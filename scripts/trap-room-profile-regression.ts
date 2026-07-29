import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RunMapGraph } from '../src/run/mapGraph';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import {
  canPlaceTrapHazardCircle,
  isInsideTrapSafeCorridor,
  trapProfileFromLegacyCurse,
  TRAP_HAZARD_CIRCLE_RADIUS,
  TRAP_ROOM_PROFILES,
} from '../src/run/trapRoomProfile';
import { WAVE_SETS } from '../src/combat-core/waves/waveManager';

const hazard = TRAP_ROOM_PROFILES.hazard;
const silence = TRAP_ROOM_PROFILES.silence;
assert.equal(hazard.safeCorridor?.shape, 'cross');
assert.equal(silence.safeCorridor?.shape, 'cross');
assert.equal(TRAP_ROOM_PROFILES.blackout.safeCorridor, undefined);
assert.equal(TRAP_ROOM_PROFILES['word-limit'].safeCorridor, undefined);
assert.equal(TRAP_ROOM_PROFILES.heatwave.safeCorridor, undefined);

const centerX = 640;
const centerY = 360;
const corridor = hazard.safeCorridor!;
assert.equal(isInsideTrapSafeCorridor(centerX + 300, centerY, centerX, centerY, corridor), true);
assert.equal(isInsideTrapSafeCorridor(centerX, centerY - 250, centerX, centerY, corridor), true);
assert.equal(isInsideTrapSafeCorridor(centerX + 250, centerY + 250, centerX, centerY, corridor), false);
assert.equal(TRAP_HAZARD_CIRCLE_RADIUS, 120);
assert.equal(canPlaceTrapHazardCircle(centerX + 270, centerY + 270, TRAP_HAZARD_CIRCLE_RADIUS, centerX, centerY, corridor), true);
assert.equal(canPlaceTrapHazardCircle(centerX + 120, centerY + 270, TRAP_HAZARD_CIRCLE_RADIUS, centerX, centerY, corridor), false);

const silenceProfile = trapProfileFromLegacyCurse('silence');
silenceProfile.safeCorridor!.halfWidth = 1;
assert.equal(TRAP_ROOM_PROFILES.silence.safeCorridor?.halfWidth, 64, 'legacy mapping is defensive');

const graph = new RunMapGraph(MAP_GRAPH_PRESET_01);
const trap = graph.snapshot().nodes.find((node) => node.id === 's2-trap');
assert.equal(trap?.kind, 'trap');
assert.equal(trap?.trapProfile?.kind, 'hazard');
assert.equal(trap?.waveSetId, 'trap-hazard');
assert.equal(WAVE_SETS['trap-hazard'].some((wave) => wave.hazard === true), false,
  'trap node owns the hazard field; its enemy wave must not spawn legacy hazards');

const missingProfile = {
  ...MAP_GRAPH_PRESET_01,
  nodes: MAP_GRAPH_PRESET_01.nodes.map((node) => (
    node.id === 's2-trap' ? { ...node, trapProfile: undefined } : node
  )),
};
assert.throws(() => new RunMapGraph(missingProfile), /requires a trap profile/);

const sceneSource = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
const roomClearedHandler = sceneSource.match(
  /on\('room-cleared',[\s\S]*?\n    \}\);/,
)?.[0] ?? '';
assert.match(
  roomClearedHandler,
  /this\.clearRoomGimmicks\(\)/,
  'room clear must remove trap effects before portal or reward interaction',
);

const clearRoomGimmicks = sceneSource.match(
  /private clearRoomGimmicks\(\): void \{[\s\S]*?\n  \}/,
)?.[0] ?? '';
for (const cleanup of [
  'this.clearHazardZones()',
  'decoration.destroy()',
  'this.hazardDecorations = []',
  'this.clearRoomCurse()',
]) {
  assert.ok(
    clearRoomGimmicks.includes(cleanup),
    `room gimmick cleanup is missing: ${cleanup}`,
  );
}

console.log('Trap room profile regression: legacy mapping, cross corridor, node contract, room-clear cleanup passed');
