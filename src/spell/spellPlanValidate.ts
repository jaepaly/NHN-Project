import type { SpellSpec } from './types';
import { validateSpec } from './validate';
import {
  SEQUENCE_PLAN_LIMITS,
} from './sequencePlan';
import type {
  BehaviorTuning,
  FormBehavior,
  SpellBehavior,
  SpellPlan,
  SpellSequence,
  WaitBehavior,
} from './sequencePlan';

/**
 * 영창 시퀀스 판정 안전벽 (SPELL_SEQUENCE_SCHEMA_DRAFT §14).
 *
 * LLM(또는 Mock)이 낸 `spell_plan` 원문(신뢰 불가)을 화이트리스트·클램프해
 * 실행 가능한 SpellPlan으로 만든다. 구조적으로 잘못된 behavior는 **추측 변환하지 않고 제거**하며,
 * 유효 sequence가 하나도 안 남으면 null을 돌려준다(호출측이 fizzle/fallback으로 처리).
 *
 * 예산(power 배분·시간·마나)·중복 제거·상한 슬라이스는 resolveSpellPlan이 이어서 담당한다.
 * 여기서는 **타입/enum 안전성과 구조 유효성**만 책임진다.
 */

const MAX_PLAN_NAME_LENGTH = 40;

function finiteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** tuning은 유한 숫자 필드만 남긴다 (0·음수·NaN·무한대는 resolveSpellPlan/tuningScale이 무시) */
function sanitizeTuning(raw: unknown): BehaviorTuning | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const keys: (keyof BehaviorTuning)[] = [
    'damage', 'range', 'radius', 'duration', 'strength', 'amount',
  ];
  const out: BehaviorTuning = {};
  let has = false;
  for (const key of keys) {
    const n = finiteNumber(o[key]);
    if (n !== undefined) { out[key] = n; has = true; }
  }
  return has ? out : undefined;
}

/** behavior 하나를 검증한다. 알 수 없는 type이나 필수 필드 위반이면 null(제거). */
function validateBehavior(raw: unknown): SpellBehavior | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;

  if (o.type === 'wait') {
    return { type: 'wait' } satisfies WaitBehavior;
  }

  if (o.type === 'form') {
    // spec은 기존 단일 주문 검증기를 그대로 재사용 — enum·클램프 규칙 단일 출처.
    // power/cost는 여기서 무의미(로컬 재계산)하나 validateSpec 통과를 위해 원문을 그대로 넘긴다.
    const spec = validateSpec(o.spec);
    if (!spec) return null;
    const behavior: FormBehavior = { type: 'form', spec };
    const powerWeight = finiteNumber(o.powerWeight);
    if (powerWeight !== undefined) behavior.powerWeight = powerWeight;
    const tuning = sanitizeTuning(o.tuning);
    if (tuning) behavior.tuning = tuning;
    return behavior;
  }

  return null;
}

function validateSequence(raw: unknown): SpellSequence | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.behaviors)) return null;
  const behaviors = o.behaviors
    .slice(0, SEQUENCE_PLAN_LIMITS.maxBehaviorsPerSequence)
    .map(validateBehavior)
    .filter((b): b is SpellBehavior => b !== null);
  if (behaviors.length === 0) return null;
  const sequence: SpellSequence = { behaviors };
  const durationWeight = finiteNumber(o.durationWeight);
  if (durationWeight !== undefined) sequence.durationWeight = durationWeight;
  return sequence;
}

/**
 * LLM/Mock 원문 → 안전한 SpellPlan. 유효 sequence가 없으면 null.
 * @param raw 신뢰 불가 JSON (spell_plan 필드 값)
 */
export function validateSpellPlan(raw: unknown): SpellPlan | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.sequences)) return null;

  const sequences = o.sequences
    .slice(0, SEQUENCE_PLAN_LIMITS.maxSequences)
    .map(validateSequence)
    .filter((s): s is SpellSequence => s !== null);
  if (sequences.length === 0) return null;
  // wait is only an interval between forms. Without a form, resolveSpellPlan
  // removes trailing waits and would otherwise leave an executable plan empty.
  if (!sequences.some((sequence) => sequence.behaviors.some(
    (behavior) => behavior.type === 'form',
  ))) return null;
  const elements = new Set<string>();
  for (const sequence of sequences) {
    for (const behavior of sequence.behaviors) {
      if (behavior.type !== 'form') continue;
      elements.add(behavior.spec.element_primary);
      if (behavior.spec.element_secondary) elements.add(behavior.spec.element_secondary);
    }
  }
  const castMode = o.castMode === 'ultimate' ? 'ultimate' : 'normal';
  const formCount = sequences.reduce((count, sequence) => count + sequence.behaviors.filter(
    (behavior) => behavior.type === 'form',
  ).length, 0);
  if (castMode === 'normal' && elements.size > 2) return null;
  if (castMode === 'ultimate') {
    if (elements.size > 8 || sequences.length < 4 || sequences.length > 8) return null;
    if (formCount < 6 || formCount > 12) return null;
    if (!sequences.some((sequence) => sequence.behaviors.filter(
      (behavior) => behavior.type === 'form',
    ).length >= 2)) return null;
    if (!sequences.at(-1)?.behaviors.some((behavior) => behavior.type === 'form')) return null;
  }

  const name = typeof o.name === 'string' && o.name.trim().length > 0
    ? o.name.trim().slice(0, MAX_PLAN_NAME_LENGTH)
    : '영창';
  const power = castMode === 'ultimate'
    ? 100
    : Math.max(0, Math.min(80, finiteNumber(o.power) ?? 0));
  const durationMs = Math.max(0, finiteNumber(o.durationMs) ?? 0);
  if (castMode === 'ultimate' && (durationMs < 4000 || durationMs > 6000)) return null;
  return { name, castMode, power, durationMs, sequences };
}

/**
 * plan → 대표 SpellSpec — 기록·반복판정·타입 완결용(실행은 시퀀스 경로가 담당).
 * 가장 위력 높은 damage/공격 form을 대표로 삼는다.
 */
export function representativeSpecFromPlan(plan: SpellPlan): SpellSpec {
  let best: SpellSpec | null = null;
  for (const sequence of plan.sequences) {
    for (const behavior of sequence.behaviors) {
      if (behavior.type === 'form' && (!best || behavior.spec.power >= best.power)) {
        best = behavior.spec;
      }
    }
  }
  if (best) return best;
  const power = Math.max(0, Math.min(100, plan.power));
  return {
    name: plan.name,
    effect: 'damage',
    target: 'enemy',
    element_primary: 'wind',
    element_secondary: null,
    form: 'bolt',
    size: 'small',
    speed: 'normal',
    status: [],
    power,
    cost: Math.max(5, Math.round(power * 0.6)),
  };
}

/**
 * v2 단일 주문 → 단일 form 시퀀스 plan (SCHEMA_DRAFT §3 하위호환 변환).
 * 폴백·기존 판정을 시퀀스 런타임 하나로 합치기 위한 어댑터.
 */
export function planFromSpec(spec: SpellSpec): SpellPlan {
  return {
    name: spec.name,
    power: spec.power,
    durationMs: 0,
    sequences: [{
      durationWeight: 1,
      behaviors: [{ type: 'form', spec, powerWeight: 1 }],
    }],
  };
}
