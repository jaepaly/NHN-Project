import assert from 'node:assert/strict';
import {
  EnemyHitStopController,
  HIT_STOP_CONFIG,
  enemyHitStopSeconds,
} from '../src/combat-core/combat/hitStopConfig';

assert.equal(enemyHitStopSeconds('standard', false), HIT_STOP_CONFIG.standardSeconds);
assert.equal(enemyHitStopSeconds('standard', true), 0);
assert.equal(enemyHitStopSeconds('persistent', false), HIT_STOP_CONFIG.persistentSeconds);
assert.equal(enemyHitStopSeconds('persistent', true), 0);
assert.ok(
  enemyHitStopSeconds('persistent', false) < enemyHitStopSeconds('standard', false),
  'persistent damage uses a shorter pause',
);

const a = {};
const b = {};
const controller = new EnemyHitStopController<object>();
controller.request(a, 0.08);
controller.request(a, 0.02);
assert.equal(controller.advance(a, 0.016), true, 'same-target requests do not shorten the pause');
assert.equal(controller.advance(b, 0.016), false, 'other enemies continue normally');
controller.request(a, 0.1);
assert.equal(controller.advance(a, 0.08), true, 'a longer new hit replaces remaining time');
assert.equal(controller.advance(a, 0.03), true, 'last frozen frame consumes the remainder');
assert.equal(controller.advance(a, 0), false, 'target resumes after its local pause');
controller.request(a, 1);
controller.remove(a);
assert.equal(controller.advance(a, 0), false, 'destroyed target is removed');
controller.request(a, 1);
controller.clear();
assert.equal(controller.advance(a, 0), false, 'room reset clears all local pauses');

console.log('HitStop regression: local target isolation + persistent reduction + cleanup passed');
