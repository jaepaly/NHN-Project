import assert from 'node:assert/strict';
import {
  enumeratePrototypeStagePaths,
  generatePrototypeMap,
  prototypeAverageRouteMix,
} from '../src/run/partitionMapGeneratorCore';
import { generateRunMap } from '../src/run/mapGenerator';
import { RunMapGraph, toMinimapModel } from '../src/run/mapGraph';
import { MINIMAP_CONFIG, minimapLayout } from '../src/ui/minimapLayout';

const risk = { combat: 1, trap: 2, elite: 2, treasure: 0, altar: 1, boss: 1 } as const;
const reward = { combat: 0, trap: 0, elite: 0, treasure: 1, altar: 1, boss: 0 } as const;
const runtimes: number[] = [];

for (let seed = 1; seed <= 5_000; seed += 1) {
  const result = generatePrototypeMap(seed);
  for (const stage of result.stages) {
    const stageIndex = stage.start.stage;
    const paths = enumeratePrototypeStagePaths(result.graph, stage.start.id, stage.boss.id);
    assert.ok(paths.length > 0, `seed ${seed} stage ${stageIndex}: route missing`);
    const signatures = paths.map(path => path.filter(node => node.id !== stage.boss.id).map(node => node.kind).join('|'));
    assert.equal(new Set(signatures).size, signatures.length, `seed ${seed} stage ${stageIndex}: duplicate route`);
    assert.ok(result.graph.nodes.some(node => node.stage === stageIndex && (node.kind === 'treasure' || node.kind === 'altar')), `seed ${seed} stage ${stageIndex}: reward missing`);
    const scores = paths.map(path => {
      const playable = path.filter(node => node.id !== stage.boss.id);
      return {
        risk: playable.reduce((sum, node) => sum + risk[node.kind], 0),
        reward: playable.reduce((sum, node) => sum + reward[node.kind], 0),
      };
    });
    for (let i = 0; i < scores.length; i += 1) for (let j = 0; j < scores.length; j += 1) {
      if (i === j) continue;
      assert.ok(!(scores[i].risk > scores[j].risk && scores[i].reward < scores[j].reward), `seed ${seed} stage ${stageIndex}: dominated route`);
    }
  }
  runtimes.push(prototypeAverageRouteMix(result.graph, result.stages).runtimeSeconds);

  const integrated = generateRunMap(seed);
  assert.ok(integrated, `seed ${seed}: integrated map missing`);
  const definition = integrated.definition;
  const points = minimapLayout(toMinimapModel(new RunMapGraph(definition).snapshot()));
  const pointById = new Map(points.map(point => [point.id, point] as const));
  for (let i = 0; i < definition.nodes.length; i += 1) for (let j = i + 1; j < definition.nodes.length; j += 1) {
    const left = definition.nodes[i];
    const right = definition.nodes[j];
    const leftPoint = pointById.get(left.id)!;
    const rightPoint = pointById.get(right.id)!;
    const distance = Math.hypot(leftPoint.x - rightPoint.x, leftPoint.y - rightPoint.y);
    assert.ok(distance >= MINIMAP_CONFIG.nodeRadius * 2, `seed ${seed}: minimap overlap ${left.id}/${right.id}`);
    if (left.stage !== right.stage) continue;
    if (left.lane === right.lane) {
      assert.ok(Math.abs(leftPoint.y - rightPoint.y) < 1e-9, `seed ${seed}: same lane changed y`);
    } else if (left.lane < right.lane) {
      assert.ok(leftPoint.y < rightPoint.y, `seed ${seed}: lane order reversed`);
    } else {
      assert.ok(leftPoint.y > rightPoint.y, `seed ${seed}: lane order reversed`);
    }
  }
  const nodeById = new Map(definition.nodes.map(node => [node.id, node] as const));
  for (let i = 0; i < definition.edges.length; i += 1) for (let j = i + 1; j < definition.edges.length; j += 1) {
    const left = definition.edges[i];
    const right = definition.edges[j];
    if (left.from === right.from || left.to === right.to) continue;
    const leftFrom = nodeById.get(left.from)!;
    const leftTo = nodeById.get(left.to)!;
    const rightFrom = nodeById.get(right.from)!;
    const rightTo = nodeById.get(right.to)!;
    if (leftFrom.stage !== rightFrom.stage || leftTo.stage !== rightTo.stage) continue;
    if (leftFrom.layer !== rightFrom.layer || leftTo.layer !== rightTo.layer) continue;
    const fromOrder = Math.sign(leftFrom.lane - rightFrom.lane);
    const toOrder = Math.sign(leftTo.lane - rightTo.lane);
    assert.ok(fromOrder === 0 || toOrder === 0 || fromOrder === toOrder, `seed ${seed}: independent edges invert lane order`);
  }
}

runtimes.sort((a, b) => a - b);
const average = runtimes.reduce((sum, value) => sum + value, 0) / runtimes.length;
const median = (runtimes[2_499] + runtimes[2_500]) / 2;
const p95 = runtimes[Math.ceil(runtimes.length * 0.95) - 1];
const minimum = runtimes[0];
const maximum = runtimes[runtimes.length - 1];
const outOfRange = runtimes.filter(value => value < 8 * 60 || value > 12 * 60).length;

assert.equal(outOfRange, 0, `8~12 minute violations: ${outOfRange}`);
// Published #240 audit: 10:16 average, 10:09 median, 11:28 p95,
// 8:35 minimum, and 11:45 maximum (rounded to whole seconds).
assert.equal(Math.round(average), 616);
assert.equal(Math.round(median), 609);
assert.equal(Math.round(p95), 688);
assert.equal(Math.round(minimum), 515);
assert.equal(Math.round(maximum), 705);
console.log(JSON.stringify({ seeds: 5_000, average, median, p95, minimum, maximum, outOfRange }));
