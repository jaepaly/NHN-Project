/**
 * 적 game-feel(juice) 트윈 헬퍼 — 스프라이트/도형 공용.
 * 위치는 건드리지 않고(이동 로직이 view.x/y 소유) **스케일·투명도·각도·색 플래시**만 다뤄
 * 이동과 충돌하지 않는다. 도형이든 나중의 스프라이트든 그대로 동작한다.
 */
import Phaser from 'phaser';

type Container = Phaser.GameObjects.Container;
type Shape = Phaser.GameObjects.Shape;

/** 피격 반응: 짧은 흰색 플래시 + 가로로 눌리는 squash (타격당하는 느낌). */
export function playHitReact(
  scene: Phaser.Scene,
  view: Container,
  flashShape: Shape,
  baseColor: number,
): void {
  scene.tweens.add({
    targets: view,
    scaleX: 1.3,
    scaleY: 0.72,
    duration: 70,
    yoyo: true,
    ease: 'Quad.easeOut',
    onComplete: () => {
      if (view.active) view.setScale(1);
    },
  });
  flashShape.setFillStyle(0xffffff);
  scene.time.delayedCall(80, () => {
    if (flashShape.active) flashShape.setFillStyle(baseColor);
  });
}

/** 공격 순간: 앞으로 뻗는 듯한 스케일 펀치 (때리는 느낌). */
export function playAttackLunge(scene: Phaser.Scene, view: Container): void {
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
