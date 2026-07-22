import { ELEMENTS } from '../../spell/types';
import type { SpellElement, SpellForm, SpellSize, SpellSpec, SpellStatus } from '../../spell/types';
import type { GrowthLevel, RewardOption, SpiritRole } from '../../run/runContract';
import { ELEMENT_LABELS } from '../../render/palette';

export const SPIRIT_CONFIG = {
  maxSlots: 2,
  maxLevel: 3,
  attackBasePower: 50,
  /** 공격 정령 한 슬롯은 수동 지속 DPS의 7.5%를 사용한다. */
  attackPowerScale: 0.15,
  attackIntervals: [6, 4.5, 4.5],
  /**
   * 레벨별 DPS 성장 (총괄 결정 2026-07-22) — 정령 투자가 실제 화력이 되게.
   * Lv1은 기본 게이트(오토 40%) 그대로, 강화할수록 오토 비중이 올라간다.
   * 풀투자(2정령 Lv3 + 신속 하한 0.5) = 각인 25% + 정령 15%×1.4×2 = 오토 ~67%
   * — 어떤 빌드로도 수동 기본(100%)은 넘지 않는다(새 불변식, 회귀 고정).
   */
  levelDpsGrowth: [1, 1.2, 1.4],
  utilityIntervals: [8, 7, 6],
  healAmounts: [10, 15, 22],
  guardAmounts: [12, 18, 26],
} as const;

export type SpiritLevel = GrowthLevel;

export interface SpiritSnapshot {
  spiritId: string;
  role: SpiritRole;
  element?: SpellElement;
  /** 융합 정령 전용 — 이중 원소의 부속성 */
  elementSecondary?: SpellElement;
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
    if (!definition || definition.role !== option.spirit.role) return null;

    const existing = this.slots.find((slot) => slot.spiritId === definition.spiritId);
    if (existing) {
      const expected = Math.min(SPIRIT_CONFIG.maxLevel, existing.level + 1);
      if (existing.level >= SPIRIT_CONFIG.maxLevel || option.spirit.level !== expected) return null;
      existing.level = expected as SpiritLevel;
      existing.remainingSeconds = Math.min(
        existing.remainingSeconds,
        intervalFor(existing) * this.hasteMultiplier,
      );
      return snapshot(existing);
    }

