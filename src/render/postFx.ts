import Phaser from 'phaser';

/**
 * 전장 카메라 네온 후처리 — Phase 5 프레젠테이션 승격 (Track C).
 *
 * 도형 프리미티브의 ADD 발광을 블룸으로 묶어 프리미엄 룩을 만들고,
 * 비네트로 가장자리를 눌러 시선을 중앙 전장으로 모은다.
 * 수치는 여기 상수로 모아 화면에서 밸런스와 함께 조정한다 (과하면 흰색 blowout → 원소 색 손실).
 */
export const WORLD_FX = {
  // 블룸은 "뿌옇다↔어둡다" 딜레마(1.25=뿌옇/0.35=어둡) 끝에 제거(사용자 피드백).
  // 도형의 ADD 발광은 블룸과 별개로 유지되므로 색이 더 또렷해진다. enabled로 언제든 재활성.
  // addBloom(color, offsetX, offsetY, blurStrength, strength, steps)
  bloom: { enabled: false, color: 0xffffff, offsetX: 1, offsetY: 1, blurStrength: 0.9, strength: 0.35, steps: 5 },
  // addVignette(x, y, radius, strength) — 블룸 제거로 어두워진 만큼 비네트도 완화
  vignette: { x: 0.5, y: 0.5, radius: 0.9, strength: 0.22 },
} as const;

/**
 * WebGL 카메라에 (선택적 블룸 +) 비네트를 얹는다.
 * Canvas 폴백 렌더러엔 postFX 파이프라인이 없으므로 조용히 무시한다.
 */
export function applyWorldFx(camera: Phaser.Cameras.Scene2D.Camera): void {
  const postFX = camera.postFX;
  if (!postFX || typeof postFX.addVignette !== 'function') return;
  const { bloom: b, vignette: v } = WORLD_FX;
  if (b.enabled) {
    postFX.addBloom(b.color, b.offsetX, b.offsetY, b.blurStrength, b.strength, b.steps);
  }
  postFX.addVignette(v.x, v.y, v.radius, v.strength);
}
