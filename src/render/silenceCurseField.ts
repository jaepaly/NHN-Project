import Phaser from 'phaser';
import {
  isInsideCurseCircle,
  ROOM_CURSE_CONFIG,
} from '../combat-core/run/roomCurse';
import type { TrapSafeCorridor } from '../run/mapGraphContract';
import { isInsideTrapSafeCorridor } from '../run/trapRoomProfile';

// 바닥 정보는 배경보다 위, 보스 경고선(-1)과 모든 전투 개체보다 아래에 둔다.
const CURSE_DEPTH = -2;
const VOID_MIST_COUNT = 24;
const VOID_NOISE_INTERVAL_SECONDS = 0.16;
const VOID_NOISE_LAYER_COUNT = 4;

interface VoidMistParticle {
  view: Phaser.GameObjects.Ellipse;
  velocity: Phaser.Math.Vector2;
  phase: number;
  pulseSpeed: number;
}

/** 침묵 저주방의 중앙 영창 가능 결계. 전투 판정과 동일한 원을 직접 소유한다. */
export class SilenceCurseField {
  readonly radius: number;

  private readonly container: Phaser.GameObjects.Container;
  private readonly outsideVeil: Phaser.GameObjects.Graphics;
  private readonly voidNoiseLayers: Phaser.GameObjects.Graphics[];
  private readonly voidMist: VoidMistParticle[];
  private readonly safeCorridorGlow: Phaser.GameObjects.Graphics | null;
  private readonly safeCorridorFrame: Phaser.GameObjects.Graphics | null;
  private readonly safeCorridorResidue: Phaser.GameObjects.Graphics | null;
  private readonly worldBounds: Phaser.Geom.Rectangle;
  private readonly veilMaskSource: Phaser.GameObjects.Graphics;
  private readonly veilMask: Phaser.Display.Masks.GeometryMask;
  private readonly silencedMark: Phaser.GameObjects.Container;
  private readonly boundary: Phaser.GameObjects.Arc;
  private readonly innerRunes: Phaser.GameObjects.Graphics;
  private readonly outerRunes: Phaser.GameObjects.Graphics;
  private readonly safeCorridor?: TrapSafeCorridor;
  private inside = true;
  private noiseCooldown = 0;
  private noiseLayerIndex = 0;
  private elapsed = 0;

  constructor(
    scene: Phaser.Scene,
    readonly centerX: number,
    readonly centerY: number,
    worldBounds: Phaser.Geom.Rectangle,
    safeCorridor?: TrapSafeCorridor,
  ) {
    this.radius = ROOM_CURSE_CONFIG.silenceRadius;
    this.worldBounds = Phaser.Geom.Rectangle.Clone(worldBounds);
    this.safeCorridor = safeCorridor && { ...safeCorridor };

    this.outsideVeil = scene.add.graphics().setDepth(CURSE_DEPTH - 1);
    this.outsideVeil.fillStyle(0x4a0757, 0.52);
    this.outsideVeil.fillRect(
      worldBounds.left,
      worldBounds.top,
      worldBounds.width,
      worldBounds.height,
    );
    this.veilMaskSource = scene.make.graphics({ x: 0, y: 0 });
    this.veilMaskSource.fillStyle(0xffffff, 1);
    this.drawSafeArea(this.veilMaskSource);
    this.veilMask = this.veilMaskSource.createGeometryMask();
    this.veilMask.setInvertAlpha(true);
    this.outsideVeil.setMask(this.veilMask);

    this.safeCorridorGlow = this.safeCorridor
      ? this.createSafeCorridorGlow(scene)
      : null;
    this.safeCorridorFrame = this.safeCorridor
      ? this.createSafeCorridorFrame(scene)
      : null;
    this.safeCorridorResidue = this.safeCorridor
      ? this.createSafeCorridorResidue(scene)
      : null;

    this.voidMist = Array.from({ length: VOID_MIST_COUNT }, (_, index) => {
      const position = randomOutsidePoint(
        this.worldBounds,
        centerX,
        centerY,
        this.radius + 45,
        this.safeCorridor,
      );
      const width = Phaser.Math.FloatBetween(42, 92);
      const view = scene.add.ellipse(
        position.x,
        position.y,
        width,
        Phaser.Math.FloatBetween(12, 28),
        index % 3 === 0 ? 0xb339d3 : 0x5c227a,
        Phaser.Math.FloatBetween(0.1, 0.22),
      ).setDepth(CURSE_DEPTH - 0.25).setBlendMode(Phaser.BlendModes.ADD);
      return {
        view,
        velocity: new Phaser.Math.Vector2(
          Phaser.Math.FloatBetween(-11, 11),
          Phaser.Math.FloatBetween(-7, 7),
        ),
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
        pulseSpeed: Phaser.Math.FloatBetween(0.7, 1.5),
      };
    });
    this.voidNoiseLayers = Array.from({ length: VOID_NOISE_LAYER_COUNT }, () => (
      scene.add.graphics()
        .setDepth(CURSE_DEPTH - 0.1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0)
    ));

    const aura = scene.add.circle(0, 0, this.radius, 0x7252a6, 0.16)
      .setStrokeStyle(3, 0xead7ff, 0.9);
    this.boundary = scene.add.circle(0, 0, this.radius - 8, 0x000000, 0)
      .setStrokeStyle(3, 0x9f6bff, 0.58);
    this.innerRunes = scene.add.graphics();
    this.outerRunes = scene.add.graphics();
    drawRuneRing(this.innerRunes, this.radius * 0.7, 8, 0xcbb0ff, 0.42);
    drawRuneRing(this.outerRunes, this.radius * 0.92, 12, 0x7f5bd6, 0.5);

    const core = scene.add.circle(0, 0, 7, 0xf0dcff, 0.8)
      .setStrokeStyle(8, 0x9165d9, 0.14);
    this.container = scene.add.container(centerX, centerY, [
      aura,
      this.boundary,
      this.innerRunes,
      this.outerRunes,
      core,
    ]).setDepth(CURSE_DEPTH);

    const markRing = scene.add.circle(0, 0, 30, 0x351342, 0.16)
      .setStrokeStyle(2, 0xb47adc, 0.72);
    const markCross = scene.add.text(0, -2, '×', {
      fontFamily: 'Consolas, monospace',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#d9a7ef',
    }).setOrigin(0.5);
    const markLabel = scene.add.text(0, -43, '영창 봉인 · MANA↓', {
      fontFamily: 'Noto Sans KR, sans-serif',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#e2b8f5',
      backgroundColor: '#17091fcc',
      padding: { x: 7, y: 3 },
    }).setOrigin(0.5);
    this.silencedMark = scene.add.container(centerX, centerY - 48, [
      markRing,
      markCross,
      markLabel,
    ]).setDepth(18).setVisible(false);
    this.redrawVoidNoise();
  }

