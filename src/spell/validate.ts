import {
  EFFECTS, ELEMENTS, FORMS, SIZES, SPEEDS, STATUSES, TARGETS,
  FALLBACK_SPELL,
} from './types';
import { validateSummonBehavior } from './summonBehavior';
import type { SpellJudgement, SpellSpec, SpellStatus } from './types';

const MAX_SPELL_NAME_LENGTH = 30;

function isOneOf<T extends readonly string[]>(list: T, v: unknown): v is T[number] {
  return typeof v === 'string' && (list as readonly string[]).includes(v);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * LLM 출력(unknown)을 검증·클램프해 안전한 SpellSpec으로 만든다 — GDD §3.4~3.5
 * 렌더러에는 이 함수를 통과한 값만 도달한다.
 *
 * @param raw LLM이 반환한 JSON (신뢰 불가)
 * @param powerCap 스테이지별 power 상한
 * @returns 검증 실패 시 null (호출측에서 재시도 → FALLBACK_SPELL 순으로 처리)
 */
export function validateSpec(raw: unknown, powerCap = 100): SpellSpec | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;

  // 필수 enum 필드 — 하나라도 어긋나면 통째로 거부 (부분 수용은 예측 불가능성을 낳는다)
  if (!isOneOf(ELEMENTS, o.element_primary)) return null;
  if (!isOneOf(FORMS, o.form)) return null;
  if (!isOneOf(EFFECTS, o.effect)) return null;
  if (!isOneOf(TARGETS, o.target)) return null;

  const secondary =
    o.element_secondary === null || o.element_secondary === undefined
      ? null
      : isOneOf(ELEMENTS, o.element_secondary) ? o.element_secondary : null;

  const size = isOneOf(SIZES, o.size) ? o.size : 'medium';
  const speed = isOneOf(SPEEDS, o.speed) ? o.speed : 'normal';

  const status: SpellStatus[] = Array.isArray(o.status)
    ? o.status.filter((s): s is SpellStatus => isOneOf(STATUSES, s)).slice(0, 3)
    : [];

  const power = clamp(Math.round(Number(o.power) || 0), 0, powerCap);
  const cost = clamp(Math.round(Number(o.cost) || 0), 1, 100);

  const name =
    typeof o.name === 'string' && o.name.trim().length > 0
      ? o.name.trim().slice(0, MAX_SPELL_NAME_LENGTH)
      : FALLBACK_SPELL.name;

  return {
    name,
    effect: o.effect,
    target: o.target,
    element_primary: o.element_primary,
    element_secondary: secondary === o.element_primary ? null : secondary,
    form: o.form,
    size,
    speed,
    status,
    power,
    cost,
    flavor: typeof o.flavor === 'string' ? o.flavor.slice(0, 60) : undefined,
    behavior: validateSummonBehavior(o.behavior) ?? undefined,
  };
}

/** 신뢰할 수 없는 LLM/캐시 출력을 SpellJudgement v2로 검증한다. */
export function validateJudgement(raw: unknown, powerCap = 100): SpellJudgement | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== 2) return null;

  if (o.disposition === 'cast') {
    const spell = validateSpec(o.spell, powerCap);
    return spell ? { schema_version: 2, disposition: 'cast', spell } : null;
  }

  if (o.disposition !== 'fizzle' && o.disposition !== 'blocked') return null;
  const expectedReason = o.disposition === 'fizzle' ? 'nonsense' : 'unsafe';
  if (o.reason !== expectedReason) return null;
  const fallbackMessage = o.disposition === 'fizzle'
    ? '마력이 형태를 이루지 못했다'
    : '해당 문장으로는 영창할 수 없습니다';
  const message = typeof o.message === 'string' && o.message.trim()
    ? o.message.trim().slice(0, 60)
    : fallbackMessage;
  return {
    schema_version: 2,
    disposition: o.disposition,
    reason: expectedReason,
    message,
  };
}
