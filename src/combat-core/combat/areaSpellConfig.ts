import type { SpellSpeed } from '../../spell/types';

export const ZONE_CONFIG = {
  castRange: 320,
  baseRadius: 130,
  tickCount: 10,
  damageMultiplierPerTick: 0.08,
  controlLingerSeconds: 0.5,
  durationSeconds: {
    slow: 4,
    normal: 3,
    fast: 2.4,
  },
} as const;

export const RAIN_CONFIG = {
  castRange: 520,
  baseAreaRadius: 150,
  baseStrikeRadius: 38,
  strikeCount: 6,
  damageMultiplierPerStrike: 0.25,
  launchDurationSeconds: {
    slow: 3,
    normal: 2.4,
    fast: 1.8,
  },
  fallDurationMs: {
    slow: 520,
    normal: 400,
    fast: 300,
  },
  fallHeight: 260,
} as const;

export interface AreaTargetPoint {
  readonly x: number;
  readonly y: number;
}

export interface AreaTargetCandidate extends AreaTargetPoint {
  readonly collisionRadius?: number;
}

export interface AreaTargetResult extends AreaTargetPoint {
  readonly hitCount: number;
}

export interface DirectionalTargetResult extends AreaTargetResult {
  readonly angle: number;
}

/** Finds the fixed-range firing direction whose corridor covers the most enemies. */
export function densestDirectionalTarget(
  fromX: number,
  fromY: number,
  range: number,
  halfWidth: number,
  targets: readonly AreaTargetCandidate[],
): DirectionalTargetResult | null {
  const safeRange = Math.max(0, range);
  const safeHalfWidth = Math.max(0, halfWidth);
  const directions = targets.flatMap((target) => {
    const dx = target.x - fromX;
    const dy = target.y - fromY;
    const distance = Math.hypot(dx, dy);
    return distance > 0 && distance <= safeRange
      ? [{ x: dx / distance, y: dy / distance }]
      : [];
  });
  if (directions.length === 0) return null;

  const baseDirections = [...directions];
  for (let left = 0; left < baseDirections.length; left += 1) {
    for (let right = left + 1; right < baseDirections.length; right += 1) {
      const dx = baseDirections[left].x + baseDirections[right].x;
      const dy = baseDirections[left].y + baseDirections[right].y;
      const length = Math.hypot(dx, dy);
      if (length > 0.000001) directions.push({ x: dx / length, y: dy / length });
    }
  }

  let best: DirectionalTargetResult | null = null;
  let bestNearestHit = Number.POSITIVE_INFINITY;
  for (const direction of directions) {
    let hitCount = 0;
    let nearestHit = Number.POSITIVE_INFINITY;
    for (const target of targets) {
      const dx = target.x - fromX;
      const dy = target.y - fromY;
      const targetRadius = Math.max(0, target.collisionRadius ?? 0);
      const forward = dx * direction.x + dy * direction.y;
      if (forward < -targetRadius || forward > safeRange + targetRadius) continue;
      const lateral = Math.abs(dx * direction.y - dy * direction.x);
      if (lateral > safeHalfWidth + targetRadius) continue;
      hitCount += 1;
      nearestHit = Math.min(nearestHit, Math.max(0, forward));
    }
    if (best && (hitCount < best.hitCount
      || (hitCount === best.hitCount && nearestHit >= bestNearestHit))) continue;
    best = {
      x: fromX + direction.x * safeRange,
      y: fromY + direction.y * safeRange,
      angle: Math.atan2(direction.y, direction.x),
      hitCount,
    };
    bestNearestHit = nearestHit;
  }

  return best;
}

/** Finds the in-range center that covers the most current enemy positions. */
export function densestAreaTarget(
  fromX: number,
  fromY: number,
  castRange: number,
  effectRadius: number,
  targets: readonly AreaTargetCandidate[],
): AreaTargetResult | null {
  const safeCastRange = Math.max(0, castRange);
  const safeEffectRadius = Math.max(0, effectRadius);
  const eligible = targets.filter((target) => (
    Math.hypot(target.x - fromX, target.y - fromY) <= safeCastRange
  ));
  if (eligible.length === 0) return null;

  const centers: AreaTargetPoint[] = eligible.map(({ x, y }) => ({ x, y }));
  for (let left = 0; left < eligible.length; left += 1) {
    for (let right = left + 1; right < eligible.length; right += 1) {
      const midpoint = {
        x: (eligible[left].x + eligible[right].x) / 2,
        y: (eligible[left].y + eligible[right].y) / 2,
      };
      if (Math.hypot(midpoint.x - fromX, midpoint.y - fromY) <= safeCastRange) {
        centers.push(midpoint);
      }
    }
  }

  let best: AreaTargetResult | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const center of centers) {
    const hitCount = targets.reduce((count, target) => {
      const targetRadius = Math.max(0, target.collisionRadius ?? 0);
      return Math.hypot(target.x - center.x, target.y - center.y)
        <= safeEffectRadius + targetRadius
        ? count + 1
        : count;
    }, 0);
    const distance = Math.hypot(center.x - fromX, center.y - fromY);
    if (best && (hitCount < best.hitCount
      || (hitCount === best.hitCount && distance >= bestDistance))) continue;
    best = { ...center, hitCount };
    bestDistance = distance;
  }

  return best;
}

export function areaTargetPoint(
  fromX: number,
  fromY: number,
  toX: number | undefined,
  toY: number | undefined,
  maxRange: number,
): AreaTargetPoint {
  if (toX === undefined || toY === undefined) return { x: fromX, y: fromY };

  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  const safeRange = Math.max(0, maxRange);
  if (distance === 0 || distance <= safeRange) return { x: toX, y: toY };

  const ratio = safeRange / distance;
  return {
    x: fromX + dx * ratio,
    y: fromY + dy * ratio,
  };
}

export function zoneDurationSeconds(speed: SpellSpeed): number {
  return ZONE_CONFIG.durationSeconds[speed];
}

export function rainLaunchDurationSeconds(speed: SpellSpeed): number {
  return RAIN_CONFIG.launchDurationSeconds[speed];
}

export function rainFallDurationMs(speed: SpellSpeed): number {
  return RAIN_CONFIG.fallDurationMs[speed];
}

const RAIN_OFFSETS: readonly AreaTargetPoint[] = [
  { x: 0, y: 0 },
  { x: -0.52, y: -0.28 },
  { x: 0.48, y: -0.42 },
  { x: -0.38, y: 0.52 },
  { x: 0.62, y: 0.34 },
  { x: 0.04, y: 0.74 },
];

export function rainOffset(index: number, areaRadius: number): AreaTargetPoint {
  const normalized = RAIN_OFFSETS[index % RAIN_OFFSETS.length];
  const safeRadius = Math.max(0, areaRadius);
  return {
    x: normalized.x * safeRadius,
    y: normalized.y * safeRadius,
  };
}
