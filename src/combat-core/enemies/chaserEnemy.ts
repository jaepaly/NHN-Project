/** R1 전투 코어: 직선 추격형 적. */
import Phaser from 'phaser';
import { CHASER_CONFIG } from '../combat/combatConfig';
import type { CombatEnemy, EnemyDestroyOptions, EnemyShotRequest } from './combatEnemy';
import { playHitReact, playAttackLunge, playDeathPop } from './enemyJuice';
import { createSpriteLayers, setLayersRotation } from '../../render/spriteLayers';

const CHASER_COLOR = 0xff4d6d;
/** AI 생성 스프라이트 키. 무채색으로 저장돼 있어 타입 색을 틴트로 입힌다. */
const CHASER_SPRITE_KEY = 'enemy-chaser';

export class ChaserEnemy implements CombatEnemy {
  readonly kind = 'chaser' as const;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number = CHASER_CONFIG.maxHp;
  readonly contactDamage: number = CHASER_CONFIG.contactDamage;
  readonly contactDistance: number = CHASER_CONFIG.contactDistance;
  readonly collisionRadius: number = CHASER_CONFIG.collisionRadius;

  hp: number = this.maxHp;
  alive = true;
  contactDamageCooldownRemaining = 0;
  private dying = false;

  private readonly body: Phaser.GameObjects.Triangle | Phaser.GameObjects.Image;
  /** 재질+발광 두 겹 — 회전을 함께 받아야 하므로 묶어둔다. */
  private readonly bodyLayers: Array<Phaser.GameObjects.Triangle | Phaser.GameObjects.Image>;
  /** 스프라이트는 오른쪽을 향해 그려져 있고(회전 0 = 우), 폴백 삼각형은 위를 향한다. */
  private readonly bodyAngleOffset: number;
  private readonly healthFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const glow = scene.add.circle(0, 0, 19, 0xff4d6d, 0.16)
      .setBlendMode(Phaser.BlendModes.ADD);
    // AI 스프라이트가 있으면 사용한다. 무채색이라 타입 색을 틴트로 입혀 색 구분 체계를
    // 지키고, 알파를 딴 이미지라 일반 블렌딩으로 불투명하게 그린다.
    const sprite = scene.textures.exists(CHASER_SPRITE_KEY);
    this.bodyAngleOffset = sprite ? 0 : Math.PI / 2;
    this.bodyLayers = sprite
      ? createSpriteLayers(scene, CHASER_SPRITE_KEY, 42, CHASER_COLOR)
      : [scene.add.triangle(0, 0, 0, 24, 12, 0, 24, 24, CHASER_COLOR)
        .setStrokeStyle(2, 0xff8fa3, 0.9)];
    [this.body] = this.bodyLayers;
    const healthBack = scene.add.rectangle(-16, -25, 32, 4, 0x30121c, 0.9)
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
    setLayersRotation(this.bodyLayers, direction.angle() + this.bodyAngleOffset);
    return [];
  }

  get canDealContactDamage(): boolean {
    return this.alive && this.contactDamageCooldownRemaining <= 0;
  }

  startContactDamageCooldown(): void {
    this.contactDamageCooldownRemaining = CHASER_CONFIG.contactDamageCooldownSeconds;
    playAttackLunge(this.view.scene, this.view); // 때리는 순간 펀치
  }

  /** @returns 이 피해로 처치됐으면 true */
  takeDamage(amount: number): boolean {
    if (!this.alive) return false;

    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    this.healthFill.setScale(this.hp / this.maxHp, 1);
    if (this.hp > 0) {
      playHitReact(this.view.scene, this.view, this.body, CHASER_COLOR); // 맞는 순간 플래시+squash
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
