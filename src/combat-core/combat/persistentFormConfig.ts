import type { SpellSize, SpellSpeed } from '../../spell/types';

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
