/** R1 전투 코어의 전투·밸런스 설정. */
export const CHASER_CONFIG = {
  maxHp: 50,
  speed: 100,
  contactDamage: 12,
  contactDistance: 28,
  collisionRadius: 12,
  contactDamageCooldownSeconds: 1,
} as const;

export const SHOOTER_CONFIG = {
  maxHp: 35,
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
    maxHp: 60,
    speed: 80,
    contactDamage: 12,
    contactDistance: 30,
    radius: 18,
  },
  small: {
    maxHp: 25,
    speed: 130,
    contactDamage: 6,
    contactDistance: 20,
    radius: 12,
  },
  contactDamageCooldownSeconds: 1,
  splitCount: 2,
  splitOffset: 35,
} as const;

export const SHIELD_SENTINEL_CONFIG = {
  maxHp: 80,
  speed: 58,
  contactDamage: 16,
  contactDistance: 30,
  collisionRadius: 24,
  contactDamageCooldownSeconds: 0.8,
  openingHalfAngle: Math.PI * 7 / 24,
  ringRotationSpeed: 0.8,
  shieldHitCapacity: 4,
} as const;

export const BASIC_ATTACK_CONFIG = {
  damage: 8,
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

export const DIRECT_FORM_DAMAGE_MULTIPLIER = {
  bolt: 1,
  beam: 0.95,
  wave: 0.6,
  nova: 0.7,
  slash: 0.8,
} as const;

/** 1차 공식: 밸런스보다 power가 실제 피해로 연결되는 구조를 우선 검증한다. */
export function spellDamageFromPower(power: number): number {
  return Math.max(0, Math.round(power));
}

export function spellImpactDamageFromPower(power: number, multiplier = 1): number {
  const safeMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
  return Math.max(1, Math.round(spellDamageFromPower(power) * safeMultiplier));
}

/**
 * 오토 시전(각인·정령) 전용 피해 — 반올림·최소 피해 1을 적용하지 않는 정확한 실수값.
 * 수동 주문의 타격별 반올림·바닥(min 1)은 저출력 오토 시전에서 DPS를 부풀린다
 * (예: zone 10틱 × 0.08배가 틱당 1로 승격 → 예산 초과). 오토는 정확값을 쓰면
 * `power / 주기` 산술 게이트(오토 ≤ 수동 40%)와 실전 피해가 항상 일치한다.
 */
export function autoSpellImpactDamageFromPower(power: number, multiplier = 1): number {
  const safePower = Number.isFinite(power) ? Math.max(0, power) : 0;
  const safeMultiplier = Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
  return safePower * safeMultiplier;
}

/** 반복 패널티 반영 power에 런 원소 친화 보너스를 적용한다. */
export function spellPowerWithAffinity(power: number, affinityBonus: number): number {
  const safePower = Number.isFinite(power) ? Math.max(0, power) : 0;
  const safeBonus = Number.isFinite(affinityBonus) ? Math.max(0, affinityBonus) : 0;
  return Math.round(safePower * (1 + safeBonus));
}

export function spellHealFromPower(power: number): number {
  return Math.max(1, Math.round(power * 0.5));
}

export function spellShieldFromPower(power: number): number {
  return Math.max(1, Math.round(8 + power * 0.6));
}

export function spellBuffManaFromPower(power: number): number {
  return Math.max(1, Math.round(3 + power * 0.25));
}
