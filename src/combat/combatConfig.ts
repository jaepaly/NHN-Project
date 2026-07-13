export const CHASER_CONFIG = {
  maxHp: 100,
  speed: 100,
  contactDamage: 10,
  contactDistance: 28,
  contactDamageCooldownSeconds: 1,
} as const;

export const BASIC_ATTACK_CONFIG = {
  damage: 10,
  intervalSeconds: 1,
  range: 500,
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
