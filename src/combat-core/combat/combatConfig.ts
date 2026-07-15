/** R1 전투 코어의 전투·밸런스 설정. */
export const CHASER_CONFIG = {
  maxHp: 30,
  speed: 100,
  contactDamage: 10,
  contactDistance: 28,
  collisionRadius: 12,
  contactDamageCooldownSeconds: 1,
} as const;

export const SHOOTER_CONFIG = {
  maxHp: 20,
  speed: 75,
  contactDamage: 6,
  contactDistance: 24,
  collisionRadius: 12,
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

export function spellImpactDamageFromPower(power: number, multiplier = 1): number {
  const safeMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
  return Math.max(1, Math.round(spellDamageFromPower(power) * safeMultiplier));
}

/** 반복 패널티 반영 power에 런 원소 친화 보너스를 적용한다. */
export function spellPowerWithAffinity(power: number, affinityBonus: number): number {
  const safePower = Number.isFinite(power) ? Math.max(0, power) : 0;
  const safeBonus = Number.isFinite(affinityBonus) ? Math.max(0, affinityBonus) : 0;
  return Math.round(safePower * (1 + safeBonus));
}

export function spellHealFromPower(power: number): number {
  return Math.max(1, Math.round(5 + power * 0.45));
}

export function spellShieldFromPower(power: number): number {
  return Math.max(1, Math.round(8 + power * 0.6));
}

export function spellBuffManaFromPower(power: number): number {
  return Math.max(1, Math.round(3 + power * 0.25));
}
