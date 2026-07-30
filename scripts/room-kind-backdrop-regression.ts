import assert from 'node:assert/strict';
import {
  ROOM_KIND_BACKDROPS,
  backdropBrightness,
  backdropPaletteForNode,
} from '../src/render/roomBackdropConfig';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import type { MapNodeKind } from '../src/run/mapGraphContract';

const KINDS: readonly MapNodeKind[] = [
  'start', 'combat', 'elite', 'stage-boss', 'memory-boss', 'treasure', 'altar', 'trap',
];

// 1) 여덟 종류 전부 배경이 있다 — 하나라도 빠지면 그 방이 기본색으로 떨어진다
assert.equal(Object.keys(ROOM_KIND_BACKDROPS).length, KINDS.length, '여덟 종류');
for (const kind of KINDS) {
  const palette = ROOM_KIND_BACKDROPS[kind];
  assert.ok(palette, `${kind} 배경 없음`);
  assert.ok(Number.isInteger(palette.base) && palette.base >= 0, `${kind} base`);
  assert.ok(Number.isInteger(palette.grid) && palette.grid >= 0, `${kind} grid`);
  assert.ok(palette.gridAlpha > 0 && palette.gridAlpha <= 1, `${kind} gridAlpha 범위`);
  assert.ok(Number.isInteger(palette.bgTint), `${kind} bgTint`);
}

// 2) **핵심**: 방 종류가 시각적으로 구분된다. 이게 이 변경의 목적 전부다.
//    start·combat은 의도적으로 같다(둘 다 스테이지 기본으로 흐르므로) — 나머지는 달라야 한다.
const DISTINCT = KINDS.filter((k) => k !== 'start');
const signatures = new Map<string, MapNodeKind[]>();
for (const kind of DISTINCT) {
  const p = ROOM_KIND_BACKDROPS[kind];
  const sig = `${p.base}|${p.grid}|${p.gridAlpha}|${p.bgTint}`;
  signatures.set(sig, [...(signatures.get(sig) ?? []), kind]);
}
for (const [sig, kinds] of signatures) {
  assert.equal(kinds.length, 1, `배경이 같은 방 종류: ${kinds.join(', ')} (${sig})`);
}
// 바탕색만으로도 구분돼야 한다 — 틴트는 배경 아트가 없으면 안 보일 수 있다
const bases = DISTINCT.map((k) => ROOM_KIND_BACKDROPS[k].base);
assert.equal(new Set(bases).size, bases.length, '바탕색이 겹치는 종류가 있다');

// 3) 색은 정보다 — **안전한 방이 적대적인 방보다 밝다**
const bright = (kind: MapNodeKind) => backdropBrightness(ROOM_KIND_BACKDROPS[kind]);
const SAFE: readonly MapNodeKind[] = ['treasure', 'altar'];
const HOSTILE: readonly MapNodeKind[] = ['elite', 'stage-boss', 'memory-boss', 'trap'];
for (const safe of SAFE) {
  for (const hostile of HOSTILE) {
    assert.ok(
      bright(safe) > bright(hostile),
      `${safe}(${bright(safe).toFixed(3)})가 ${hostile}(${bright(hostile).toFixed(3)})보다 밝아야 한다`,
    );
  }
}
// 보물이 가장 밝고 최종 보스가 가장 어둡다 — 양 극단을 고정한다
const brightest = KINDS.reduce((a, b) => (bright(a) >= bright(b) ? a : b));
const darkest = KINDS.reduce((a, b) => (bright(a) <= bright(b) ? a : b));
assert.equal(brightest, 'treasure', `가장 밝은 방이 treasure여야 한다 (지금 ${brightest})`);
assert.equal(darkest, 'memory-boss', `가장 어두운 방이 memory-boss여야 한다 (지금 ${darkest})`);
// 전부 어두운 편이다 — 밝다고 해도 게임 배경이라 광량이 튀면 안 된다 (#220 맥락)
for (const kind of KINDS) {
  assert.ok(bright(kind) < 0.25, `${kind} 배경이 너무 밝다 (${bright(kind).toFixed(3)})`);
}

// 4) 격자 진하기도 성격을 나른다 — 함정은 흐리게(바닥이 안 보인다), 보스는 진하게(조여든다)
assert.ok(
  ROOM_KIND_BACKDROPS.trap.gridAlpha < ROOM_KIND_BACKDROPS.combat.gridAlpha,
  '함정 격자는 일반보다 흐리다',
);
assert.ok(
  ROOM_KIND_BACKDROPS['memory-boss'].gridAlpha > ROOM_KIND_BACKDROPS.combat.gridAlpha,
  '최종 보스 격자는 일반보다 진하다',
);

// 5) 노드 → 배경 선택 — 전투·시작은 스테이지로 갈리고 나머지는 종류로 고정
assert.notEqual(
  backdropPaletteForNode('combat', 1).base,
  backdropPaletteForNode('combat', 2).base,
  '일반 전투는 스테이지로 갈린다 (진행감)',
);
assert.notEqual(
  backdropPaletteForNode('start', 1).base,
  backdropPaletteForNode('start', 2).base,
  '시작 방도 스테이지로 갈린다',
);
for (const kind of ['elite', 'trap', 'treasure', 'altar', 'stage-boss', 'memory-boss'] as const) {
  assert.equal(
    backdropPaletteForNode(kind, 1).base,
    backdropPaletteForNode(kind, 2).base,
    `${kind}는 종류가 스테이지보다 우선 — 두 스테이지에서 같아야 한다`,
  );
  assert.equal(
    backdropPaletteForNode(kind, 1).base, ROOM_KIND_BACKDROPS[kind].base,
    `${kind} 배경이 종류 표와 일치`,
  );
}

// 6) 프리셋의 모든 노드가 실제로 배경을 받는다 (빠진 종류가 프리셋에 있으면 안 된다)
for (const node of MAP_GRAPH_PRESET_01.nodes) {
  const palette = backdropPaletteForNode(node.kind, node.stage as 1 | 2);
  assert.ok(palette, `${node.id}(${node.kind}) 배경 없음`);
}
// 프리셋이 쓰는 종류가 몇 가지인지 — 한 런에서 실제로 몇 가지 배경을 보게 되나
const usedKinds = new Set(MAP_GRAPH_PRESET_01.nodes.map((n) => n.kind));
assert.ok(usedKinds.size >= 6, `프리셋이 쓰는 방 종류가 적다 (${usedKinds.size}종)`);

console.log('room kind backdrop regression: 전종류·시각구분·안전밝기·격자성격·스테이지분기·프리셋 6군 통과');
