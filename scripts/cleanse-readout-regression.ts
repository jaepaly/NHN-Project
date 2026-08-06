import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanseHintFor, cleanseReadoutLine } from '../src/render/floorHazardReadout';
import { FLOOR_HAZARD_CONFIG } from '../src/combat-core/combat/floorHazardConfig';
import {
  FLOOR_HAZARD_KINDS,
  createFloorHazardPlayerState,
  floorHazardCleansesRemaining,
  tryCleanseFloorHazards,
} from '../src/combat-core/combat/floorHazardState';

const fresh = createFloorHazardPlayerState();
assert.equal(cleanseReadoutLine(fresh, []), null, 'no notice outside a hazard room');

for (const kind of FLOOR_HAZARD_KINDS) {
  const hint = cleanseHintFor(kind);
  const config = FLOOR_HAZARD_CONFIG[kind];
  assert.equal(hint.split('·').length, config.counterElements.length + config.counterEffects.length);
  assert.ok(cleanseReadoutLine(fresh, [kind]));
}

const cleansed = tryCleanseFloorHazards(fresh, 'water', 'damage', ['lava']);
assert.deepEqual(cleansed.cleansed, ['lava']);
assert.equal(floorHazardCleansesRemaining(cleansed.state), 0);
assert.ok(cleanseReadoutLine(cleansed.state, ['lava']));

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
assert.ok(/cleanseReadoutLine\(\s*this\.floorHazardPlayer,/.test(scene));
assert.ok(/this\.waveText\.setText\(cleanseLine \?\? ''\);/.test(scene));
assert.ok(/this\.roomRadar\.setStatus\(roomLine, encounterLine\);/.test(scene));
assert.ok(!/const researchLines =/.test(scene));

console.log('cleanse readout regression: hazard notice remains separate from room progress passed');
