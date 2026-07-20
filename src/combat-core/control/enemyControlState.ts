import type { CombatEnemy } from '../enemies/combatEnemy';
import {
  CONTROL_CONFIG,
  controlDurationFromPower,
} from './controlConfig';

/** Phase 2 최소 control 구현: 적별 비중첩 둔화 수명만 관리한다. */
export class EnemyControlState {
  private readonly effects = new Map<CombatEnemy, {
    slowRemaining: number;
    slowMovementMultiplier: number;
    rootRemaining: number;
  }>();

  applySlow(
    enemy: CombatEnemy,
    power: number,
    durationOverrideSeconds?: number,
    movementMultiplierOverride?: number,
  ): number {
    const duration = durationOverrideSeconds !== undefined
      && Number.isFinite(durationOverrideSeconds)
      ? Math.max(0, durationOverrideSeconds)
      : controlDurationFromPower(power);
    const effect = this.effectFor(enemy);
    const movementMultiplier = movementMultiplierOverride !== undefined
      && Number.isFinite(movementMultiplierOverride)
      ? Math.max(0, Math.min(1, movementMultiplierOverride))
      : CONTROL_CONFIG.slowMovementMultiplier;
    if (effect.slowRemaining <= 0) effect.slowMovementMultiplier = movementMultiplier;
    else effect.slowMovementMultiplier = Math.min(effect.slowMovementMultiplier, movementMultiplier);
    const remaining = Math.max(effect.slowRemaining, duration);
    effect.slowRemaining = remaining;
    return remaining;
  }

  applyRoot(enemy: CombatEnemy, durationSeconds: number): number {
    const duration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0;
    const effect = this.effectFor(enemy);
    const remaining = Math.max(effect.rootRemaining, duration);
    effect.rootRemaining = remaining;
    return remaining;
  }

  update(deltaSeconds: number): CombatEnemy[] {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const expired: CombatEnemy[] = [];
    for (const [enemy, effect] of this.effects) {
      if (!enemy.alive) {
        this.effects.delete(enemy);
        expired.push(enemy);
        continue;
      }
      effect.slowRemaining = Math.max(0, effect.slowRemaining - delta);
      if (effect.slowRemaining <= 0) {
        effect.slowMovementMultiplier = CONTROL_CONFIG.slowMovementMultiplier;
      }
      effect.rootRemaining = Math.max(0, effect.rootRemaining - delta);
      if (effect.slowRemaining <= 0 && effect.rootRemaining <= 0) {
        this.effects.delete(enemy);
        expired.push(enemy);
      }
    }
    return expired;
  }

  movementMultiplierFor(enemy: CombatEnemy): number {
    const effect = this.effects.get(enemy);
    if (!effect) return 1;
    if (effect.rootRemaining > 0) return 0;
    return effect.slowRemaining > 0 ? effect.slowMovementMultiplier : 1;
  }

  remainingFor(enemy: CombatEnemy): number {
    const effect = this.effects.get(enemy);
    return effect ? Math.max(effect.slowRemaining, effect.rootRemaining) : 0;
  }

  rootRemainingFor(enemy: CombatEnemy): number {
    return this.effects.get(enemy)?.rootRemaining ?? 0;
  }

  remove(enemy: CombatEnemy): boolean {
    return this.effects.delete(enemy);
  }

  clear(): CombatEnemy[] {
    const affected = [...this.effects.keys()];
    this.effects.clear();
    return affected;
  }

  private effectFor(enemy: CombatEnemy): {
    slowRemaining: number;
    slowMovementMultiplier: number;
    rootRemaining: number;
  } {
    let effect = this.effects.get(enemy);
    if (!effect) {
      effect = {
        slowRemaining: 0,
        slowMovementMultiplier: CONTROL_CONFIG.slowMovementMultiplier,
        rootRemaining: 0,
      };
      this.effects.set(enemy, effect);
    }
    return effect;
  }
}
