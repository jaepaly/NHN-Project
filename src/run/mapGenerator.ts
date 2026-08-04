import type { MapGraphDefinition } from './mapGraph';
import type { MapNode, MapNodeKind } from './mapGraphContract';
import {
  generatePrototypeMap,
  rngFromSeed,
} from './partitionMapGeneratorCore';
import { TRAP_ROOM_PROFILES } from './trapRoomProfile';
import { PRESET_IDS_BY_TIER, type EncounterTier } from '../combat-core/waves/encounterPresets';

export interface MapGeneratorConfig {
  /** Kept for public API compatibility. #240 owns the fixed 3..4 / 4..5 budgets. */
  pathRoomsPerStage: readonly [readonly [number, number], readonly [number, number]];
  /** Kept for public API compatibility. The approved prototype selects internally. */
  maxAttempts: number;
}

export const MAP_GENERATOR_CONFIG: MapGeneratorConfig = {
  pathRoomsPerStage: [[3, 4], [4, 5]],
  maxAttempts: 160,
};

const TRAP_PROFILE_WEIGHTS: ReadonlyArray<readonly [keyof typeof TRAP_ROOM_PROFILES, number]> = [
  ['hazard', 20],
  ['blackout', 20],
  ['silence', 20],
  ['heatwave', 20],
  ['word-limit', 20],
];

export const seededRandom = rngFromSeed;

function pickWeighted<T>(rand: () => number, rows: ReadonlyArray<readonly [T, number]>): T {
  const total = rows.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rand() * total;
  for (const [value, weight] of rows) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return rows[rows.length - 1][0];
}

function finalizeNode(
  source: { id: string; stage: number; kind: MapNodeKind; layer: number; lane: number },
  rand: () => number,
): MapNode {
  const base = {
    id: source.id,
    stage: source.stage,
    kind: source.kind,
    layer: source.layer,
    lane: source.lane,
    terrain: [] as const,
    curseWeights: {} as const,
  };
  if (source.kind === 'trap') {
    const key = pickWeighted(rand, TRAP_PROFILE_WEIGHTS);
    return { ...base, waveSetId: 't1-a', trapProfile: TRAP_ROOM_PROFILES[key] };
  }
  if (source.kind === 'start' || source.kind === 'combat' || source.kind === 'elite') {
    return { ...base, waveSetId: 't1-a' };
  }
  return { ...base, waveSetId: null };
}

export interface GeneratedMap {
  definition: MapGraphDefinition;
  seed: number;
  attempts: number;
}

/**
 * Runs the approved #240 prototype unchanged, then adapts its two independent
 * stage graphs to the game's MapGraph contract. Runtime-only fields are added
 * after generation and never participate in room-layout decisions.
 */
export function generateRunMap(
  seed: number,
  config: MapGeneratorConfig = MAP_GENERATOR_CONFIG,
): GeneratedMap | null {
  void config;
  const generated = generatePrototypeMap(seed);
  const [stage1, stage2] = generated.stages;
  const stageTwoLayerOffset = stage1.boss.depth + 1;
  const rand = rngFromSeed((seed ^ 0xa5a5a5a5) >>> 0);
  const initialNodes = generated.graph.nodes.map((node): MapNode => {
    const kind: MapNodeKind = node.id === stage1.start.id
      ? 'start'
      : node.id === stage1.boss.id
        ? 'stage-boss'
        : node.id === stage2.boss.id
          ? 'memory-boss'
          : node.kind as MapNodeKind;
    return finalizeNode({
      id: node.id,
      stage: node.stage,
      kind,
      layer: node.stage === 2 ? stageTwoLayerOffset + node.depth : node.depth,
      lane: node.lane,
    }, rand);
  });
  const edges = [...generated.graph.edges, { from: stage1.boss.id, to: stage2.start.id }];
  const lastBeforeBossNodeId = edges.find(edge => edge.to === stage2.boss.id)?.from;
  if (!lastBeforeBossNodeId) return null;
  const nodes = assignEncounterPresets(initialNodes, edges, seed, lastBeforeBossNodeId);
  return {
    definition: { nodes, edges, startNodeId: stage1.start.id, lastBeforeBossNodeId },
    seed,
    attempts: 1,
  };
}

function assignEncounterPresets(
  nodes: readonly MapNode[],
  edges: readonly { from: string; to: string }[],
  seed: number,
  lastBeforeBossNodeId: string,
): MapNode[] {
  const encounterKinds = new Set<MapNodeKind>(['start', 'combat', 'elite', 'trap']);
  const lastBeforeBossLayer = nodes.find((node) => node.id === lastBeforeBossNodeId)?.layer;
  if (lastBeforeBossLayer === undefined) {
    throw new Error(`Unknown last-before-boss node: ${lastBeforeBossNodeId}`);
  }
  const incoming = new Map<string, string[]>();
  for (const edge of edges) incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge.from]);
  const assigned = new Map<string, string>();
  const ancestorPresets = new Map<string, Set<string>>();
  const rand = rngFromSeed((seed ^ 0x3c6ef372) >>> 0);
  const ordered = nodes.slice().sort((left, right) => left.layer - right.layer || left.id.localeCompare(right.id));
  for (const node of ordered) {
    const predecessorIds = incoming.get(node.id) ?? [];
    const blocked = new Set<string>();
    const directlyBlocked = new Set<string>();
    for (const predecessorId of predecessorIds) {
      for (const presetId of ancestorPresets.get(predecessorId) ?? []) blocked.add(presetId);
      const presetId = assigned.get(predecessorId);
      if (presetId) {
        blocked.add(presetId);
        directlyBlocked.add(presetId);
      }
    }
    if (!encounterKinds.has(node.kind)) {
      ancestorPresets.set(node.id, blocked);
      continue;
    }
    const tier = tierForProgress(lastBeforeBossLayer > 0 ? node.layer / lastBeforeBossLayer : 0);
    const pool = PRESET_IDS_BY_TIER[tier];
    const candidates = pool.filter((id) => !blocked.has(id));
    const nonAdjacentFallback = pool.filter((id) => !directlyBlocked.has(id));
    const choices = candidates.length > 0
      ? candidates
      : nonAdjacentFallback.length > 0 ? nonAdjacentFallback : pool;
    const selected = choices[Math.floor(rand() * choices.length)];
    assigned.set(node.id, selected);
    ancestorPresets.set(node.id, new Set([...blocked, selected]));
  }
  return nodes.map((node) => assigned.has(node.id) ? { ...node, waveSetId: assigned.get(node.id)! } : node);
}

function tierForProgress(progress: number): EncounterTier {
  if (progress < 1 / 3) return 1;
  if (progress < 2 / 3) return 2;
  return 3;
}
