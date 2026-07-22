export const ACTIVE_MANA_CONFIG = {
  // 시전 중심 방향(총괄 결정) — 방당 수동 시전 ~2회→더 자주 되게 드롭값 ~1.6× 상향.
  // 실측 기준: 웨이브(처키4)=20→32 마나. 최종은 적 HP·웨이브 밀도와 함께 플레이테스트로 미세조정.
  // 패시브 재생: 처치 수급이 주(主)지만, 0에 가까우면 보스전에서 잡몹 대기 동안 "회피만"
  // 하게 된다(플레이 피드백). 잡몹 간격(~10~15s)에 1회 시전 가능한 트리클 바닥을 준다.
  // 비용 max(5, power×0.6)=보통 18~54, maxMana 100 기준. 손맛 튜닝 1순위 노브.
  passiveRegenPerSecond: 2.0,
  normalDropMana: 8,
  smallSplitterDropMana: 3,
  shieldSentinelDropMana: 11,
  eliteDropMana: 16,
  bossThresholdMana: 5,
  bossThresholdRatios: [
    0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1,
  ],
  bossDropOffset: 72,
  pickupRadius: 34,
  attractionRadius: 120,
  attractionSpeed: 260,
  potionMana: 18,
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
