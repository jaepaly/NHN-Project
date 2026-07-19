import Phaser from 'phaser';
import type { SpellElement } from '../../spell/types';
import { ELEMENT_PALETTES } from '../../render/palette';

/** 런 동안 플레이어 주위를 도는 정령의 경량 Phaser 뷰. */
export class SpiritOrbView {
  readonly view: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, element: SpellElement) {
    const palette = ELEMENT_PALETTES[element];
    const orbitRing = scene.add.circle(0, 0, 13, palette.glow, 0.08)
      .setStrokeStyle(1.5, palette.accent, 0.75)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = scene.add.circle(0, 0, 9, palette.glow, 0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = scene.add.circle(0, 0, 4.5, palette.core, 1)
      .setBlendMode(Phaser.BlendModes.ADD);
    const mote = scene.add.circle(8, -4, 2, palette.accent, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.view = scene.add.container(0, 0, [orbitRing, halo, core, mote]).setDepth(8);
  }

  get x(): number {
    return this.view.x;
  }

  get y(): number {
    return this.view.y;
  }

  updatePosition(playerX: number, playerY: number, angle: number, radius: number): void {
    this.view.setPosition(
      playerX + Math.cos(angle) * radius,
      playerY + Math.sin(angle) * radius,
    );
    this.view.rotation = angle;
  }

  pulse(scene: Phaser.Scene): void {
    scene.tweens.add({
      targets: this.view,
      scale: { from: 1.45, to: 1 },
      duration: 220,
      ease: 'Quad.Out',
    });
  }

  destroy(): void {
    this.view.destroy(true);
  }
}
