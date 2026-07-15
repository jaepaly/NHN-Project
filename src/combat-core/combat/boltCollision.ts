export interface BoltCollisionTarget {
  readonly x: number;
  readonly y: number;
  readonly collisionRadius: number;
}

export interface BoltCollision<T extends BoltCollisionTarget> {
  readonly target: T;
  readonly x: number;
  readonly y: number;
  readonly progress: number;
}

/** Returns the first target intersected by a projectile's movement segment. */
export function firstBoltCollision<T extends BoltCollisionTarget>(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  projectileRadius: number,
  targets: readonly T[],
): BoltCollision<T> | null {
  let first: BoltCollision<T> | null = null;
  const safeProjectileRadius = Math.max(0, projectileRadius);

  for (const target of targets) {
    const combinedRadius = safeProjectileRadius + Math.max(0, target.collisionRadius);
    const progress = segmentCircleEntryProgress(
      fromX,
      fromY,
      toX,
      toY,
      target.x,
      target.y,
      combinedRadius,
    );
    if (progress === null || (first && progress >= first.progress)) continue;

    first = {
      target,
      x: fromX + (toX - fromX) * progress,
      y: fromY + (toY - fromY) * progress,
      progress,
    };
  }

  return first;
}

function segmentCircleEntryProgress(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  centerX: number,
  centerY: number,
  radius: number,
): number | null {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const offsetX = fromX - centerX;
  const offsetY = fromY - centerY;
  const c = offsetX * offsetX + offsetY * offsetY - radius * radius;
  if (c <= 0) return 0;

  const a = dx * dx + dy * dy;
  if (a === 0) return null;

  const b = 2 * (offsetX * dx + offsetY * dy);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;

  const entry = (-b - Math.sqrt(discriminant)) / (2 * a);
  return entry >= 0 && entry <= 1 ? entry : null;
}
