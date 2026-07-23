import { ELEMENTS } from './types';
import type { SpellSpec } from './types';
import { validateSpec } from './validate';
import {
  MOVE_DESTINATIONS,
  SEQUENCE_PLAN_LIMITS,
} from './sequencePlan';
import type {
  BehaviorTuning,
  FormBehavior,
  MoveBehavior,
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

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

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

  if (o.type === 'move') {
    // 이동도 마법 정체성을 가지므로 element 필수, destination은 화이트리스트만.
    if (!isOneOf(MOVE_DESTINATIONS, o.destination)) return null;
    if (!isOneOf(ELEMENTS, o.element)) return null;
    const move: MoveBehavior = { type: 'move', destination: o.destination, element: o.element };
    const distance = finiteNumber(o.distance);
    const angle = finiteNumber(o.angle);
    if (distance !== undefined) move.distance = distance;
    if (angle !== undefined) move.angle = angle;
    return move;
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

  const name = typeof o.name === 'string' && o.name.trim().length > 0
    ? o.name.trim().slice(0, MAX_PLAN_NAME_LENGTH)
    : '영창';
  const power = Math.max(0, Math.min(100, finiteNumber(o.power) ?? 0));
  const durationMs = Math.max(0, finiteNumber(o.durationMs) ?? 0);

  return { name, power, durationMs, sequences };
}

/**
 * plan → 대표 SpellSpec — 기록·반복판정·타입 완결용(실행은 시퀀스 경로가 담당).
 * 가장 위력 높은 damage/공격 form을 대표로 삼고, 이동/대기만 있으면 무해한 자리표시 주문을 만든다.
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
  const firstMove = plan.sequences
    .flatMap((s) => s.behaviors)
    .find((b): b is MoveBehavior => b.type === 'move');
  const power = Math.max(0, Math.min(100, plan.power));
  return {
    name: plan.name,
    effect: 'damage',
    target: 'enemy',
    element_primary: firstMove?.element ?? 'wind',
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
