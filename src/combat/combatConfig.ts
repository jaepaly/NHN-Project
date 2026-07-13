export const CHASER_CONFIG = {
  maxHp: 30,
  speed: 100,
  contactDamage: 10,
  contactDistance: 28,
  contactDamageCooldownSeconds: 1,
} as const;

export const SHOOTER_CONFIG = {
  maxHp: 20,
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
    maxHp: 40,
    speed: 80,
    contactDamage: 12,
    contactDistance: 30,
    radius: 18,
  },
  small: {
    maxHp: 10,
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
  damage: 10,
  intervalSeconds: 1,
  range: 400,
  projectileSpeed: 600,
  hitDistance: 18,
} as const;

export const SPELL_DAMAGE_CONFIG = {
  novaBaseRadius: 60,
  beamRange: 650,
  beamBaseWidth: 24,
  waveRange: 500,
  waveBaseWidth: 120,
  waveHitDepth: 36,
} as const;

/** 1차 공식: 밸런스보다 power가 실제 피해로 연결되는 구조를 우선 검증한다. */
export function spellDamageFromPower(power: number): number {
  return Math.max(0, Math.round(power));
}
