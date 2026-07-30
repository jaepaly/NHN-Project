import assert from 'node:assert/strict';
import {
  RISK_ORDER,
  ROOM_REWARD_SCALES,
  rewardScaleFor,
} from '../src/combat-core/run/roomRewardScale';
import { drawRewardOptions } from '../src/combat-core/run/rewardConfig';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import type { MapNodeKind } from '../src/run/mapGraphContract';

const KINDS: readonly MapNodeKind[] = [
  'start', 'combat', 'elite', 'stage-boss', 'memory-boss', 'treasure', 'altar', 'trap',
];

// 1) 여덟 종류 전부 배율이 있다 — 빠지면 그 방이 undefined 배율로 떨어진다
assert.equal(Object.keys(ROOM_REWARD_SCALES).length, KINDS.length);
for (const kind of KINDS) {
  const entry = rewardScaleFor(kind);
  assert.ok(entry, `${kind} 배율 없음`);
  assert.ok(entry.scale > 0, `${kind} 배율은 양수`);
  assert.ok(typeof entry.hint === 'string', `${kind} 힌트`);
}

// 2) ══ 핵심 불변식: **위험한 방이 더 준다** ══
// 총괄 지적("누가 함정방을 선택하겠어")의 근본 원인이 이 부등식의 부재였다.
// 종전엔 combat·elite·trap이 전부 배율 1로 동일해 더 위험한 방을 고를 이유가 없었다.
for (let i = 1; i < RISK_ORDER.length; i += 1) {
  const safer = rewardScaleFor(RISK_ORDER[i - 1]).scale;
  const riskier = rewardScaleFor(RISK_ORDER[i]).scale;
  assert.ok(
    riskier > safer,
    `${RISK_ORDER[i]}(${riskier})가 ${RISK_ORDER[i - 1]}(${safer})보다 많이 줘야 한다`,
  );
}
// 일반 전투가 기준값 1 — 다른 방들이 이보다 나은지로 읽힌다
assert.equal(rewardScaleFor('combat').scale, 1, '일반 전투가 기준값');
// 함정·정예는 확실히 이득이어야 한다 (오차 수준이면 체감이 없다)
for (const kind of ['trap', 'elite'] as const) {
  assert.ok(
    rewardScaleFor(kind).scale >= 1.2,
    `${kind} 배율이 너무 작다 (${rewardScaleFor(kind).scale}) — 위험을 감수할 이유가 안 된다`,
  );
}

// 3) 무전투 방은 배율 대신 **선택 폭**으로 대가를 치른다
assert.equal(rewardScaleFor('treasure').optionCount, 2, '보물은 2택 — 안전한 대가');
assert.ok(
  (rewardScaleFor('treasure').optionCount ?? 3) < 3,
  '보물이 배율도 높고 선택지도 많으면 다른 방을 고를 이유가 없다',
);
assert.equal(rewardScaleFor('combat').optionCount, undefined, '일반은 기본 3택');

// 4) 힌트가 고르기 전에 정보를 준다 — 이게 없으면 배율을 올려도 모른다
for (const kind of ['combat', 'elite', 'trap', 'treasure', 'altar'] as const) {
  assert.ok(rewardScaleFor(kind).hint.length > 0, `${kind} 힌트가 비었다`);
}
// 배율이 있는 방은 힌트에 그 수치가 드러난다
for (const kind of ['elite', 'trap'] as const) {
  const { scale, hint } = rewardScaleFor(kind);
  assert.ok(
    hint.includes(String(scale)),
    `${kind} 힌트에 배율이 안 보인다 ("${hint}") — 정보 없는 선택은 제비뽑기다`,
  );
}
// 힌트가 서로 달라야 포탈 두 개를 비교할 수 있다
const hints = ['combat', 'elite', 'trap', 'treasure', 'altar'].map(
  (k) => rewardScaleFor(k as MapNodeKind).hint,
);
assert.equal(new Set(hints).size, hints.length, '힌트가 겹치는 방 종류가 있다');

// 5) 배율이 실제 카드에 반영된다 — 설정만 있고 안 쓰이면 의미가 없다
const rand = (() => { let i = 0; return () => { i += 1; return (i * 0.37) % 1; }; })();
const base = drawRewardOptions(1, rand, 1);
const scaled = drawRewardOptions(1, (() => {
  let i = 0; return () => { i += 1; return (i * 0.37) % 1; };
})(), rewardScaleFor('elite').scale);
assert.equal(base.length, scaled.length, '같은 시드면 같은 장수');
const scaledWithPower = scaled.filter((o) => (o.powerScale ?? 1) > 1);
assert.ok(scaledWithPower.length > 0, '정예 배율이 카드의 powerScale에 실려야 한다');
for (const option of scaledWithPower) {
  assert.equal(option.powerScale, rewardScaleFor('elite').scale, 'powerScale이 배율과 일치');
}
// 기준값에서는 powerScale이 붙지 않는다 (1을 명시할 이유가 없다)
assert.ok(
  base.every((o) => (o.powerScale ?? 1) === 1),
  '기준 배율에서는 powerScale이 1',
);

// 6) 프리셋의 모든 노드가 배율을 받는다
for (const node of MAP_GRAPH_PRESET_01.nodes) {
  assert.ok(rewardScaleFor(node.kind), `${node.id}(${node.kind}) 배율 없음`);
}
// 프리셋에 실제로 위험한 방이 있어야 이 체계가 의미가 있다
const risky = MAP_GRAPH_PRESET_01.nodes.filter(
  (n) => rewardScaleFor(n.kind).scale > 1 && n.kind !== 'treasure' && n.kind !== 'altar',
);
assert.ok(risky.length > 0, '프리셋에 위험–보상 방이 없다');

console.log('room reward scale regression: 전종류·위험보상·무전투대가·힌트·카드반영·프리셋 6군 통과');
