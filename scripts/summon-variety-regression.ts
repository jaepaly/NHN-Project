import assert from 'node:assert/strict';
import {
  resolveSummonKind,
  summonGroupPlan,
} from '../src/combat-core/summons/summonConfig';
import { SummonCombatState } from '../src/combat-core/summons/summonCombatState';

// 1) 주문명 키워드 → 종류
assert.equal(resolveSummonKind('fire', '내 분신을 만들어라'), 'clone', '분신=clone');
assert.equal(resolveSummonKind('fire', '화염 포탑을 세워라'), 'turret', '포탑=turret');
assert.equal(resolveSummonKind('fire', '벌레 군체를 소환'), 'swarm', '군체=swarm');
assert.equal(resolveSummonKind('light', '빛의 정령'), 'orb', '기본=orb');

// 2) 원소 기본 (주문명 단서 없을 때) — 암영=군체
assert.equal(resolveSummonKind('dark', '어둠의 소환'), 'swarm', '암영=군체');
assert.equal(resolveSummonKind('fire', '불의 소환'), 'orb');

// 3) 주문명이 원소보다 우선
assert.equal(resolveSummonKind('dark', '암흑 포탑'), 'turret', '이름 포탑 > 원소 군체');

// 4) 그룹 플랜 — 수·고정·피해배율
const clone = summonGroupPlan('fire', '분신');
assert.equal(clone.count, 1);
assert.equal(clone.stationary, false);
assert.ok(clone.attackIntervalScale < 1, '분신은 빠른 공격');

const swarm = summonGroupPlan('fire', '군체');
assert.equal(swarm.count, 3, '군체 3기');
assert.ok(swarm.damageScale < 1, '군체는 피해 분할');

const turret = summonGroupPlan('fire', '포탑');
assert.equal(turret.stationary, true, '포탑 고정');
assert.ok(turret.damageScale > 1, '포탑은 강타');

// 5) SummonCombatState — 배율 반영
const base = new SummonCombatState(100);
const halved = new SummonCombatState(100, 0.5);
assert.ok(halved.damage < base.damage, 'damageScale 반영');
const fast = new SummonCombatState(100, 1, 0.5);
// 빠른 공격: 같은 시간에 더 자주 shouldAttack
let baseAttacks = 0; let fastAttacks = 0;
const b2 = new SummonCombatState(100);
for (let i = 0; i < 10; i += 1) {
  if (b2.update(0.5, true).shouldAttack) baseAttacks += 1;
  if (fast.update(0.5, true).shouldAttack) fastAttacks += 1;
}
assert.ok(fastAttacks > baseAttacks, 'attackIntervalScale<1 = 더 자주 공격');

console.log('SummonVariety regression: 이름/원소 매핑·플랜·배율 5군 통과');
