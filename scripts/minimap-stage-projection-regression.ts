import assert from 'node:assert/strict';
import type { MinimapModel } from '../src/run/mapGraphContract';
import {
  currentMinimapStage,
  minimapStages,
  projectMinimapStage,
} from '../src/ui/minimapStageProjection';

const model: MinimapModel = {
  nodes: [
    { id: 'start', stage: 1, kind: 'start', status: 'cleared', layer: 0, lane: 0 },
    { id: 's1-room', stage: 1, kind: 'combat', status: 'cleared', layer: 1, lane: 0 },
    { id: 'gate', stage: 1, kind: 'stage-boss', status: 'cleared', layer: 2, lane: 0 },
    { id: 's2-a', stage: 2, kind: 'combat', status: 'current', layer: 3, lane: -1 },
    { id: 's2-b', stage: 2, kind: 'altar', status: 'unvisited', layer: 4, lane: 1 },
    { id: 'final', stage: 2, kind: 'memory-boss', status: 'unvisited', layer: 5, lane: 0 },
  ],
  edges: [
    { from: 'start', to: 's1-room' },
    { from: 's1-room', to: 'gate' },
    { from: 'gate', to: 's2-a' },
    { from: 's2-a', to: 's2-b' },
    { from: 's2-b', to: 'final' },
  ],
};

assert.deepEqual(minimapStages(model), [1, 2], 'stage list');
assert.equal(currentMinimapStage(model), 2, 'current node stage');

const stage1 = projectMinimapStage(model, 1);
assert.deepEqual(stage1.nodes.map((node) => node.id), ['start', 's1-room', 'gate']);
assert.equal(stage1.edges.length, 2, 'stage 1 internal edges only');
assert.equal(Math.min(...stage1.nodes.map((node) => node.layer)), 0, 'stage 1 layer normalization');

const stage2 = projectMinimapStage(model, 2);
assert.deepEqual(stage2.nodes.map((node) => node.id), ['s2-a', 's2-b', 'final']);
assert.equal(stage2.edges.length, 2, 'stage 2 internal edges only');
assert.ok(!stage2.edges.some((edge) => edge.from === 'gate'), 'previous gate entry edge removed');
assert.equal(Math.min(...stage2.nodes.map((node) => node.layer)), 0, 'stage 2 layer normalization');

console.log('Minimap stage projection regression: isolated stage nodes/edges/normalization passed');
