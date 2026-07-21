/**
 * 적 game-feel(juice) 트윈 헬퍼 — 스프라이트/도형 공용.
 * 위치는 건드리지 않고(이동 로직이 view.x/y 소유) **스케일·투명도·각도·색 플래시**만 다뤄
 * 이동과 충돌하지 않는다. 도형이든 나중의 스프라이트든 그대로 동작한다.
 */
import Phaser from 'phaser';
import { weakTint } from '../../render/spriteLayers';

type Container = Phaser.GameObjects.Container;
type Shape = Phaser.GameObjects.Shape;
/** 피격 플래시 대상 — 도형과 스프라이트를 모두 받는다 (색 교체 API가 서로 다르다). */
type FlashTarget = Shape | Phaser.GameObjects.Image;

/**
 * 피격 순간엔 흰색으로 덮고, 끝나면 원래 색으로 되돌린다.
 * 스프라이트는 setTintFill로 픽셀을 통째로 흰색 실루엣으로 만들어야 플래시가 보인다
 * (setTint는 곱셈이라 어두운 재질에서는 거의 티가 나지 않는다).
 * 복구할 때는 바탕에 걸려 있던 약한 틴트를 다시 씌운다.
 */
function applyFlashColor(target: FlashTarget, baseColor: number, flashing: boolean): void {
  if (target instanceof Phaser.GameObjects.Image) {
    if (flashing) target.setTintFill(0xffffff);
    else target.setTint(weakTint(baseColor));
    return;
  }
  target.setFillStyle(flashing ? 0xffffff : baseColor);
}

function resetScaleTween(scene: Phaser.Scene, view: Container): void {
  scene.tweens.killTweensOf(view);
  if (view.active) view.setScale(1);
}

export type SquashKind = 'standard' | 'knockback' | 'persistent' | 'boss';

const baseScales = new WeakMap<Container, { x: number; y: number }>();
const squashTweens = new WeakMap<Container, Phaser.Tweens.Tween>();

const SQUASH_PROFILE = {
  standard: { compressed: 0.72, expanded: 1.24, durationMs: 70 },
  knockback: { compressed: 0.66, expanded: 1.3, durationMs: 80 },
  persistent: { compressed: 0.86, expanded: 1.12, durationMs: 45 },
  boss: { compressed: 0.9, expanded: 1.08, durationMs: 60 },
} as const;

/** Directional body squash. Position knockback runs independently in parallel. */
export function playImpactSquash(
  scene: Phaser.Scene,
  view: Container,
  directionX = 1,
  directionY = 0,
  kind: SquashKind = 'standard',
): void {
  const base = baseScales.get(view) ?? { x: view.scaleX, y: view.scaleY };
  baseScales.set(view, base);
  squashTweens.get(view)?.stop();
  if (!view.active) return;
  view.setScale(base.x, base.y);

  const profile = SQUASH_PROFILE[kind];
  const horizontalImpact = Math.abs(directionX) >= Math.abs(directionY);
  const targetScaleX = base.x * (horizontalImpact ? profile.compressed : profile.expanded);
  const targetScaleY = base.y * (horizontalImpact ? profile.expanded : profile.compressed);
  const tween = scene.tweens.add({
    targets: view,
    scaleX: targetScaleX,
    scaleY: targetScaleY,
    duration: profile.durationMs,
    yoyo: true,
    ease: 'Quad.easeOut',
    onComplete: () => {
      squashTweens.delete(view);
      if (view.active) view.setScale(base.x, base.y);
    },
  });
  squashTweens.set(view, tween);
}

export function playHitFlash(
  scene: Phaser.Scene,
  flashShape: FlashTarget,
  baseColor: number,
): void {
  applyFlashColor(flashShape, baseColor, true);
  scene.time.delayedCall(80, () => {
    if (flashShape.active) applyFlashColor(flashShape, baseColor, false);
  });
}

/** 피격 반응: 짧은 흰색 플래시 + 가로로 눌리는 squash (타격당하는 느낌). */
export function playHitReact(
  scene: Phaser.Scene,
  view: Container,
  flashShape: FlashTarget,
  baseColor: number,
): void {
  playImpactSquash(scene, view);
  playHitFlash(scene, flashShape, baseColor);
}

/** 공격 순간: 앞으로 뻗는 듯한 스케일 펀치 (때리는 느낌). */
export function playAttackLunge(scene: Phaser.Scene, view: Container): void {
  resetScaleTween(scene, view);
  scene.tweens.add({
    targets: view,
    scaleX: 1.24,
    scaleY: 1.24,
    duration: 110,
    yoyo: true,
    ease: 'Back.easeOut',
    onComplete: () => {
      if (view.active) view.setScale(1);
    },
  });
}

/** 처치 연출: 팝(확대) + 페이드 + 회전 후 뷰 파괴 콜백. */
export function playDeathPop(scene: Phaser.Scene, view: Container, onComplete: () => void): void {
  scene.tweens.killTweensOf(view); // 진행 중이던 hit/attack 스케일 중단
  scene.tweens.add({
    targets: view,
    scaleX: 1.5,
    scaleY: 1.5,
    alpha: 0,
    angle: view.angle + 30,
    duration: 240,
    ease: 'Back.easeIn',
    onComplete,
  });
}
