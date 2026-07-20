import Phaser from 'phaser';
import type { CombatEnemy, EnemyShotRequest } from './combatEnemy';

const CONFIG = {
  maxHp: 60,
  speed: 58,
  contactDamage: 16,
  contactDistance: 30,
  collisionRadius: 24,
  contactDamageCooldownSeconds: 0.8,
  openingHalfAngle: Math.PI * 7 / 24,
  ringRotationSpeed: 0.8,
} as const;

/** Room C 전용 실드셋: 회전 실드의 열린 각도에서만 본체 피해를 받는다. */
export class ShieldSentinelEnemy implements CombatEnemy {
  readonly kind = 'shield-sentinel' as const;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp = CONFIG.maxHp;
  readonly contactDamage = CONFIG.contactDamage;
  readonly contactDistance = CONFIG.contactDistance;
  readonly collisionRadius = CONFIG.collisionRadius;

  hp: number = this.maxHp;
  alive = true;
  private contactDamageCooldownRemaining = 0;
  private readonly body: Phaser.GameObjects.Rectangle;
  private readonly shieldRing: Phaser.GameObjects.Graphics;
  private readonly healthFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.shieldRing = scene.add.graphics();
    this.shieldRing.lineStyle(5, 0x66d9ff, 0.9);
    this.shieldRing.beginPath();
    this.shieldRing.arc(0, 0, 31, -Math.PI * 5 / 24, Math.PI * 29 / 24, false);
    this.shieldRing.strokePath();
    this.body = scene.add.rectangle(0, 0, 31, 31, 0x557799)
      .setStrokeStyle(2, 0xb9efff, 0.9);
    const healthBack = scene.add.rectangle(-22, -35, 44, 5, 0x152431, 0.9)
      .setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(-22, -35, 44, 5, 0x72f1b8)
      .setOrigin(0, 0.5);
    this.view = scene.add.container(
      x,
      y,
      [this.shieldRing, this.body, healthBack, this.healthFill],
    );
  }

  get x(): number { return this.view.x; }
  get y(): number { return this.view.y; }
  get canDealContactDamage(): boolean {
    return this.alive && this.contactDamageCooldownRemaining <= 0;
  }

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
    this.body.rotation = direction.angle();
    return [];
  }

  startContactDamageCooldown(): void {
    this.contactDamageCooldownRemaining = CONFIG.contactDamageCooldownSeconds;
  }

  takeMechanicDamage(
    amount: number,
    sourceX: number,
    sourceY: number,
  ): { defeated: boolean; blocked: boolean } {
    if (!this.alive) return { defeated: false, blocked: true };
    const incomingAngle = Phaser.Math.Angle.Between(this.x, this.y, sourceX, sourceY);
    const openingAngle = Phaser.Math.Angle.Wrap(this.shieldRing.rotation - Math.PI / 2);
    const entersOpening = Math.abs(Phaser.Math.Angle.Wrap(incomingAngle - openingAngle))
      <= CONFIG.openingHalfAngle;
    if (!entersOpening) {
      return { defeated: false, blocked: true };
    }
    return { defeated: this.applyDamage(amount), blocked: false };
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

  destroy(): void {
    this.alive = false;
    this.view.destroy(true);
  }
}
