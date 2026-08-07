import Phaser from 'phaser';
import type { SelfBuffKind } from '../combat-core/player/selfBuffConfig';
import type { SpellElement } from '../spell/types';
import { ELEMENT_PALETTES } from './palette';
import { ensureParticleTextures, particleKey, PARTICLE_TEXTURES } from './particleTextures';
import { spawnTrailGhost } from './trailEffect';
import { scaledAlpha } from './vfxBrightness';
import {
  SUPPORT_VFX_CONFIG,
  shieldVisualRatio,
  supportPowerScale,
  supportVfxScale,
} from './supportSpellVfxConfig';
import type { SupportVfxSource } from './supportSpellVfxConfig';

export { SUPPORT_VFX_CONFIG, shieldVisualRatio, supportPowerScale, supportVfxScale } from './supportSpellVfxConfig';

/**
 * 플레이어 지원 효과 전용 연출.
 *
 * 수치를 소유하지 않고 PlayerCombatState의 스냅샷만 따라간다. 보호막이 추후 개별
 * 지속시간 구조로 바뀌어도 합산량 계약은 그대로 사용할 수 있어 렌더러를 다시 만들지 않는다.
 */
export class SupportSpellVfx {
  private readonly shieldLayer: Phaser.GameObjects.Graphics;
  private readonly buffLayers = new Map<SelfBuffKind, Phaser.GameObjects.Graphics>();
  private observedShield = 0;
  private hasteTrailCooldown = 0;
  private elapsed = 0;
  private pendingShieldGain: {
    amount: number;
    power: number;
    element: SpellElement | null;
    source: SupportVfxSource;
  } | null = null;
  private shieldMergeTimer: Phaser.Time.TimerEvent | null = null;
  private readonly buffPowerScales = new Map<SelfBuffKind, number>();
  private readonly transients = new Set<Phaser.GameObjects.GameObject>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Phaser.GameObjects.Container,
  ) {
    ensureParticleTextures(scene);
    this.shieldLayer = scene.add.graphics();
    player.addAt(this.shieldLayer, 0);
    for (const kind of ['haste', 'empower', 'ward'] as const) {
      const layer = scene.add.graphics().setVisible(false);
      player.add(layer);
      this.buffLayers.set(kind, layer);
    }
  }

  playHeal(amount: number, maxHp: number, power: number, element: SpellElement, source: SupportVfxSource): void {
    const scale = supportVfxScale(source) * supportPowerScale(power);
    const effective = amount > 0;
    const amountRatio = maxHp > 0 ? Phaser.Math.Clamp(amount / maxHp, 0, 1) : 0;
    const color = SUPPORT_VFX_CONFIG.healColor;
    const accent = ELEMENT_PALETTES[element].accent;
    const x = this.player.x;
    const y = this.player.y;

    const ring = this.scene.add.circle(x, y + 5, 39, color, 0)
      .setStrokeStyle(4.2, color, scaledAlpha(effective ? 1 : 0.4))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(9)
      .setScale(1.82 * scale);
    this.transients.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scale: 0.42 * scale,
      alpha: { from: scaledAlpha(effective ? 1 : 0.4), to: 0 },
      duration: SUPPORT_VFX_CONFIG.healDurationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => this.destroyTransient(ring),
    });

    const core = this.scene.add.circle(x, y - 1, 23, color, scaledAlpha(effective ? 0.38 : 0.12))
      .setStrokeStyle(2.6, accent, scaledAlpha(effective ? 0.94 : 0.28))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(9);
    this.transients.add(core);
    this.scene.tweens.add({
      targets: core,
      scale: { from: 0.62 * scale, to: 1.65 * scale },
      alpha: 0,
      duration: SUPPORT_VFX_CONFIG.healDurationMs * 0.82,
      ease: 'Quad.easeOut',
      onComplete: () => this.destroyTransient(core),
    });

    const count = effective ? Math.round((15 + amountRatio * 12) * scale) : 5;
    for (let index = 0; index < count; index += 1) {
      const angle = (Math.PI * 2 * index) / Math.max(1, count);
      const radius = 16 + (index % 3) * 8;
      const mote = this.scene.add.circle(
        x + Math.cos(angle) * radius,
        y + 10 + Math.sin(angle) * radius * 0.45,
        2.5 + (index % 2) * 1.1,
        index % 3 === 0 ? accent : color,
        scaledAlpha(effective ? 0.82 : 0.3),
      ).setBlendMode(Phaser.BlendModes.ADD).setDepth(10);
      this.transients.add(mote);
      this.scene.tweens.add({
        targets: mote,
        y: mote.y - (39 + (index % 4) * 10) * scale,
        x: mote.x + Math.cos(angle) * 8,
        alpha: 0,
        scale: { from: 1, to: 0.35 },
        duration: (560 + (index % 4) * 70) * scale,
        ease: 'Quad.easeOut',
        onComplete: () => this.destroyTransient(mote),
      });
    }
  }

  playShieldGain(
    gainedAmount: number,
    totalAmount: number,
    power: number,
    element: SpellElement | null,
    source: SupportVfxSource,
  ): void {
    this.observedShield = Math.max(0, totalAmount);
    const safePower = Number.isFinite(power) ? Phaser.Math.Clamp(power, 0, 100) : 50;
    const pending = this.pendingShieldGain;
    this.pendingShieldGain = pending
      ? {
        amount: pending.amount + Math.max(0, gainedAmount),
        power: Math.max(pending.power, safePower),
        element: safePower >= pending.power ? element : pending.element,
        source: pending.source === 'spell' || source === 'spell' ? 'spell' : source,
      }
      : { amount: Math.max(0, gainedAmount), power: safePower, element, source };
    if (this.shieldMergeTimer) return;
    this.shieldMergeTimer = this.scene.time.delayedCall(
      SUPPORT_VFX_CONFIG.shieldMergeWindowMs,
      () => this.flushShieldGain(),
    );
  }

  private flushShieldGain(): void {
    const gain = this.pendingShieldGain;
    this.pendingShieldGain = null;
    this.shieldMergeTimer = null;
    if (!gain) return;
    const scale = supportVfxScale(gain.source) * supportPowerScale(gain.power);
    const color = SUPPORT_VFX_CONFIG.shieldColor;
    const accent = gain.element ? ELEMENT_PALETTES[gain.element].accent : SUPPORT_VFX_CONFIG.shieldHighlight;
    const shell = this.scene.add.graphics();
    this.transients.add(shell);
    drawSegmentedShell(
      shell,
      SUPPORT_VFX_CONFIG.shieldRadius,
      color,
      scaledAlpha(gain.amount > 0 ? 0.9 : 0.3),
      accent,
    );
    shell.setPosition(this.player.x, this.player.y).setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: shell,
      scale: { from: 0.72 * scale, to: 1.22 * scale },
      alpha: { from: scaledAlpha(gain.amount > 0 ? 1 : 0.34), to: 0 },
      duration: SUPPORT_VFX_CONFIG.shieldGainDurationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => this.destroyTransient(shell),
    });
  }

  playShieldHit(absorbedAmount: number, broken: boolean): void {
    if (absorbedAmount <= 0) return;
    const color = broken ? SUPPORT_VFX_CONFIG.shieldHighlight : SUPPORT_VFX_CONFIG.shieldColor;
    const ring = this.scene.add.circle(this.player.x, this.player.y, SUPPORT_VFX_CONFIG.shieldRadius, color, 0)
      .setStrokeStyle(broken ? 3.2 : 2.2, color, scaledAlpha(0.92))
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(10);
    this.transients.add(ring);
    this.scene.tweens.add({
      targets: ring,
      scale: broken ? 1.55 : 1.2,
      alpha: 0,
      duration: broken ? 460 : 260,
      ease: 'Quad.easeOut',
      onComplete: () => this.destroyTransient(ring),
    });
    if (!broken) return;
    for (let index = 0; index < 8; index += 1) {
      const angle = (Math.PI * 2 * index) / 8 + Math.PI / 8;
      const shard = this.scene.add.image(
        this.player.x + Math.cos(angle) * 24,
        this.player.y + Math.sin(angle) * 24,
        particleKey(this.scene, PARTICLE_TEXTURES.shard),
      ).setTint(color).setDisplaySize(8, 13).setRotation(angle).setAlpha(scaledAlpha(0.76)).setDepth(10);
      this.transients.add(shard);
      this.scene.tweens.add({
        targets: shard,
        x: shard.x + Math.cos(angle) * 27,
        y: shard.y + Math.sin(angle) * 27,
        rotation: shard.rotation + 0.7,
        alpha: 0,
        duration: 430,
        ease: 'Quad.easeOut',
        onComplete: () => this.destroyTransient(shard),
      });
    }
  }

  playBuffCast(kind: SelfBuffKind, power: number, element: SpellElement): void {
    const powerScale = supportPowerScale(power);
    this.buffPowerScales.set(kind, powerScale);
    const color = SUPPORT_VFX_CONFIG.buffColors[kind];
    const accent = ELEMENT_PALETTES[element].accent;
    const burst = this.scene.add.graphics().setPosition(this.player.x, this.player.y).setDepth(9);
    this.transients.add(burst);
    if (kind === 'haste') drawHasteCast(burst, color, scaledAlpha(0.95));
    else if (kind === 'empower') drawEmpower(burst, color, accent, scaledAlpha(0.92), 0);
    else drawWard(burst, color, scaledAlpha(0.94), 0);
    burst.setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: burst,
      scale: { from: 0.72 * powerScale, to: 1.32 * powerScale },
      alpha: { from: 1, to: 0 },
      duration: 520,
      ease: 'Cubic.easeOut',
      onComplete: () => this.destroyTransient(burst),
    });
  }

  update(
    deltaSeconds: number,
    shield: number,
    maxShield: number,
    buffs: readonly { kind: SelfBuffKind; remaining: number; multiplier: number }[],
    moving: boolean,
    moveDirection: Readonly<{ x: number; y: number }>,
  ): void {
    const delta = Math.max(0, deltaSeconds);
    this.elapsed += delta;
    this.syncShield(shield, maxShield);
    this.shieldLayer.rotation += 0.18 * delta;
    const activeKinds = new Set(buffs.map((buff) => buff.kind));
    for (const [kind, layer] of this.buffLayers) {
      layer.setVisible(activeKinds.has(kind));
      if (!activeKinds.has(kind)) {
        this.buffPowerScales.delete(kind);
        continue;
      }
      const powerScale = this.buffPowerScales.get(kind) ?? 1;
      layer.setScale(powerScale);
      layer.clear();
      if (kind === 'empower') {
        drawEmpower(layer, SUPPORT_VFX_CONFIG.buffColors.empower, 0xffd166, scaledAlpha(0.36), this.elapsed);
      } else if (kind === 'ward') {
        drawWard(layer, SUPPORT_VFX_CONFIG.buffColors.ward, scaledAlpha(0.42), this.elapsed);
      }
    }

    this.hasteTrailCooldown = Math.max(0, this.hasteTrailCooldown - delta);
    if (moving && activeKinds.has('haste') && this.hasteTrailCooldown <= 0) {
      this.hasteTrailCooldown = 0.045;
      spawnTrailGhost(
        this.scene,
        this.player.x - moveDirection.x * 5,
        this.player.y - moveDirection.y * 5,
        16 * (this.buffPowerScales.get('haste') ?? 1),
        SUPPORT_VFX_CONFIG.buffColors.haste,
        this.player.depth - 1,
      );
    }
  }

  reset(): void {
    this.observedShield = 0;
    this.hasteTrailCooldown = 0;
    this.elapsed = 0;
    this.shieldMergeTimer?.remove(false);
    this.shieldMergeTimer = null;
    this.pendingShieldGain = null;
    this.buffPowerScales.clear();
    for (const transient of this.transients) transient.destroy();
    this.transients.clear();
    this.shieldLayer.clear();
    for (const layer of this.buffLayers.values()) layer.clear().setVisible(false);
  }

  destroy(): void {
    for (const transient of this.transients) transient.destroy();
    this.transients.clear();
    this.shieldMergeTimer?.remove(false);
    this.shieldMergeTimer = null;
    this.pendingShieldGain = null;
    this.buffPowerScales.clear();
    this.shieldLayer.destroy();
    for (const layer of this.buffLayers.values()) layer.destroy();
    this.buffLayers.clear();
  }

  private syncShield(amount: number, maxAmount: number): void {
    const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    const increasedWithoutEvent = safeAmount > this.observedShield + 0.001;
    this.observedShield = safeAmount;
    const ratio = shieldVisualRatio(safeAmount, maxAmount);
    this.shieldLayer.clear().setVisible(ratio > 0);
    if (ratio <= 0) return;
    drawSegmentedShell(
      this.shieldLayer,
      SUPPORT_VFX_CONFIG.shieldRadius,
      SUPPORT_VFX_CONFIG.shieldColor,
      scaledAlpha(0.2 + ratio * 0.34),
      SUPPORT_VFX_CONFIG.shieldHighlight,
      ratio,
    );
    if (increasedWithoutEvent) {
      this.playShieldGain(safeAmount, safeAmount, 50, null, 'room-start');
    }
  }

  private destroyTransient(object: Phaser.GameObjects.GameObject): void {
    this.transients.delete(object);
    if (object.active) object.destroy();
  }
}

