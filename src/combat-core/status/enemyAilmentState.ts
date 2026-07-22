import type { CombatEnemy } from '../enemies/combatEnemy';
import { AILMENT_CONFIG } from './ailmentConfig';

/**
 * 적별 지속 상태이상 — burn(지속피해)·weaken(취약).
 * freeze=root·slow는 EnemyControlState가 이동배율로 처리하므로 여기선 다루지 않는다.
 */
export class EnemyAilmentState {
  private readonly burns = new Map<CombatEnemy, { dps: number; remaining: number; tickAccum: number }>();
  private readonly weakens = new Map<CombatEnemy, { multiplier: number; remaining: number }>();

  /** 지속피해 — 더 강한 dps·더 긴 시간으로 갱신(비중첩). */
  applyBurn(enemy: CombatEnemy, dps: number, seconds: number): void {
    const b = this.burns.get(enemy);
    this.burns.set(enemy, {
      dps: Math.max(b?.dps ?? 0, Math.max(0, dps)),
      remaining: Math.max(b?.remaining ?? 0, Math.max(0, seconds)),
      tickAccum: b?.tickAccum ?? 0,
    });
  }

  /** 취약 — 더 강한 배율·더 긴 시간으로 갱신. */
  applyWeaken(enemy: CombatEnemy, multiplier: number, seconds: number): void {
    const w = this.weakens.get(enemy);
    this.weakens.set(enemy, {
      multiplier: Math.max(w?.multiplier ?? 1, multiplier),
      remaining: Math.max(w?.remaining ?? 0, Math.max(0, seconds)),
    });
  }

  /** 받는 피해 배율(weaken). 1=평소, >1=더 받음. */
  damageTakenMultiplierFor(enemy: CombatEnemy): number {
    return this.weakens.get(enemy)?.multiplier ?? 1;
  }

  isBurning(enemy: CombatEnemy): boolean {
    return (this.burns.get(enemy)?.remaining ?? 0) > 0;
  }

  /**
   * 매 프레임 갱신 — burn을 0.5초 펄스로 onBurnTick에 전달(피해 적용은 소비자 몫),
   * weaken 만료 정리. 죽은 적은 제거.
   */
  update(deltaSeconds: number, onBurnTick: (enemy: CombatEnemy, damage: number) => void): void {
    const delta = Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0);
    for (const [enemy, b] of this.burns) {
      if (!enemy.alive) { this.burns.delete(enemy); continue; }
      b.remaining -= delta;
      b.tickAccum += delta;
      if (b.tickAccum >= AILMENT_CONFIG.burn.tickSeconds || b.remaining <= 0) {
        if (b.tickAccum > 0) onBurnTick(enemy, b.dps * b.tickAccum);
        b.tickAccum = 0;
      }
      if (b.remaining <= 0) this.burns.delete(enemy);
    }
    for (const [enemy, w] of this.weakens) {
      if (!enemy.alive) { this.weakens.delete(enemy); continue; }
      w.remaining -= delta;
      if (w.remaining <= 0) this.weakens.delete(enemy);
    }
  }

  remove(enemy: CombatEnemy): void {
    this.burns.delete(enemy);
    this.weakens.delete(enemy);
  }

  clear(): void {
    this.burns.clear();
    this.weakens.clear();
  }
}
