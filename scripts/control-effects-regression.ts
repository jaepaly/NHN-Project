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

// 5) 장판형 control은 power와 무관하게 짧은 override 수명을 사용한다.
const zoneState = new EnemyControlState();
const zoneTarget = enemy();
assert.equal(zoneState.applySlow(zoneTarget, 100, 0.5), 0.5);
zoneState.update(0.4);
assert.ok(Math.abs(zoneState.remainingFor(zoneTarget) - 0.1) < Number.EPSILON);
assert.equal(zoneState.applySlow(zoneTarget, 100, 0.5), 0.5);
assert.deepEqual(zoneState.update(0.5), [zoneTarget]);

// 6) 처치된 적과 방 정리는 상태를 남기지 않는다.
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

// 7) 폼 전용 둔화 배율은 기본 0.5와 별도로 지정하고 만료 후 복구할 수 있다.
const customSlowState = new EnemyControlState();
const customSlowTarget = enemy();
customSlowState.applySlow(customSlowTarget, 100, 1.5, 0.6);
assert.equal(customSlowState.movementMultiplierFor(customSlowTarget), 0.6);
customSlowState.update(1.5);
assert.equal(customSlowState.movementMultiplierFor(customSlowTarget), 1);

console.log('Control effects regression: 지속시간·둔화·만료·비중첩·override·정리·전용배율 7군 통과');

// 8) cage 감금은 이동 배율을 0으로 만들고 보스에도 같은 규칙을 적용한다.
const cageState = new EnemyControlState();
const boss = enemy();
assert.equal(cageState.applyRoot(boss, 2), 2);
assert.equal(cageState.movementMultiplierFor(boss), 0);
assert.equal(cageState.rootRemainingFor(boss), 2);

// 8) 감금과 둔화는 독립 수명이며, 감금 종료 뒤 남은 둔화로 복구된다.
cageState.applySlow(boss, 50); // 4초 둔화
cageState.update(2);
assert.equal(cageState.rootRemainingFor(boss), 0);
assert.equal(cageState.remainingFor(boss), 2);
assert.equal(cageState.movementMultiplierFor(boss), CONTROL_CONFIG.slowMovementMultiplier);
cageState.update(2);
assert.equal(cageState.movementMultiplierFor(boss), 1);

// 9) cage 재적용은 중첩하지 않고 더 긴 남은 시간만 유지한다.
const refreshTarget = enemy();
cageState.applyRoot(refreshTarget, 2);
cageState.update(0.5);
assert.equal(cageState.applyRoot(refreshTarget, 1), 1.5);
assert.equal(cageState.applyRoot(refreshTarget, 2), 2);
assert.equal(cageState.movementMultiplierFor(refreshTarget), 0);

// 10) 감금 대상 사망과 방 정리는 상태를 남기지 않는다.
const rootedDead = enemy();
cageState.applyRoot(rootedDead, 2);
rootedDead.alive = false;
assert.deepEqual(cageState.update(0), [rootedDead]);
assert.equal(cageState.movementMultiplierFor(rootedDead), 1);
assert.deepEqual(cageState.clear(), [refreshTarget]);

console.log('Control effects regression: cage 감금·둔화복구·재적용·정리 4군 통과');
