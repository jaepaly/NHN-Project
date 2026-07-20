import Phaser from 'phaser';

/**
 * 전장 카메라 네온 후처리 — Phase 5 프레젠테이션 승격 (Track C).
 *
 * 도형 프리미티브의 ADD 발광을 블룸으로 묶어 프리미엄 룩을 만들고,
 * 비네트로 가장자리를 눌러 시선을 중앙 전장으로 모은다.
 * 수치는 여기 상수로 모아 화면에서 밸런스와 함께 조정한다 (과하면 흰색 blowout → 원소 색 손실).
 */
export const WORLD_FX = {
  // addBloom(color, offsetX, offsetY, blurStrength, strength, steps)
  // strength 1.25는 너무 뿌옇다(사용자 피드백) — 은은한 잔광만 남게 완화(총괄 실측 확정). steps↓로 번짐 폭도 축소.
  bloom: { color: 0xffffff, offsetX: 1, offsetY: 1, blurStrength: 0.9, strength: 0.35, steps: 5 },
  // addVignette(x, y, radius, strength) — radius 클수록·strength 작을수록 은은
  vignette: { x: 0.5, y: 0.5, radius: 0.86, strength: 0.34 },
} as const;

/**
 * WebGL 카메라에 블룸+비네트를 한 겹 얹는다.
 * Canvas 폴백 렌더러엔 postFX 파이프라인이 없으므로 조용히 무시한다.
 */
export function applyWorldFx(camera: Phaser.Cameras.Scene2D.Camera): void {
  const postFX = camera.postFX;
  if (!postFX || typeof postFX.addBloom !== 'function') return;
  const { bloom: b, vignette: v } = WORLD_FX;
  postFX.addBloom(b.color, b.offsetX, b.offsetY, b.blurStrength, b.strength, b.steps);
  postFX.addVignette(v.x, v.y, v.radius, v.strength);
}