  contains(x: number, y: number): boolean {
    const insideSanctuary = isInsideCurseCircle(
      x,
      y,
      this.centerX,
      this.centerY,
      this.radius,
    );
    const insideCorridor = this.safeCorridor
      && isInsideTrapSafeCorridor(
        x,
        y,
        this.centerX,
        this.centerY,
        this.safeCorridor,
      );
    return insideSanctuary || Boolean(insideCorridor);
  }

  update(deltaSeconds: number, playerX: number, playerY: number): void {
    if (!this.container.active) return;
    this.elapsed += deltaSeconds;
    this.innerRunes.rotation += 0.18 * deltaSeconds;
    this.outerRunes.rotation -= 0.12 * deltaSeconds;
    this.updateVoidMist(deltaSeconds);
    this.noiseCooldown -= deltaSeconds;
    if (this.noiseCooldown <= 0) {
      this.noiseCooldown = VOID_NOISE_INTERVAL_SECONDS;
      this.redrawVoidNoise();
    }
    this.silencedMark.setPosition(playerX, playerY - 48);
    const nextInside = this.contains(playerX, playerY);
    if (nextInside === this.inside) return;
    this.inside = nextInside;
    this.silencedMark.setVisible(!nextInside);
    this.boundary.setStrokeStyle(
      nextInside ? 4 : 2,
      nextInside ? 0xe8d5ff : 0x7042a8,
      nextInside ? 0.9 : 0.46,
    );
  }

  destroy(): void {
    this.outsideVeil.clearMask(true);
    this.veilMask.destroy();
    this.veilMaskSource.destroy();
    this.outsideVeil.destroy();
    this.safeCorridorGlow?.destroy();
    this.safeCorridorFrame?.destroy();
    this.safeCorridorResidue?.destroy();
    for (const layer of this.voidNoiseLayers) {
      this.container.scene.tweens.killTweensOf(layer);
      layer.destroy();
    }
    for (const particle of this.voidMist) particle.view.destroy();
    this.silencedMark.destroy(true);
    this.container.destroy(true);
  }

