import assert from 'node:assert/strict';
import {
  CHAIN_CONFIG,
  lockedPointTargetForForm,
  selectChainTargets,
  selectChainTargetsFromFirst,
} from '../src/combat-core/combat/advancedFormConfig';

interface Target {
  id: string;
  x: number;
  y: number;
  alive?: boolean;
}

// 1) 최초 적중 뒤 최대 3회 추가 연쇄해 총 4개 대상을 고른다.
const fourTargets: Target[] = [
  { id: 'a', x: 100, y: 0 },
  { id: 'b', x: 220, y: 0 },
  { id: 'c', x: 340, y: 0 },
  { id: 'd', x: 460, y: 0 },
  { id: 'e', x: 580, y: 0 },
];
assert.deepEqual(
  selectChainTargets(0, 0, fourTargets).map(({ id }) => id),
  ['a', 'b', 'c', 'd'],
);

// 2) 같은 객체는 가까워도 다시 선택하지 않는다.
const noRepeat = selectChainTargets(0, 0, [
  { id: 'a', x: 80, y: 0 },
  { id: 'b', x: 120, y: 0 },
  { id: 'c', x: 160, y: 0 },
]);
assert.equal(new Set(noRepeat).size, noRepeat.length);

// 3) 다음 미적중 대상이 연쇄 반경 밖이면 즉시 종료한다.
assert.deepEqual(
  selectChainTargets(0, 0, [
    { id: 'a', x: 100, y: 0 },
    { id: 'b', x: 100 + CHAIN_CONFIG.jumpRadius + 1, y: 0 },
  ]).map(({ id }) => id),
  ['a'],
);

// 4) 최초 대상이 시전 사거리 밖이면 적중 경로를 만들지 않는다.
assert.deepEqual(
  selectChainTargets(0, 0, [
    { id: 'far', x: CHAIN_CONFIG.initialRange + 1, y: 0 },
  ]),
  [],
);

// 5) 사망 대상은 최초·후속 선택 모두에서 제외한다.
assert.deepEqual(
  selectChainTargets(0, 0, [
    { id: 'dead', x: 50, y: 0, alive: false },
    { id: 'alive', x: 100, y: 0, alive: true },
  ]).map(({ id }) => id),
  ['alive'],
);

// 6) 각 연쇄는 감소하며 최초+3연쇄 최대 총 계수는 2.7이다.
assert.deepEqual(CHAIN_CONFIG.damageMultipliers, [1, 0.75, 0.55, 0.4]);
assert.ok(CHAIN_CONFIG.damageMultipliers.every((value, index, values) => (
  index === 0 || value < values[index - 1]
)));
assert.ok(Math.abs(
  CHAIN_CONFIG.damageMultipliers.reduce((sum, value) => sum + value, 0) - 2.7,
) < 1e-9);

// 7) cage는 collision resolver를 거치지 않으므로 damage/control 모두 시전 대상을 고정한다.
const cageTarget = { id: 'cage-target' };
assert.equal(lockedPointTargetForForm('cage', cageTarget), cageTarget);
assert.equal(lockedPointTargetForForm('cage', null), null);

// 8) 충돌 또는 별도 경로로 대상을 정하는 폼은 point 대상을 미리 고정하지 않는다.
assert.equal(lockedPointTargetForForm('bolt', cageTarget), null);
assert.equal(lockedPointTargetForForm('chain', cageTarget), null);

// 9) A sequence lock-on remains the first chain target even when another enemy is nearer.
const locked = fourTargets[2];
assert.deepEqual(
  selectChainTargetsFromFirst(locked, fourTargets).map(({ id }) => id),
  ['c', 'b', 'a', 'd'],
);

console.log('advanced forms regression: chain 6군 + cage 단일 대상 고정 2군 통과');
