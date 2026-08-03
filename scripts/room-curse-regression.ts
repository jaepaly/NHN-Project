import assert from 'node:assert/strict';
import {
  ROOM_CURSE_CONFIG,
  isInsideCurseCircle,
  silenceManaDrainPerSecond,
} from '../src/combat-core/run/roomCurse';

assert.equal(ROOM_CURSE_CONFIG.silenceRadius, 185);
assert.equal(ROOM_CURSE_CONFIG.silenceManaDrainRatio, 0.05);
assert.equal(ROOM_CURSE_CONFIG.blackoutVisionRadius, 95);
assert.equal(ROOM_CURSE_CONFIG.blackoutIlluminationSeconds, 4);

assert.equal(isInsideCurseCircle(0, 0, 0, 0, 10), true);
assert.equal(isInsideCurseCircle(10, 0, 0, 0, 10), true);
assert.equal(isInsideCurseCircle(10.01, 0, 0, 0, 10), false);
assert.equal(isInsideCurseCircle(0, 0, 0, 0, -1), false);
assert.equal(isInsideCurseCircle(Number.NaN, 0, 0, 0, 10), false);

assert.equal(silenceManaDrainPerSecond(100), 5);
assert.equal(silenceManaDrainPerSecond(0), 0);
assert.equal(silenceManaDrainPerSecond(Number.NaN), 0);

console.log('Room curse regression: MapGraph trap config·circle guard·silence drain 3군 통과');
