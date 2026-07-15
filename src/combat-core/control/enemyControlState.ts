import type { CombatEnemy } from '../enemies/combatEnemy';
import {
  CONTROL_CONFIG,
  controlDurationFromPower,
} from './controlConfig';

/** Phase 2 최소 control 구현: 적별 비중첩 둔화 수명만 관리한다. */
export class EnemyControlState {
  private readonly slowRemaining = new Map<CombatEnemy, number>();

  applySlow(enemy: CombatEnemy, power: number, durationOverrideSeconds?: number): number {
    const duration = durationOverrideSeconds !== undefined
      && Number.isFinite(durationOverrideSeconds)
      ? Math.max(0, durationOverrideSeconds)
      : controlDurationFromPower(power);
    const remaining = Math.max(this.slowRemaining.get(enemy) ?? 0, duration);
    this.slowRemaining.set(enemy, remaining);
    return remaining;
  }

  update(deltaSeconds: number): CombatEnemy[] {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const expired: CombatEnemy[] = [];
    for (const [enemy, remaining] of this.slowRemaining) {
      if (!enemy.alive || remaining <= delta) {
        this.slowRemaining.delete(enemy);
        expired.push(enemy);
        continue;
      }
      this.slowRemaining.set(enemy, remaining - delta);
    }
    return expired;
  }

  movementMultiplierFor(enemy: CombatEnemy): number {
    return this.slowRemaining.has(enemy)
      ? CONTROL_CONFIG.slowMovementMultiplier
      : 1;
  }

  remainingFor(enemy: CombatEnemy): number {
    return this.slowRemaining.get(enemy) ?? 0;
  }

  remove(enemy: CombatEnemy): boolean {
    return this.slowRemaining.delete(enemy);
  }

  clear(): CombatEnemy[] {
    const affected = [...this.slowRemaining.keys()];
    this.slowRemaining.clear();
    return affected;
  }
}
