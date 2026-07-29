import type { GrowthLevel, RewardOption } from '../../run/runContract';
import type { SpellSize, SpellSpec, SpellStatus } from '../../spell/types';
import { ELEMENT_LABELS, FORM_LABELS } from '../../render/palette';
import { FUSION_ELEMENT_STATUS } from '../player/fusionGauge';

/**
 * 각인 v1 임시 밸런스.
 * 한 슬롯의 지속 DPS를 수동 영창의 12.5%로 고정한다 (두 슬롯 25%).
 * 정령 두 슬롯(15%)과 합쳐 자동 피해 총합 40% — 여기까지가 원래 설계다.
 *
 * ⚠️ **진화는 이 상한을 넘긴다** (총괄 결정). 진화 각인은 발수가 2→3이라
 * 슬롯당 18.75%, 두 슬롯 37.5%가 되고 정령까지 더하면 **52.5%**다.
 * 즉 양쪽 각인을 모두 진화시키면 자동 피해가 수동의 절반을 넘는다.
 * 런 후반에 Lv3+친화를 양쪽 다 모아야 도달하는 지점이라 열어둔 것이고,
 * 수치는 engrave-regression의 진화DPS 군이 고정한다 — 조용히 움직이면 거기서 깨진다.
 */
export const ENGRAVE_CONFIG = {
  maxSlots: 2,
  maxLevel: 3,
  baseIntervalSeconds: 6,
  level3IntervalSeconds: 4,
  level2ShotCount: 2,
  secondShotDelaySeconds: 0.3,
  powerScale: 0.25,
  /**
   * 진화 각인의 발수 (총괄 결정) — Lv3의 2발에서 **한 발 더**.
   *
   * 지금까지 진화는 DPS가 완전히 불변이었다(§0 게이트). 그런데 Lv3 + 동일 원소
   * 친화까지 모아야 뜨는 카드인데 화면에서 달라지는 게 이름표뿐인 경우가 있어
   * (원본이 large/huge면 크기도 그대로) 보상으로 읽히지 않았다.
   *
   * **발당 위력은 Lv3와 같다** — 즉 이 각인의 DPS는 정확히 1.5배가 된다.
   * 나눠 갖는 게 아니라 실제로 늘어나는 것이다. §0 게이트를 의도적으로 연다.
   */
  evolvedShotCount: 3,
} as const;

export type EngraveLevel = GrowthLevel;

export interface EngravedSpellSnapshot {
  spellKey: string;
  level: EngraveLevel;
  spell: SpellSpec;
  intervalSeconds: number;
  shotCount: number;
  remainingSeconds: number;
  /** 진화 완료 여부 — LLM 격상명·huge 크기·**3발**(발당 위력 동일 = DPS 1.5배) */
  evolved: boolean;
}

export interface EngraveCastRequest {
  spellKey: string;
  level: EngraveLevel;
  spell: SpellSpec;
  /** 두 번째 발부터는 씬의 타이머로 지연한다 (발마다 누적). */
  delaySeconds: number;
  /** 진화 각인인가 — 씬이 연출 격하를 풀어 자동 시전인데도 화려하게 나간다. */
  evolved: boolean;
}

interface EngravedSpellState {
  spellKey: string;
  level: EngraveLevel;
  spell: SpellSpec;
  remainingSeconds: number;
  evolved: boolean;
}

/** Phaser와 분리된 각인 슬롯·강화·타이머 관리자. */
export class EngraveManager {
  private readonly candidates = new Map<string, SpellSpec>();
  private slots: EngravedSpellState[] = [];

  /** 수동으로 실제 발동한 damage 주문만 보상 후보로 기억한다. */
  rememberManualCast(spellKey: string, spell: SpellSpec): void {
    const key = spellKey.trim();
    if (!key
      || spell.effect !== 'damage'
      || spell.form === 'wall'
      || spell.form === 'orbit') return;
    const previous = this.candidates.get(key);
    if (!previous || previous.power <= spell.power) {
      this.candidates.set(key, cloneSpell(spell));
    }
  }

