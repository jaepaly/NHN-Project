import Phaser from 'phaser';
import type { SpellElement } from '../spell/types';

// HUD(99+) 아래, 전투 오브젝트 위에 올려 환경 전체가 달아오른 인상을 만든다.
const CURSE_DEPTH = 95;

/** 폭염 방의 저강도 환경 연출과 냉각 피드백을 담당한다. */
export class HeatwaveCurseField {
  private readonly veil: Phaser.GameObjects.Graphics;
  private readonly edgeHeat: Phaser.GameObjects.Graphics;
  private readonly heatBlur: Phaser.GameObjects.Graphics;
  private coolingAura: Phaser.GameObjects.Arc | null = null;
  private elapsed = 0;
  private heatVisualBlend = 1;

  constructor(
    private readonly scene: Phaser.Scene,
  ) {
    this.veil = scene.add.graphics().setScrollFactor(0).setDepth(CURSE_DEPTH);
    this.veil.fillStyle(0x9b3519, 0.28);
    this.veil.fillRect(0, 0, scene.scale.width, scene.scale.height);
    this.edgeHeat = scene.add.graphics().setScrollFactor(0).setDepth(CURSE_DEPTH + 0.05);
    this.drawEdgeHeat();
    this.heatBlur = scene.add.graphics()
      .setScrollFactor(0)
      .setDepth(CURSE_DEPTH + 0.1);
  }

  update(
    deltaSeconds: number,
    playerX: number,
    playerY: number,
    coolingRemaining: number,
  ): void {
    this.elapsed += Math.max(0, deltaSeconds);
    const visualTarget = coolingRemaining > 0 ? 0 : 1;
    const transitionSeconds = visualTarget === 0 ? 0.22 : 0.42;
    this.heatVisualBlend = Phaser.Math.Linear(
      this.heatVisualBlend,
      visualTarget,
      Math.min(1, Math.max(0, deltaSeconds) / transitionSeconds),
    );
    // 화면 전체가 천천히 달아올랐다 식는 듯한 색조 맥동만 남긴다.
    this.veil.setAlpha((0.78 + Math.sin(this.elapsed * 2.5) * 0.2) * this.heatVisualBlend);
    this.edgeHeat.setAlpha((0.7 + Math.sin(this.elapsed * 2.5) * 0.18) * this.heatVisualBlend);
    this.heatBlur.setAlpha(this.heatVisualBlend);
    this.redrawHeatBlur();

    if (coolingRemaining > 0) {
      if (!this.coolingAura?.active) {
        this.coolingAura = this.scene.add.circle(playerX, playerY, 34, 0x83e8ff, 0.08)
          .setStrokeStyle(2, 0xb7f5ff, 0.72)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(8);
      }
      const pulse = 1 + Math.sin(this.elapsed * 4.5) * 0.08;
      this.coolingAura.setPosition(playerX, playerY).setScale(pulse).setAlpha(0.72 + pulse * 0.08);
    } else if (this.coolingAura) {
      this.coolingAura.destroy();
      this.coolingAura = null;
    }

  }

  showCooling(x: number, y: number, element: SpellElement): void {
    const color = element === 'wind' ? 0xb9ffe9 : element === 'ice' ? 0xc9efff : 0x74d9ff;
    const ring = this.scene.add.circle(x, y, 16, color, 0.05)
      .setStrokeStyle(4, color, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(9);
    this.scene.tweens.add({
      targets: ring,
      radius: 94,
      alpha: 0,
      duration: 460,
      ease: 'Sine.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  destroy(): void {
    this.veil.destroy();
    this.edgeHeat.destroy();
    this.heatBlur.destroy();
    this.coolingAura?.destroy();
    this.coolingAura = null;
  }

  private drawEdgeHeat(): void {
    const { width, height } = this.scene.scale;
    const graphics = this.edgeHeat.clear();
    // 네모 테두리처럼 읽히지 않도록 넓고 옅은 층을 겹쳐 가장자리만 달군다.
    const layers = [
      { inset: 0, alpha: 0.09 },
      { inset: 26, alpha: 0.064 },
      { inset: 58, alpha: 0.042 },
      { inset: 96, alpha: 0.026 },
    ];
    for (const layer of layers) {
      const thickness = 38;
      const innerWidth = Math.max(0, width - layer.inset * 2);
      const innerHeight = Math.max(0, height - layer.inset * 2);
      graphics.fillStyle(0xf05d28, layer.alpha);
      graphics.fillRect(layer.inset, layer.inset, innerWidth, thickness);
      graphics.fillRect(layer.inset, height - layer.inset - thickness, innerWidth, thickness);
      graphics.fillRect(layer.inset, layer.inset, thickness, innerHeight);
      graphics.fillRect(width - layer.inset - thickness, layer.inset, thickness, innerHeight);
    }
  }

  private redrawHeatBlur(): void {
    const graphics = this.heatBlur.clear();
    const { width, height } = this.scene.scale;
    for (let index = 0; index < 5; index += 1) {
      const phase = this.elapsed * 0.16 + index * 1.9;
      const x = ((index * 263 + Math.sin(phase) * 130 + width) % (width + 420)) - 210;
      const y = ((index * 149 - this.elapsed * 12 + Math.cos(phase * 1.4) * 80 + height) % (height + 420)) - 210;
      const radius = 145 + (index % 3) * 45;
      // 큰 원을 보이지 않는 수준의 동심층으로 겹쳐, 윤곽 대신 공기 흐림만 남긴다.
      graphics.fillStyle(index % 2 === 0 ? 0xff9658 : 0xe96a38, 0.018);
      graphics.fillCircle(x, y, radius);
      graphics.fillStyle(index % 2 === 0 ? 0xffb26b : 0xf07a42, 0.014);
      graphics.fillCircle(x, y, radius * 0.72);
      graphics.fillStyle(0xffc985, 0.01);
      graphics.fillCircle(x, y, radius * 0.42);
    }
  }

}
