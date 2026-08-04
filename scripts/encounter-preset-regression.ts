import assert from 'node:assert/strict';
import {
  ENCOUNTER_PRESETS,
  PRESET_IDS_BY_TIER,
  resolveEliteAssignments,
  validateEncounterPresets,
  waveEnemyKinds,
} from '../src/combat-core/waves/encounterPresets';
import { generateRunMap } from '../src/run/mapGenerator';
import { MAP_GRAPH_BUILD_PRESET, MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';

assert.doesNotThrow(validateEncounterPresets);
assert.deepEqual(Object.values(PRESET_IDS_BY_TIER).flat(), Object.keys(ENCOUNTER_PRESETS));

for (const definition of [MAP_GRAPH_PRESET_01, MAP_GRAPH_BUILD_PRESET]) {
  const lastBeforeBoss = definition.nodes.find((node) => node.id === definition.lastBeforeBossNodeId)!;
  for (const node of definition.nodes) {
    if (!node.waveSetId) continue;
    const preset = ENCOUNTER_PRESETS[node.waveSetId];
    assert.ok(preset, `${definition.startNodeId}: ${node.id} references a supported encounter preset`);
    const progress = lastBeforeBoss.layer > 0 ? node.layer / lastBeforeBoss.layer : 0;
    const expectedTier = progress < 1 / 3 ? 1 : progress < 2 / 3 ? 2 : 3;
    assert.equal(preset.tier, expectedTier, `${definition.startNodeId}: ${node.id} follows playable progress tier`);
  }
}

const EXPECTED_COUNTS: Readonly<Record<string, readonly [number, number]>> = {
  't1-a': [9, 9], 't1-b': [9, 9], 't1-c': [9, 9],
  't2-a': [10, 10], 't2-b': [8, 10], 't2-c': [10, 10],
  't3-a': [11, 11], 't3-b': [9, 11], 't3-c': [10, 12],
};

for (const preset of Object.values(ENCOUNTER_PRESETS)) {
  assert.ok(preset.waves.length >= 2 && preset.waves.length <= 3, `${preset.id}: 2..3 waves`);
  const nominal = preset.waves.reduce((sum, wave) => sum + waveEnemyKinds(wave).length, 0);
  const splitterCount = preset.waves.reduce((sum, wave) => sum + wave.splitterCount, 0);
  const effective = nominal + splitterCount * 2;
  assert.deepEqual([nominal, effective], EXPECTED_COUNTS[preset.id], `${preset.id}: initial/effective enemy budget`);
  preset.waves.forEach((wave, waveIndex) => {
    const first = resolveEliteAssignments(preset.id, waveIndex, 1234, 'node-a');
    const repeat = resolveEliteAssignments(preset.id, waveIndex, 1234, 'node-a');
    assert.deepEqual(first, repeat, `${preset.id} wave ${waveIndex + 1}: deterministic`);
    assert.equal(first.length, waveEnemyKinds(wave).length, `${preset.id} wave ${waveIndex + 1}: all initial enemies elite`);
    assert.ok(first.filter((modifier) => modifier === 'guard').length <= 1, `${preset.id}: guard cap`);
  });
}

for (let seed = 1; seed <= 200; seed += 1) {
  const generated = generateRunMap(seed)!;
  const nodes = new Map(generated.definition.nodes.map((node) => [node.id, node]));
  const lastBeforeBoss = nodes.get(generated.definition.lastBeforeBossNodeId)!;
  for (const node of generated.definition.nodes) {
    if (!node.waveSetId) continue;
    const preset = ENCOUNTER_PRESETS[node.waveSetId];
    assert.ok(preset, `seed ${seed}: generated preset exists`);
    const progress = lastBeforeBoss.layer > 0 ? node.layer / lastBeforeBoss.layer : 0;
    const expectedTier = progress < 1 / 3 ? 1 : progress < 2 / 3 ? 2 : 3;
    assert.equal(preset.tier, expectedTier, `seed ${seed}: ${node.id} follows global progress tier`);
  }
  for (const edge of generated.definition.edges) {
    const from = nodes.get(edge.from)!;
    const to = nodes.get(edge.to)!;
    if (from.waveSetId && to.waveSetId && ENCOUNTER_PRESETS[from.waveSetId]?.tier === ENCOUNTER_PRESETS[to.waveSetId]?.tier) {
      const tier = ENCOUNTER_PRESETS[to.waveSetId].tier;
      const incomingSameTierPresets = new Set(
        generated.definition.edges
          .filter((candidate) => candidate.to === to.id)
          .map((candidate) => nodes.get(candidate.from)?.waveSetId)
          .filter((presetId): presetId is string => ENCOUNTER_PRESETS[presetId]?.tier === tier),
      );
      if (incomingSameTierPresets.size < PRESET_IDS_BY_TIER[tier].length) {
        assert.notEqual(
          from.waveSetId,
          to.waveSetId,
          `seed ${seed}: adjacent same-tier encounters differ when an alternative exists (${from.id}@${from.layer} -> ${to.id}@${to.layer})`,
        );
      }
    }
  }
}

const variants = new Set<string>();
for (let seed = 1; seed <= 40; seed += 1) {
  variants.add(resolveEliteAssignments('t3-c', 1, seed, 'same-node').join(','));
}
assert.ok(variants.size > 1, 'different map seeds vary eligible elite targets');

console.log('Encounter preset regression: 9 presets, budgets, deterministic elite assignments, and 200 generated maps passed');
