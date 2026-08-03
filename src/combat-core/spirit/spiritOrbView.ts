import Phaser from 'phaser';
import type { SpellElement } from '../../spell/types';
import { ELEMENT_PALETTES } from '../../render/palette';

/** 전장에 자율 배치되어 목표를 잡고 발사하는 정령의 경량 Phaser 뷰. */
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

  moveToward(targetX: number, targetY: number, deltaSeconds: number): void {
    if (this.view.x === 0 && this.view.y === 0) this.view.setPosition(targetX, targetY);
    const t = Math.min(1, Math.max(0, deltaSeconds) * 3.2);
    this.view.x = Phaser.Math.Linear(this.view.x, targetX, t);
    this.view.y = Phaser.Math.Linear(this.view.y, targetY, t);
    this.view.rotation = Phaser.Math.Angle.Between(this.view.x, this.view.y, targetX, targetY);
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
