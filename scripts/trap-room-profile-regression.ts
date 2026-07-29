import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RunMapGraph, type MapGraphDefinition } from '../src/run/mapGraph';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import {
  canPlaceTrapHazardCircle,
  isInsideTrapSafeCorridor,
  trapHazardCirclePlacements,
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

const playerRadius = 16;
const placements = trapHazardCirclePlacements(
  centerX,
  centerY,
  corridor,
  playerRadius,
);
assert.equal(placements.length, 3, 'all preset hazard circles must pass corridor clearance');
for (const placement of placements) {
  assert.equal(
    canPlaceTrapHazardCircle(
      placement.x,
      placement.y,
      placement.radius,
      centerX,
      centerY,
      corridor,
      playerRadius,
    ),
    true,
    'spawned circle must preserve the cross corridor including player radius',
  );
}

// 네 방향 축을 따라 방 가장자리에서 중앙까지 이동할 때 어느 원형 장판과도 겹치지 않는다.
const axisPaths = [
  Array.from({ length: centerX + 1 }, (_, x) => [x, centerY] as const),
  Array.from({ length: centerX + 1 }, (_, dx) => [centerX + dx, centerY] as const),
  Array.from({ length: centerY + 1 }, (_, y) => [centerX, y] as const),
  Array.from({ length: centerY + 1 }, (_, dy) => [centerX, centerY + dy] as const),
];
for (const path of axisPaths) {
  for (const [x, y] of path) {
    assert.equal(
      placements.some((placement) => (
        Math.hypot(x - placement.x, y - placement.y)
          <= placement.radius + playerRadius
      )),
      false,
      `cross corridor disconnected by a hazard circle at (${x}, ${y})`,
    );
  }
}

const silenceProfile = trapProfileFromLegacyCurse('silence');
silenceProfile.safeCorridor!.halfWidth = 1;
assert.equal(TRAP_ROOM_PROFILES.silence.safeCorridor?.halfWidth, 64, 'legacy mapping is defensive');

// 현재 6방 고정 프리셋은 roomIndex에 묶인 함정 배선이 일반화될 때까지 trap을
// 제외한다. 계약 검증은 제단 갈래를 함정 갈래로 바꾼 독립 fixture로 유지한다.
const trapDefinition: MapGraphDefinition = {
  ...MAP_GRAPH_PRESET_01,
  nodes: MAP_GRAPH_PRESET_01.nodes.map((node) => (
    node.id === 's2-altar'
      ? {
        ...node,
        id: 's2-trap',
        kind: 'trap',
        waveSetId: 'trap-hazard',
        trapProfile: TRAP_ROOM_PROFILES.hazard,
      }
      : node
  )),
  edges: MAP_GRAPH_PRESET_01.edges.map((edge) => ({
    from: edge.from === 's2-altar' ? 's2-trap' : edge.from,
    to: edge.to === 's2-altar' ? 's2-trap' : edge.to,
  })),
};
const graph = new RunMapGraph(trapDefinition);
const trap = graph.snapshot().nodes.find((node) => node.id === 's2-trap');
assert.equal(trap?.kind, 'trap');
assert.equal(trap?.trapProfile?.kind, 'hazard');
assert.equal(trap?.waveSetId, 'trap-hazard');
assert.equal(WAVE_SETS['trap-hazard'].some((wave) => wave.hazard === true), false,
  'trap node owns the hazard field; its enemy wave must not spawn legacy hazards');

const missingProfile = {
  ...trapDefinition,
  nodes: trapDefinition.nodes.map((node) => (
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

console.log('Trap room profile regression: mapping, connected cross corridor, node contract, room-clear cleanup passed');
