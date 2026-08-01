import type {
  SpellEffect,
  SpellElement,
  SpellForm,
  SpellSpec,
  SpellStatus,
  SpellTarget,
} from './types';
import { catalogSequenceFixture } from './sequenceFixtureCatalog';

export const SEQUENCE_PLAN_LIMITS = {
  maxSequences: 10,
  maxBehaviorsPerSequence: 5,
  maxDurationMs: 3000,
  baseDurationMs: 500,
  durationMsPerPower: 25,
} as const;

/** Future judge contract: requested duration is clamped locally from total power. */
export function maxSequenceDurationMs(power: number): number {
  const safePower = Number.isFinite(power) ? Math.max(0, Math.min(100, power)) : 0;
  return Math.min(
    SEQUENCE_PLAN_LIMITS.maxDurationMs,
    SEQUENCE_PLAN_LIMITS.baseDurationMs
      + safePower * SEQUENCE_PLAN_LIMITS.durationMsPerPower,
  );
}

export interface WaitBehavior {
  type: 'wait';
}

export interface BehaviorTuning {
  damage?: number;
  range?: number;
  radius?: number;
  duration?: number;
  strength?: number;
  amount?: number;
}

export interface FormBehavior {
  type: 'form';
  spec: SpellSpec;
  powerWeight?: number;
  tuning?: BehaviorTuning;
}

export type SpellBehavior = WaitBehavior | FormBehavior;

/** 실제 behavior가 사용하는 원소 집합. wait은 비원소이며 form은 보조 원소까지 포함한다. */
export function behaviorElements(behavior: SpellBehavior): SpellElement[] {
  if (behavior.type === 'wait') return [];
  return behavior.spec.element_secondary != null
    ? [behavior.spec.element_primary, behavior.spec.element_secondary]
    : [behavior.spec.element_primary];
}

/** 원소 친화 저주 등에서 실제 실행 behavior의 주·보조 원소를 공통 판정한다. */
export function behaviorUsesAnyElement(
  behavior: SpellBehavior,
  elements: readonly SpellElement[],
): boolean {
  return elements.length > 0
    && behaviorElements(behavior).some((element) => elements.includes(element));
}

export interface SpellSequence {
  durationWeight?: number;
  behaviors: SpellBehavior[];
}

export interface SpellPlan {
  name: string;
  castMode?: 'normal' | 'ultimate';
  power: number;
  durationMs: number;
  sequences: SpellSequence[];
}

export interface ResolvedSpellSequence {
  durationMs: number;
  behaviors: SpellBehavior[];
}

export interface ResolvedSpellPlan {
  name: string;
  castMode: 'normal' | 'ultimate';
  power: number;
  manaCost: number;
  sequences: ResolvedSpellSequence[];
}

export function tuningScale(
  tuning: BehaviorTuning | undefined,
  key: keyof BehaviorTuning,
  minimum = 0.65,
  maximum = 1.35,
): number {
  if (!tuning) return 1;
  const entries = Object.entries(tuning)
    .filter((entry): entry is [keyof BehaviorTuning, number] => (
      Number.isFinite(entry[1]) && entry[1] > 0
    ));
  const selected = entries.find(([entryKey]) => entryKey === key)?.[1];
  if (selected === undefined || entries.length <= 1) return 1;
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const neutralShare = 1 / entries.length;
  const relativeShare = (selected / total) / neutralShare;
  return Math.max(minimum, Math.min(maximum, relativeShare));
}

function finiteNonNegative(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value ?? fallback) : fallback;
}

function behaviorSignature(behavior: SpellBehavior): string {
  if (behavior.type !== 'form') return behavior.type;
  const { spec } = behavior;
  const elements = spec.element_secondary
    ? `${spec.element_primary}+${spec.element_secondary}`
    : spec.element_primary;
  const detail = spec.effect === 'control'
    ? spec.status.join('+') || 'slow'
    : spec.effect;
  return `${spec.form}:${elements}:${detail}`;
}

function normalizeBehaviors(behaviors: readonly SpellBehavior[]): SpellBehavior[] {
  const limited = behaviors.slice(0, SEQUENCE_PLAN_LIMITS.maxBehaviorsPerSequence);
  const withoutMixedWait = limited.some((behavior) => behavior.type !== 'wait')
    ? limited.filter((behavior) => behavior.type !== 'wait')
    : limited.slice(0, 1);
  const signatures = new Set<string>();
  return withoutMixedWait.filter((behavior) => {
    const signature = behaviorSignature(behavior);
    if (signatures.has(signature)) return false;
    signatures.add(signature);
    return true;
  });
}

