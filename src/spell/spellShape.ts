/**
 * 주문 형상 DSL (L3 확장) — LLM이 **형태의 모양**을 설계한다.
 *
 * 소환 행동 DSL(summonBehavior)이 "어떻게 움직이는가"를 열었다면, 이쪽은
 * "어떤 모양으로 세워지는가"를 연다. 같은 철학: **허용된 부품만 화이트리스트로
 * 받고 수치는 클램프하며, 없거나 이상하면 기존 기본형으로 폴백**한다.
 *
 * 왜 필요한가 — "화염의 벽을 지그재그로 만들어라"에서 지금은 `지그재그`가 조용히
 * 버려진다. 벽 형상이 고정 원호 하나뿐이기 때문이다. 특정 단어를 특별 취급하면
 * 그건 하드코딩이므로(팀이 L3에서 거부한 방식), 모양 자체를 조합 가능한 어휘로 만든다.
 *
 * ⚠️ **형상은 위력이 아니다.** 어떤 모양이든 폴리라인 총 길이는 크기(size)가 정한
 * 값으로 정규화된다(`shapedWallPoints`). 모양은 표현이지 숨은 버프가 아니다 —
 * 친화 VFX 격상과 같은 원칙.
 */

/** LLM이 고를 수 있는 형상 부품 — 이 목록 밖은 거부하고 기본형(arc)으로 폴백 */
export const SHAPE_KINDS = [
  'arc',      // 원호 — 기본형 (시전자를 감싸는 완만한 곡선)
  'line',     // 직선 — 곧게 뻗은 장벽
  'zigzag',   // 갈지자 — 뾰족하게 꺾이는 톱니
  'wave',     // 물결 — 부드럽게 굽이치는 곡선
  'ring',     // 원 — 닫힌 고리 (둘러싸기)
  'polygon',  // 다각형 — 삼각형·사각형 등 닫힌 도형
] as const;

export type ShapeKind = typeof SHAPE_KINDS[number];

export interface SpellShape {
  kind: ShapeKind;
  /** zigzag·wave의 굴곡 세기 */
  amplitude?: number;
  /** polygon의 변 수 (삼각형=3) */
  sides?: number;
}

export const SHAPE_LIMITS = {
  defaultAmplitude: 30,
  maxAmplitude: 100,
  defaultSides: 3,
  minSides: 3,
  maxSides: 8,
} as const;

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * LLM 출력(신뢰 불가)을 안전한 SpellShape으로 검증·클램프한다.
 * @returns 형상이 없거나 알 수 없는 종류면 null → 호출측이 기본형(arc)을 쓴다.
 */
export function validateSpellShape(raw: unknown): SpellShape | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.kind !== 'string') return null;
  if (!(SHAPE_KINDS as readonly string[]).includes(o.kind)) return null;

  return {
    kind: o.kind as ShapeKind,
    amplitude: clampNumber(o.amplitude, SHAPE_LIMITS.defaultAmplitude, 1, SHAPE_LIMITS.maxAmplitude),
    sides: Math.round(
      clampNumber(o.sides, SHAPE_LIMITS.defaultSides, SHAPE_LIMITS.minSides, SHAPE_LIMITS.maxSides),
    ),
  };
}
