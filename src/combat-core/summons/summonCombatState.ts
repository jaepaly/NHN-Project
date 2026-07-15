import {
  SUMMON_CONFIG,
  summonStatsFromPower,
} from './summonConfig';

export interface SummonTickResult {
  expired: boolean;
  shouldAttack: boolean;
}

/** Phaser와 분리된 소환 수명·공격 쿨다운 상태. */
export class SummonCombatState {
  readonly damage: number;
  readonly durationSeconds: number;

  remainingSeconds: number;
  private attackCooldownRemaining = 0;

  constructor(power: number) {
    const stats = summonStatsFromPower(power);
    this.damage = stats.damage;
    this.durationSeconds = stats.durationSeconds;
    this.remainingSeconds = stats.durationSeconds;
  }

  update(deltaSeconds: number, hasTarget: boolean): SummonTickResult {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.remainingSeconds = Math.max(0, this.remainingSeconds - delta);
    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - delta);

    if (this.remainingSeconds <= 0) {
      return { expired: true, shouldAttack: false };
    }
    if (!hasTarget || this.attackCooldownRemaining > 0) {
      return { expired: false, shouldAttack: false };
    }

    this.attackCooldownRemaining = SUMMON_CONFIG.attackIntervalSeconds;
    return { expired: false, shouldAttack: true };
  }
}
