import type { SpellSpeed } from '../../spell/types';

export const NOVA_CONFIG = {
  castRange: 520,
  instantDistance: 12,
  projectileSpeed: {
    slow: 460,
    normal: 620,
    fast: 820,
  },
} as const;

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
  strikeCount: 10,
  damageMultiplierPerStrike: 0.75,
  launchDurationSeconds: {
    slow: 2.1,
    normal: 1.7,
    fast: 1.25,
  },
  fallDurationMs: {
    slow: 360,
    normal: 280,
    fast: 210,
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

export function novaProjectileSpeed(speed: SpellSpeed): number {
  return NOVA_CONFIG.projectileSpeed[speed];
}

export function rainLaunchDurationSeconds(speed: SpellSpeed): number {
  return RAIN_CONFIG.launchDurationSeconds[speed];
}

export function rainFallDurationMs(speed: SpellSpeed): number {
  return RAIN_CONFIG.fallDurationMs[speed];
}

export function rainOffset(index: number, areaRadius: number): AreaTargetPoint {
  const safeRadius = Math.max(0, areaRadius);
  const count = RAIN_CONFIG.strikeCount;
  const normalizedIndex = ((Math.floor(index) % count) + count) % count;
  if (normalizedIndex === 0 || safeRadius === 0) return { x: 0, y: 0 };

  // Keep one strike at the center, then distribute the rest across the field
  // with a deterministic golden-angle spiral. The 0.72 limit keeps each
  // strike radius visually inside the telegraphed rain field.
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const distance = Math.sqrt(normalizedIndex / (count - 1)) * safeRadius * 0.72;
  const angle = (normalizedIndex - 1) * goldenAngle;
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  };
}
