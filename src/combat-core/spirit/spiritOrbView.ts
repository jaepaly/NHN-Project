import Phaser from 'phaser';
import type { SpellElement } from '../../spell/types';
import { ELEMENT_PALETTES } from '../../render/palette';

/** 전장에 자율 배치되어 목표를 잡고 발사하는 정령의 경량 Phaser 뷰. */
export class SpiritOrbView {
  readonly view: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene, rawElements: readonly SpellElement[]) {
    const elements = [...new Set(rawElements)].filter((element): element is SpellElement => Boolean(ELEMENT_PALETTES[element]));
    const primary = elements[0] ?? 'light';
    const palette = ELEMENT_PALETTES[primary];
    const orbitRing = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    elements.forEach((element, index) => {
      const start = -Math.PI / 2 + (Math.PI * 2 * index) / elements.length;
      const end = -Math.PI / 2 + (Math.PI * 2 * (index + 1)) / elements.length;
      orbitRing.lineStyle(2.5, ELEMENT_PALETTES[element].accent, 0.9).beginPath().arc(0, 0, 13, start, end).strokePath();
    });
    const halo = scene.add.circle(0, 0, 9, palette.glow, 0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    const cores = elements.map((element, index) => {
      const angle = (Math.PI * 2 * index) / elements.length - Math.PI / 2;
      return scene.add.circle(Math.cos(angle) * 2.4, Math.sin(angle) * 2.4, 4.5, ELEMENT_PALETTES[element].core, 0.94)
        .setBlendMode(Phaser.BlendModes.ADD);
    });
    const motes = elements.map((element, index) => {
      const angle = (Math.PI * 2 * index) / elements.length - Math.PI / 4;
      return scene.add.circle(Math.cos(angle) * 8, Math.sin(angle) * 8, 2, ELEMENT_PALETTES[element].accent, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD);
    });
    this.view = scene.add.container(0, 0, [orbitRing, halo, ...cores, ...motes]).setDepth(8);
  }

  get x(): number {
    return this.view.x;
  }

  get y(): number {
    return this.view.y;
  }

  moveToward(targetX: number, targetY: number, deltaSeconds: number, maxSpeed: number): void {
    if (this.view.x === 0 && this.view.y === 0) this.view.setPosition(targetX, targetY);
    const dx = targetX - this.view.x;
    const dy = targetY - this.view.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(distance, Math.max(0, maxSpeed) * Math.max(0, deltaSeconds));
    if (distance > 0 && step > 0) {
      this.view.x += (dx / distance) * step;
      this.view.y += (dy / distance) * step;
    }
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
