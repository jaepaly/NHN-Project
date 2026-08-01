/**
 * 좌상단 전투 HUD 아래에 붙는 친화도 패널의 순수 기하.
 *
 * 씬 안에서 좌표를 각각 계산하면 라벨과 바가 서로 다른 간격을 쓰기 쉽고,
 * 마도서 판의 장식 여백까지 고려하지 못해 두 판이 겹쳐 보인다. 이 모듈을 Phaser와
 * 분리해 회귀에서 실제 경계와 행 배치를 수치로 검증한다.
 */

export const AFFINITY_PANEL_LAYOUT = {
  /** 전투 HUD 외곽과 친화도 패널 외곽 사이의 빈 공간 */
  gap: 14,
  padX: 8,
  padTop: 9,
  labelToBar: 16,
  rowPitch: 27,
  primaryBarHeight: 6,
  secondaryBarHeight: 4,
  padBottom: 10,
} as const;

export interface AffinityPanelGeometry {
  top: number;
  height: number;
}

export function affinityPanelGeometry(
  hudY: number,
  hudHeight: number,
  rowCount: number,
): AffinityPanelGeometry {
  const safeY = Number.isFinite(hudY) ? hudY : 0;
  const safeHeight = Number.isFinite(hudHeight) ? Math.max(0, hudHeight) : 0;
  const rows = Number.isFinite(rowCount) ? Math.max(0, Math.floor(rowCount)) : 0;
  const top = safeY + safeHeight + AFFINITY_PANEL_LAYOUT.gap;
  if (rows === 0) return { top, height: 0 };
  return {
    top,
    height: AFFINITY_PANEL_LAYOUT.padTop
      + (rows - 1) * AFFINITY_PANEL_LAYOUT.rowPitch
      + AFFINITY_PANEL_LAYOUT.labelToBar
      + AFFINITY_PANEL_LAYOUT.primaryBarHeight
      + AFFINITY_PANEL_LAYOUT.padBottom,
  };
}

export function affinityLabelY(panelTop: number, index: number): number {
  return panelTop
    + AFFINITY_PANEL_LAYOUT.padTop
    + Math.max(0, Math.floor(index)) * AFFINITY_PANEL_LAYOUT.rowPitch;
}

export function affinityBarY(panelTop: number, index: number): number {
  return affinityLabelY(panelTop, index) + AFFINITY_PANEL_LAYOUT.labelToBar;
}