function drawSegmentedShell(
  graphics: Phaser.GameObjects.Graphics,
  radius: number,
  color: number,
  alpha: number,
  accent: number,
  integrity = 1,
): void {
  const segments = 6;
  const safeIntegrity = Phaser.Math.Clamp(integrity, 0, 1);
  for (let index = 0; index < segments; index += 1) {
    const center = -Math.PI / 2 + (Math.PI * 2 * index) / segments;
    const half = 0.47;
    graphics.lineStyle(1.6 + safeIntegrity * 1.2, color, alpha * (0.72 + safeIntegrity * 0.28));
    graphics.beginPath();
    graphics.arc(0, 0, radius, center - half, center + half, false);
    graphics.strokePath();
    graphics.fillStyle(accent, alpha * 0.72);
    graphics.fillCircle(Math.cos(center) * radius, Math.sin(center) * radius, 1.4 + safeIntegrity * 0.6);
  }
}

function drawHasteCast(graphics: Phaser.GameObjects.Graphics, color: number, alpha: number): void {
  graphics.lineStyle(2.5, color, alpha);
  for (let index = 0; index < 8; index += 1) {
    const angle = (Math.PI * 2 * index) / 8;
    const inner = 16;
    const outer = 34;
    graphics.lineBetween(
      Math.cos(angle) * inner,
      Math.sin(angle) * inner,
      Math.cos(angle) * outer,
      Math.sin(angle) * outer,
    );
  }
}

function drawEmpower(
  graphics: Phaser.GameObjects.Graphics,
  color: number,
  accent: number,
  alpha: number,
  elapsed: number,
): void {
  for (let index = 0; index < 5; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 5 + elapsed * 0.18;
    const radius = 25 + Math.sin(elapsed * 2 + index) * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    graphics.fillStyle(index % 2 === 0 ? accent : color, alpha);
    graphics.fillTriangle(x, y - 5, x - 3, y + 3, x + 3, y + 3);
  }
}

function drawWard(graphics: Phaser.GameObjects.Graphics, color: number, alpha: number, elapsed: number): void {
  graphics.lineStyle(1.8, color, alpha);
  for (let index = 0; index < 3; index += 1) {
    const angle = elapsed * 0.55 + (Math.PI * 2 * index) / 3;
    const x = Math.cos(angle) * 29;
    const y = Math.sin(angle) * 18;
    graphics.strokePoints([
      new Phaser.Geom.Point(x, y - 5),
      new Phaser.Geom.Point(x + 4, y),
      new Phaser.Geom.Point(x, y + 5),
      new Phaser.Geom.Point(x - 4, y),
    ], true);
  }
}
