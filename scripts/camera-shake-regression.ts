import assert from 'node:assert/strict';
import {
  CAMERA_SHAKE_CONFIG,
  CameraShakeGate,
} from '../src/combat-core/combat/cameraShakeConfig';

const gate = new CameraShakeGate();
assert.deepEqual(gate.request('weak', 100), CAMERA_SHAKE_CONFIG.weak);
assert.equal(gate.request('weak', 120), null, 'same-tier overlap must not restart');
assert.deepEqual(gate.request('strong', 120), CAMERA_SHAKE_CONFIG.strong, 'stronger impact replaces');
assert.equal(gate.request('medium', 250), null, 'weaker impact cannot replace strong shake');
assert.deepEqual(gate.request('weak', 400), CAMERA_SHAKE_CONFIG.weak);
gate.reset();
assert.deepEqual(gate.request('medium', 0), CAMERA_SHAKE_CONFIG.medium);

console.log('Camera shake regression: priority + overlap suppression + reset passed');
