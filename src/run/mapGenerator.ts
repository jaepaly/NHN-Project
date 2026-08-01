import type { MapGraphDefinition } from './mapGraph';
import type { MapNode, MapNodeKind } from './mapGraphContract';
import {
  generatePrototypeMap,
  rngFromSeed,
} from './partitionMapGeneratorCore';
import { TRAP_ROOM_PROFILES } from './trapRoomProfile';

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

const WAVE_SET_BY_KIND: Record<'start' | 'combat' | 'elite' | 'trap', readonly string[]> = {
  start: ['room-a'],
  combat: ['room-a', 'room-b', 'room-c-shield'],
  elite: ['elite'],
  trap: ['trap-hazard'],
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
    return { ...base, waveSetId: WAVE_SET_BY_KIND.trap[0], trapProfile: TRAP_ROOM_PROFILES[key] };
  }
  if (source.kind === 'start' || source.kind === 'combat' || source.kind === 'elite') {
    const pool = source.kind === 'combat'
      ? WAVE_SET_BY_KIND.combat.filter(key => (source.stage === 2 ? key.startsWith('room-c') : !key.startsWith('room-c')))
      : WAVE_SET_BY_KIND[source.kind];
    return { ...base, waveSetId: pool[Math.floor(rand() * pool.length)] };
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
  const nodes = generated.graph.nodes.map((node): MapNode => {
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
  return {
    definition: { nodes, edges, startNodeId: stage1.start.id, lastBeforeBossNodeId },
    seed,
    attempts: 1,
  };
}
