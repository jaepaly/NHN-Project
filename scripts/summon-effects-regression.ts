import assert from 'node:assert/strict';
import { summonStatsFromPower } from '../src/combat-core/summons/summonConfig';
import { SummonCombatState } from '../src/combat-core/summons/summonCombatState';

// 1) power 기반 지속시간과 피해 공식.
assert.deepEqual(summonStatsFromPower(Number.NaN), {
  durationSeconds: 5,
  damage: 1,
});
assert.deepEqual(summonStatsFromPower(-10), {
  durationSeconds: 5,
  damage: 1,
});
assert.deepEqual(summonStatsFromPower(50), {
  durationSeconds: 7,
  damage: 15,
});
assert.deepEqual(summonStatsFromPower(100), {
  durationSeconds: 10,
  damage: 30,
});

// 2) 대상이 있으면 생성 직후 첫 자동 공격을 요청한다.
const active = new SummonCombatState(50);
assert.deepEqual(active.update(0, true), {
  expired: false,
  shouldAttack: true,
});

// 3) 공격 간격 1.2초를 지키고 실제 delta로 수명이 감소한다.
assert.deepEqual(active.update(0.5, true), {
  expired: false,
  shouldAttack: false,
});
assert.equal(active.remainingSeconds, 6.5);
assert.deepEqual(active.update(0.7, true), {
  expired: false,
  shouldAttack: true,
});
assert.equal(active.remainingSeconds, 5.8);

// 4) 대상이 없을 때는 공격 기회를 소비하지 않고 대기한다.
active.update(1.2, false);
assert.deepEqual(active.update(0, true), {
  expired: false,
  shouldAttack: true,
});

// 5) 지속시간이 끝난 tick에는 공격하지 않는다.
const expiring = new SummonCombatState(0);
assert.deepEqual(expiring.update(5, true), {
  expired: true,
  shouldAttack: false,
});
assert.equal(expiring.remainingSeconds, 0);
assert.deepEqual(expiring.update(Number.NaN, true), {
  expired: true,
  shouldAttack: false,
});

console.log('Summon effects regression: 수치·첫 공격·간격·대기·만료 5군 통과');
