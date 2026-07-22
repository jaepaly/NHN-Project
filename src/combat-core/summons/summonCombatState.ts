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

  private readonly attackInterval: number;

  constructor(power: number, damageScale = 1, attackIntervalScale = 1) {
    const stats = summonStatsFromPower(power);
    this.damage = Math.max(1, Math.round(stats.damage * damageScale)); // 군체=분할, 포탑=강타
    this.durationSeconds = stats.durationSeconds;
    this.remainingSeconds = stats.durationSeconds;
    this.attackInterval = SUMMON_CONFIG.attackIntervalSeconds * Math.max(0.1, attackIntervalScale);
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

    this.attackCooldownRemaining = this.attackInterval;
    return { expired: false, shouldAttack: true };
  }
}
