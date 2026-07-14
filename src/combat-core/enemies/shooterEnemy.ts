/** R1 전투 코어: 거리 유지형 원거리 적. */
import Phaser from 'phaser';
import { SHOOTER_CONFIG } from '../combat/combatConfig';
import type { CombatEnemy, EnemyShotRequest } from './combatEnemy';

export class ShooterEnemy implements CombatEnemy {
  readonly kind = 'shooter' as const;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number = SHOOTER_CONFIG.maxHp;
  readonly contactDamage: number = SHOOTER_CONFIG.contactDamage;
  readonly contactDistance: number = SHOOTER_CONFIG.contactDistance;

  hp: number = this.maxHp;
  alive = true;
  contactDamageCooldownRemaining = 0;

  private readonly body: Phaser.GameObjects.Rectangle;
  private readonly healthFill: Phaser.GameObjects.Rectangle;
  private attackCooldownRemaining: number = SHOOTER_CONFIG.attackIntervalSeconds;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const glow = scene.add.rectangle(0, 0, 34, 34, 0xffb347, 0.14)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.body = scene.add.rectangle(0, 0, 24, 24, 0xffa62b)
      .setStrokeStyle(2, 0xffd08a, 0.95);
    const healthBack = scene.add.rectangle(-16, -25, 32, 4, 0x30200e, 0.9)
      .setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(-16, -25, 32, 4, 0x72f1b8, 1)
      .setOrigin(0, 0.5);

    this.view = scene.add.container(x, y, [glow, this.body, healthBack, this.healthFill]);
  }

  get x(): number {
    return this.view.x;
  }

  get y(): number {
    return this.view.y;
  }

  get canDealContactDamage(): boolean {
    return this.alive && this.contactDamageCooldownRemaining <= 0;
  }

  update(deltaSeconds: number, targetX: number, targetY: number): EnemyShotRequest[] {
    if (!this.alive) return [];

    this.contactDamageCooldownRemaining = Math.max(
      0,
      this.contactDamageCooldownRemaining - deltaSeconds,
    );
    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - deltaSeconds);
    const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
    const distance = direction.length();
    if (distance === 0) return [];

    direction.normalize();
    const minimumDistance = SHOOTER_CONFIG.preferredDistance - SHOOTER_CONFIG.distanceTolerance;
    const maximumDistance = SHOOTER_CONFIG.preferredDistance + SHOOTER_CONFIG.distanceTolerance;
    if (distance > maximumDistance) {
      this.view.x += direction.x * SHOOTER_CONFIG.speed * deltaSeconds;
      this.view.y += direction.y * SHOOTER_CONFIG.speed * deltaSeconds;
    } else if (distance < minimumDistance) {
      this.view.x -= direction.x * SHOOTER_CONFIG.speed * deltaSeconds;
      this.view.y -= direction.y * SHOOTER_CONFIG.speed * deltaSeconds;
    }
    this.body.rotation = direction.angle();

    if (
      this.attackCooldownRemaining > 0
      || distance > SHOOTER_CONFIG.attackRange
    ) return [];

    this.attackCooldownRemaining = SHOOTER_CONFIG.attackIntervalSeconds;
    const baseAngle = direction.angle();
    const spread = Phaser.Math.DegToRad(SHOOTER_CONFIG.bulletSpreadDegrees);
    const middleIndex = (SHOOTER_CONFIG.bulletCount - 1) / 2;
    return Array.from({ length: SHOOTER_CONFIG.bulletCount }, (_, index) => ({
      x: this.x,
      y: this.y,
      angle: baseAngle + (index - middleIndex) * spread,
    }));
  }

  startContactDamageCooldown(): void {
    this.contactDamageCooldownRemaining = SHOOTER_CONFIG.contactDamageCooldownSeconds;
  }

  takeDamage(amount: number): boolean {
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
