import assert from 'node:assert/strict';
import {
  RunMapGraph,
  maximumMapPathRooms,
  toMinimapModel,
  type MapGraphDefinition,
} from '../src/run/mapGraph';
import { encounterFromMapNode } from '../src/run/mapEncounter';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';

const graph = new RunMapGraph(MAP_GRAPH_PRESET_01);

assert.equal(graph.current().id, 's1-start');
assert.equal(maximumMapPathRooms(MAP_GRAPH_PRESET_01), 8);
assert.deepEqual(graph.progress(), { stage: 1, roomNumber: 1, totalVisitedRooms: 1 });
assert.deepEqual(graph.choices().map((node) => node.id), ['s1-combat', 's1-treasure']);
assert.equal(graph.canEnter('s1-combat'), true);
assert.equal(graph.canEnter('s2-combat'), false);
assert.throws(() => graph.enter('s2-combat'), /unreachable/);

graph.enter('s1-combat');
assert.deepEqual(graph.progress(), { stage: 1, roomNumber: 2, totalVisitedRooms: 2 });
assert.equal(graph.enter('s1-combat').id, 's1-combat', 'duplicate portal entry is a no-op');
assert.deepEqual(graph.progress(), { stage: 1, roomNumber: 2, totalVisitedRooms: 2 });
let state = graph.snapshot();
assert.equal(state.currentNodeId, 's1-combat');
assert.equal(state.nodes.find((node) => node.id === 's1-start')?.status, 'cleared');
assert.equal(state.nodes.find((node) => node.id === 's1-treasure')?.status, 'unvisited');
assert.equal(state.nodes.find((node) => node.id === 's1-elite')?.status, 'reachable');

graph.enter('s1-elite');
graph.enter('s1-boss');
assert.equal(graph.isBossNode(graph.current().id), true);
assert.equal(graph.isFinalBossNode(graph.current().id), false);
graph.enter('s2-combat');
assert.deepEqual(graph.progress(), { stage: 2, roomNumber: 1, totalVisitedRooms: 5 });
assert.deepEqual(graph.choices().map((node) => node.kind), ['trap', 'altar']);
graph.enter('s2-trap');
graph.enter('s2-elite');
assert.equal(graph.lastBeforeBoss().id, 's2-elite');
graph.enter('s2-memory-boss');
assert.equal(graph.isBossNode(graph.current().id), true);
assert.equal(graph.isFinalBossNode(graph.current().id), true);
assert.deepEqual(graph.choices(), []);

const demoGraph = new RunMapGraph(
  MAP_GRAPH_PRESET_01,
  MAP_GRAPH_PRESET_01.lastBeforeBossNodeId,
);
assert.equal(demoGraph.current().id, 's2-elite', '시연 런은 마지막 보스 직전 노드에서 시작');

const trapEncounter = encounterFromMapNode(
  MAP_GRAPH_PRESET_01.nodes.find((node) => node.id === 's2-trap')!,
);
assert.deepEqual(trapEncounter, {
  id: 's2-trap',
  stage: 2,
  kind: 'combat',
  rewardAfterClear: true,
    waveSetId: 't3-b',
});
const memoryBossEncounter = encounterFromMapNode(
  MAP_GRAPH_PRESET_01.nodes.find((node) => node.id === 's2-memory-boss')!,
);
assert.equal(memoryBossEncounter.kind, 'memory-boss');
assert.equal(memoryBossEncounter.rewardAfterClear, false);

state = graph.snapshot();
const minimap = toMinimapModel(state);
assert.equal(minimap.nodes.length, MAP_GRAPH_PRESET_01.nodes.length);
assert.equal(minimap.edges.length, MAP_GRAPH_PRESET_01.edges.length);
assert.equal(minimap.nodes.find((node) => node.id === 's2-memory-boss')?.status, 'current');

const malformed = (patch: Partial<MapGraphDefinition>): MapGraphDefinition => ({
  ...MAP_GRAPH_PRESET_01,
  ...patch,
});

assert.throws(
  () => new RunMapGraph(malformed({ edges: [...MAP_GRAPH_PRESET_01.edges, { from: 's2-memory-boss', to: 's1-start' }] })),
  /cycles/,
);
assert.throws(
  () => new RunMapGraph(malformed({ nodes: MAP_GRAPH_PRESET_01.nodes.slice(1) })),
  /start node is missing/,
);
assert.throws(
  () => new RunMapGraph(malformed({
    nodes: MAP_GRAPH_PRESET_01.nodes.map((node) => (
      node.id === 's1-combat' ? { ...node, waveSetId: null } : node
    )),
  })),
  /requires waveSetId/,
);
assert.throws(
  () => new RunMapGraph(malformed({
    nodes: MAP_GRAPH_PRESET_01.nodes.map((node) => (
      node.id === 's1-treasure' ? { ...node, waveSetId: 'room-a' } : node
    )),
  })),
  /must not define waveSetId/,
);

console.log('MapGraph regression: progress, idempotent navigation, completion authority, typed content, graph guards passed');

// ── 프리셋이 가리키는 웨이브셋이 실제로 존재하는가 (총괄 제보로 추가) ──────
// 없는 키를 가리키면 startRoom이 방을 비운 뒤 예외를 던져 **몹도 포탈도 없는 빈 방**이
// 되고 런이 진행 불가가 된다. 실제로 s2-combat이 'room-c'(WAVE_SETS에 없음)를
// 가리켜 매 런 5번 방에서 터졌다. 씬에 대체 폴백을 넣었지만 오타 자체는 여기서 막는다.
{
  const { WAVE_SETS } = await import('../src/combat-core/waves/waveManager');
  const assertWave = (await import('node:assert/strict')).default;
  const missing: string[] = [];
  for (const node of MAP_GRAPH_PRESET_01.nodes) {
    if (!node.waveSetId) continue;
    if (!WAVE_SETS[node.waveSetId]) missing.push(`${node.id} → '${node.waveSetId}'`);
  }
  assertWave.deepEqual(missing, [], `존재하지 않는 웨이브셋을 가리키는 노드: ${missing.join(', ')}`);

  // 역방향도 본다 — 전투 노드는 반드시 웨이브셋을 가져야 한다(빈 전투방 방지)
  for (const node of MAP_GRAPH_PRESET_01.nodes) {
    const needsWave = node.kind === 'start' || node.kind === 'combat'
      || node.kind === 'elite' || node.kind === 'trap';
    if (needsWave) {
      assertWave.ok(node.waveSetId, `${node.id}(${node.kind})는 웨이브셋이 있어야 한다`);
    }
  }
  console.log('map graph regression: 프리셋 웨이브셋 참조 무결성 통과');
}
