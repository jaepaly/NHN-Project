import assert from 'node:assert/strict';
import { RunMapGraph, toMinimapModel, type MapGraphDefinition } from '../src/run/mapGraph';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';

const graph = new RunMapGraph(MAP_GRAPH_PRESET_01);

assert.equal(graph.current().id, 's1-start');
assert.deepEqual(graph.choices().map((node) => node.id), ['s1-combat', 's1-treasure']);
assert.throws(() => graph.enter('s2-combat'), /unreachable/);

graph.enter('s1-combat');
let state = graph.snapshot();
assert.equal(state.currentNodeId, 's1-combat');
assert.equal(state.nodes.find((node) => node.id === 's1-start')?.status, 'cleared');
assert.equal(state.nodes.find((node) => node.id === 's1-treasure')?.status, 'unvisited');
assert.equal(state.nodes.find((node) => node.id === 's1-elite')?.status, 'reachable');

graph.enter('s1-elite');
graph.enter('s1-boss');
assert.equal(graph.isBossNode(graph.current().id), true);
graph.enter('s2-combat');
assert.deepEqual(graph.choices().map((node) => node.kind), ['trap', 'altar']);
graph.enter('s2-trap');
graph.enter('s2-elite');
assert.equal(graph.lastBeforeBoss().id, 's2-elite');
graph.enter('s2-memory-boss');
assert.equal(graph.isBossNode(graph.current().id), true);
assert.deepEqual(graph.choices(), []);

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

console.log('MapGraph regression: contract, navigation, snapshot, minimap adapter, graph guards passed');
