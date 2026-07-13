export const CHASER_CONFIG = {
  maxHp: 100,
  speed: 100,
  contactDamage: 10,
  contactDistance: 28,
  contactDamageCooldownSeconds: 1,
} as const;

export const SHOOTER_CONFIG = {
  maxHp: 70,
  speed: 75,
  contactDamage: 6,
  contactDistance: 24,
  contactDamageCooldownSeconds: 1,
  preferredDistance: 320,
  distanceTolerance: 60,
  attackRange: 600,
  attackIntervalSeconds: 1.8,
  bulletCount: 3,
  bulletSpreadDegrees: 12,
  bulletSpeed: 220,
  bulletDamage: 8,
  bulletLifetimeSeconds: 4,
  bulletHitDistance: 14,
} as const;

export const SPLITTER_CONFIG = {
  large: {
    maxHp: 120,
    speed: 80,
    contactDamage: 12,
    contactDistance: 30,
    radius: 18,
  },
  small: {
    maxHp: 40,
    speed: 130,
    contactDamage: 6,
    contactDistance: 20,
    radius: 12,
  },
  contactDamageCooldownSeconds: 1,
  splitCount: 2,
  splitOffset: 35,
} as const;

export const BASIC_ATTACK_CONFIG = {
  // 임시 테스트값: 혼합 웨이브 3개를 약 1분 안에 검증하기 위한 수치.
  damage: 30,
  intervalSeconds: 1,
  range: 400,
  projectileSpeed: 600,
  hitDistance: 18,
} as const;

export const SPELL_DAMAGE_CONFIG = {
  novaBaseRadius: 60,
} as const;

/** 1차 공식: 밸런스보다 power가 실제 피해로 연결되는 구조를 우선 검증한다. */
export function spellDamageFromPower(power: number): number {
  return Math.max(0, Math.round(power));
}
