import assert from 'node:assert/strict';
import { generateRunMap, seededRandom } from '../src/run/mapGenerator';
import { RunMapGraph } from '../src/run/mapGraph';
import { WAVE_SETS } from '../src/combat-core/waves/waveManager';
import type { MapGraphDefinition } from '../src/run/mapGraph';
import type { MapNode, MapNodeKind } from '../src/run/mapGraphContract';

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

const generated: MapGraphDefinition[] = [];
for (let seed = 1; seed <= 500; seed += 1) {
  const result = generateRunMap(seed);
  assert.ok(result, `seed ${seed} must produce a map`);
  generated.push(result.definition);
}

const totalLengths = new Set<number>();
for (const definition of generated) {
  assert.doesNotThrow(() => new RunMapGraph(definition), 'MapGraph contract must accept generated maps');
  const finalBoss = definition.nodes.find((node) => node.kind === 'memory-boss');
  const stageBoss = definition.nodes.find((node) => node.kind === 'stage-boss');
  assert.ok(finalBoss && stageBoss, 'both bosses must exist');
  const paths = pathsTo(definition, finalBoss.id);
  assert.ok(paths.length > 0, 'a start-to-final-boss path must exist');
  for (const path of paths) totalLengths.add(path.length);

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

  // 3. no complete route may be strictly riskier and less rewarding.
  const scores = paths.map((path) => path.reduce((score, node) => ({
    risk: score.risk + risk[node.kind], reward: score.reward + reward[node.kind],
  }), { risk: 0, reward: 0 }));
  for (let i = 0; i < scores.length; i += 1) for (let j = i + 1; j < scores.length; j += 1) {
    assert.ok(!(scores[i].risk > scores[j].risk && scores[i].reward < scores[j].reward), 'route dominance');
    assert.ok(!(scores[j].risk > scores[i].risk && scores[j].reward < scores[i].reward), 'route dominance');
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