  /** 기본 3택 중 무작위 한 장을 현재 가능한 각인 카드로 치환한다. */
  injectReward(
    options: readonly RewardOption[],
    roomIndex: number,
    rand: () => number,
  ): readonly RewardOption[] {
    const result = options.map(cloneReward);
    const option = this.createRewardOption(roomIndex, rand);
    if (!option || result.length === 0) return result;
    result[randomIndex(result.length, rand)] = option;
    return result;
  }

  /** 선택된 각인 카드 적용. 스탯 보상 적용과 분리된 씬 이벤트에서 호출한다. */
  applyReward(option: RewardOption): EngravedSpellSnapshot | null {
    if (option.kind !== 'engrave' || !option.engrave) return null;
    const { spellKey, level } = option.engrave;
    const candidate = this.candidates.get(spellKey);
    if (!candidate) return null;

    const existing = this.slots.find((slot) => slot.spellKey === spellKey);
    if (existing) {
      const expected = Math.min(ENGRAVE_CONFIG.maxLevel, existing.level + 1);
      if (existing.level >= ENGRAVE_CONFIG.maxLevel || level !== expected) return null;
      existing.level = expected as EngraveLevel;
      existing.spell = cloneSpell(candidate);
      existing.remainingSeconds = Math.min(
        existing.remainingSeconds,
        intervalForLevel(existing.level),
      );
      return snapshot(existing);
    }

    if (level !== 1 || this.slots.length >= ENGRAVE_CONFIG.maxSlots) return null;
    const created: EngravedSpellState = {
      spellKey,
      level: 1,
      spell: cloneSpell(candidate),
      remainingSeconds: ENGRAVE_CONFIG.baseIntervalSeconds,
      evolved: false,
    };
    this.slots.push(created);
    return snapshot(created);
  }

  /**
   * 진화 후보 — Lv3 각인 중 동일 원소 친화를 보유한 미진화 슬롯 (PROGRESSION_DESIGN §2).
   */
  evolveCandidates(
    affinity: Partial<Record<SpellSpec['element_primary'], number>>,
  ): readonly EngravedSpellSnapshot[] {
    return this.slots
      .filter((slot) => slot.level >= ENGRAVE_CONFIG.maxLevel
        && !slot.evolved
        && (affinity[slot.spell.element_primary] ?? 0) > 0)
      .map(snapshot);
  }

  /**
   * 각인 진화 — LLM 격상명 · huge 크기 · **3발**(Lv3는 2발).
   *
   * 발당 위력·주기는 그대로라 이 각인의 DPS는 정확히 **1.5배**가 된다.
   * 원래는 DPS 완전 불변이었으나(§0 게이트), 그러면 원본이 large/huge인 주문은
   * 진화해도 **이름표만 바뀌어** 보상으로 읽히지 않았다. 게이트를 의도적으로 연다.
   */
  evolve(spellKey: string, evolvedName: string): EngravedSpellSnapshot | null {
    const slot = this.slots.find((entry) => entry.spellKey === spellKey);
    if (!slot || slot.level < ENGRAVE_CONFIG.maxLevel || slot.evolved) return null;
    const name = evolvedName.trim();
    if (!name) return null;
    slot.evolved = true;
    // 진화하면 그 원소의 **본성**이 드러난다 — 빙결은 얼려 세우고, 대지는 붙잡고,
    // 화염은 태운다. Lv3 정령이 이미 같은 문법을 쓴다(spiritManager ELEMENT_STATUSES).
    // 각인만 안 하고 있었다. 위력 숫자가 아니라 **성질**이 달라지는 축이다.
    slot.spell = { ...cloneSpell(slot.spell), name, status: evolvedStatus(slot.spell) };
    return snapshot(slot);
  }

  /** 전투 중 델타를 누적하고 이번 프레임에 예약할 자동 시전 목록을 반환한다. */
  update(deltaSeconds: number): readonly EngraveCastRequest[] {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (delta === 0) return [];

    const casts: EngraveCastRequest[] = [];
    for (const slot of this.slots) {
      slot.remainingSeconds -= delta;
      const interval = intervalForLevel(slot.level);
      while (slot.remainingSeconds <= 0) {
        const shotCount = shotCountForLevel(slot.level, slot.evolved);
        for (let shot = 0; shot < shotCount; shot++) {
          casts.push({
            spellKey: slot.spellKey,
            level: slot.level,
            spell: scaledSpell(slot.spell, slot.level, slot.evolved),
            // 발마다 누적 지연. 예전엔 `shot === 0 ? 0 : delay`라 3발째가 2발째와
            // **같은 시각**에 겹쳤다 — 2발까지만 있어서 안 드러났던 결함이다.
            delaySeconds: shot * ENGRAVE_CONFIG.secondShotDelaySeconds,
            evolved: slot.evolved,
          });
        }
        slot.remainingSeconds += interval;
      }
    }
    return casts;
  }