    if (option.spirit.level !== 1 || this.slotCount() >= SPIRIT_CONFIG.maxSlots) return null;
    const created: SpiritState = {
      ...definition,
      level: 1,
      remainingSeconds: intervalFor({ ...definition, level: 1 }) * this.hasteMultiplier,
      slotWeight: 1,
    };
    this.slots.push(created);
    return snapshot(created);
  }

  /** 융합 후보 — 공격 정령 2체 보유 시 (PROGRESSION_DESIGN §3). */
  fuseCandidate(): { spiritIds: [string, string]; elements: [SpellElement, SpellElement] } | null {
    const attackers = this.slots.filter(
      (slot) => slot.role === 'attack' && !slot.elementSecondary && slot.element,
    );
    if (attackers.length < 2) return null;
    return {
      spiritIds: [attackers[0].spiritId, attackers[1].spiritId],
      elements: [attackers[0].element!, attackers[1].element!],
    };
  }

  /**
   * 정령 융합 — 공격 정령 2체를 소모해 주+부속성 이중 원소 정령 1체를 만든다.
   * 융합체는 2슬롯을 점유하고 2슬롯 분량의 power 예산을 쓴다 (오토 40% 게이트 불변).
   */
  fuse(spiritIds: readonly string[], fusedName: string): SpiritSnapshot | null {
    if (spiritIds.length !== 2 || spiritIds[0] === spiritIds[1]) return null;
    const name = fusedName.trim();
    if (!name) return null;
    const first = this.slots.find((slot) => slot.spiritId === spiritIds[0]);
    const second = this.slots.find((slot) => slot.spiritId === spiritIds[1]);
    if (!first?.element || !second?.element) return null;
    if (first.role !== 'attack' || second.role !== 'attack') return null;
    if (first.elementSecondary || second.elementSecondary) return null;

    this.slots = this.slots.filter((slot) => slot !== first && slot !== second);
    const fused: SpiritState = {
      spiritId: `fused-${first.element}-${second.element}`,
      role: 'attack',
      element: first.element,
      elementSecondary: second.element,
      level: SPIRIT_CONFIG.maxLevel as SpiritLevel,
      remainingSeconds: spiritInterval('attack', SPIRIT_CONFIG.maxLevel as SpiritLevel)
        * this.hasteMultiplier,
      slotWeight: 2,
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
    for (const spirit of this.slots) {
      spirit.remainingSeconds -= delta;
      const interval = intervalFor(spirit) * this.hasteMultiplier;
      while (spirit.remainingSeconds <= 0) {
        requests.push(pulseFor(spirit));
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
  }

  private createRewardOption(roomIndex: number, rand: () => number): RewardOption | null {
    const candidates: Array<{ definition: SpiritDefinition; level: SpiritLevel }> = [];
    if (this.slotCount() < SPIRIT_CONFIG.maxSlots) {
      for (const definition of DEFINITIONS) {
        if (!this.slots.some((slot) => slot.spiritId === definition.spiritId)) {
          candidates.push({ definition, level: 1 });
        }
      }
    }
    for (const slot of this.slots) {
      if (slot.level < SPIRIT_CONFIG.maxLevel) {
        candidates.push({
          definition: slot,
          level: (slot.level + 1) as SpiritLevel,
        });
      }
    }
    if (candidates.length === 0) return null;

    const { definition, level } = candidates[randomIndex(candidates.length, rand)];
    const element = definition.element;
    return {
      id: `room-${roomIndex}-spirit-${definition.spiritId}-lv${level}`,
      kind: 'spirit',
      title: spiritTitle(definition, level),
      description: spiritDescription(definition, level),
      element,
      spirit: {
        spiritId: definition.spiritId,
        role: definition.role,
        level,
      },
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

function pulseFor(spirit: SpiritState): SpiritPulseRequest {
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
    spell: attackSpell(spirit.element ?? 'light', spirit.level, spirit),
  };
}

function attackSpell(
  element: SpellElement,
  level: SpiritLevel,
  state?: Pick<SpiritState, 'elementSecondary' | 'fusedName' | 'slotWeight'>,
): SpellSpec {
  const evolved = level >= 2;
  const fusedSecondary = state?.elementSecondary ?? null;
  const size: SpellSize = fusedSecondary
    ? 'huge' // 융합체는 격상의 시각적 정점
    : level === 1 ? 'small' : level === 2 ? 'medium' : 'large';
  const status = level >= 3 ? [...ELEMENT_STATUSES[element]] : [];
  if (fusedSecondary) {
    for (const extra of ELEMENT_STATUSES[fusedSecondary]) {
      if (!status.includes(extra) && status.length < 3) status.push(extra);
    }
  }
  return {
    name: state?.fusedName ?? `${ELEMENT_LABELS[element]} 정령 Lv${level}`,
    effect: 'damage',
    target: evolved && ['nova', 'wave', 'zone', 'rain'].includes(ELEMENT_FORMS[element])
      ? 'area'
      : 'enemy',
    element_primary: element,
    element_secondary: fusedSecondary,
    form: evolved ? ELEMENT_FORMS[element] : 'bolt',
    size,
    speed: element === 'wind' || element === 'lightning' ? 'fast' : 'normal',
    status,
    // 융합체는 소모한 슬롯 수만큼의 power 예산을 쓴다 (2슬롯 → ×2, 총합은 불변)
    power: spiritAttackPower(level) * (state?.slotWeight ?? 1),
    cost: 0,
    flavor: '정령의 자동 시전은 마나·쿨다운·주문 기억을 사용하지 않는다.',
  };
}

function spiritTitle(definition: SpiritDefinition, level: SpiritLevel): string {
  const prefix = level === 1 ? '정령 계약' : '정령 진화';
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
    level: state.level,
    intervalSeconds: intervalFor(state),
    remainingSeconds: state.remainingSeconds,
    fused: state.slotWeight > 1,
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
