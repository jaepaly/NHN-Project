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
 * #240 HTML과 같이 stage 전체의 min/max lane을 고정 축으로 사용한다. layer마다
 * 재정렬하면 짧은 갈래의 노드가 중앙으로 튀어 실제 lane 전환처럼 보인다.
 */
export function minimapLayout(model: MinimapModel): MinimapPoint[] {
  const { width, height, padding } = MINIMAP_CONFIG;
  // 입구에서 비정상값만 정규화한다. 음수·소수 lane은 생성기의 실제 좌표다.
  const nodes = model.nodes.map((node) => ({
    ...node,
    stage: typeof node.stage === 'number' && Number.isFinite(node.stage) ? node.stage : 1,
    layer: finiteOrZero(node.layer, true),
    lane: finiteOrZero(node.lane, false),
  }));
  const maxLayer = nodes.length > 0 ? Math.max(...nodes.map((node) => node.layer)) : 0;
  const laneBounds = new Map<number, { min: number; max: number }>();
  for (const node of nodes) {
    const current = laneBounds.get(node.stage);
    laneBounds.set(node.stage, current
      ? { min: Math.min(current.min, node.lane), max: Math.max(current.max, node.lane) }
      : { min: node.lane, max: node.lane });
  }

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  return nodes.map((node) => ({
    id: node.id,
    x: padding + (maxLayer > 0 ? (node.layer / maxLayer) * innerW : innerW / 2),
    y: laneY(node, laneBounds.get(node.stage), padding, innerH),
  }));
}

function laneY(
  node: MinimapNode,
  bounds: { min: number; max: number } | undefined,
  padding: number,
  innerH: number,
): number {
  if (!bounds || bounds.min === bounds.max) return padding + innerH / 2;
  return padding + ((node.lane - bounds.min) / (bounds.max - bounds.min)) * innerH;
}

function finiteOrZero(value: number | undefined, clampPositive: boolean): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return clampPositive ? Math.max(0, value) : value;
}
