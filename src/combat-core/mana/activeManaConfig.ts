export const ACTIVE_MANA_CONFIG = {
  passiveRegenPerSecond: 0.5,
  normalDropMana: 5,
  smallSplitterDropMana: 2,
  shieldSentinelDropMana: 7,
  eliteDropMana: 10,
  bossThresholdMana: 3,
  bossThresholdRatios: [
    0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1,
  ],
  bossDropOffset: 72,
  pickupRadius: 34,
  attractionRadius: 120,
  attractionSpeed: 260,
  potionMana: 12,
  potionSpawnDelayMinSeconds: 10,
  potionSpawnDelayMaxSeconds: 15,
  potionLifetimeSeconds: 8,
  potionTelegraphSeconds: 0.65,
  potionPickupRadius: 38,
  potionSpawnDistanceMin: 180,
  potionSpawnDistanceMax: 280,
  potionCameraMargin: 56,
  surgeManaGainBonus: 0.25,
  surgePickupRadiusBonus: 0.35,
  castInputLockSeconds: 0.4,
} as const;

export function manaPotionSpawnDelay(randomValue: number): number {
  const random = Number.isFinite(randomValue) ? Math.max(0, Math.min(1, randomValue)) : 0;
  return ACTIVE_MANA_CONFIG.potionSpawnDelayMinSeconds
    + (ACTIVE_MANA_CONFIG.potionSpawnDelayMaxSeconds
      - ACTIVE_MANA_CONFIG.potionSpawnDelayMinSeconds) * random;
}

export function manaDropAmount(elite: boolean, kind = 'chaser'): number {
  if (elite) return ACTIVE_MANA_CONFIG.eliteDropMana;
  if (kind === 'small-splitter') return ACTIVE_MANA_CONFIG.smallSplitterDropMana;
  if (kind === 'shield-sentinel') return ACTIVE_MANA_CONFIG.shieldSentinelDropMana;
  return ACTIVE_MANA_CONFIG.normalDropMana;
}

export function crossedBossManaThresholds(
  previousHp: number,
  currentHp: number,
  maxHp: number,
): number[] {
  if (!Number.isFinite(maxHp) || maxHp <= 0) return [];
  const previousRatio = Math.max(0, previousHp) / maxHp;
  const currentRatio = Math.max(0, currentHp) / maxHp;
  return ACTIVE_MANA_CONFIG.bossThresholdRatios.filter(
    (threshold) => previousRatio > threshold && currentRatio <= threshold,
  );
}
