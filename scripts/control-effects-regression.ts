import assert from 'node:assert/strict';
import {
  CONTROL_CONFIG,
  controlDurationFromPower,
} from '../src/combat-core/control/controlConfig';
import { EnemyControlState } from '../src/combat-core/control/enemyControlState';
import type { CombatEnemy } from '../src/combat-core/enemies/combatEnemy';

function enemy(alive = true): CombatEnemy {
  return { alive } as CombatEnemy;
}

// 1) power 기반 지속시간은 2~6초 범위로 고정된다.
assert.equal(controlDurationFromPower(Number.NaN), 2);
assert.equal(controlDurationFromPower(-10), 2);
assert.equal(controlDurationFromPower(50), 4);
assert.equal(controlDurationFromPower(100), 6);
assert.equal(controlDurationFromPower(1000), 6);

// 2) 둔화 중에는 이동 배율만 0.5가 된다.
const state = new EnemyControlState();
const target = enemy();
assert.equal(state.movementMultiplierFor(target), 1);
assert.equal(state.applySlow(target, 50), 4);
assert.equal(
  state.movementMultiplierFor(target),
  CONTROL_CONFIG.slowMovementMultiplier,
);

// 3) 시간은 실제 delta로 감소하고 만료 즉시 정상 배율로 돌아온다.
assert.deepEqual(state.update(1.5), []);
assert.equal(state.remainingFor(target), 2.5);
assert.deepEqual(state.update(2.5), [target]);
assert.equal(state.remainingFor(target), 0);
assert.equal(state.movementMultiplierFor(target), 1);

// 4) 재적중은 배율을 중첩하지 않고 더 긴 남은 시간만 유지한다.
state.applySlow(target, 100);
state.update(1);
assert.equal(state.remainingFor(target), 5);
assert.equal(state.applySlow(target, 0), 5);
assert.equal(state.applySlow(target, 100), 6);
assert.equal(state.movementMultiplierFor(target), 0.5);

// 5) 처치된 적과 방 정리는 상태를 남기지 않는다.
const deadTarget = enemy(false);
state.applySlow(deadTarget, 50);
assert.deepEqual(state.update(0), [deadTarget]);
assert.equal(state.remove(target), true);
assert.equal(state.remove(target), false);
const a = enemy();
const b = enemy();
state.applySlow(a, 10);
state.applySlow(b, 20);
assert.deepEqual(new Set(state.clear()), new Set([a, b]));
assert.equal(state.movementMultiplierFor(a), 1);
assert.equal(state.movementMultiplierFor(b), 1);

console.log('Control effects regression: 지속시간·둔화·만료·비중첩·정리 5군 통과');
