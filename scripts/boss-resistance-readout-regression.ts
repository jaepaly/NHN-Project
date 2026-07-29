import assert from 'node:assert/strict';
import { RESISTANCE } from '../src/spell/bossMemory';
import {
  bossResistanceLines,
  bossResistanceReadout,
  reductionPercent,
} from '../src/render/bossResistanceReadout';

const T = RESISTANCE.masteryImmunityAffinity;
const read = (entries: Parameters<typeof bossResistanceReadout>[0]) =>
  bossResistanceReadout(entries, T);

// 1) 배수 → 감소율 (×0.75는 "−25%"로 읽혀야 한다 — 배수는 방향을 한 번 더 생각하게 한다)
assert.equal(reductionPercent(0.75), 25);
assert.equal(reductionPercent(0.5), 50);
assert.equal(reductionPercent(0.3), 70);
assert.equal(reductionPercent(1), 1, '내성이 있으면 0%로 사라지지 않는다');
assert.equal(reductionPercent(0), 100);
assert.equal(reductionPercent(Number.NaN), 1, 'NaN 방어');
assert.equal(reductionPercent(-4), 100, '범위 밖 클램프');
assert.equal(reductionPercent(9), 1);

// 2) **핵심**: 마스터리 관통(#171)은 저항이 아니라 관통으로 읽힌다.
//    친화가 임계에 닿으면 내성이 완전히 무시되는데, 화면이 계속 "저항"이라 적으면
//    실제로는 온전히 들어가는 주력 원소를 플레이어가 버린다.
const pierced = read([{ element: 'fire', multiplier: 0.75, affinity: T }]);
assert.deepEqual(pierced.resisted, [], '관통된 원소는 저항 목록에서 빠진다');
assert.deepEqual(pierced.pierced, ['fire']);
const notYet = read([{ element: 'fire', multiplier: 0.75, affinity: T - 0.01 }]);
assert.deepEqual(notYet.pierced, [], '임계 미만은 관통이 아니다');
assert.equal(notYet.resisted.length, 1);
assert.equal(notYet.resisted[0].reductionPercent, 25);
// 임계 정확히 = 관통 (경계 포함 — 기전이 >= 이므로 표시도 >= 여야 한다)
assert.deepEqual(read([{ element: 'ice', multiplier: 0.5, affinity: T }]).pierced, ['ice']);

// 3) 섞여 있으면 각각의 자리로 간다
const mixed = read([
  { element: 'fire', multiplier: 0.75, affinity: T + 0.5 },   // 관통
  { element: 'ice', multiplier: 0.75, affinity: 0.2 },        // 저항
  { element: 'wind', multiplier: 0.5, affinity: 0 },          // 저항(더 아픔)
]);
assert.deepEqual(mixed.pierced, ['fire']);
assert.deepEqual(mixed.resisted.map((r) => r.element), ['wind', 'ice'], '아픈 것부터');
assert.deepEqual(mixed.resisted.map((r) => r.reductionPercent), [50, 25]);

// 4) 내성 아닌 항목(배수 1 이상)은 어느 쪽에도 안 들어간다
const none = read([
  { element: 'fire', multiplier: 1, affinity: 0 },
  { element: 'ice', multiplier: 1.2, affinity: 0 },
]);
assert.deepEqual(none.resisted, []);
assert.deepEqual(none.pierced, []);
assert.deepEqual(read([]).resisted, []);

// 5) 정렬 안정성 — 동률은 원소명으로 갈라 프레임마다 순서가 흔들리지 않는다
const tie = read([
  { element: 'water', multiplier: 0.75, affinity: 0 },
  { element: 'earth', multiplier: 0.75, affinity: 0 },
  { element: 'dark', multiplier: 0.75, affinity: 0 },
]);
assert.deepEqual(tie.resisted.map((r) => r.element), ['dark', 'earth', 'water']);
assert.deepEqual(read([
  { element: 'water', multiplier: 0.75, affinity: T },
  { element: 'dark', multiplier: 0.75, affinity: T },
]).pierced, ['dark', 'water']);

// 6) 방어 — 손상된 입력에도 안 죽는다
const corrupt = read([
  { element: 'fire', multiplier: Number.NaN, affinity: 0 },
  { element: 'ice', multiplier: 0.75, affinity: Number.NaN },
]);
assert.deepEqual(corrupt.resisted.map((r) => r.element), ['ice'], 'NaN 배수는 내성 아님');
assert.deepEqual(corrupt.pierced, [], 'NaN 친화는 관통 아님');

// 7) 줄 구성 — **한 줄에 한 사실**. 적 수가 저항 목록 꼬리에 붙던 게 이번 수정의 핵심.
const status = 'BOSS 340/900  ·  ENEMIES 3';
assert.deepEqual(bossResistanceLines(status, read([])), [status], '내성 없으면 상태 줄만');
const lines = bossResistanceLines(status, mixed);
assert.equal(lines.length, 3);
assert.equal(lines[0], status, '적 수는 상태 줄에 남는다');
assert.ok(lines[1].startsWith('저항'));
assert.ok(lines[2].startsWith('관통'));
assert.ok(lines[1].includes('−50%') && lines[1].includes('−25%'));
// 어느 줄에도 ENEMIES가 두 번 나오지 않는다 (종전 버그: 저항 줄 끝에 붙었다)
assert.equal(lines.filter((l) => l.includes('ENEMIES')).length, 1);
assert.ok(!lines[1].includes('ENEMIES'), '저항 줄에 적 수가 섞이지 않는다');
// 배수 표기는 남지 않는다
assert.ok(!lines.some((l) => l.includes('×')), '×0.75가 아니라 −25%로 적는다');
// 관통만 있을 때도 상태 줄은 유지
const onlyPierced = bossResistanceLines(status, pierced);
assert.equal(onlyPierced.length, 2);
assert.ok(onlyPierced[1].startsWith('관통'));

console.log('boss resistance readout regression: 감소율·관통분리·혼합·비내성·정렬·방어·줄구성 7군 통과');
