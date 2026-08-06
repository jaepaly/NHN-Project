import type { MinimapModel, MinimapNode } from '../run/mapGraphContract';

export function minimapStages(model: MinimapModel): number[] {
  return [...new Set(model.nodes.map(nodeStage))].sort((a, b) => a - b);
}

export function currentMinimapStage(model: MinimapModel): number {
  const current = model.nodes.find((node) => node.status === 'current');
  return current ? nodeStage(current) : (minimapStages(model)[0] ?? 1);
}

/**
 * 전체 맵 그래프를 요청한 스테이지만 표시하는 독립된 모델로 투영한다.
 * 원본 그래프는 변경하지 않으며, 해당 스테이지의 첫 layer를 0으로 정규화한다.
 * 직전 스테이지의 관문 노드와 스테이지 간 연결선은 포함하지 않는다.
 */
export function projectMinimapStage(model: MinimapModel, requestedStage: number): MinimapModel {
  const stages = minimapStages(model);
  const stage = stages.includes(requestedStage) ? requestedStage : (stages[0] ?? 1);
  const stageNodes = model.nodes.filter((node) => nodeStage(node) === stage);
  if (stageNodes.length === 0) return { nodes: [], edges: [] };

  const visibleIds = new Set(stageNodes.map((node) => node.id));
  const minLayer = Math.min(...stageNodes.map((node) => finiteLayer(node.layer)));

  return {
    nodes: stageNodes.map((node) => ({
      ...node,
      stage,
      layer: finiteLayer(node.layer) - minLayer,
    })),
    edges: model.edges
      .filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to))
      .map((edge) => ({ ...edge })),
  };
}

function nodeStage(node: MinimapNode): number {
  return typeof node.stage === 'number' && Number.isFinite(node.stage) ? node.stage : 1;
}

function finiteLayer(layer: number): number {
  return Number.isFinite(layer) ? Math.max(0, layer) : 0;
}
