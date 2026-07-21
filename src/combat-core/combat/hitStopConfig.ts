/** Phase 5 game-feel: pause only the enemy that received a valid hit. */
export const HIT_STOP_CONFIG = {
  standardSeconds: 0.11,
  persistentSeconds: 0.02,
} as const;

export type HitStopKind = 'standard' | 'persistent';

export function enemyHitStopSeconds(kind: HitStopKind, boss: boolean): number {
  if (boss) return 0;
  return kind === 'persistent'
    ? HIT_STOP_CONFIG.persistentSeconds
    : HIT_STOP_CONFIG.standardSeconds;
}

export class EnemyHitStopController<T extends object> {
  private readonly remainingByTarget = new Map<T, number>();

  request(target: T, durationSeconds: number): void {
    const safeDuration = Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds)
      : 0;
    if (safeDuration === 0) return;
    const current = this.remainingByTarget.get(target) ?? 0;
    this.remainingByTarget.set(target, Math.max(current, safeDuration));
  }

  /** Returns true when this target must skip its gameplay update for the current frame. */
  advance(target: T, deltaSeconds: number): boolean {
    const remaining = this.remainingByTarget.get(target) ?? 0;
    if (remaining <= 0) return false;
    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const next = Math.max(0, remaining - safeDelta);
    if (next > 0) this.remainingByTarget.set(target, next);
    else this.remainingByTarget.delete(target);
    return true;
  }

  remove(target: T): void {
    this.remainingByTarget.delete(target);
  }

  clear(): void {
    this.remainingByTarget.clear();
  }
}
