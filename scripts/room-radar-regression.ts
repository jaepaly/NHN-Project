import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectRoomRadarPoint, ROOM_RADAR_CONFIG } from '../src/ui/roomRadarModel';

const bounds = { x: 100, y: 200, width: 1000, height: 500 };
assert.deepEqual(projectRoomRadarPoint(bounds, { x: 100, y: 200 }), {
  x: ROOM_RADAR_CONFIG.padding,
  y: ROOM_RADAR_CONFIG.headerHeight,
});
assert.deepEqual(projectRoomRadarPoint(bounds, { x: 1100, y: 700 }), {
  x: ROOM_RADAR_CONFIG.width - ROOM_RADAR_CONFIG.padding,
  y: ROOM_RADAR_CONFIG.height - ROOM_RADAR_CONFIG.padding,
});
assert.equal(ROOM_RADAR_CONFIG.headerHeight >= 45, true, 'header holds title and two state lines');

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8').replace(/\s+/g, ' ');
const radar = readFileSync('src/ui/roomRadarHud.ts', 'utf8').replace(/\s+/g, ' ');
assert.match(scene, /new RoomRadarHud\( this, width - ROOM_RADAR_CONFIG\.width - 18, ROOM_RADAR_TOP, \)/u);
assert.match(scene, /this\.roomRadar\.setStatus\(roomLine, encounterLine\);/u);
assert.match(scene, /this\.roomRadar\.update\( this\.worldBounds, \{ x: this\.player\.x, y: this\.player\.y \}, this\.enemies, \);/u);
assert.match(radar, /setStatus\(roomLine: string, encounterLine: string\): void/u);
assert.match(radar, /this\.status\.setText\(`\$\{roomLine\}\\n\$\{encounterLine\}`\);/u);

console.log('room radar regression: projection and room progress integration passed');
