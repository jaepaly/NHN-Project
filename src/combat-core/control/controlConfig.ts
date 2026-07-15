export const CONTROL_CONFIG = {
  slowMovementMultiplier: 0.5,
  minimumDurationSeconds: 2,
  maximumDurationSeconds: 6,
  durationSecondsPerPower: 0.04,
  indicatorRadius: 28,
  indicatorColor: 0x8fd6ff,
} as const;

/** Phase 2 임시 공식: power를 2~6초 범위의 결정론적 둔화 시간으로 변환한다. */
export function controlDurationFromPower(power: number): number {
  const safePower = Number.isFinite(power) ? Math.max(0, power) : 0;
  return Math.min(
    CONTROL_CONFIG.maximumDurationSeconds,
    CONTROL_CONFIG.minimumDurationSeconds
      + safePower * CONTROL_CONFIG.durationSecondsPerPower,
  );
}
