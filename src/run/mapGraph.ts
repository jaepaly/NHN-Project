import type {
  MapGraph,
  MapGraphEdge,
  MapGraphState,
  MapNode,
  MapNodeStatus,
  MinimapModel,
} from './mapGraphContract';

export interface MapGraphDefinition {
  nodes: readonly MapNode[];
  edges: readonly MapGraphEdge[];
  startNodeId: string;
  lastBeforeBossNodeId: string;
}

/**
 * Phaser 비의존 런 맵 상태 모델입니다.
 *
 * 씬은 전투 종료 후 choices()를 읽어 포탈을 그리고, 포탈 선택이 확정되면
 * enter()만 호출합니다. 이전 current 노드는 enter 시점에 cleared가 됩니다.
 */
export class RunMapGraph implements MapGraph {
  private readonly nodesById: ReadonlyMap<string, MapNode>;
  private readonly edges: readonly MapGraphEdge[];
  private readonly nextIdsByNode: ReadonlyMap<string, readonly string[]>;
  private readonly clearedNodeIds = new Set<string>();
  private currentNodeId: string;
  private readonly lastBeforeBossNodeId: string;

  constructor(definition: MapGraphDefinition) {
    validateDefinition(definition);
    this.nodesById = new Map(definition.nodes.map((node) => [node.id, cloneNode(node)]));
    this.edges = definition.edges.map((edge) => ({ ...edge }));
    this.nextIdsByNode = buildNextIds(this.edges);
    this.currentNodeId = definition.startNodeId;
    this.lastBeforeBossNodeId = definition.lastBeforeBossNodeId;
  }

  current(): MapNode {
    return this.node(this.currentNodeId);
  }

  choices(): MapNode[] {
    return (this.nextIdsByNode.get(this.currentNodeId) ?? []).map((id) => this.node(id));
  }

  enter(nodeId: string): MapNode {
    const nextIds = this.nextIdsByNode.get(this.currentNodeId) ?? [];
    if (!nextIds.includes(nodeId)) {
      throw new Error(`MapGraph cannot enter unreachable node: ${nodeId}`);
    }
    this.clearedNodeIds.add(this.currentNodeId);
    this.currentNodeId = nodeId;
    return this.current();
  }

  snapshot(): MapGraphState {
    return {
      currentNodeId: this.currentNodeId,
      nodes: [...this.nodesById.values()].map((node) => ({
        ...cloneNode(node),
        status: this.statusOf(node.id),
      })),
      edges: this.edges.map((edge) => ({ ...edge })),
    };
  }

  isBossNode(nodeId: string): boolean {
    const kind = this.nodesById.get(nodeId)?.kind;
    return kind === 'stage-boss' || kind === 'memory-boss';
  }

  lastBeforeBoss(): MapNode {
    return this.node(this.lastBeforeBossNodeId);
  }

  private statusOf(nodeId: string): MapNodeStatus {
    if (nodeId === this.currentNodeId) return 'current';
    if (this.clearedNodeIds.has(nodeId)) return 'cleared';
    if ((this.nextIdsByNode.get(this.currentNodeId) ?? []).includes(nodeId)) return 'reachable';
    return 'unvisited';
  }

  private node(id: string): MapNode {
    const node = this.nodesById.get(id);
    if (!node) throw new Error(`MapGraph node does not exist: ${id}`);
    return cloneNode(node);
  }
}

/** MapGraphState를 R3의 기존 미니맵 입력 형식으로 축소합니다. */
export function toMinimapModel(state: MapGraphState): MinimapModel {
  return {
    nodes: state.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      status: node.status,
      layer: node.layer,
      lane: node.lane,
    })),
    edges: state.edges.map((edge) => ({ ...edge })),
  };
}

