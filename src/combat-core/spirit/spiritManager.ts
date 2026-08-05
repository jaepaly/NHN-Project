import { ELEMENTS } from '../../spell/types';
import type { SpellElement, SpellForm, SpellSize, SpellSpec, SpellStatus } from '../../spell/types';
import type { GrowthLevel, RewardOption, SpiritRole } from '../../run/runContract';
import { ELEMENT_LABELS } from '../../render/palette';

export const SPIRIT_CONFIG = {
  maxSlots: 2,
  maxLevel: 1,
  attackBasePower: 50,
  /** 공격 정령 한 슬롯은 수동 지속 DPS의 7.5%를 사용한다. */
  attackPowerScale: 0.15,
  attackIntervals: [6, 6, 6],
  /**
   * 레벨별 DPS 성장 (총괄 결정 2026-07-22) — 정령 투자가 실제 화력이 되게.
   * Lv1은 기본 게이트(오토 40%) 그대로, 강화할수록 오토 비중이 올라간다.
   * 풀투자(2정령 Lv3 + 신속 하한 0.5) = 각인 25% + 정령 15%×1.4×2 = 오토 ~67%
   * — 어떤 빌드로도 수동 기본(100%)은 넘지 않는다(새 불변식, 회귀 고정).
   */
  levelDpsGrowth: [1, 1, 1],
  utilityIntervals: [8, 8, 8],
  healAmounts: [10, 10, 10],
  guardAmounts: [12, 12, 12],
} as const;

export type SpiritLevel = GrowthLevel;

export interface SpiritSnapshot {
  spiritId: string;
  role: SpiritRole;
  element?: SpellElement;
  /** 융합 정령 전용 — 이중 원소의 부속성 */
  elementSecondary?: SpellElement;
  /** 융합 정령이 흡수한 모든 원소. element/elementSecondary는 구형 HUD 호환용이다. */
  elements?: readonly SpellElement[];
  level: SpiritLevel;
  intervalSeconds: number;
  remainingSeconds: number;
  /** 융합 정령 여부 — 2슬롯 예산을 하나로 합친다 (40% 게이트 불변) */
  fused: boolean;
  /** 융합 정령의 LLM 격상명 */
  fusedName?: string;
}

export type SpiritPulseRequest =
  | { kind: 'attack'; spiritId: string; spell: SpellSpec }
  | { kind: 'heal'; spiritId: string; amount: number }
  | { kind: 'guard'; spiritId: string; amount: number };

interface SpiritDefinition {
  spiritId: string;
  role: SpiritRole;
  element?: SpellElement;
}

interface SpiritState extends SpiritDefinition {
  level: SpiritLevel;
  remainingSeconds: number;
  /** 차지하는 슬롯 수 — 일반 1, 융합 2 (오토 DPS 예산도 슬롯 수에 비례) */
  slotWeight: number;
  elementSecondary?: SpellElement;
  elements?: readonly SpellElement[];
  fusedName?: string;
}

const ELEMENT_FORMS: Record<SpellElement, SpellForm> = {
  fire: 'nova',
  water: 'wave',
  lightning: 'chain',
  ice: 'cage',
  earth: 'zone',
  wind: 'bolt',
  light: 'beam',
  dark: 'rain',
};

const ELEMENT_STATUSES: Record<SpellElement, SpellStatus[]> = {
  fire: ['burn'],
  water: ['knockback'],
  lightning: ['shock'],
  ice: ['freeze'],
  earth: ['slow'],
  wind: ['knockback'],
  light: ['weaken'],
  dark: ['weaken'],
};

export function spiritElementStatuses(element: SpellElement): SpellStatus[] {
  return [...ELEMENT_STATUSES[element]];
}

const DEFINITIONS: readonly SpiritDefinition[] = [
  ...ELEMENTS.map((element) => ({
    spiritId: `attack-${element}`,
    role: 'attack' as const,
    element,
  })),
  { spiritId: 'heal', role: 'heal' },
  { spiritId: 'guard', role: 'guard' },
];