/**
 * 시퀀스 흐름 — 행동이 "완결 대기" 없이 이어지게 하는 오버랩 타임라인 (총괄 발안 07-26).
 *
 * 기존: 시퀀스 i의 behaviors를 발동하고 durationMs를 **통째로** 기다린 뒤 i+1 시작.
 * 행동 사이가 턴제처럼 뚝뚝 끊겨 답답하다. 영창은 안무여야 한다.
 *
 * 변경: 시퀀스 i가 70% 진행된 시점에 i+1을 발동한다 — 이전 연출의 꼬리와 다음
 * 행동의 머리가 겹쳐 "슥슥" 이어진다. 판정·피해는 발동 시점의 각 form이 내므로
 * 총량 불변 — 시간 배치만 달라진다.
 *
 * 예외 2개:
 * - **wait 전용 시퀀스는 오버랩하지 않는다** — "심장이 두 번 뛰는 동안"처럼
 *   간격 자체가 내용인 행동을 당기면 의미가 죽는다.
 * - **마지막 시퀀스는 온전히 기다린다** — 겹칠 다음이 없고, 여기서 줄이면
 *   진행바가 마지막 연출보다 먼저 끝난다.
 */
export const SEQUENCE_FLOW_CONFIG = {
  /** 다음 시퀀스가 발동되는 이전 시퀀스 진행률 (0.7 = 70% 시점) */
  overlapStart: 0.7,
  /** 순간형 피날레가 끝난 뒤 입력·진행바만 남는 공백의 상한 */
  instantFinalTailMs: 200,
} as const;

const SUSTAINED_FINAL_FORMS = new Set<SpellForm>([
  'beam', 'rain', 'wall', 'cage', 'orbit', 'summon', 'buff', 'zone',
]);

export interface SequenceFlowTimeline {
  /** 시퀀스 i 발동 후 다음 발동까지 실제로 기다릴 ms */
  waitsMs: number[];
  /** 실효 총 실행 시간(ms) — 진행바가 이 값을 쓴다 */
  totalMs: number;
  /** 진행바 경계(0~1) — 각 시퀀스 **발동 시점** 기준. 화면과 실제 발동이 일치한다 */
  boundaries: number[];
}

function isWaitOnly(sequence: ResolvedSpellSequence): boolean {
  return sequence.behaviors.every((behavior) => behavior.type === 'wait');
}

function finalSequenceWaitMs(sequence: ResolvedSpellSequence): number {
  const duration = Math.max(0, sequence.durationMs);
  if (isWaitOnly(sequence)) return 0;
  const hasSustainedForm = sequence.behaviors.some((behavior) => (
    behavior.type === 'form' && SUSTAINED_FINAL_FORMS.has(behavior.spec.form)
  ));
  return hasSustainedForm
    ? duration
    : Math.min(duration, SEQUENCE_FLOW_CONFIG.instantFinalTailMs);
}

export function sequenceFlowTimeline(
  sequences: readonly ResolvedSpellSequence[],
): SequenceFlowTimeline {
  const waitsMs = sequences.map((sequence, index) => {
    const duration = Math.max(0, sequence.durationMs);
    const isLast = index === sequences.length - 1;
    if (isLast) return finalSequenceWaitMs(sequence);
    if (isWaitOnly(sequence)) return duration;
    return duration * SEQUENCE_FLOW_CONFIG.overlapStart;
  });
  const totalMs = waitsMs.reduce((sum, ms) => sum + ms, 0);
  let elapsed = 0;
  const boundaries = sequences.slice(0, -1).map((_, index) => {
    elapsed += waitsMs[index];
    return totalMs > 0 ? elapsed / totalMs : 0;
  });
  return { waitsMs, totalMs, boundaries };
}

