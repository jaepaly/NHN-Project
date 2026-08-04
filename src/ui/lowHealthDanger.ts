export const LOW_HEALTH_DANGER = {
  enterRatio: 0.3,
  exitRatio: 0.35,
  periodMs: 1300,
  minAlpha: 0.04,
  maxAlpha: 0.13,
  fadeOutMs: 240,
} as const;

/** 30~35% 구간에서는 직전 상태를 유지해 경계에서 켜짐/꺼짐이 반복되지 않게 한다. */
export function nextLowHealthDangerActive(current: boolean, hpRatio: number): boolean {
  const ratio = Number.isFinite(hpRatio) ? Math.max(0, hpRatio) : 1;
  if (!current && ratio <= LOW_HEALTH_DANGER.enterRatio) return true;
  if (current && ratio >= LOW_HEALTH_DANGER.exitRatio) return false;
  return current;
}

export function lowHealthDangerAlpha(nowMs: number): number {
  const now = Number.isFinite(nowMs) ? nowMs : 0;
  const wave = (Math.sin((now / LOW_HEALTH_DANGER.periodMs) * Math.PI * 2) + 1) / 2;
  return LOW_HEALTH_DANGER.minAlpha
    + (LOW_HEALTH_DANGER.maxAlpha - LOW_HEALTH_DANGER.minAlpha) * wave;
}