/** Phaser와 분리된 정령 슬롯·보상·자동 발동 관리자. */
export class SpiritManager {
  private slots: SpiritState[] = [];
  /** 신속 정령 보상 — 주기·발당 위력에 함께 곱한다(예산 중립). 1=기본, 0.5=2배 속사 하한 */
  private hasteMultiplier = 1;
  private fusionResonance = false;
  private recoveryEnabled = false;
  private recoveryRemainingSeconds: number = SPIRIT_CONFIG.utilityIntervals[0];
  private guardEnabled = false;
  private guardRemainingSeconds: number = SPIRIT_CONFIG.utilityIntervals[0];

  injectReward(
    options: readonly RewardOption[],
    roomIndex: number,
    rand: () => number,
  ): readonly RewardOption[] {
    const result = options.map(cloneReward);
    const option = this.createRewardOption(roomIndex, rand);
    if (!option) return result;

    // 각인 카드와 정령 카드가 서로 덮어쓰지 않도록 정적 카드만 치환한다.
    const replaceable = result
      .map((reward, index) => ({ reward, index }))
      .filter(({ reward }) => reward.kind !== 'engrave' && reward.kind !== 'spirit');
    if (replaceable.length === 0) return result;
    const picked = replaceable[randomIndex(replaceable.length, rand)];
    result[picked.index] = option;
    return result;
  }

  applyReward(option: RewardOption): SpiritSnapshot | null {
    if (option.kind !== 'spirit' || !option.spirit) return null;
    const definition = DEFINITIONS.find((entry) => entry.spiritId === option.spirit?.spiritId);
    if (
      !definition
      || definition.role !== option.spirit.role
      || definition.role === 'heal'
      || definition.role === 'guard'
    ) return null;

    // 카드 생성과 **같은 기준**으로 막는다. 생성부만 고치면 저장된 카드·다른 경로로
    // 들어온 요청이 그대로 통과해 중복 원소가 계약된다
    if (definition.element && this.ownedAttackElements().has(definition.element)) return null;
    if (option.spirit.level !== 1 || this.slotCount() >= SPIRIT_CONFIG.maxSlots) return null;
    const created: SpiritState = {
      ...definition,
      level: 1,
      remainingSeconds: intervalFor({ ...definition, level: 1 }) * this.hasteMultiplier,
      slotWeight: 1,
      elements: definition.element ? [definition.element] : undefined,
    };
    this.slots.push(created);
    return snapshot(created);
  }

  enableRecovery(): boolean {
    if (this.recoveryEnabled) return false;
    this.recoveryEnabled = true;
    this.recoveryRemainingSeconds = SPIRIT_CONFIG.utilityIntervals[0] * this.hasteMultiplier;
    return true;
  }

  enableGuard(): boolean {
    if (this.guardEnabled) return false;
    this.guardEnabled = true;
    this.guardRemainingSeconds = SPIRIT_CONFIG.utilityIntervals[0] * this.hasteMultiplier;
    return true;
  }

  /** 융합 후보 — 공격 정령 2체 보유 시 (PROGRESSION_DESIGN §3). */
  /**
   * 이미 보유한 공격 원소 — **융합체가 흡수한 원소까지 포함한다.**
   *
   * ⚠️ 중복 판정을 `spiritId`로 하면 안 된다. 융합체의 id는
   * `fused-fire-water-lightning`이라 `attack-lightning`과 겹치지 않아, 이미 흡수한
   * 원소가 다시 보상 카드로 나오고 **선택하면 계약까지 된다**(슬롯만 낭비하고
   * 다시 융합해도 `new Set` 합집합이라 원소가 안 늘어난다).
   * 총괄 제보: *"불+물+전기 상태인데 선택지 보상으로 전기 정령이 나옴."*
   */
  private ownedAttackElements(): Set<SpellElement> {
    const owned = new Set<SpellElement>();
    for (const slot of this.slots) {
      if (slot.role !== 'attack') continue;
      for (const element of slot.elements ?? (slot.element ? [slot.element] : [])) {
        owned.add(element);
      }
    }
    return owned;
  }

