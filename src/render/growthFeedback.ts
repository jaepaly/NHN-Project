import Phaser from 'phaser';
import type { RewardOption } from '../run/runContract';
import type { SpellElement } from '../spell/types';
import { ELEMENT_PALETTES } from './palette';
import {
  GROWTH_FEEDBACK_CONFIG as CFG,
  auraElement,
  colorFor,
  gainLabelFor,
  runeRingCount,
} from './growthFeedbackConfig';

/**
 * 강화 체감 연출 (성장 시스템 ⑤ — PROGRESSION_DESIGN §4).
 *
 * 1) 획득 순간: 보상 색 파티클이 플레이어로 수렴 + 증가분 부상 텍스트
 * 2) 누적 성장: 보상을 고를수록 발밑 룬 링이 늘고, 친화 원소 오라가 감싼다
 *
 * 씬 상태를 읽지 않는다 — 좌표·보상·친화만 받아 그린다 (ProtoScene이 호출부).
 * 규칙(라벨·색·링 수)은 growthFeedbackConfig의 순수 함수가 소유한다.
 */

/** 보상 색 파티클이 사방에서 플레이어로 빨려 들어온다 */
export function playRewardConvergence(
  scene: Phaser.Scene,
  x: number,
  y: number,
  option: RewardOption,
): void {
  const color = colorFor(option);
  for (let i = 0; i < CFG.convergeParticles; i++) {
    const angle = (Math.PI * 2 * i) / CFG.convergeParticles + Math.random() * 0.4;
    const distance = CFG.convergeRadius * (0.7 + Math.random() * 0.5);
    const dot = scene.add.circle(
      x + Math.cos(angle) * distance,
      y + Math.sin(angle) * distance,
      3 + Math.random() * 2,
      color,
      0.95,
    ).setBlendMode(Phaser.BlendModes.ADD).setDepth(9);
    scene.tweens.add({
      targets: dot,
      x, y,
      scale: { from: 1, to: 0.2 },
      alpha: { from: 1, to: 0.2 },
      duration: CFG.convergeDurationMs * (0.75 + Math.random() * 0.5),
      ease: 'Quad.easeIn',
      onComplete: () => dot.destroy(),
    });
  }

  // 수렴이 끝나는 시점에 한 번 퍼지는 링 — "흡수됐다"는 마무리
  const ring = scene.add.circle(x, y, 18, color, 0)
    .setStrokeStyle(2, color, 0.9)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(9);
  scene.tweens.add({
    targets: ring,
    scale: { from: 0.4, to: 2.1 },
    alpha: { from: 0.9, to: 0 },
    delay: CFG.convergeDurationMs * 0.6,
    duration: 420,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

/** 증가분을 숫자로 — 플레이어 위로 떠오르는 텍스트 */
export function showGainText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  option: RewardOption,
): void {
  const { text, color } = gainLabelFor(option);
  const label = scene.add.text(x, y - 34, text, {
    fontFamily: 'Consolas, monospace',
    fontSize: '18px',
    fontStyle: 'bold',
    color: `#${color.toString(16).padStart(6, '0')}`,
    stroke: '#05060f',
    strokeThickness: 4,
  }).setOrigin(0.5).setDepth(60);

  scene.tweens.add({
    targets: label,
    y: label.y - CFG.gainTextRiseY,
    alpha: { from: 1, to: 0 },
    scale: { from: 0.85, to: 1.05 },
    duration: CFG.gainTextDurationMs,
    ease: 'Quad.easeOut',
    onComplete: () => label.destroy(),
  });
}

/**
 * 플레이어 발밑 누적 성장 표식 — 룬 링 + 친화 오라.
 * 컨테이너를 씬이 소유하고, 보상을 고를 때마다 sync를 호출해 다시 그린다.
 */
export class GrowthMarks {
  private readonly rings: Phaser.GameObjects.Graphics;
  private aura: Phaser.GameObjects.Arc | null = null;
  private auraTween: Phaser.Tweens.Tween | null = null;
  private ringCount = 0;
  private auraColor: number | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.rings = scene.add.graphics().setDepth(-10);
  }

  /** 누적 보상·친화에 맞춰 표식을 갱신한다 (변화 없으면 다시 그리지 않는다) */
  sync(
    rewardCount: number,
    affinity: Partial<Record<SpellElement, number>>,
    x: number,
    y: number,
  ): void {
    const count = runeRingCount(rewardCount);
    const element = auraElement(affinity);
    const color = element ? ELEMENT_PALETTES[element].core : null;
    if (count !== this.ringCount) {
      this.ringCount = count;
      this.redrawRings();
    }
    if (color !== this.auraColor) {
      this.auraColor = color;
      this.redrawAura();
    }
    this.follow(x, y);
  }

  /** 매 프레임 플레이어를 따라간다 */
  follow(x: number, y: number): void {
    this.rings.setPosition(x, y);
    this.aura?.setPosition(x, y);
  }

  destroy(): void {
    this.auraTween?.remove();
    this.aura?.destroy();
    this.rings.destroy();
  }

  /** 새 런 — 표식 초기화 */
  reset(): void {
    this.ringCount = 0;
    this.auraColor = null;
    this.rings.clear();
    this.auraTween?.remove();
    this.auraTween = null;
    this.aura?.destroy();
    this.aura = null;
  }

  private redrawRings(): void {
    const g = this.rings.clear();
    for (let i = 0; i < this.ringCount; i++) {
      const radius = CFG.runeRingBaseRadius + i * CFG.runeRingSpacing;
      g.lineStyle(1.5, 0x8fa4ff, 0.16 + i * 0.06);
      g.strokeCircle(0, 0, radius);
      // 링마다 룬 눈금 — 개수가 늘수록 촘촘해져 성장이 눈에 띈다
      const ticks = 6 + i * 2;
      for (let t = 0; t < ticks; t++) {
        const angle = (Math.PI * 2 * t) / ticks + i * 0.3;
        const inner = radius - 3;
        const outer = radius + 3;
        g.lineBetween(
          Math.cos(angle) * inner, Math.sin(angle) * inner,
          Math.cos(angle) * outer, Math.sin(angle) * outer,
        );
      }
    }
  }

  private redrawAura(): void {
    this.auraTween?.remove();
    this.auraTween = null;
    this.aura?.destroy();
    this.aura = null;
    if (this.auraColor === null) return;

    this.aura = this.scene.add.circle(0, 0, CFG.auraRadius, this.auraColor, 0.16)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(-9);
    this.auraTween = this.scene.tweens.add({
      targets: this.aura,
      scale: { from: 0.92, to: 1.14 },
      alpha: { from: 0.5, to: 0.95 },
      yoyo: true,
      repeat: -1,
      duration: 1200,
      ease: 'Sine.easeInOut',
    });
  }
}