  private updateVoidMist(deltaSeconds: number): void {
    for (const particle of this.voidMist) {
      particle.view.x += particle.velocity.x * deltaSeconds;
      particle.view.y += particle.velocity.y * deltaSeconds;
      wrapPoint(particle.view, this.worldBounds);

      const dx = particle.view.x - this.centerX;
      const dy = particle.view.y - this.centerY;
      if (this.safeCorridor && this.contains(particle.view.x, particle.view.y)) {
        const push = this.safeCorridor.halfWidth + 35;
        particle.view.setPosition(
          this.centerX + (dx >= 0 ? push : -push),
          this.centerY + (dy >= 0 ? push : -push),
        );
        particle.velocity.negate();
        continue;
      }
      const safeRadius = this.radius + 35;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq < safeRadius * safeRadius) {
        const distance = Math.max(1, Math.sqrt(distanceSq));
        particle.view.setPosition(
          this.centerX + (dx / distance) * safeRadius,
          this.centerY + (dy / distance) * safeRadius,
        );
        particle.velocity.negate();
      }
      particle.view.alpha = 0.13
        + (Math.sin(this.elapsed * particle.pulseSpeed + particle.phase) + 1) * 0.055;
    }
  }

  private redrawVoidNoise(): void {
    const layer = this.voidNoiseLayers[this.noiseLayerIndex];
    this.noiseLayerIndex = (this.noiseLayerIndex + 1) % this.voidNoiseLayers.length;
    this.container.scene.tweens.killTweensOf(layer);
    layer.clear().setAlpha(0.9);
    layer.lineStyle(2, 0xf067ff, Phaser.Math.FloatBetween(0.48, 0.72));
    const arcCount = Phaser.Math.Between(5, 8);
    for (let index = 0; index < arcCount; index += 1) {
      const point = randomOutsidePoint(
        this.worldBounds,
        this.centerX,
        this.centerY,
        this.radius + 55,
        this.safeCorridor,
      );
      layer.beginPath();
      layer.moveTo(point.x, point.y);
      let x = point.x;
      let y = point.y;
      const segments = Phaser.Math.Between(2, 4);
      for (let segment = 0; segment < segments; segment += 1) {
        x += Phaser.Math.FloatBetween(8, 22);
        y += Phaser.Math.FloatBetween(-12, 12);
        layer.lineTo(x, y);
      }
      layer.strokePath();
    }
    this.container.scene.tweens.add({
      targets: layer,
      alpha: 0,
      duration: 520,
      ease: 'Quad.easeOut',
    });
  }

  private drawSafeArea(graphics: Phaser.GameObjects.Graphics): void {
    // 기존 중앙 원형 결계는 유지하고, 함정방 통합 시 십자 통로만 추가한다.
    graphics.fillCircle(this.centerX, this.centerY, this.radius);
    if (!this.safeCorridor) return;
    const halfWidth = this.safeCorridor.halfWidth;
    graphics.fillRect(
      this.centerX - halfWidth,
      this.worldBounds.top,
      halfWidth * 2,
      this.worldBounds.height,
    );
    graphics.fillRect(
      this.worldBounds.left,
      this.centerY - halfWidth,
      this.worldBounds.width,
      halfWidth * 2,
    );
  }

  /**
   * 십자 통로를 단순히 '어둠이 없는 구멍'으로 두지 않고, 중앙 결계의 잔광이
   * 사방으로 흘러나가는 것처럼 보이게 한다. 테두리는 만들지 않아 안전영역
   * 사이에 인위적인 경계가 생기지 않는다.
   */
  private createSafeCorridorGlow(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    const glow = scene.add.graphics().setDepth(CURSE_DEPTH - 0.5);
    const halfWidth = this.safeCorridor!.halfWidth;
    const layers = [
      { spread: 58, alpha: 0.045 },
      { spread: 30, alpha: 0.07 },
      { spread: 12, alpha: 0.1 },
    ];
    for (const layer of layers) {
      const width = halfWidth + layer.spread;
      glow.fillStyle(0x7252a6, layer.alpha);
      // 중앙 원형 결계에는 통로의 사각 잔광을 겹치지 않는다. 각 팔은
      // 마법진 외곽에서 시작해 사방으로 퍼져나오는 형태만 남긴다.
      glow.fillRect(
        this.centerX - width,
        this.worldBounds.top,
        width * 2,
        Math.max(0, this.centerY - this.radius - this.worldBounds.top),
      );
      glow.fillRect(
        this.centerX - width,
        this.centerY + this.radius,
        width * 2,
        Math.max(0, this.worldBounds.bottom - (this.centerY + this.radius)),
      );
      glow.fillRect(
        this.worldBounds.left,
        this.centerY - width,
        Math.max(0, this.centerX - this.radius - this.worldBounds.left),
        width * 2,
      );
      glow.fillRect(
        this.centerX + this.radius,
        this.centerY - width,
        Math.max(0, this.worldBounds.right - (this.centerX + this.radius)),
        width * 2,
      );
    }
    return glow;
  }

  /**
   * 십자 통로의 경계는 중앙 원형 결계에 접속한다. 선을 마법진 내부까지
   * 관통시키지 않아 하나의 결계가 사방으로 확장된 형태로 읽힌다.
   */
  private createSafeCorridorFrame(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    const frame = scene.add.graphics()
      // 원형 마법진보다 뒤에 두어 통로선이 외곽 링을 관통해 보이지 않게 한다.
      .setDepth(CURSE_DEPTH - 0.1)
      .lineStyle(2.5, 0xcbb0ff, 0.72);
    const halfWidth = this.safeCorridor!.halfWidth;
    const joinOffset = Math.sqrt(Math.max(0, this.radius * this.radius - halfWidth * halfWidth));
    const topJoin = this.centerY - joinOffset;
    const bottomJoin = this.centerY + joinOffset;
    const leftJoin = this.centerX - joinOffset;
    const rightJoin = this.centerX + joinOffset;

    frame.lineBetween(this.centerX - halfWidth, this.worldBounds.top, this.centerX - halfWidth, topJoin);
    frame.lineBetween(this.centerX + halfWidth, this.worldBounds.top, this.centerX + halfWidth, topJoin);
    frame.lineBetween(this.centerX - halfWidth, bottomJoin, this.centerX - halfWidth, this.worldBounds.bottom);
    frame.lineBetween(this.centerX + halfWidth, bottomJoin, this.centerX + halfWidth, this.worldBounds.bottom);
    frame.lineBetween(this.worldBounds.left, this.centerY - halfWidth, leftJoin, this.centerY - halfWidth);
    frame.lineBetween(this.worldBounds.left, this.centerY + halfWidth, leftJoin, this.centerY + halfWidth);
    frame.lineBetween(rightJoin, this.centerY - halfWidth, this.worldBounds.right, this.centerY - halfWidth);
    frame.lineBetween(rightJoin, this.centerY + halfWidth, this.worldBounds.right, this.centerY + halfWidth);
    return frame;
  }

  /** 중앙 마법진에서 흘러나온 룬 잔광을 십자 통로 위에 남긴다. */
  private createSafeCorridorResidue(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
    const residue = scene.add.graphics()
      .setDepth(CURSE_DEPTH - 0.08)
      .setBlendMode(Phaser.BlendModes.ADD)
      .lineStyle(1.4, 0xbda5ff, 0.3);
    const start = this.radius + 34;
    const spacing = 74;
    const arms = [
      { dx: 0, dy: -1, limit: this.centerY - this.worldBounds.top },
      { dx: 1, dy: 0, limit: this.worldBounds.right - this.centerX },
      { dx: 0, dy: 1, limit: this.worldBounds.bottom - this.centerY },
      { dx: -1, dy: 0, limit: this.centerX - this.worldBounds.left },
    ];
    for (const arm of arms) {
      for (let distance = start; distance < arm.limit - 18; distance += spacing) {
        const x = this.centerX + arm.dx * distance;
        const y = this.centerY + arm.dy * distance;
        residue.strokeCircle(x, y, 4);
        if (arm.dx === 0) {
          residue.lineBetween(x - 7, y, x + 7, y);
        } else {
          residue.lineBetween(x, y - 7, x, y + 7);
        }
      }
    }
    return residue;
  }
}

