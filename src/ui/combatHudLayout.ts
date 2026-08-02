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
  /** 8원소를 왼쪽 4개·오른쪽 4개로 고정 배치한다. */
  columns: 2,
  rowsPerColumn: 4,
  columnGap: 10,
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
  const items = Number.isFinite(rowCount) ? Math.max(0, Math.floor(rowCount)) : 0;
  const rows = Math.min(AFFINITY_PANEL_LAYOUT.rowsPerColumn, items);
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
  const row = Math.max(0, Math.floor(index)) % AFFINITY_PANEL_LAYOUT.rowsPerColumn;
  return panelTop
    + AFFINITY_PANEL_LAYOUT.padTop
    + row * AFFINITY_PANEL_LAYOUT.rowPitch;
}

export function affinityBarY(panelTop: number, index: number): number {
  return affinityLabelY(panelTop, index) + AFFINITY_PANEL_LAYOUT.labelToBar;
}

/** 패널 폭에서 두 칼럼 사이 간격과 좌우 여백을 뺀 실제 게이지 폭. */
export function affinityColumnWidth(panelWidth: number): number {
  const safeWidth = Number.isFinite(panelWidth) ? Math.max(0, panelWidth) : 0;
  const inner = Math.max(0, safeWidth - AFFINITY_PANEL_LAYOUT.padX * 2);
  return Math.max(
    0,
    (inner - AFFINITY_PANEL_LAYOUT.columnGap) / AFFINITY_PANEL_LAYOUT.columns,
  );
}

/** 인덱스 0~3은 왼쪽, 4~7은 오른쪽 칼럼에 놓인다. */
export function affinityColumnX(panelX: number, panelWidth: number, index: number): number {
  const column = Math.min(
    AFFINITY_PANEL_LAYOUT.columns - 1,
    Math.floor(Math.max(0, index) / AFFINITY_PANEL_LAYOUT.rowsPerColumn),
  );
  return panelX + AFFINITY_PANEL_LAYOUT.padX
    + column * (affinityColumnWidth(panelWidth) + AFFINITY_PANEL_LAYOUT.columnGap);
}
