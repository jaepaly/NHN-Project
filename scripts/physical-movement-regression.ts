import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PhysicalMovementState } from '../src/combat-core/player/physicalMovementState';

const movement = new PhysicalMovementState();
movement.keyDown('KeyW');
assert.equal(movement.isDown('up'), true);
movement.keyDown('Enter');
movement.keyDown('KeyD');
assert.equal(movement.isDown('right'), true);
movement.keyUp('KeyW');
assert.equal(movement.isDown('up'), false);
assert.equal(movement.isDown('right'), true);
movement.reset();
assert.equal(movement.isDown('right'), false);

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
assert.ok(scene.includes("window.addEventListener('keydown', this.onPhysicalMoveKeyDown, true)"));
assert.ok(scene.includes("window.addEventListener('keyup', this.onPhysicalMoveKeyUp, true)"));
assert.ok(scene.includes("window.removeEventListener('keydown', this.onPhysicalMoveKeyDown, true)"));
assert.ok(scene.includes("window.removeEventListener('keyup', this.onPhysicalMoveKeyUp, true)"));
for (const direction of ['up', 'down', 'left', 'right']) {
  assert.ok(scene.includes(`this.physicalMovement.isDown('${direction}')`));
}

const judgingAt = scene.indexOf('private beginJudging()');
const judgingEnd = scene.indexOf('private finishCastingUx()', judgingAt);
assert.ok(!scene.slice(judgingAt, judgingEnd).includes('resetMovementKeys()'),
  '판정 시작 순간에는 실제로 누르고 있는 이동키 상태를 지우지 않는다');

console.log('physical movement regression: 캡처 단계 WASD 추적 2그룹 통과');