export function resolveSpellPlan(plan: SpellPlan): ResolvedSpellPlan {
  const ultimate = plan.castMode === 'ultimate';
  const power = Math.max(0, Math.min(100, finiteNonNegative(plan.power, 0)));
  const durationMs = Math.min(
    ultimate ? 6000 : maxSequenceDurationMs(power),
    finiteNonNegative(plan.durationMs, 0),
  );
  const sequences = plan.sequences
    .slice(0, SEQUENCE_PLAN_LIMITS.maxSequences)
    .map((sequence) => ({
      durationWeight: finiteNonNegative(sequence.durationWeight, 1),
      behaviors: normalizeBehaviors(sequence.behaviors),
    }))
    .filter((sequence) => sequence.behaviors.length > 0)
    .filter((sequence) => !(
      sequence.durationWeight === 0
      && sequence.behaviors.every((behavior) => behavior.type === 'wait')
    ));
  // wait은 사건 사이의 간격이다. 뒤따르는 사건이 없는 trailing wait은 의미가 없고
  // 진행바·다음 입력만 늦추므로 입력 출처와 무관하게 로컬에서 제거한다.
  while (sequences.length > 0 && sequences.at(-1)!.behaviors.every(
    (behavior) => behavior.type === 'wait',
  )) {
    sequences.pop();
  }

  const totalDurationWeight = sequences.reduce(
    (sum, sequence) => sum + sequence.durationWeight,
    0,
  );
  const normalizedDurationWeight = totalDurationWeight > 0
    ? totalDurationWeight
    : Math.max(1, sequences.length);
  const formBehaviors = sequences.flatMap((sequence) => (
    sequence.behaviors.filter((behavior): behavior is FormBehavior => behavior.type === 'form')
  ));
  const totalPowerWeight = formBehaviors.reduce(
    (sum, behavior) => sum + finiteNonNegative(behavior.powerWeight, 1),
    0,
  );

  return {
    name: plan.name,
    castMode: ultimate ? 'ultimate' : 'normal',
    power,
    manaCost: ultimate ? 0 : Math.max(5, Math.round(power * 0.6)),
    sequences: sequences.map((sequence) => ({
      durationMs: durationMs * (
        totalDurationWeight > 0 ? sequence.durationWeight : 1
      ) / normalizedDurationWeight,
      behaviors: sequence.behaviors.map((behavior) => {
        if (behavior.type !== 'form') return behavior;
        const weight = finiteNonNegative(behavior.powerWeight, 1);
        const allocatedPower = totalPowerWeight > 0
          ? power * weight / totalPowerWeight
          : 0;
        return {
          ...behavior,
          powerWeight: weight,
          spec: {
            ...behavior.spec,
            power: Math.max(0, Math.round(allocatedPower)),
            cost: 0,
          },
        };
      }),
    })),
  };
}

function spell(
  name: string,
  form: SpellForm,
  element: SpellElement,
  effect: SpellEffect = 'damage',
  target: SpellTarget = 'enemy',
  status: SpellStatus[] = [],
): SpellSpec {
  return {
    name,
    effect,
    target,
    element_primary: element,
    element_secondary: null,
    form,
    size: 'medium',
    speed: 'normal',
    status,
    power: 0,
    cost: 0,
  };
}

const form = (
  spec: SpellSpec,
  powerWeight = 1,
  tuning?: BehaviorTuning,
): FormBehavior => ({ type: 'form', spec, powerWeight, tuning });

