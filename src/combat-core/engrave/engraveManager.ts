import type { GrowthLevel, RewardOption } from '../../run/runContract';
import type { SpellSize, SpellSpec } from '../../spell/types';
import { ELEMENT_LABELS, FORM_LABELS } from '../../render/palette';

/**
 * 각인 v1 임시 밸런스.
 * 한 슬롯의 지속 DPS를 수동 영창의 12.5%로 고정한다.
 * 정령 두 슬롯(15%)과 합쳐도 자동 피해 총합은 수동 지속 DPS의 40% 이하다.
 */
export const ENGRAVE_CONFIG = {
  maxSlots: 2,
  maxLevel: 3,
  baseIntervalSeconds: 6,
  level3IntervalSeconds: 4,
  level2ShotCount: 2,
  secondShotDelaySeconds: 0.3,
  powerScale: 0.25,
} as const;

export type EngraveLevel = GrowthLevel;

export interface EngravedSpellSnapshot {
  spellKey: string;
  level: EngraveLevel;
  spell: SpellSpec;
  intervalSeconds: number;
  shotCount: number;
  remainingSeconds: number;
  /** 진화 완료 여부 — 진화 시 LLM 격상명·huge 크기를 얻는다 (DPS 예산은 불변) */
  evolved: boolean;
}

export interface EngraveCastRequest {
  spellKey: string;
  level: EngraveLevel;
  spell: SpellSpec;
  /** Lv2+ 두 번째 발은 씬의 타이머로 지연한다. */
  delaySeconds: number;
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
   * 각인 진화 — LLM 격상명으로 개명하고 huge 크기가 된다.
   * DPS 예산(powerScale·주기)은 그대로 — 진화는 정체성·연출의 격상이다 (§0 게이트 유지).
   */
  evolve(spellKey: string, evolvedName: string): EngravedSpellSnapshot | null {
    const slot = this.slots.find((entry) => entry.spellKey === spellKey);
    if (!slot || slot.level < ENGRAVE_CONFIG.maxLevel || slot.evolved) return null;
    const name = evolvedName.trim();
    if (!name) return null;
    slot.evolved = true;
    slot.spell = { ...cloneSpell(slot.spell), name };
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
        const shotCount = shotCountForLevel(slot.level);
        for (let shot = 0; shot < shotCount; shot++) {
          casts.push({
            spellKey: slot.spellKey,
            level: slot.level,
            spell: scaledSpell(slot.spell, slot.level, slot.evolved),
            delaySeconds: shot === 0 ? 0 : ENGRAVE_CONFIG.secondShotDelaySeconds,
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

export function shotCountForLevel(level: EngraveLevel): number {
  return level >= 2 ? ENGRAVE_CONFIG.level2ShotCount : 1;
}

/** 레벨별 발수·주기 변화에도 지속 DPS 예산이 일정하도록 한 발의 power를 분배한다. */
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
    shotCount: shotCountForLevel(state.level),
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
