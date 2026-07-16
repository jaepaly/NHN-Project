/** R1 전투 코어: 보스 임시 수치. 플레이테스트·팀 합의 후 조정한다. (Phaser 비의존 — 회귀 스크립트에서 사용) */
export const BOSS_CONFIG = {
  maxHp: 450,
  speed: 55,
  contactDamage: 18,
  contactDistance: 50,
  contactDamageCooldownSeconds: 1.2,
  collisionRadius: 42,

  // 방사 탄막 패턴
  volleyIntervalSeconds: 3.2,
  volleyProjectiles: 12,
  /** 첫 볼리까지의 유예 (등장 연출·대사 읽을 시간) */
  volleyInitialDelaySeconds: 2.4,

  // HP 임계 통과 시 하수인 소환 (비율, 내림차순)
  minionThresholds: [2 / 3, 1 / 3] as readonly number[],
  minionsPerTrigger: 2,

  // 기억 기반 내성·카운터 — 판정은 R2 계약(src/spell/bossMemoryContract) 소비, 여기는 적용 수치만
  /** 장기 기억(지난 런) 부분 내성 배수 — 단기 내성(R2 RESISTANCE.multiplier=0.3)보다 약하게 (GDD §4.2) */
  longTermResistMultiplier: 0.6,
  /** counterStrategy 'rush': 원거리 폼 위주 플레이어에게 돌진 — 이동속도 배수 */
  rushSpeedMultiplier: 1.6,
  /** counterStrategy 'ranged': 근거리 폼 위주 플레이어에게 탄막 강화 — 볼리 간격 배수 */
  rangedVolleyIntervalMultiplier: 0.7,
} as const;