export function debugSpellPlan(keyword: string): SpellPlan | null {
  const catalogFixture = catalogSequenceFixture(keyword);
  if (catalogFixture) return catalogFixture;
  const rawKey = keyword.trim().toLowerCase();
  const showcaseAliases: Record<string, string> = {
    '불사조의 낙화': 'phoenix-dive',
    '뇌광의 사냥': 'thunder-hunt',
    '겨울 정원의 폐막': 'winter-garden',
    '일식의 왈츠': 'eclipse-waltz',
    '최후의 성채': 'last-bastion',
    '해일의 역류': 'receding-tide',
    '폭풍의 눈': 'eye-of-storm',
    '심연의 군세': 'abyssal-host',
    '새벽의 순례': 'dawn-pilgrimage',
    '허공답보': 'void-steps',
    '유리별의 사격': 'glass-star-shot',
    '팔원소 대합창': 'octave-of-elements',
  };
  const key = showcaseAliases[rawKey] ?? rawKey.replace(/^#seq\s+/, '');
  switch (key) {
    case 'single':
      return {
        name: '단일 화염 폭발', power: 60, durationMs: 700,
        sequences: [{ durationWeight: 1, behaviors: [
          form(spell('단일 화염 폭발', 'nova', 'fire'), 1),
        ] }],
      };
    case 'dash-nova':
      return {
        name: '돌진 폭발', power: 75, durationMs: 1500,
        sequences: [
          { durationWeight: 1, behaviors: [
            form(spell('돌진 폭발', 'nova', 'fire'), 1),
          ] },
        ],
      };
    case 'parallel':
      return {
        name: '광휘 돌진 감금', power: 82, durationMs: 1900,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('광휘 돌진', 'beam', 'light'), 2, { range: 3, damage: 1 }),
          ] },
          { durationWeight: 1, behaviors: [
            form(spell('어둠 감금', 'cage', 'dark', 'control', 'enemy'), 1),
          ] },
        ],
      };
    case 'lockon':
      return {
        name: '빙결 표식 추적', power: 70, durationMs: 2200,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('빙결 표식', 'zone', 'ice', 'control', 'area', ['slow']), 1,
              { duration: 3, strength: 1 }),
          ] },
          { durationWeight: 1, behaviors: [
            form(spell('추적 광선', 'beam', 'light'), 2),
          ] },
        ],
      };
    case 'retarget':
      return {
        name: '연속 처형', power: 90, durationMs: 2600,
        sequences: [
          { durationWeight: 1, behaviors: [form(spell('첫 표식', 'bolt', 'lightning'), 2)] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 1, behaviors: [form(spell('다음 표식', 'beam', 'lightning'), 3)] },
        ],
      };
    case 'petal-dance':
      return {
        name: '꽃잎 댄스', power: 78, durationMs: 3000,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('꽃잎 윤무', 'orbit', 'wind'), 2),
          ] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 2, behaviors: [
            form(spell('꽃잎 파동', 'wave', 'wind'), 2),
          ] },
        ],
      };
    case 'shield':
      return {
        name: '응축 보호막', power: 65, durationMs: 900,
        sequences: [{ durationWeight: 1, behaviors: [
          form(spell('응축 보호막', 'buff', 'earth', 'shield', 'self'), 1,
            { amount: 3, duration: 1 }),
        ] }],
      };
    case 'self-buff-only':
    case 'movement-only': // 이전 DEV 키 호환 별칭
      return {
        name: '삼연보', power: 60, durationMs: 2100,
        sequences: [
          { durationWeight: 1, behaviors: [form(spell('첫 바람 자취', 'wave', 'wind'), 1)] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 1, behaviors: [form(spell('마지막 바람 자취', 'nova', 'wind'), 1)] },
        ],
      };
    case 'phoenix-dive':
      return {
        name: '불사조의 낙화', power: 88, durationMs: 2700,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('불사조의 궤적', 'wave', 'fire'), 2, { range: 3, damage: 2 }),
          ] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 2, behaviors: [
            form(spell('낙화 폭발', 'nova', 'fire'), 3, { radius: 3, damage: 2 }),
          ] },
        ],
      };
    case 'thunder-hunt':
      return {
        name: '뇌광의 사냥', power: 84, durationMs: 2400,
        sequences: [
          { durationWeight: 1, behaviors: [
            form(spell('뇌광 표식', 'bolt', 'lightning'), 1),
          ] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 2, behaviors: [
            form(spell('추적 낙뢰', 'chain', 'lightning'), 3, { range: 3, damage: 2 }),
          ] },
        ],
      };
    case 'winter-garden':
      return {
        name: '겨울 정원의 폐막', power: 80, durationMs: 2300,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('서리 정원', 'zone', 'ice', 'control', 'area', ['slow']), 2,
              { radius: 3, duration: 2, strength: 1 }),
          ] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 1, behaviors: [
            form(spell('빙결 폐막', 'cage', 'ice', 'control', 'enemy', ['freeze']), 2,
              { duration: 3, strength: 2 }),
          ] },
        ],
      };
    case 'eclipse-waltz':
      return {
        name: '일식의 왈츠', power: 92, durationMs: 2800,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('그림자 선회', 'orbit', 'dark'), 2, { radius: 2, damage: 1 }),
          ] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 2, behaviors: [
            form(spell('개기일식', 'beam', 'light'), 3, { range: 3, damage: 2 }),
          ] },
        ],
      };
    case 'last-bastion':
      return {
        name: '최후의 성채', power: 86, durationMs: 2100,
        sequences: [
          { durationWeight: 1, behaviors: [
            form(spell('대지의 가호', 'buff', 'earth', 'shield', 'self'), 1,
              { amount: 3, duration: 1 }),
          ] },
          { durationWeight: 2, behaviors: [
            form(spell('성채의 벽', 'wall', 'earth', 'control', 'area', ['knockback']), 3,
              { range: 2, duration: 2, strength: 1 }),
          ] },
        ],
      };
    case 'receding-tide':
      return {
        name: '해일의 역류', power: 82, durationMs: 2300,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('밀어내는 해류', 'wave', 'water', 'control', 'area', ['knockback']), 2,
              { range: 3, strength: 2 }),
          ] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 2, behaviors: [
            form(spell('되감기는 폭우', 'rain', 'water'), 3, { radius: 3, damage: 2 }),
          ] },
        ],
      };
    case 'eye-of-storm':
      return {
        name: '폭풍의 눈', power: 90, durationMs: 2700,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('고요한 눈', 'zone', 'wind', 'control', 'area', ['slow']), 1,
              { radius: 3, duration: 2 }),
            form(spell('폭풍 고리', 'orbit', 'lightning'), 2,
              { radius: 2, damage: 2 }),
          ] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 2, behaviors: [
            form(spell('낙뢰의 가지', 'chain', 'lightning', 'damage', 'enemy', ['shock']), 3,
              { range: 3, damage: 2 }),
          ] },
        ],
      };
    case 'abyssal-host':
      return {
        name: '심연의 군세', power: 94, durationMs: 2850,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('심연의 문', 'zone', 'dark', 'control', 'area', ['weaken']), 1,
              { radius: 3, duration: 2 }),
            form(spell('그림자 권속', 'summon', 'dark', 'summon', 'area'), 2),
          ] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 2, behaviors: [
            form(spell('도망칠 수 없는 밤', 'cage', 'dark', 'control', 'enemy', ['slow']), 2,
              { duration: 3, strength: 2 }),
            form(spell('심연의 숨결', 'beam', 'dark'), 2, { range: 3, damage: 2 }),
          ] },
        ],
      };
    case 'dawn-pilgrimage':
      return {
        name: '새벽의 순례', power: 76, durationMs: 2100,
        sequences: [
          { durationWeight: 2, behaviors: [
            form(spell('새벽의 치유', 'buff', 'light', 'heal', 'self'), 2,
              { amount: 3, duration: 1 }),
          ] },
          { durationWeight: 1, behaviors: [
            form(spell('순례자의 가호', 'buff', 'earth', 'shield', 'self'), 2,
              { amount: 3, duration: 1 }),
          ] },
        ],
      };
    case 'void-steps':
      return {
        name: '허공답보', power: 72, durationMs: 2200,
        sequences: [
          { durationWeight: 1, behaviors: [form(spell('첫 공허 잔상', 'orbit', 'dark'), 1)] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
          { durationWeight: 1, behaviors: [form(spell('두 번째 공허 잔상', 'wave', 'dark'), 1)] },
          { durationWeight: 1, behaviors: [{ type: 'wait' }] },
        ],
      };
    case 'glass-star-shot':
      return {
        name: '유리별의 사격', power: 85, durationMs: 2400,
        sequences: [
          { durationWeight: 1, behaviors: [
            form(spell('유리별 조각', 'bolt', 'ice', 'damage', 'enemy', ['freeze']), 1),
          ] },
          { durationWeight: 1, behaviors: [
            form(spell('굴절광', 'beam', 'light'), 2, { range: 3, damage: 1 }),
          ] },
          { durationWeight: 2, behaviors: [
            form(spell('별의 파쇄', 'nova', 'ice'), 3, { radius: 3, damage: 2 }),
          ] },
        ],
      };
    case 'octave-of-elements':
      return {
        name: '팔원소 대합창', power: 100, durationMs: 3000,
        sequences: [
          { durationWeight: 1, behaviors: [
            form(spell('불과 물의 서주', 'wave', 'fire'), 1),
            form(spell('밀려오는 화음', 'wave', 'water'), 1),
          ] },
          { durationWeight: 1, behaviors: [
            form(spell('천둥과 서리의 변주', 'chain', 'lightning'), 1),
            form(spell('얼어붙은 박자', 'cage', 'ice', 'control', 'enemy', ['freeze']), 1),
          ] },
          { durationWeight: 1, behaviors: [
            form(spell('대지와 바람의 합주', 'wall', 'earth', 'control', 'area', ['knockback']), 1),
            form(spell('회오리 선율', 'orbit', 'wind'), 1),
          ] },
          { durationWeight: 1, behaviors: [
            form(spell('빛과 어둠의 종장', 'beam', 'light'), 1),
            form(spell('밤의 종지', 'nova', 'dark'), 1),
          ] },
        ],
      };
    default:
      return null;
  }
}
