import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  projectRoomRadarPoint,
  ROOM_RADAR_CONFIG,
} from '../src/ui/roomRadarModel';

const bounds = { x: 100, y: 200, width: 1000, height: 500 };
const topLeft = projectRoomRadarPoint(bounds, { x: 100, y: 200 });
assert.deepEqual(topLeft, {
  x: ROOM_RADAR_CONFIG.padding,
  y: ROOM_RADAR_CONFIG.headerHeight,
}, '방 좌상단 투영');

const bottomRight = projectRoomRadarPoint(bounds, { x: 1100, y: 700 });
assert.deepEqual(bottomRight, {
  x: ROOM_RADAR_CONFIG.width - ROOM_RADAR_CONFIG.padding,
  y: ROOM_RADAR_CONFIG.height - ROOM_RADAR_CONFIG.padding,
}, '방 우하단 투영');

const center = projectRoomRadarPoint(bounds, { x: 600, y: 450 });
assert.equal(center.x, ROOM_RADAR_CONFIG.width / 2, '가로 중앙 투영');
assert.equal(
  center.y,
  ROOM_RADAR_CONFIG.headerHeight
    + (ROOM_RADAR_CONFIG.height - ROOM_RADAR_CONFIG.headerHeight - ROOM_RADAR_CONFIG.padding) / 2,
  '세로 중앙 투영',
);

assert.deepEqual(
  projectRoomRadarPoint(bounds, { x: -500, y: 900 }),
  { x: ROOM_RADAR_CONFIG.padding, y: ROOM_RADAR_CONFIG.height - ROOM_RADAR_CONFIG.padding },
  '방 밖 좌표 가장자리 고정',
);

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8').replace(/\s+/g, ' ');
assert.match(scene, /new RoomRadarHud\( this, width - ROOM_RADAR_CONFIG\.width - 18, ROOM_RADAR_TOP, \)/u, '우상단 레이더 생성');
assert.match(scene, /this\.roomRadar\.update\( this\.worldBounds, \{ x: this\.player\.x, y: this\.player\.y \}, this\.enemies, \);/u, '플레이어·적 실시간 갱신');

console.log('room radar regression: 좌표 투영·경계 고정·씬 생성/갱신 7군 통과');
