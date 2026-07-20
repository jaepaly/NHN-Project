import Phaser from 'phaser';

/**
 * 잔상 트레일 — Phase 5 프레젠테이션 (Track C 아트 디렉션).
 *
 * 이동체 위치에 반투명 고스트를 남기고 페이드+수축시켜 네온 룩의 잔광을 만든다.
 * 이동 로직(view.x/y 소유)과 무관하게 "그 순간의 위치 스냅샷"만 남기므로
 * 도형이든 나중의 스프라이트든, 어떤 뷰든 동일하게 동작한다. 블룸과 겹쳐 잔광이 번진다.
 */
export const TRAIL_CONFIG = {
  /** 최소 스폰 간격(초) — 프레임당 남기지 않아 오브젝트 폭증을 막는다. */
  spawnIntervalSeconds: 0.028,
  fadeDurationMs: 240,
  startAlpha: 0.4,
  endScale: 0.45,
} as const;

/** (x,y)에 색 고스트 원을 남기고 페이드아웃 후 파괴한다. */
export function spawnTrailGhost(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  color: number,
  depth = 0,
): void {
  const ghost = scene.add
    .circle(x, y, radius, color, TRAIL_CONFIG.startAlpha)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(depth);
  scene.tweens.add({
    targets: ghost,
    alpha: 0,
    scale: TRAIL_CONFIG.endScale,
    duration: TRAIL_CONFIG.fadeDurationMs,
    ease: 'Cubic.easeOut',
    onComplete: () => ghost.destroy(),
  });
}
