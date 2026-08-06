import assert from 'node:assert/strict';
import {
  allRoomIconTextures,
  ROOM_ICON_KINDS,
  roomIconDataUri,
  roomIconTextureKey,
} from '../src/ui/roomKindIcon';
import type { MapNodeKind } from '../src/run/mapGraphContract';

const expected: MapNodeKind[] = [
  'combat', 'elite', 'trap', 'treasure', 'altar', 'stage-boss', 'memory-boss',
];

assert.deepEqual([...ROOM_ICON_KINDS], expected, '선택 대상 7종 아이콘 매핑');
assert.equal(roomIconDataUri('start'), null, '시작 노드는 전용 아이콘 없음');
assert.equal(roomIconTextureKey('start'), null, '시작 텍스처 없음');

for (const kind of expected) {
  const uri = roomIconDataUri(kind);
  assert.ok(uri?.startsWith('data:image/svg+xml;base64,'), `${kind} Phaser-compatible SVG data URI`);
  const decoded = atob(uri!.split(',')[1]);
  assert.match(decoded, /viewBox="0 0 64 64"/, `${kind} 공통 캔버스`);
  assert.ok(!/[<>](BOSS|일반방|함정방)[<>]/.test(decoded), `${kind} 표시 텍스트 없음`);
  assert.equal(roomIconTextureKey(kind), `room-kind-icon-${kind}`, `${kind} 텍스처 키`);
}

assert.equal(allRoomIconTextures().length, 7, 'Phaser 로드용 7종');
assert.equal(new Set(allRoomIconTextures().map(({ key }) => key)).size, 7, '텍스처 키 고유');

console.log('Room kind icon regression: 7종 매핑·시작 제외·SVG 캔버스·텍스트 없음·키 고유 통과');