  get entries(): readonly EngravedSpellSnapshot[] {
    return this.slots.map(snapshot);
  }

  /** 후보 주문 스펙 조회 — 보상 카드가 spellKey만 들고 폼 글리프를 찾을 때 쓴다. */
  candidateSpell(spellKey: string): SpellSpec | null {
    return this.candidates.get(spellKey) ?? null;
  }

  reset(): void {
    this.candidates.clear();
    this.slots = [];
  }

  private createRewardOption(roomIndex: number, rand: () => number): RewardOption | null {
    let keys: string[];
    if (this.slots.length < ENGRAVE_CONFIG.maxSlots) {
      keys = [...this.candidates.keys()].filter(
        (key) => !this.slots.some((slot) => slot.spellKey === key),
      );
    } else {
      keys = this.slots
        .filter((slot) => slot.level < ENGRAVE_CONFIG.maxLevel)
        .map((slot) => slot.spellKey);
    }

    // 새 슬롯 후보가 없으면 보유 각인의 강화 카드를 허용한다.
    if (keys.length === 0 && this.slots.length > 0) {
      keys = this.slots
        .filter((slot) => slot.level < ENGRAVE_CONFIG.maxLevel)
        .map((slot) => slot.spellKey);
    }
    if (keys.length === 0) return null;

    const spellKey = keys[randomIndex(keys.length, rand)];
    const spell = this.candidates.get(spellKey);
    if (!spell) return null;
    const currentLevel = this.slots.find((slot) => slot.spellKey === spellKey)?.level ?? 0;
    const nextLevel = Math.min(ENGRAVE_CONFIG.maxLevel, currentLevel + 1) as EngraveLevel;
    const isNew = nextLevel === 1;
    // 주문 이름만으론 어떤 마법이었는지 기억이 안 난다(플레이 피드백) — 원소·형태·위력을
    // 카드에 명시해 "내가 썼던 그 주문"을 알아보게 한다.
    const identity = `${ELEMENT_LABELS[spell.element_primary]} ${FORM_LABELS[spell.form]} · 위력 ${Math.round(spell.power)}`;
    const description = nextLevel === 1
      ? `${identity}\n${ENGRAVE_CONFIG.baseIntervalSeconds}초마다 위력 ${Math.round(ENGRAVE_CONFIG.powerScale * 100)}% 자동 시전`
      : nextLevel === 2
        ? `${identity}\nLv2 · 발수 +1 (${ENGRAVE_CONFIG.secondShotDelaySeconds}초 간격)`
        : `${identity}\nLv3 · 주기 ${ENGRAVE_CONFIG.level3IntervalSeconds}초 · 크기 한 단계 상승`;

    return {
      id: `room-${roomIndex}-engrave-${hashKey(spellKey)}-lv${nextLevel}`,
      kind: 'engrave',
      title: `${isNew ? '주문 각인' : '각인 강화'} · ${spell.name}`,
      description,
      element: spell.element_primary,
      engrave: { spellKey, level: nextLevel },
    };
  }
}

export function intervalForLevel(level: EngraveLevel): number {
  return level >= 3
    ? ENGRAVE_CONFIG.level3IntervalSeconds
    : ENGRAVE_CONFIG.baseIntervalSeconds;
}

