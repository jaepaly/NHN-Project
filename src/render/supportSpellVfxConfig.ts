export type SupportVfxSource = 'spell' | 'spirit' | 'room-start';

export const SUPPORT_VFX_CONFIG = {
  healColor: 0x72f1a8,
  shieldColor: 0x63c4bb,
  shieldHighlight: 0xd8fffa,
  buffColors: {
    haste: 0x63e6be,
    empower: 0xffa62b,
    ward: 0x8fa4ff,
  },
  passiveScale: 0.62,
  shieldRadius: 31,
  healDurationMs: 780,
  shieldGainDurationMs: 520,
  shieldMergeWindowMs: 120,
  minPowerScale: 0.85,
  maxPowerScale: 1.2,
} as const;

export function supportVfxScale(source: SupportVfxSource): number {
  return source === 'spell' ? 1 : SUPPORT_VFX_CONFIG.passiveScale;
}

export function shieldVisualRatio(amount: number, maxAmount: number): number {
  if (!Number.isFinite(amount) || !Number.isFinite(maxAmount) || maxAmount <= 0) return 0;
  return Math.min(1, Math.max(0, amount / maxAmount));
}

export function supportPowerScale(power: number): number {
  const normalized = Number.isFinite(power) ? Math.min(100, Math.max(0, power)) / 100 : 0.5;
  return SUPPORT_VFX_CONFIG.minPowerScale
    + (SUPPORT_VFX_CONFIG.maxPowerScale - SUPPORT_VFX_CONFIG.minPowerScale) * normalized;
}
