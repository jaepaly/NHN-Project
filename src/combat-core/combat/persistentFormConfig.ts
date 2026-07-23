import type { SpellSize, SpellSpeed } from '../../spell/types';
import { SHAPE_LIMITS } from '../../spell/spellShape';
import type { SpellShape } from '../../spell/spellShape';

export interface FormPoint {
  x: number;
  y: number;
}

export const WALL_CONFIG = {
  offset: 90,
  lengths: {
    small: 120,
    medium: 160,
    large: 220,
    huge: 300,
  } satisfies Record<SpellSize, number>,
  thickness: 14,
  durations: {
    slow: 4,
    normal: 3,
    fast: 2.2,
  } satisfies Record<SpellSpeed, number>,
  damageMultiplier: 0.5,
  bossSlowMovementMultiplier: 0.6,
  bossSlowDurationSeconds: 1.5,
  targetingRange: 650,
  targetingHalfWidth: 150,
  segmentCount: 32,
} as const;

export const ORBIT_CONFIG = {
  counts: {
    small: 2,
    medium: 3,
    large: 4,
    huge: 5,
  } satisfies Record<SpellSize, number>,
  radius: 90,
  rotationsPerSecond: {
    slow: 0.9,
    normal: 1.2,
    fast: 1.6,
  } satisfies Record<SpellSpeed, number>,
  durationSeconds: 4,
  contactRadius: 16,
  damageMultiplier: 0.35,
  repeatHitCooldownSeconds: 0.8,
} as const;

export function wallDurationSeconds(speed: SpellSpeed): number {
  return WALL_CONFIG.durations[speed];
}

/** 플레이어를 원의 중심으로 삼아 목표 방향을 바라보는 원호 점 목록을 만든다. */
export function wallArcPoints(
  origin: FormPoint,
  target: FormPoint | null,
  size: SpellSize,
  rangeScale = 1,
): readonly FormPoint[] {
  const safeScale = Number.isFinite(rangeScale) ? Math.max(0.25, rangeScale) : 1;
  const direction = normalizedDirection(origin, target);
  const middleAngle = Math.atan2(direction.y, direction.x);
  const halfArcAngle = WALL_CONFIG.lengths[size] / WALL_CONFIG.offset / 2;
  const points: FormPoint[] = [];
  for (let index = 0; index <= WALL_CONFIG.segmentCount; index += 1) {
    const ratio = index / WALL_CONFIG.segmentCount;
    const angle = middleAngle - halfArcAngle + halfArcAngle * 2 * ratio;
    points.push({
      x: origin.x + Math.cos(angle) * WALL_CONFIG.offset * safeScale,
      y: origin.y + Math.sin(angle) * WALL_CONFIG.offset * safeScale,
    });
  }
  return points;
}

