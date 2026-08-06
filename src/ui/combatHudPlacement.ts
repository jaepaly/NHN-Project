export const COMPACT_VITAL_HUD = {
  width: 210,
  height: 65,
  gapFromBuild: 12,
  rowTop: 9,
  rowPitch: 18,
  labelX: 10,
  barX: 57,
  barWidth: 91,
  barHeight: 5,
  valueRight: 8,
} as const;

export const COMPACT_AFFINITY_HUD = {
  x: 18,
  y: 18,
  width: 244,
  headerHeight: 30,
} as const;

export interface CompactVitalGeometry { x: number; y: number }

/** 우하단 빌드 칩 바로 왼쪽에 붙되 작은 화면에서도 밖으로 나가지 않는다. */
export function compactVitalGeometry(
  screenWidth: number,
  screenHeight: number,
  buildWidth: number,
  buildHeight = buildWidth,
): CompactVitalGeometry {
  const width = Number.isFinite(screenWidth) ? Math.max(0, screenWidth) : 0;
  const height = Number.isFinite(screenHeight) ? Math.max(0, screenHeight) : 0;
  const safeBuildWidth = Number.isFinite(buildWidth) ? Math.max(0, buildWidth) : 0;
  const safeBuildHeight = Number.isFinite(buildHeight) ? Math.max(0, buildHeight) : 0;
  const buildLeft = width - 20 - safeBuildWidth;
  return {
    x: Math.max(8, buildLeft - COMPACT_VITAL_HUD.gapFromBuild - COMPACT_VITAL_HUD.width),
    y: Math.max(8, height - 26 - safeBuildHeight),
  };
}

export function compactVitalRowY(vitalY: number, index: number): number {
  return vitalY + COMPACT_VITAL_HUD.rowTop
    + Math.max(0, Math.floor(index)) * COMPACT_VITAL_HUD.rowPitch;
}
