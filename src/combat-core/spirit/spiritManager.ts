import { ELEMENTS } from '../../spell/types';
import type { SpellElement, SpellForm, SpellSize, SpellSpec, SpellStatus } from '../../spell/types';
import type { RewardOption, SpiritRole } from '../../run/runContract';
import { ELEMENT_LABELS } from '../../render/palette';

export const SPIRIT_CONFIG = {
  maxSlots: 2,
  maxLevel: 3,
  attackBasePower: 50,
  /** 공격 정령 한 슬롯은 수동 지속 DPS의 7.5%를 사용한다. */
  attackPowerScale: 0.15,
  attackIntervals: [6, 4.5, 4.5],
  utilityIntervals: [8, 7, 6],
  healAmounts: [10, 15, 22],
  guardAmounts: [12, 18, 26],
} as const;

export type SpiritLevel = 1 | 2 | 3;

export interface SpiritSnapshot {
  spiritId: string;
  role: SpiritRole;
  element?: SpellElement;
  level: SpiritLevel;
  intervalSeconds: number;
  remainingSeconds: number;
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
      existing.remainingSeconds = Math.min(existing.remainingSeconds, intervalFor(existing));
      return snapshot(existing);
    }

    if (option.spirit.level !== 1 || this.slots.length >= SPIRIT_CONFIG.maxSlots) return null;
    const created: SpiritState = {
      ...definition,
      level: 1,
      remainingSeconds: intervalFor({ ...definition, level: 1 }),
    };
    this.slots.push(created);
    return snapshot(created);
  }

  update(deltaSeconds: number): readonly SpiritPulseRequest[] {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (delta === 0) return [];

    const requests: SpiritPulseRequest[] = [];
    for (const spirit of this.slots) {
      spirit.remainingSeconds -= delta;
      const interval = intervalFor(spirit);
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
  }

  private createRewardOption(roomIndex: number, rand: () => number): RewardOption | null {
    const candidates: Array<{ definition: SpiritDefinition; level: SpiritLevel }> = [];
    if (this.slots.length < SPIRIT_CONFIG.maxSlots) {
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
  return SPIRIT_CONFIG.attackBasePower * SPIRIT_CONFIG.attackPowerScale * intervalRatio;
}

function intervalFor(spirit: Pick<SpiritState, 'role' | 'level'>): number {
  return spiritInterval(spirit.role, spirit.level);
}

function pulseFor(spirit: SpiritState): SpiritPulseRequest {
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
    spell: attackSpell(spirit.element ?? 'light', spirit.level),
  };
}

function attackSpell(element: SpellElement, level: SpiritLevel): SpellSpec {
  const evolved = level >= 2;
  const size: SpellSize = level === 1 ? 'small' : level === 2 ? 'medium' : 'large';
  return {
    name: `${ELEMENT_LABELS[element]} 정령 Lv${level}`,
    effect: 'damage',
    target: evolved && ['nova', 'wave', 'zone', 'rain'].includes(ELEMENT_FORMS[element])
      ? 'area'
      : 'enemy',
    element_primary: element,
    element_secondary: null,
    form: evolved ? ELEMENT_FORMS[element] : 'bolt',
    size,
    speed: element === 'wind' || element === 'lightning' ? 'fast' : 'normal',
    status: level >= 3 ? [...ELEMENT_STATUSES[element]] : [],
    power: spiritAttackPower(level),
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
    level: state.level,
    intervalSeconds: intervalFor(state),
    remainingSeconds: state.remainingSeconds,
  };
}

function cloneReward(option: RewardOption): RewardOption {
  return {
    ...option,
    engrave: option.engrave ? { ...option.engrave } : undefined,
    spirit: option.spirit ? { ...option.spirit } : undefined,
  };
}

function randomIndex(length: number, rand: () => number): number {
  const raw = rand();
  const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
  return Math.floor(value * length);
}
