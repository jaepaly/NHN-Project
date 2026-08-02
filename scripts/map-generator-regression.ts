import assert from 'node:assert/strict';
import { generateRunMap, seededRandom } from '../src/run/mapGenerator';
import { RunMapGraph, maximumMapPathRooms } from '../src/run/mapGraph';
import { WAVE_SETS } from '../src/combat-core/waves/waveManager';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { encounterFromMapNode } from '../src/run/mapEncounter';
import type { MapGraphDefinition } from '../src/run/mapGraph';
import type { MapNode, MapNodeKind } from '../src/run/mapGraphContract';
import { MINIMAP_CONFIG, minimapLayout } from '../src/ui/minimapLayout';
import { toMinimapModel } from '../src/run/mapGraph';

/** #240의 맵 경로 비교용 상대값. 실제 roomRewardScale과 의도적으로 분리한다. */
const risk: Record<MapNodeKind, number> = {
  start: 1, combat: 1, elite: 2, trap: 2, treasure: 0, altar: 1,
  'stage-boss': 0, 'memory-boss': 0,
};
const reward: Record<MapNodeKind, number> = {
  start: 0, combat: 0, elite: 0, trap: 0, treasure: 1, altar: 1,
  'stage-boss': 0, 'memory-boss': 0,
};

