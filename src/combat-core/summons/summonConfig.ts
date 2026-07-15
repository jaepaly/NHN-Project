export const SUMMON_CONFIG = {
  minimumDurationSeconds: 5,
  maximumDurationSeconds: 10,
  baseDurationSeconds: 4,
  durationSecondsPerPower: 0.06,
  damagePowerMultiplier: 0.3,
  attackIntervalSeconds: 1.2,
  attackRange: 400,
  projectileSpeed: 500,
  projectileHitDistance: 16,
  orbitRadius: 48,
  orbitAngularSpeed: 1.8,
} as const;

export interface SummonStats {
  durationSeconds: number;
  damage: number;
}

/** Phase 2 임시 공식: 최종 power를 소환 지속시간과 자동 공격 피해로 변환한다. */
export function summonStatsFromPower(power: number): SummonStats {
  const safePower = Number.isFinite(power) ? Math.max(0, power) : 0;
  const durationSeconds = Math.min(
    SUMMON_CONFIG.maximumDurationSeconds,
    Math.max(
      SUMMON_CONFIG.minimumDurationSeconds,
      SUMMON_CONFIG.baseDurationSeconds
        + safePower * SUMMON_CONFIG.durationSecondsPerPower,
    ),
  );
  return {
    durationSeconds,
    damage: Math.max(1, Math.round(safePower * SUMMON_CONFIG.damagePowerMultiplier)),
  };
}
