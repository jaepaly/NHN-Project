import Phaser from 'phaser';
import {
  CameraShakeGate,
  type CameraShakeTier,
} from '../combat-core/combat/cameraShakeConfig';

const gates = new WeakMap<Phaser.Scene, CameraShakeGate>();

export function requestCameraShake(
  scene: Phaser.Scene,
  tier: CameraShakeTier,
  intensityScale = 1,
): boolean {
  let gate = gates.get(scene);
  if (!gate) {
    gate = new CameraShakeGate();
    gates.set(scene, gate);
  }
  const profile = gate.request(tier, scene.time.now);
  if (!profile) return false;
  const safeScale = Number.isFinite(intensityScale)
    ? Phaser.Math.Clamp(intensityScale, 0.5, 2)
    : 1;
  scene.cameras.main.shake(profile.durationMs, profile.intensity * safeScale, true);
  return true;
}

export function resetCameraShake(scene: Phaser.Scene): void {
  gates.get(scene)?.reset();
  scene.cameras.main.shakeEffect.reset();
}
