import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  nextRoomChoiceFocusIndex,
  roomChoiceFocusDirection,
  roomChoicePresentation,
  showRoomChoices,
} from '../src/ui/roomChoiceOverlay';
import type { MapNodeKind } from '../src/run/mapGraphContract';
import { mockMinimapModel } from '../src/run/mapGraphMock';

// 1) 모든 방 종류가 빈 이름·색 없이 표시된다.
const kinds: MapNodeKind[] = [
  'start', 'combat', 'elite', 'stage-boss', 'memory-boss', 'treasure', 'altar', 'trap',
];
for (const kind of kinds) {
  const presentation = roomChoicePresentation(kind);
  assert.ok(presentation.label.length > 0, `${kind} 이름`);
  assert.match(presentation.color, /^#[0-9a-f]{6}$/i, `${kind} 색`);
  assert.ok(presentation.description.length >= 10, `${kind} 짧은 설명`);
}
assert.equal(roomChoicePresentation('treasure').label, '보물방');
assert.equal(roomChoicePresentation('trap').label, '함정방');

// 2) 빈 선택지·중복 ID·지도 밖 선택지는 DOM을 만들기 전에 거부한다.
const map = mockMinimapModel();
await assert.rejects(showRoomChoices({ map, options: [] }), /at least one option/);
await assert.rejects(showRoomChoices({
  map,
  options: [
    { nodeId: 'b1', kind: 'elite' },
    { nodeId: 'b1', kind: 'elite' },
  ],
}), /unique option node ids/);
await assert.rejects(showRoomChoices({
  map,
  options: [{ nodeId: 'missing', kind: 'combat' }],
}), /must match a map node/);

// 3) 플레이 이동과 같은 W/S로만 포커스를 옮기며, 양 끝에서 순환하지 않는다.
const source = readFileSync('src/ui/roomChoiceOverlay.ts', 'utf8');
for (const key of ['KeyW', 'KeyS', 'Enter']) {
  assert.ok(source.includes(`'${key}'`), `${key} 입력`);
}
assert.equal(roomChoiceFocusDirection({ code: 'KeyW', key: 'w' }), -1, 'W는 위 후보');
assert.equal(roomChoiceFocusDirection({ code: 'KeyS', key: 's' }), 1, 'S는 아래 후보');
assert.equal(roomChoiceFocusDirection({ code: 'KeyW', key: 'ㅈ' }), -1, '한글 IME에서도 물리 W 키');
assert.equal(roomChoiceFocusDirection({ code: 'KeyS', key: 'ㄴ' }), 1, '한글 IME에서도 물리 S 키');
assert.equal(roomChoiceFocusDirection({ code: 'ArrowUp', key: 'ArrowUp' }), 0, '방향키는 사용하지 않는다');
assert.equal(roomChoiceFocusDirection({ code: 'ArrowDown', key: 'ArrowDown' }), 0, '방향키는 사용하지 않는다');
assert.equal(roomChoiceFocusDirection({ code: 'KeyA', key: 'a' }), 0, '좌우 이동 키는 무시');
for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
  assert.ok(!source.includes(`'${key}'`), `${key} 입력을 사용하지 않는다`);
}
assert.equal(nextRoomChoiceFocusIndex(0, -1, 2), 0, '첫 후보에서 위 입력은 유지');
assert.equal(nextRoomChoiceFocusIndex(0, 1, 2), 1, '첫 후보에서 아래 입력은 둘째 후보');
assert.equal(nextRoomChoiceFocusIndex(1, 1, 2), 1, '마지막 후보에서 아래 입력은 유지');
assert.equal(nextRoomChoiceFocusIndex(1, -1, 2), 0, '둘째 후보에서 위 입력은 첫 후보');
assert.ok(source.includes('aPoint.y - bPoint.y'), '후보 번호·입력을 지도 세로 좌표순으로 정렬');
assert.ok(source.includes('Number.parseInt(event.key, 10)'), '숫자키 입력');
assert.ok(source.includes('<b>W/S + Enter</b>'), '게임 이동키와 일치하는 조작 안내');
assert.ok(!source.includes("event.key === 'Escape'"), 'Escape로 필수 선택을 취소하면 안 된다');

// 4) 전체 지도와 실제 선택지를 분리해서 받는다.
assert.ok(source.includes('nodeId: string'), 'MapGraph 노드 ID 계약');
assert.ok(source.includes('kind: MapNodeKind'), 'MapNode 종류 계약');
assert.ok(!source.includes('rewardHint'), '내부 밸런스 요약은 경로 UI에 노출하지 않는다');
assert.ok(!source.includes('route-detail-reward'), '상세에는 자연어 방 설명만 표시');
assert.ok(source.includes('map: MinimapModel'), '전체 경로 지도 계약');
assert.ok(source.includes('options: readonly RoomChoiceOption[]'), '현재 선택 가능 노드 계약');

// 5) 기존 미니맵 좌표와 연결선을 큰 중앙 지도에 재사용한다.
assert.ok(source.includes('minimapLayout(model)'), '기존 미니맵 레이아웃 재사용');
assert.ok(source.includes("createElementNS('http://www.w3.org/2000/svg', 'path')"), '곡선 지도 연결선');
assert.ok(source.includes("path.setAttribute("), 'SVG 마력선 속성');
assert.ok(source.includes(' C ${from.x + deltaX * 0.38}'), '직선 대신 유기적인 베지어 곡선');
assert.ok(source.includes('route-map'), '중앙 전체 지도');

// 6) 전체 노드는 설명 가능하되 실제 다음 방만 선택할 수 있다.
assert.ok(source.includes('optionById'), '선택 가능 노드 집합');
assert.ok(source.includes("button.setAttribute('aria-disabled'"), '비선택 노드 비활성 계약');
assert.ok(source.includes('route-ready-label'), '이동 가능 표시');
assert.ok(source.includes('route-detail-description'), '호버·포커스 방 설명');
assert.ok(source.includes('ROUTE_MAP_VERTICAL_GUTTER = 24'), '상하 장식 잘림 방지 여백');
assert.ok(
  source.includes('point.y + ROUTE_MAP_VERTICAL_GUTTER'),
  '노드와 SVG 연결선에 같은 세로 여백 적용',
);
assert.ok(
  source.includes('.route-node:not(.selectable):not(.current):hover'),
  '미래·지나온 노드 hover 시각 반응',
);
assert.ok(
  source.includes('if (selectable) setFocus(selectable.index)'),
  '선택 가능 노드 hover와 포커스 확대 동기화',
);

console.log('room choice overlay regression: 방표시·입력방어·키보드·전체지도계약·레이아웃재사용·선택제한 6군 통과');
