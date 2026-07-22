/**
 * 상태이상 수치 — burn(지속피해)·weaken(취약). 순수 함수, 회귀로 고정.
 * freeze=root·slow는 EnemyControlState를 재사용하고, shock은 즉발이라 여기 수치만 둔다.
 */

export const AILMENT_CONFIG = {
  /** 지속피해: dps는 위력 비례, 0.5초 펄스로 적용(매 프레임 스팸 방지) */
  burn: { dpsPerPower: 0.12, minDps: 3, seconds: 3, tickSeconds: 0.5 },
  /** 경직(root) 지속 */
  freeze: { baseSeconds: 0.8, secPerPower: 0.012 },
  /** 둔화 — 이동배율·지속 */
  slow: { movementMultiplier: 0.45, baseSeconds: 1.5, secPerPower: 0.02 },
  /** 취약 — 받는 피해 증폭 배율(>1) */
  weaken: { amplifyPerPower: 0.005, min: 1.1, max: 1.5, seconds: 4 },
  /** 연쇄 감전 — 인접 적에게 피해의 일부, 남발 방지 쿨다운 */
  shock: { damageMultiplier: 0.4, radius: 150, maxTargets: 3, cooldownSeconds: 0.4 },
} as const;

function clampPower(power: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(power) ? power : 0));
}

export function burnDpsFromPower(power: number): number {
  return Math.max(AILMENT_CONFIG.burn.minDps, clampPower(power) * AILMENT_CONFIG.burn.dpsPerPower);
}

export function freezeSecondsFromPower(power: number): number {
  return AILMENT_CONFIG.freeze.baseSeconds + clampPower(power) * AILMENT_CONFIG.freeze.secPerPower;
}

export function slowSecondsFromPower(power: number): number {
  return AILMENT_CONFIG.slow.baseSeconds + clampPower(power) * AILMENT_CONFIG.slow.secPerPower;
}

/** 취약 — 받는 피해 배율(>1). 위력100 → ×1.4 */
export function weakenMultiplierFromPower(power: number): number {
  return Math.max(
    AILMENT_CONFIG.weaken.min,
    Math.min(AILMENT_CONFIG.weaken.max, 1 + clampPower(power) * AILMENT_CONFIG.weaken.amplifyPerPower),
  );
}
