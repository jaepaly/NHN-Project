/** R1 전투 코어: 직선 추격형 적. */
import Phaser from 'phaser';
import { CHASER_CONFIG } from '../combat/combatConfig';
import type { CombatEnemy, EnemyShotRequest } from './combatEnemy';

export class ChaserEnemy implements CombatEnemy {
  readonly kind = 'chaser' as const;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number = CHASER_CONFIG.maxHp;
  readonly contactDamage: number = CHASER_CONFIG.contactDamage;
  readonly contactDistance: number = CHASER_CONFIG.contactDistance;

  hp: number = this.maxHp;
  alive = true;
  contactDamageCooldownRemaining = 0;

  private readonly body: Phaser.GameObjects.Triangle;
  private readonly healthFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const glow = scene.add.circle(0, 0, 19, 0xff4d6d, 0.16)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.body = scene.add.triangle(0, 0, 0, 24, 12, 0, 24, 24, 0xff4d6d)
      .setStrokeStyle(2, 0xff8fa3, 0.9);
    const healthBack = scene.add.rectangle(-16, -25, 32, 4, 0x30121c, 0.9)
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

  update(
    deltaSeconds: number,
    targetX: number,
    targetY: number,
    movementMultiplier = 1,
  ): EnemyShotRequest[] {
    if (!this.alive) return [];

    this.contactDamageCooldownRemaining = Math.max(
      0,
      this.contactDamageCooldownRemaining - deltaSeconds,
    );

    const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
    if (direction.lengthSq() === 0) return [];

    direction.normalize();
    const moveScale = safeMovementMultiplier(movementMultiplier);
    this.view.x += direction.x * CHASER_CONFIG.speed * deltaSeconds * moveScale;
    this.view.y += direction.y * CHASER_CONFIG.speed * deltaSeconds * moveScale;
    this.body.rotation = direction.angle() + Math.PI / 2;
    return [];
  }

  get canDealContactDamage(): boolean {
    return this.alive && this.contactDamageCooldownRemaining <= 0;
  }

  startContactDamageCooldown(): void {
    this.contactDamageCooldownRemaining = CHASER_CONFIG.contactDamageCooldownSeconds;
  }

  /** @returns 이 피해로 처치됐으면 true */
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

function safeMovementMultiplier(multiplier: number): number {
  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}
