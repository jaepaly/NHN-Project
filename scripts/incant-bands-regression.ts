import assert from 'node:assert/strict';
import {
  INCANT_BANDS,
  bandAffordances,
  bandForCost,
  reachableBand,
  spellManaCost,
} from '../src/run/incantBands';

// 1) 비용 공식 — sequencePlan·mockJudge와 같은 max(5, round(power×0.6))
assert.equal(spellManaCost(0), 5, '바닥 5 — 공짜 주문은 없다');
assert.equal(spellManaCost(8), 5, '바닥 아래는 전부 5');
assert.equal(spellManaCost(50), 30);
assert.equal(spellManaCost(100), 60, 'powerCap 100 → 최대 비용 60');
assert.equal(spellManaCost(Number.NaN), 5, 'NaN 방어');
assert.equal(spellManaCost(-40), 5, '음수 방어');

// 2) 대역 비용은 공식에서 유도된다 — 종전 힌트 문자열의 ~10 · ~25 · 40+ 와 같은 값
const costs = INCANT_BANDS.map((b) => spellManaCost(b.power));
assert.deepEqual(costs, [10, 25, 40], '속삭임 10 · 영창 25 · 외침 40');
// 오름차순이어야 "더 큰 말 = 더 비싸다"가 성립한다
for (let i = 1; i < costs.length; i += 1) {
  assert.ok(costs[i] > costs[i - 1], '대역 비용은 오름차순');
}
assert.equal(INCANT_BANDS.length, 3, '세 대역 — 칩 세 칸이 flex로 균등 분할된다');
// 라벨·힌트가 비어 있으면 칩이 빈 칸으로 보인다
for (const band of INCANT_BANDS) {
  assert.ok(band.label.length > 0 && band.hint.length > 0, `${band.key} 라벨·힌트`);
}

// 3) 감당 가능 판정 — 경계 포함(비용과 같으면 쓸 수 있다)
assert.deepEqual(
  bandAffordances(0).map((e) => e.affordable), [false, false, false], '마나 0 = 전부 불가',
);
assert.deepEqual(
  bandAffordances(10).map((e) => e.affordable), [true, false, false], '정확히 10 = 속삭임 가능',
);
assert.deepEqual(bandAffordances(24).map((e) => e.affordable), [true, false, false]);
assert.deepEqual(bandAffordances(25).map((e) => e.affordable), [true, true, false]);
assert.deepEqual(bandAffordances(100).map((e) => e.affordable), [true, true, true]);
// 감당 가능은 단조 — 마나가 늘었는데 못 쓰게 되는 대역은 없다
for (let mana = 0; mana <= 80; mana += 1) {
  const count = bandAffordances(mana).filter((e) => e.affordable).length;
  const prev = bandAffordances(mana - 1).filter((e) => e.affordable).length;
  assert.ok(count >= prev, `마나 ${mana}에서 감당 대역이 줄었다`);
}
assert.equal(bandAffordances(Number.NaN).filter((e) => e.affordable).length, 0, 'NaN 방어');
assert.equal(bandAffordances(-9).filter((e) => e.affordable).length, 0, '음수 방어');

// 4) 닿는 최대 대역 — 헤딩 마나 색과 'reach' 테두리의 근거
assert.equal(reachableBand(0), null, '하나도 못 쓰면 null (mana-dry 표시)');
assert.equal(reachableBand(9), null, '바닥 미만');
assert.equal(reachableBand(10)?.key, 'whisper');
assert.equal(reachableBand(39)?.key, 'chant');
assert.equal(reachableBand(40)?.key, 'shout');
assert.equal(reachableBand(999)?.key, 'shout', '최대 대역 위로는 없다');
assert.equal(reachableBand(Number.NaN), null, 'NaN 방어');

// 5) 사후 분류 — 심판이 매긴 비용이 어느 대역이었나 (같은 잣대로 읽히게)
assert.equal(bandForCost(5)?.key, 'whisper', '최소 비용도 속삭임');
assert.equal(bandForCost(10)?.key, 'whisper');
assert.equal(bandForCost(24)?.key, 'whisper');
assert.equal(bandForCost(25)?.key, 'chant');
assert.equal(bandForCost(60)?.key, 'shout');
assert.equal(bandForCost(Number.NaN)?.key, 'whisper', 'NaN 방어 — 최소 대역');
// 사전 판정과 사후 분류가 어긋나지 않는다: 그 비용을 낼 수 있는 마나면 그 대역에 닿는다
for (const band of INCANT_BANDS) {
  const cost = spellManaCost(band.power);
  assert.equal(bandForCost(cost).key, band.key, `${band.key} 사후 분류 일치`);
  assert.equal(reachableBand(cost)?.key, band.key, `${band.key} 사전 판정 일치`);
}

console.log('incant bands regression: 비용공식·대역유도·감당판정·최대대역·사후분류 5군 통과');