  /**
   * 융합 후보 — 공격 정령 2체. **융합체도 후보다**(3속성 이상 융합의 정식 경로).
   *
   * ⚠️ `elements`는 두 정령의 **원소 전체 합집합**이다. 종전엔 정령마다 주속성 하나만
   * 실어서(`[a.element, b.element]`), 불+물 융합체와 전기를 합칠 때 후보가
   * `['fire','lightning']`이 되고 **물이 사라졌다** — 카드 제목·작명·연출이 전부 이
   * 값을 쓰므로 총괄 제보 *"3가지 속성을 합치면 해당 속성 정보가 반영 안 된다"*가
   * 여기서 나왔다. `fuse()`는 원래부터 합집합을 만들었으니 데이터가 아니라 보고가
   * 어긋나 있었다.
   */
  fuseCandidate(): { spiritIds: [string, string]; elements: readonly SpellElement[] } | null {
    const attackers = this.slots.filter((slot) => slot.role === 'attack' && slot.element);
    if (attackers.length < 2) return null;
    const [first, second] = attackers;
    return {
      spiritIds: [first.spiritId, second.spiritId],
      elements: [...new Set([
        ...(first.elements ?? [first.element!]),
        ...(second.elements ?? [second.element!]),
      ])],
    };
  }

  /**
   * 정령 융합 — 공격 정령 2체를 소모해 다원소 정령 1체를 만든다. 융합체도 다시
   * 융합할 수 있어 3속성 이상이 나온다(`evolve-fuse-regression`의 '삼원 성운').
   *
   * 융합체는 **1슬롯만 점유**해 새 정령을 다시 영입할 여지를 남기고(회귀로 잠긴 의도),
   * power는 원소 수로 나눠 총합이 2슬롯 예산을 넘지 않는다 (오토 40% 게이트 불변).
   */
  fuse(spiritIds: readonly string[], fusedName: string): SpiritSnapshot | null {
    if (spiritIds.length !== 2 || spiritIds[0] === spiritIds[1]) return null;
    const name = fusedName.trim();
    if (!name) return null;
    const first = this.slots.find((slot) => slot.spiritId === spiritIds[0]);
    const second = this.slots.find((slot) => slot.spiritId === spiritIds[1]);
    if (!first?.element || !second?.element) return null;
    if (first.role !== 'attack' || second.role !== 'attack') return null;
    const elements = [...new Set([
      ...(first.elements ?? [first.element]),
      ...(second.elements ?? [second.element]),
    ])] as SpellElement[];
    if (elements.length < 2) return null;

    this.slots = this.slots.filter((slot) => slot !== first && slot !== second);
    const fused: SpiritState = {
      spiritId: `fused-${elements.join('-')}`,
      role: 'attack',
      element: elements[0],
      elementSecondary: elements[1],
      elements,
      level: 1,
      remainingSeconds: spiritInterval('attack', 1)
        * this.hasteMultiplier,
      slotWeight: 1,
      fusedName: name,
    };
    this.slots.push(fused);
    return snapshot(fused);
  }

  /** 점유 슬롯 합 — 융합 정령은 2슬롯으로 센다. */
  slotCount(): number {
    return this.slots.reduce((sum, slot) => sum + slot.slotWeight, 0);
  }

  /** 신속 정령 적용 — 현재 배율을 돌려준다 (HUD·안내용). */
  applyHaste(scale: number, floorMultiplier: number): number {
    const safeScale = Number.isFinite(scale) ? Math.min(1, Math.max(0.1, scale)) : 1;
    const floor = Number.isFinite(floorMultiplier) ? Math.max(0.1, floorMultiplier) : 0.5;
    this.hasteMultiplier = Math.max(floor, this.hasteMultiplier * safeScale);
    return this.hasteMultiplier;
  }

  get haste(): number {
    return this.hasteMultiplier;
  }

