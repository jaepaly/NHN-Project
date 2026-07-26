import type { MinimapModel, MinimapNode } from '../run/mapGraphContract';

/**
 * 미니맵 레이아웃 — 뷰모델(layer/lane)을 패널 안 좌표로 변환하는 순수 계산.
 * 렌더(minimapHud)와 분리해 회귀로 고정한다: 겹침·범위 이탈은 화면을 봐야만
 * 알 수 있는 종류의 버그라, 좌표 계산만큼은 수치로 못박는다.
 */
export const MINIMAP_CONFIG = {
  /** 패널 크기(px) — 우상단 상태 박스(288폭) 아래 정렬 */
  width: 288,
  height: 132,
  /** 패널 안쪽 여백 — 노드가 테두리에 붙지 않게 */
  padding: 18,
  /** 노드 반지름 */
  nodeRadius: 6,
  /** 현재 노드 강조 반지름 */
  currentRadius: 9,
} as const;

export interface MinimapPoint {
  id: string;
  x: number;
  y: number;
}

/**
 * layer → x(좌→우 진행), lane → y. 총괄 스케치와 같은 가로 흐름 — 보스가 오른쪽 끝.
 * 같은 layer의 lane들은 세로로 균등 분배하고, lane이 1개면 세로 중앙.
 */
export function minimapLayout(model: MinimapModel): MinimapPoint[] {
  const { width, height, padding } = MINIMAP_CONFIG;
  // 입구에서 정규화 — NaN layer/lane이 Map 키·laneCount로 번지면 좌표 전체가 NaN이 된다.
  const nodes = model.nodes.map((node) => ({
    ...node,
    layer: clampFinite(node.layer),
    lane: clampFinite(node.lane),
  }));
  const maxLayer = nodes.length > 0 ? Math.max(...nodes.map((node) => node.layer)) : 0;
  const laneCounts = new Map<number, number>();
  for (const node of nodes) {
    laneCounts.set(node.layer, Math.max(laneCounts.get(node.layer) ?? 0, node.lane + 1));
  }

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  return nodes.map((node) => ({
    id: node.id,
    x: padding + (maxLayer > 0 ? (node.layer / maxLayer) * innerW : innerW / 2),
    y: laneY(node, laneCounts.get(node.layer) ?? 1, padding, innerH),
  }));
}

function laneY(node: MinimapNode, laneCount: number, padding: number, innerH: number): number {
  if (!Number.isFinite(laneCount) || laneCount <= 1) return padding + innerH / 2;
  const lane = Math.min(node.lane, laneCount - 1);
  return padding + (lane / (laneCount - 1)) * innerH;
}

function clampFinite(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