function validateDefinition(definition: MapGraphDefinition): void {
  if (definition.nodes.length === 0) throw new Error('MapGraph requires at least one node');

  const nodesById = new Map<string, MapNode>();
  for (const node of definition.nodes) {
    if (!node.id || nodesById.has(node.id)) throw new Error(`Duplicate or empty MapGraph node id: ${node.id}`);
    if (node.kind === 'trap' && !node.trapProfile) {
      throw new Error(`Trap MapGraph node requires a trap profile: ${node.id}`);
    }
    if (node.kind !== 'trap' && node.trapProfile) {
      throw new Error(`Only trap MapGraph nodes may have a trap profile: ${node.id}`);
    }
    nodesById.set(node.id, node);
  }
  if (!nodesById.has(definition.startNodeId)) throw new Error('MapGraph start node is missing');
  if (nodesById.get(definition.startNodeId)?.kind !== 'start') {
    throw new Error('MapGraph start node must have kind start');
  }
  if (!nodesById.has(definition.lastBeforeBossNodeId)) {
    throw new Error('MapGraph last-before-boss node is missing');
  }

  const edgeKeys = new Set<string>();
  for (const edge of definition.edges) {
    if (!nodesById.has(edge.from) || !nodesById.has(edge.to)) {
      throw new Error(`MapGraph edge references missing node: ${edge.from} -> ${edge.to}`);
    }
    if (edge.from === edge.to) throw new Error(`MapGraph self edge: ${edge.from}`);
    const key = `${edge.from}\u0000${edge.to}`;
    if (edgeKeys.has(key)) throw new Error(`Duplicate MapGraph edge: ${edge.from} -> ${edge.to}`);
    edgeKeys.add(key);
  }

  const nextIds = buildNextIds(definition.edges);
  const reachable = walk(definition.startNodeId, nextIds);
  if (reachable.size !== definition.nodes.length) throw new Error('MapGraph contains unreachable nodes');
  assertAcyclic(definition.nodes.map((node) => node.id), nextIds);

  const finalBosses = definition.nodes.filter((node) => node.kind === 'memory-boss');
  if (finalBosses.length !== 1) throw new Error('MapGraph requires exactly one final memory boss');
  const finalBossId = finalBosses[0].id;
  if ((nextIds.get(finalBossId) ?? []).length !== 0) throw new Error('Final memory boss must be terminal');
  if (!(nextIds.get(definition.lastBeforeBossNodeId) ?? []).includes(finalBossId)) {
    throw new Error('last-before-boss node must connect directly to final memory boss');
  }

  const reverse = buildReverseIds(definition.edges);
  const canReachBoss = walk(finalBossId, reverse);
  if (canReachBoss.size !== definition.nodes.length) {
    throw new Error('Every MapGraph node must lead to the final memory boss');
  }
}

function buildNextIds(edges: readonly MapGraphEdge[]): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const edge of edges) {
    const next = result.get(edge.from) ?? [];
    next.push(edge.to);
    result.set(edge.from, next);
  }
  return result;
}

function buildReverseIds(edges: readonly MapGraphEdge[]): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const edge of edges) {
    const previous = result.get(edge.to) ?? [];
    previous.push(edge.from);
    result.set(edge.to, previous);
  }
  return result;
}

function walk(startId: string, links: ReadonlyMap<string, readonly string[]>): Set<string> {
  const visited = new Set<string>();
  const pending = [startId];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    pending.push(...(links.get(id) ?? []));
  }
  return visited;
}

function assertAcyclic(nodeIds: readonly string[], nextIds: ReadonlyMap<string, readonly string[]>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error('MapGraph must not contain cycles');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const nextId of nextIds.get(id) ?? []) visit(nextId);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of nodeIds) visit(id);
}

function cloneNode(node: MapNode): MapNode {
  return {
    ...node,
    terrain: node.terrain.map((placement) => ({ ...placement })),
    curseWeights: { ...node.curseWeights },
    trapProfile: node.trapProfile && {
      ...node.trapProfile,
      safeCorridor: node.trapProfile.safeCorridor && { ...node.trapProfile.safeCorridor },
    },
  };
}