  update(deltaSeconds: number): readonly SpiritPulseRequest[] {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (delta === 0) return [];

    const requests: SpiritPulseRequest[] = [];
    if (this.recoveryEnabled) {
      this.recoveryRemainingSeconds -= delta;
      const interval = SPIRIT_CONFIG.utilityIntervals[0] * this.hasteMultiplier;
      while (this.recoveryRemainingSeconds <= 0) {
        requests.push({
          kind: 'heal',
          spiritId: 'passive-recovery',
          amount: SPIRIT_CONFIG.healAmounts[0],
        });
        this.recoveryRemainingSeconds += interval;
      }
    }
    if (this.guardEnabled) {
      this.guardRemainingSeconds -= delta;
      const interval = SPIRIT_CONFIG.utilityIntervals[0] * this.hasteMultiplier;
      while (this.guardRemainingSeconds <= 0) {
        requests.push({
          kind: 'guard',
          spiritId: 'passive-guard',
          amount: SPIRIT_CONFIG.guardAmounts[0],
        });
        this.guardRemainingSeconds += interval;
      }
    }
    for (const spirit of this.slots) {
      spirit.remainingSeconds -= delta;
      const interval = intervalFor(spirit) * this.hasteMultiplier;
      while (spirit.remainingSeconds <= 0) {
        requests.push(pulseFor(spirit, this.fusionResonance));
        spirit.remainingSeconds += interval;
      }
    }
    return requests;
  }

  get entries(): readonly SpiritSnapshot[] {
    return this.slots.map(snapshot);
  }

  reset(): void {
    this.slots = [];
    this.hasteMultiplier = 1;
    this.fusionResonance = false;
    this.recoveryEnabled = false;
    this.recoveryRemainingSeconds = SPIRIT_CONFIG.utilityIntervals[0];
    this.guardEnabled = false;
    this.guardRemainingSeconds = SPIRIT_CONFIG.utilityIntervals[0];
  }

  enableFusionResonance(): void {
    this.fusionResonance = true;
  }

  private createRewardOption(roomIndex: number, rand: () => number): RewardOption | null {
    const candidates: Array<{
      definition: SpiritDefinition;
      level: SpiritLevel;
      kind: 'spirit' | 'spirit-recovery' | 'spirit-guard';
    }> = [];
    if (this.slotCount() < SPIRIT_CONFIG.maxSlots) {
      // 보유 원소로 거른다 — spiritId로 보면 융합체가 흡수한 원소를 못 걸러낸다
      const owned = this.ownedAttackElements();
      for (const definition of DEFINITIONS) {
        if (definition.role !== 'heal' && definition.role !== 'guard'
          && (!definition.element || !owned.has(definition.element))) {
          candidates.push({ definition, level: 1, kind: 'spirit' });
        }
      }
    }
    if (!this.recoveryEnabled) {
      const definition = DEFINITIONS.find((entry) => entry.role === 'heal');
      if (definition) candidates.push({ definition, level: 1, kind: 'spirit-recovery' });
    }
    if (!this.guardEnabled) {
      const definition = DEFINITIONS.find((entry) => entry.role === 'guard');
      if (definition) candidates.push({ definition, level: 1, kind: 'spirit-guard' });
    }
    if (candidates.length === 0) return null;

    const { definition, level, kind } = candidates[randomIndex(candidates.length, rand)];
    const element = definition.element;
    return {
      id: `room-${roomIndex}-spirit-${definition.spiritId}-lv${level}`,
      kind,
      title: kind === 'spirit-recovery'
        ? '회복 공명'
        : kind === 'spirit-guard' ? '수호 공명' : spiritTitle(definition),
      description: kind === 'spirit-recovery'
        ? `정령 슬롯을 차지하지 않음 · ${SPIRIT_CONFIG.utilityIntervals[0]}초마다 HP +${SPIRIT_CONFIG.healAmounts[0]}`
        : kind === 'spirit-guard'
          ? `정령 슬롯을 차지하지 않음 · ${SPIRIT_CONFIG.utilityIntervals[0]}초마다 보호막 +${SPIRIT_CONFIG.guardAmounts[0]}`
        : spiritDescription(definition, level),
      element,
      spirit: kind === 'spirit' ? {
        spiritId: definition.spiritId,
        role: definition.role,
        level,
      } : undefined,
    };
  }
}

export function spiritInterval(role: SpiritRole, level: SpiritLevel): number {
  const values = role === 'attack'
    ? SPIRIT_CONFIG.attackIntervals
    : SPIRIT_CONFIG.utilityIntervals;
  return values[level - 1];
}

export function spiritAttackPower(level: SpiritLevel): number {
  const intervalRatio = spiritInterval('attack', level) / SPIRIT_CONFIG.attackIntervals[0];
  return SPIRIT_CONFIG.attackBasePower * SPIRIT_CONFIG.attackPowerScale * intervalRatio
    * SPIRIT_CONFIG.levelDpsGrowth[level - 1];
}