function drawRuneRing(
  graphics: Phaser.GameObjects.Graphics,
  radius: number,
  count: number,
  color: number,
  alpha: number,
): void {
  graphics.lineStyle(2, color, alpha);
  for (let index = 0; index < count; index += 1) {
    const angle = (Math.PI * 2 * index) / count;
    const halfWidth = Math.PI / count * 0.28;
    graphics.beginPath();
    graphics.arc(0, 0, radius, angle - halfWidth, angle + halfWidth);
    graphics.strokePath();
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    graphics.strokeCircle(x, y, 3);
  }
}

function randomOutsidePoint(
  bounds: Phaser.Geom.Rectangle,
  centerX: number,
  centerY: number,
  sanctuaryRadius: number,
  safeCorridor?: TrapSafeCorridor,
): Phaser.Math.Vector2 {
  const radiusSq = sanctuaryRadius * sanctuaryRadius;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const x = Phaser.Math.FloatBetween(bounds.left, bounds.right);
    const y = Phaser.Math.FloatBetween(bounds.top, bounds.bottom);
    const dx = x - centerX;
    const dy = y - centerY;
    const outsideCircle = dx * dx + dy * dy > radiusSq;
    const outsideCorridor = !safeCorridor
      || !isInsideTrapSafeCorridor(x, y, centerX, centerY, safeCorridor);
    if (outsideCircle && outsideCorridor) return new Phaser.Math.Vector2(x, y);
  }
  return new Phaser.Math.Vector2(bounds.left + 30, bounds.top + 30);
}

function wrapPoint(
  view: Phaser.GameObjects.Ellipse,
  bounds: Phaser.Geom.Rectangle,
): void {
  if (view.x < bounds.left) view.x = bounds.right;
  else if (view.x > bounds.right) view.x = bounds.left;
  if (view.y < bounds.top) view.y = bounds.bottom;
  else if (view.y > bounds.bottom) view.y = bounds.top;
}
