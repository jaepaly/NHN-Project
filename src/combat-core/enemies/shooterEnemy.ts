/** R1 전투 코어: 거리 유지형 원거리 적. */
import Phaser from 'phaser';
import { SHOOTER_CONFIG } from '../combat/combatConfig';
import type { CombatEnemy, EnemyDestroyOptions, EnemyShotRequest } from './combatEnemy';
import { playHitFlash, playAttackLunge, playDeathPop } from './enemyJuice';
import { createSpriteLayers, setLayersRotation } from '../../render/spriteLayers';

const SHOOTER_COLOR = 0xffa62b;
/** AI 생성 스프라이트 키. 무채색으로 저장돼 있어 타입 색을 틴트로 입힌다. */
const SHOOTER_SPRITE_KEY = 'enemy-shooter';

export class ShooterEnemy implements CombatEnemy {
  readonly kind = 'shooter' as const;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number = SHOOTER_CONFIG.maxHp;
  readonly contactDamage: number = SHOOTER_CONFIG.contactDamage;
  readonly contactDistance: number = SHOOTER_CONFIG.contactDistance;
  readonly collisionRadius: number = SHOOTER_CONFIG.collisionRadius;

  hp: number = this.maxHp;
  alive = true;
  contactDamageCooldownRemaining = 0;
  private dying = false;

  private readonly body: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
  /** 재질+발광 두 겹 — 회전을 함께 받아야 하므로 묶어둔다. */
  private readonly bodyLayers: Array<Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image>;
  private readonly healthFill: Phaser.GameObjects.Rectangle;
  private attackCooldownRemaining: number = SHOOTER_CONFIG.attackIntervalSeconds;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const glow = scene.add.rectangle(0, 0, 34, 34, 0xffb347, 0.14)
      .setBlendMode(Phaser.BlendModes.ADD);
    // AI 스프라이트는 재질 + 발광 두 겹으로 그린다(spriteLayers 참고). 통째로 틴트하면
    // 재질감이 죽어 단색 덩어리가 되므로, 타입 색은 코어(발광)가 전담한다.
    // 텍스처가 없으면 기존 도형으로 폴백해 게임은 항상 돌아간다.
    this.bodyLayers = scene.textures.exists(SHOOTER_SPRITE_KEY)
      ? createSpriteLayers(scene, SHOOTER_SPRITE_KEY, 46, SHOOTER_COLOR)
      : [scene.add.rectangle(0, 0, 24, 24, SHOOTER_COLOR)
        .setStrokeStyle(2, 0xffd08a, 0.95)];
    [this.body] = this.bodyLayers;
    const healthBack = scene.add.rectangle(-16, -25, 32, 4, 0x30200e, 0.9)
      .setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(-16, -25, 32, 4, 0x72f1b8, 1)
      .setOrigin(0, 0.5);

    this.view = scene.add.container(x, y, [glow, ...this.bodyLayers, healthBack, this.healthFill]);
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
    this.attackCooldownRemaining = Math.max(0, this.attackCooldownRemaining - deltaSeconds);
    const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
    const distance = direction.length();
    if (distance === 0) return [];

    direction.normalize();
    const minimumDistance = SHOOTER_CONFIG.preferredDistance - SHOOTER_CONFIG.distanceTolerance;
    const maximumDistance = SHOOTER_CONFIG.preferredDistance + SHOOTER_CONFIG.distanceTolerance;
    const moveScale = safeMovementMultiplier(movementMultiplier);
    if (distance > maximumDistance) {
      this.view.x += direction.x * SHOOTER_CONFIG.speed * deltaSeconds * moveScale;
      this.view.y += direction.y * SHOOTER_CONFIG.speed * deltaSeconds * moveScale;
    } else if (distance < minimumDistance) {
      this.view.x -= direction.x * SHOOTER_CONFIG.speed * deltaSeconds * moveScale;
      this.view.y -= direction.y * SHOOTER_CONFIG.speed * deltaSeconds * moveScale;
    }
    setLayersRotation(this.bodyLayers, direction.angle());

    if (
      this.attackCooldownRemaining > 0
      || distance > SHOOTER_CONFIG.attackRange
    ) return [];

    this.attackCooldownRemaining = SHOOTER_CONFIG.attackIntervalSeconds;
    playAttackLunge(this.view.scene, this.view); // 발사 반동
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
    if (this.hp > 0) {
      playHitFlash(this.view.scene, this.body, SHOOTER_COLOR);
      return false;
    }

    this.alive = false;
    return true;
  }

  destroy(options: EnemyDestroyOptions = {}): void {
    this.alive = false;
    if (this.dying) return;
    this.dying = true;
    if (options.animate === false) {
      this.view.scene.tweens.killTweensOf(this.view);
      if (this.view.active) this.view.destroy(true);
      return;
    }
    playDeathPop(this.view.scene, this.view, () => {
      if (this.view.active) this.view.destroy(true);
    });
  }
}

function safeMovementMultiplier(multiplier: number): number {
  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}