function pathsTo(definition: MapGraphDefinition, endId: string): MapNode[][] {
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const next = new Map<string, string[]>();
  for (const edge of definition.edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  const paths: MapNode[][] = [];
  const walk = (id: string, trail: MapNode[]): void => {
    const node = byId.get(id);
    assert.ok(node, `edge target must exist: ${id}`);
    const here = [...trail, node];
    if (id === endId) { paths.push(here); return; }
    for (const child of next.get(id) ?? []) walk(child, here);
  };
  walk(definition.startNodeId, []);
  return paths;
}

function assertPlayablePath(definition: MapGraphDefinition, path: readonly MapNode[]): void {
  const graph = new RunMapGraph(definition);
  const encounterByRoom = new Map([[1, encounterFromMapNode(graph.current())]]);
  let transition: (() => void) | null = null;
  let completed = 0;
  const controller = new CombatRunController({
    playerState: new PlayerCombatState(),
    maxRooms: 8,
    encounterProvider: (roomIndex) => {
      const encounter = encounterByRoom.get(roomIndex);
      if (!encounter) throw new Error(`missing encounter for room ${roomIndex}`);
      return encounter;
    },
    rewardDraw: (roomIndex) => [{
      id: `room-${roomIndex}-hp`, kind: 'max-hp', title: 'HP', description: 'test',
    }],
    scheduleTransition: (_delay, callback) => { transition = callback; },
  });
  controller.configureMapRoute(maximumMapPathRooms(definition));
  controller.on('run-completed', () => { completed += 1; });

  assert.equal(controller.state.roomCountMode, 'dynamic');
  assert.equal(controller.state.maxRooms, maximumMapPathRooms(definition));
  for (let index = 0; index < path.length; index += 1) {
    const node = graph.current();
    assert.equal(node.id, path[index].id, 'selected MapNode must drive the encounter');
    assert.equal(controller.state.encounterId, node.id, 'encounter id must match MapNode id');
    controller.notifyRoomCleared();

    if (node.kind === 'memory-boss') {
      assert.equal(controller.state.phase, 'run-over');
      assert.equal(completed, 1, 'memory-boss must complete the run exactly once');
      controller.notifyRoomCleared();
      assert.equal(completed, 1, 'run completion must not repeat');
      continue;
    }

    assert.notEqual(controller.state.phase, 'run-over', `room ${index + 1} must not end early`);
    const nextNode = graph.enter(path[index + 1].id);
    encounterByRoom.set(controller.state.roomIndex + 1, encounterFromMapNode(nextNode));
    controller.chooseReward(`room-${controller.state.roomIndex}-hp`);
    assert.ok(transition, `room ${index + 1} must schedule its next encounter`);
    transition();
    transition = null;
  }
}

const generated: MapGraphDefinition[] = [];
for (let seed = 1; seed <= 500; seed += 1) {
  const result = generateRunMap(seed);
  assert.ok(result, `seed ${seed} must produce a map`);
  generated.push(result.definition);
}

// 붉은 원형 위험지대는 trapProfile='hazard'의 함정방 전용이다. 과거 고정 런의
// stage 2 일반방 변형 `room-c-hazard`가 생성 맵 풀에 남아 방 표기와 기믹이 충돌했다.
for (let seed = 1; seed <= 500; seed += 1) {
  const result = generateRunMap(seed)!;
  for (const node of result.definition.nodes) {
    assert.notEqual(
      node.waveSetId,
      'room-c-hazard',
      `seed ${seed}: ${node.kind} ${node.id} must not use the legacy hazard combat wave`,
    );
  }
}
const reportedHazardSeed = generateRunMap(3_934_948_004)!;
assert.ok(
  reportedHazardSeed.definition.nodes.every(node => node.waveSetId !== 'room-c-hazard'),
  'reported seed 3934948004 must not create a red hazard combat room',
);

const totalLengths = new Set<number>();
for (const definition of generated) {
  const acceptedGraph = new RunMapGraph(definition);
  assert.doesNotThrow(() => acceptedGraph, 'MapGraph contract must accept generated maps');
  const minimapPoints = minimapLayout(toMinimapModel(acceptedGraph.snapshot()));
  for (let i = 0; i < minimapPoints.length; i += 1) for (let j = i + 1; j < minimapPoints.length; j += 1) {
    const distance = Math.hypot(
      minimapPoints[i].x - minimapPoints[j].x,
      minimapPoints[i].y - minimapPoints[j].y,
    );
    assert.ok(
      distance >= MINIMAP_CONFIG.nodeRadius * 2,
      `generated minimap nodes overlap: ${minimapPoints[i].id}/${minimapPoints[j].id}`,
    );
  }
  const finalBoss = definition.nodes.find((node) => node.kind === 'memory-boss');
  const stageBoss = definition.nodes.find((node) => node.kind === 'stage-boss');
  assert.ok(finalBoss && stageBoss, 'both bosses must exist');
  const paths = pathsTo(definition, finalBoss.id);
  assert.ok(paths.length > 0, 'a start-to-final-boss path must exist');
  for (const path of paths) {
    totalLengths.add(path.length);
    assertPlayablePath(definition, path);
  }

  // 0. all selectable routes have distinct room sequences.
  const signatures = paths.map((path) => path.map((node) => node.kind).join(','));
  assert.equal(new Set(signatures).size, signatures.length, 'duplicate complete route sequence');

  // 1. stage entry is ordinary combat. `start` is the existing first-room
  // contract; every post-stage-boss entry is explicitly combat.
  assert.equal(definition.nodes.find((node) => node.id === definition.startNodeId)?.kind, 'start');
  const stageTwoEntries = definition.edges
    .filter((edge) => edge.from === stageBoss.id)
    .map((edge) => definition.nodes.find((node) => node.id === edge.to)!);
  assert.ok(stageTwoEntries.length > 0 && stageTwoEntries.every((node) => node.kind === 'combat'));

  // 2. each stage has at least one treasure or altar.
  for (const stage of [1, 2]) {
    assert.ok(definition.nodes.some((node) => node.stage === stage
      && (node.kind === 'treasure' || node.kind === 'altar')), `stage ${stage} reward minimum`);
  }

  // 3. #240 compares alternatives inside each stage. Combining two valid
  // stage choices into a Cartesian whole-run set is not an additional design
  // constraint in the approved HTML generator.
  for (const stage of [1, 2]) {
    const stagePaths = [...new Map(paths.map(path => {
      const nodes = path.filter(node => node.stage === stage && node.kind !== 'stage-boss' && node.kind !== 'memory-boss');
      return [nodes.map(node => node.kind).join(','), nodes] as const;
    })).values()];
    const scores = stagePaths.map(path => path.reduce((score, node) => ({
      risk: score.risk + risk[node.kind], reward: score.reward + reward[node.kind],
    }), { risk: 0, reward: 0 }));
    for (let i = 0; i < scores.length; i += 1) for (let j = i + 1; j < scores.length; j += 1) {
      assert.ok(!(scores[i].risk > scores[j].risk && scores[i].reward < scores[j].reward), `stage ${stage} route dominance`);
      assert.ok(!(scores[j].risk > scores[i].risk && scores[j].reward < scores[i].reward), `stage ${stage} route dominance`);
    }
  }

  for (const node of definition.nodes) {
    if (['start', 'combat', 'elite', 'trap'].includes(node.kind)) {
      assert.ok(node.waveSetId && WAVE_SETS[node.waveSetId], `valid wave set: ${node.id}`);
    } else assert.equal(node.waveSetId, null, `non-combat wave set must be null: ${node.id}`);
    assert.equal(node.kind === 'trap', Boolean(node.trapProfile), `trap profile contract: ${node.id}`);
  }
}

// #288 must not constrain every generated map to the old preset's 8 rooms.
assert.ok(totalLengths.size > 1, `path length should vary across seeds: ${[...totalLengths]}`);
assert.ok(![...totalLengths].every((length) => length === 8), 'fixed 8-room constraint must not return');

const a = generateRunMap(4242);
const b = generateRunMap(4242);
const c = generateRunMap(4243);
assert.ok(a && b && c);
assert.deepEqual(a!.definition, b!.definition, 'same seed must reproduce the same map');
assert.notDeepEqual(a!.definition, c!.definition, 'different seed should vary');
const r1 = seededRandom(7);
const r2 = seededRandom(7);
assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()], 'PRNG determinism');

console.log(`map generator regression: 500 seeds; path lengths ${[...totalLengths].sort((a, b) => a - b).join(', ')}`);