/**
 * 진화 각인의 상태이상 — 그 원소의 **본성**이 드러난다 (빙결은 얼려 세우고, 화염은 태운다).
 *
 * 원본 영창에 이미 그 상태이상이 있으면 더할 게 없다(#216 항목8). 그때는 **부속성의
 * 본성**까지 드러낸다 — 이중 원소로 외운 사람에게만 열리는 갈래라 원소 정체성을
 * 흐리지 않고, 위력·발수를 안 건드려 오토 비중(#67)에도 무관하다.
 *
 * 단일 원소인데 이미 본성을 담아 외운 경우는 그대로 둔다. 그건 결함이 아니라
 * "이미 드러낸 본성은 또 드러낼 게 없다"는 정상 동작이고, 진화의 주보상(3발=DPS ×3 ·
 * huge · 격상명)은 전부 그대로 주어진다. 억지 보정은 밸런스만 흔든다.
 */
export function evolvedStatus(spell: SpellSpec): SpellStatus[] {
  const status = [...spell.status];
  const primary = FUSION_ELEMENT_STATUS[spell.element_primary];
  if (!status.includes(primary)) {
    status.push(primary);
    return status;
  }
  const secondary = spell.element_secondary
    ? FUSION_ELEMENT_STATUS[spell.element_secondary]
    : null;
  if (secondary && !status.includes(secondary)) status.push(secondary);
  return status;
}

export function shotCountForLevel(level: EngraveLevel, evolved = false): number {
  if (evolved) return ENGRAVE_CONFIG.evolvedShotCount;
  return level >= 2 ? ENGRAVE_CONFIG.level2ShotCount : 1;
}

/** 레벨별 발수·주기 변화에도 지속 DPS 예산이 일정하도록 한 발의 power를 분배한다. */
/**
 * 발당 위력 — 레벨 예산을 그 레벨의 발수로 나눈다.
 *
 * ⚠️ **여기에 evolved를 넘기지 마라.** 일부러 안 넘긴다.
 * 넘기면 진화 각인이 예산을 3발로 쪼개 나눠 갖게 되어 DPS가 도로 불변이 된다.
 * 진화의 3발째는 "나눠 갖는 발"이 아니라 **더 얹는 발**이다 — 그게 보상이다.
 * (총괄 결정: 진화가 이름표만 바뀌는 카드로 읽히던 문제를 푼다)
 */
export function scaledPowerForLevel(basePower: number, level: EngraveLevel): number {
  const safePower = Number.isFinite(basePower) ? Math.max(0, basePower) : 0;
  const intervalRatio = intervalForLevel(level) / ENGRAVE_CONFIG.baseIntervalSeconds;
  return safePower * ENGRAVE_CONFIG.powerScale
    * intervalRatio
    / shotCountForLevel(level);
}

function scaledSpell(spell: SpellSpec, level: EngraveLevel, evolved = false): SpellSpec {
  return {
    ...cloneSpell(spell),
    // 진화는 무조건 huge — 격상의 시각적 정점 (power 예산은 그대로)
    size: evolved ? 'huge' : level >= 3 ? increaseSize(spell.size) : spell.size,
    power: scaledPowerForLevel(spell.power, level),
    cost: 0,
  };
}

function increaseSize(size: SpellSize): SpellSize {
  const sizes: readonly SpellSize[] = ['small', 'medium', 'large', 'huge'];
  return sizes[Math.min(sizes.length - 1, sizes.indexOf(size) + 1)];
}

function snapshot(state: EngravedSpellState): EngravedSpellSnapshot {
  return {
    spellKey: state.spellKey,
    level: state.level,
    spell: cloneSpell(state.spell),
    intervalSeconds: intervalForLevel(state.level),
    shotCount: shotCountForLevel(state.level, state.evolved),
    remainingSeconds: state.remainingSeconds,
    evolved: state.evolved,
  };
}

function cloneSpell(spell: SpellSpec): SpellSpec {
  return { ...spell, status: [...spell.status] };
}

function cloneReward(option: RewardOption): RewardOption {
  return {
    ...option,
    engrave: option.engrave ? { ...option.engrave } : undefined,
    spirit: option.spirit ? { ...option.spirit } : undefined,
    evolve: option.evolve
      ? {
        ...option.evolve,
        spiritIds: option.evolve.spiritIds ? [...option.evolve.spiritIds] : undefined,
        elements: [...option.evolve.elements],
      }
      : undefined,
  };
}

function randomIndex(length: number, rand: () => number): number {
  const raw = rand();
  const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
  return Math.floor(value * length);
}

function hashKey(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
