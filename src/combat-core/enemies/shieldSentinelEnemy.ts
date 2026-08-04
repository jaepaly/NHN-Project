import Phaser from 'phaser';
import type { CombatEnemy, EnemyShotRequest } from './combatEnemy';
import { createSpriteLayers, setLayersRotation } from '../../render/spriteLayers';

const SENTINEL_COLOR = 0x557799;
/** AI 스프라이트(코어만). 무채색으로 저장돼 있어 타입 색을 틴트로 입힌다. */
const SENTINEL_SPRITE_KEY = 'enemy-shield-sentinel-core';

const CONFIG = {
  maxHp: 60,
  speed: 58,
  contactDamage: 16,
  contactDistance: 30,
  collisionRadius: 24,
  contactDamageCooldownSeconds: 0.8,
  openingHalfAngle: Math.PI * 7 / 24,
  ringRotationSpeed: 0.8,
  shieldHitCapacity: 4,
} as const;

/** Room C 전용 실드셋: 회전 실드의 열린 각도에서만 본체 피해를 받는다. */
export class ShieldSentinelEnemy implements CombatEnemy {
  readonly kind = 'shield-sentinel' as const;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number;
  readonly contactDamage = CONFIG.contactDamage;
  readonly contactDistance = CONFIG.contactDistance;
  readonly collisionRadius = CONFIG.collisionRadius;

  hp: number;
  alive = true;
  private shieldHitsRemaining: number = CONFIG.shieldHitCapacity;
  private contactDamageCooldownRemaining = 0;
  /** 재질+발광 두 겹 — 회전을 함께 받아야 하므로 묶어둔다. */
  private readonly bodyLayers: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image>;
  private readonly shieldRing: Phaser.GameObjects.Graphics;
  private readonly healthFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, hpScale = 1) {
    this.maxHp = Math.max(1, Math.round(CONFIG.maxHp * hpScale));
    this.hp = this.maxHp;
    this.shieldRing = scene.add.graphics();
    this.drawShieldRing();
    // AI 스프라이트는 코어만 잘라 쓴다. 원본에는 닫힌 육각 방패 링이 그려져 있는데,
    // 이 적의 방패는 회전하며 틈이 생기고 그 틈으로만 공격이 통하는 게임 메커닉이라
    // 링은 위 shieldRing(절차적)이 계속 담당해야 한다.
    this.bodyLayers = scene.textures.exists(SENTINEL_SPRITE_KEY)
      ? createSpriteLayers(scene, SENTINEL_SPRITE_KEY, 38, SENTINEL_COLOR)
      : [scene.add.rectangle(0, 0, 31, 31, SENTINEL_COLOR)
        .setStrokeStyle(2, 0xb9efff, 0.9)];
    const healthBack = scene.add.rectangle(-22, -35, 44, 5, 0x152431, 0.9)
      .setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(-22, -35, 44, 5, 0x72f1b8)
      .setOrigin(0, 0.5);
    this.view = scene.add.container(
      x,
      y,
      [this.shieldRing, ...this.bodyLayers, healthBack, this.healthFill],
    );
  }

  get x(): number { return this.view.x; }
  get y(): number { return this.view.y; }
  get canDealContactDamage(): boolean {
    return this.alive && this.contactDamageCooldownRemaining <= 0;
  }
  get shieldHits(): number { return this.shieldHitsRemaining; }
  get shieldIsActive(): boolean { return this.shieldHitsRemaining > 0; }

  update(
    deltaSeconds: number,
    targetX: number,
    targetY: number,
    movementMultiplier = 1,
  ): EnemyShotRequest[] {
    if (!this.alive) return [];
    this.contactDamageCooldownRemaining = Math.max(0, this.contactDamageCooldownRemaining - deltaSeconds);
    this.shieldRing.rotation += CONFIG.ringRotationSpeed * deltaSeconds;
    const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
    if (direction.lengthSq() === 0) return [];
    direction.normalize();
    const multiplier = Number.isFinite(movementMultiplier) ? Math.max(0, movementMultiplier) : 1;
    this.view.x += direction.x * CONFIG.speed * deltaSeconds * multiplier;
    this.view.y += direction.y * CONFIG.speed * deltaSeconds * multiplier;
    setLayersRotation(this.bodyLayers, direction.angle());
    return [];
  }

  startContactDamageCooldown(): void {
    this.contactDamageCooldownRemaining = CONFIG.contactDamageCooldownSeconds;
  }

  takeMechanicDamage(
    amount: number,
    sourceX: number,
    sourceY: number,
  ): { defeated: boolean; blocked: boolean; shieldBroken: boolean } {
    if (!this.alive) return { defeated: false, blocked: true, shieldBroken: false };
    if (!this.shieldIsActive) {
      return { defeated: this.applyDamage(amount), blocked: false, shieldBroken: false };
    }
    const incomingAngle = Phaser.Math.Angle.Between(this.x, this.y, sourceX, sourceY);
    const openingAngle = Phaser.Math.Angle.Wrap(this.shieldRing.rotation - Math.PI / 2);
    const entersOpening = Math.abs(Phaser.Math.Angle.Wrap(incomingAngle - openingAngle))
      <= CONFIG.openingHalfAngle;
    if (!entersOpening) {
      this.shieldHitsRemaining = Math.max(0, this.shieldHitsRemaining - 1);
      this.drawShieldRing();
      return {
        defeated: false,
        blocked: true,
        shieldBroken: this.shieldHitsRemaining === 0,
      };
    }
    return { defeated: this.applyDamage(amount), blocked: false, shieldBroken: false };
  }

  takeDamage(amount: number): boolean {
    return this.applyDamage(amount);
  }

  private applyDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    this.healthFill.setScale(this.hp / this.maxHp, 1);
    if (this.hp > 0) return false;
    this.alive = false;
    return true;
  }

  private drawShieldRing(): void {
    this.shieldRing.clear();
    if (!this.shieldIsActive) return;
    const integrity = this.shieldHitsRemaining / CONFIG.shieldHitCapacity;
    this.shieldRing.lineStyle(5, 0x66d9ff, 0.35 + integrity * 0.55);
    this.shieldRing.beginPath();
    this.shieldRing.arc(0, 0, 31, -Math.PI * 5 / 24, Math.PI * 29 / 24, false);
    this.shieldRing.strokePath();
    // 내구도가 줄수록 방패 면에 균열 간격을 만든다. 회전하는 실드라는 정보는 유지한다.
    for (let i = this.shieldHitsRemaining; i < CONFIG.shieldHitCapacity; i++) {
      const angle = -Math.PI * 5 / 24 + (i + 0.65) * (Math.PI * 34 / 24 / CONFIG.shieldHitCapacity);
      const inner = 24;
      const outer = 36;
      this.shieldRing.lineStyle(2, 0xe1f7ff, 0.8);
      this.shieldRing.lineBetween(
        Math.cos(angle) * inner,
        Math.sin(angle) * inner,
        Math.cos(angle + 0.18) * outer,
        Math.sin(angle + 0.18) * outer,
      );
    }
  }

  destroy(): void {
    this.alive = false;
    this.view.destroy(true);
  }
}