/** 폴리라인 총 길이 */
function polylineLength(points: readonly FormPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

/** 중심을 고정한 채 배율 조정 — 형상의 성격은 유지하고 크기만 맞춘다 */
function scaleAbout(points: readonly FormPoint[], center: FormPoint, k: number): FormPoint[] {
  return points.map((p) => ({
    x: center.x + (p.x - center.x) * k,
    y: center.y + (p.y - center.y) * k,
  }));
}

/**
 * 기본 원호(arc)의 실효 정면폭 — 목표 방향과 수직으로 잰 벽의 폭.
 * 열린 형상의 정규화 기준이자, 오탐 무해화의 축이다 (아래 불변식 참조).
 */
export function wallFrontage(size: SpellSize, rangeScale = 1): number {
  const safeScale = Number.isFinite(rangeScale) ? Math.max(0.25, rangeScale) : 1;
  const halfArcAngle = WALL_CONFIG.lengths[size] / WALL_CONFIG.offset / 2;
  // 호가 반원을 넘으면(huge) 횡폭은 지름에서 캡된다 — sin이 다시 줄어드는 걸 막는다
  const spread = halfArcAngle >= Math.PI / 2 ? 1 : Math.sin(halfArcAngle);
  return 2 * WALL_CONFIG.offset * safeScale * spread;
}

/**
 * 형상 DSL을 실제 벽 폴리라인으로 실현한다 (L3 확장 — spellShape.ts).
 *
 * ⚠️ **불변식: 형상은 표현이지 위력이 아니다.** 다만 열린 형상과 닫힌 형상은
 * "세기"의 척도가 달라 기준을 나눈다 (회귀로 고정):
 *
 * - **열린 형상**(line·zigzag·wave): **정면폭 = 기본 원호(arc)의 실효 정면폭** 고정.
 *   벽의 힘은 *얼마나 넓은 통로를 막는가*이므로 정면폭이 맞는 척도다. 굴곡은 전진축
 *   방향이라 정면폭을 건드리지 않는다 — 접어도 막는 폭은 같고 모양만 달라진다.
 *   기준을 arc와 통일한 이유(#133 오탐 실측): LLM이 모양 묘사 없는 벽에 간헐적으로
 *   `line`을 붙이는데, line 정면폭이 arc보다 넓으면 **오탐 = 숨은 버프**가 된다.
 *   전 형상의 정면폭을 arc와 같게 묶으면 오탐이 떠도 세기가 변하지 않는다 —
 *   프롬프트(확률적)에 기대지 않는 결정론적 방어.
 *   (총 길이로 정규화하면 "지그재그로 만들라"는 말이 벽을 좁히는 **벌칙**이 된다.)
 * - **닫힌 형상**(ring·polygon): **총 둘레 = 같은 값** 고정. 360° 차단은 틈이 없어
 *   그 자체로 강하므로, 둘레까지 키워주면 이중 이득이 된다. 둘레를 묶어 반경으로 상쇄한다.
 *
 * shape가 없거나 'arc'면 기존 `wallArcPoints`와 **완전히 동일**한 결과를 낸다.
 */
export function shapedWallPoints(
  origin: FormPoint,
  target: FormPoint | null,
  size: SpellSize,
  rangeScale = 1,
  shape?: SpellShape | null,
): readonly FormPoint[] {
  if (!shape || shape.kind === 'arc') {
    return wallArcPoints(origin, target, size, rangeScale);
  }
  const safeScale = Number.isFinite(rangeScale) ? Math.max(0.25, rangeScale) : 1;
  const targetLength = WALL_CONFIG.lengths[size];
  const direction = normalizedDirection(origin, target);
  const offset = WALL_CONFIG.offset * safeScale;
  // 벽의 중심 = 시전자에서 목표 방향으로 offset 떨어진 지점
  const center: FormPoint = {
    x: origin.x + direction.x * offset,
    y: origin.y + direction.y * offset,
  };
  const forward = direction;                                   // 목표 방향
  const normal = { x: -direction.y, y: direction.x };          // 좌우(횡) 방향
  const segments = WALL_CONFIG.segmentCount;
  const amplitude = shape.amplitude ?? SHAPE_LIMITS.defaultAmplitude;

  let raw: FormPoint[];
  if (shape.kind === 'ring' || shape.kind === 'polygon') {
    // 닫힌 도형은 시전자를 감싼다 — "원을 그리며 벽을 세운다"
    const corners = shape.kind === 'ring' ? segments : Math.max(3, shape.sides ?? 3);
    raw = [];
    for (let i = 0; i <= corners; i += 1) {
      const angle = (Math.PI * 2 * i) / corners - Math.PI / 2;
      raw.push({
        x: origin.x + Math.cos(angle) * offset,
        y: origin.y + Math.sin(angle) * offset,
      });
    }
    const scaled = scaleAbout(raw, origin, targetLength / (polylineLength(raw) || 1));
    return scaled;
  }

  // 열린 형상 — 정면폭(횡방향)은 그대로 두고 전진축으로만 굽힌다.
  // 굴곡이 정면폭을 깎지 않으므로 재정규화하지 않는다 (위 불변식 참조).
  const frontage = wallFrontage(size, rangeScale);
  raw = [];
  for (let i = 0; i <= segments; i += 1) {
    const ratio = i / segments;
    const along = (ratio - 0.5) * frontage;        // 횡방향 진행 = 정면폭(arc와 동일)
    let bend = 0;                                  // 전진축 굴곡
    if (shape.kind === 'zigzag') {
      // 삼각파 — 뾰족하게 꺾인다
      const phase = ratio * 6;
      bend = (Math.abs((phase % 2) - 1) * 2 - 1) * amplitude;
    } else if (shape.kind === 'wave') {
      bend = Math.sin(ratio * Math.PI * 3) * amplitude;
    }
    raw.push({
      x: center.x + normal.x * along + forward.x * bend,
      y: center.y + normal.y * along + forward.y * bend,
    });
  }
  return raw;
}

export function orbitCount(size: SpellSize): number {
  return ORBIT_CONFIG.counts[size];
}

export function orbitAngularVelocity(speed: SpellSpeed): number {
  return ORBIT_CONFIG.rotationsPerSecond[speed] * Math.PI * 2;
}

export function orbitPoint(
  center: FormPoint,
  baseAngle: number,
  index: number,
  count: number,
  radiusScale = 1,
): FormPoint {
  const safeCount = Math.max(1, Math.floor(count));
  const safeScale = Number.isFinite(radiusScale) ? Math.max(0.25, radiusScale) : 1;
  const angle = baseAngle + Math.PI * 2 * index / safeCount;
  return {
    x: center.x + Math.cos(angle) * ORBIT_CONFIG.radius * safeScale,
    y: center.y + Math.sin(angle) * ORBIT_CONFIG.radius * safeScale,
  };
}

export function repeatHitReady(lastHitAt: number | undefined, elapsedSeconds: number): boolean {
  return lastHitAt === undefined
    || elapsedSeconds - lastHitAt >= ORBIT_CONFIG.repeatHitCooldownSeconds - Number.EPSILON;
}

/** 빠른 이동체가 원호의 선분 사이를 한 프레임에 통과해도 잡아내는 sweep 판정. */
export function sweepIntersectsPolyline(
  from: FormPoint,
  to: FormPoint,
  radius: number,
  points: readonly FormPoint[],
): boolean {
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  for (let index = 1; index < points.length; index += 1) {
    if (segmentDistance(from, to, points[index - 1], points[index]) <= safeRadius) {
      return true;
    }
  }
  return false;
}

function normalizedDirection(origin: FormPoint, target: FormPoint | null): FormPoint {
  const dx = (target?.x ?? origin.x) - origin.x;
  const dy = (target?.y ?? origin.y - 1) - origin.y;
  const length = Math.hypot(dx, dy);
  if (length <= Number.EPSILON) return { x: 0, y: -1 };
  return { x: dx / length, y: dy / length };
}

function segmentDistance(
  a0: FormPoint,
  a1: FormPoint,
  b0: FormPoint,
  b1: FormPoint,
): number {
  if (segmentsIntersect(a0, a1, b0, b1)) return 0;
  return Math.min(
    pointSegmentDistance(a0, b0, b1),
    pointSegmentDistance(a1, b0, b1),
    pointSegmentDistance(b0, a0, a1),
    pointSegmentDistance(b1, a0, a1),
  );
}

function pointSegmentDistance(point: FormPoint, start: FormPoint, end: FormPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return Math.hypot(point.x - start.x, point.y - start.y);
  const ratio = Math.max(0, Math.min(1,
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + dx * ratio), point.y - (start.y + dy * ratio));
}

function segmentsIntersect(a0: FormPoint, a1: FormPoint, b0: FormPoint, b1: FormPoint): boolean {
  const o1 = orientation(a0, a1, b0);
  const o2 = orientation(a0, a1, b1);
  const o3 = orientation(b0, b1, a0);
  const o4 = orientation(b0, b1, a1);
  return o1 * o2 <= 0 && o3 * o4 <= 0;
}

function orientation(a: FormPoint, b: FormPoint, c: FormPoint): number {
  const value = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(value) <= Number.EPSILON) return 0;
  return Math.sign(value);
}
