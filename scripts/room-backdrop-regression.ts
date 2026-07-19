import assert from 'node:assert/strict';
import {
  backdropPaletteForRoom,
  ROOM_BACKDROP_PALETTES,
} from '../src/render/roomBackdropConfig';

assert.equal(backdropPaletteForRoom(1, 3), ROOM_BACKDROP_PALETTES.stage1);
assert.equal(backdropPaletteForRoom(2, 3), ROOM_BACKDROP_PALETTES.stage2);
assert.equal(backdropPaletteForRoom(3, 3), ROOM_BACKDROP_PALETTES.boss);
assert.equal(backdropPaletteForRoom(4, 3), ROOM_BACKDROP_PALETTES.boss);
assert.equal(backdropPaletteForRoom(Number.NaN, 3), ROOM_BACKDROP_PALETTES.stage1);
assert.equal(backdropPaletteForRoom(1, Number.NaN), ROOM_BACKDROP_PALETTES.boss);

console.log('room backdrop regression: 단계·보스방·범위보정 6군 통과');
