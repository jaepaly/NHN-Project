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

  // 기억 기반 원소 내성 — 판정 로직은 bossResistance.ts (R2 계약 지점)
  /** 내성 원소 피해 배율 (0.3 = 70% 감소, GDD §4.1) */
  resistanceMultiplier: 0.3,
  /** 이 횟수 미만으로 영창한 런에는 내성 없음 (첫 런 진입 직후 보호) */
  resistanceMinCasts: 3,
} as const;