function intervalFor(spirit: Pick<SpiritState, 'role' | 'level'>): number {
  return spiritInterval(spirit.role, spirit.level);
}

function pulseFor(spirit: SpiritState, fusionResonance: boolean): SpiritPulseRequest {
  // 신속 정령은 순수 빈도 증가다(위력 보정 없음) — 스택할수록 실질 DPS/HPS가 오른다.
  // 이것이 소환사 빌드의 투자 축(총괄 결정): 정령 카드를 쌓으면 오토 비중이 40%를 넘어간다.
  if (spirit.role === 'heal') {
    return {
      kind: 'heal',
      spiritId: spirit.spiritId,
      amount: SPIRIT_CONFIG.healAmounts[spirit.level - 1],
    };
  }
  if (spirit.role === 'guard') {
    return {
      kind: 'guard',
      spiritId: spirit.spiritId,
      amount: SPIRIT_CONFIG.guardAmounts[spirit.level - 1],
    };
  }
  return {
    kind: 'attack',
    spiritId: spirit.spiritId,
    spell: attackSpell(spirit.element ?? 'light', spirit.level, spirit, fusionResonance),
  };
}

function attackSpell(
  element: SpellElement,
  level: SpiritLevel,
  state?: Pick<SpiritState, 'elementSecondary' | 'elements' | 'fusedName' | 'slotWeight'>,
  fusionResonance = false,
): SpellSpec {
  const fusedElements = state?.elements ?? (state?.elementSecondary ? [element, state.elementSecondary] : [element]);
  const fused = fusedElements.length > 1;
  const size: SpellSize = fused
    ? 'huge' // 융합체는 격상의 시각적 정점
    : level === 1 ? 'small' : level === 2 ? 'medium' : 'large';
  const status = fused && fusionResonance
    ? [...new Set(fusedElements.flatMap(spiritElementStatuses))]
    : spiritElementStatuses(element);
  return {
    name: state?.fusedName ?? `${ELEMENT_LABELS[element]} 정령 Lv${level}`,
    effect: 'damage',
    target: 'enemy',
    element_primary: element,
    element_secondary: null,
    form: 'bolt',
    size,
    speed: element === 'wind' || element === 'lightning' ? 'fast' : 'normal',
    status,
    // 융합체는 소모한 슬롯 수만큼의 power 예산을 쓴다 (2슬롯 → ×2, 총합은 불변)
    power: spiritAttackPower(1) * (fused ? 2 / fusedElements.length : 1),
    cost: 0,
    flavor: '정령의 자동 시전은 마나·쿨다운·주문 기억을 사용하지 않는다.',
  };
}

function spiritTitle(definition: SpiritDefinition): string {
  const prefix = '정령 계약';
  if (definition.role === 'heal') return `${prefix} · 치유`;
  if (definition.role === 'guard') return `${prefix} · 수호`;
  return `${prefix} · ${ELEMENT_LABELS[definition.element ?? 'light']}`;
}

function spiritDescription(definition: SpiritDefinition, level: SpiritLevel): string {
  const interval = spiritInterval(definition.role, level);
  if (definition.role === 'heal') {
    return `Lv${level} · ${interval}초마다 HP +${SPIRIT_CONFIG.healAmounts[level - 1]}`;
  }
  if (definition.role === 'guard') {
    return `Lv${level} · ${interval}초마다 보호막 +${SPIRIT_CONFIG.guardAmounts[level - 1]}`;
  }
  const form = level === 1 ? '소형 탄환' : ELEMENT_FORMS[definition.element ?? 'light'];
  return `Lv${level} · ${interval}초마다 ${form} 자동 시전`;
}

function snapshot(state: SpiritState): SpiritSnapshot {
  return {
    spiritId: state.spiritId,
    role: state.role,
    element: state.element,
    elementSecondary: state.elementSecondary,
    elements: state.elements,
    level: state.level,
    intervalSeconds: intervalFor(state),
    remainingSeconds: state.remainingSeconds,
    fused: (state.elements?.length ?? 1) > 1,
    fusedName: state.fusedName,
  };
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
