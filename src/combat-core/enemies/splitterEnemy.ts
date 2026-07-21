/** R1 전투 코어: 처치 시 소형으로 분열하는 적. */
import Phaser from 'phaser';
import { SPLITTER_CONFIG } from '../combat/combatConfig';
import type { CombatEnemy, EnemyShotRequest } from './combatEnemy';

export class SplitterEnemy implements CombatEnemy {
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number;
  readonly contactDamage: number;
  readonly contactDistance: number;
  readonly collisionRadius: number;
  readonly small: boolean;

  hp: number;
  alive = true;
  contactDamageCooldownRemaining = 0;

  private readonly body: Phaser.GameObjects.Polygon | Phaser.GameObjects.Image;
  private readonly healthFill: Phaser.GameObjects.Rectangle;
  private readonly speed: number;

  constructor(scene: Phaser.Scene, x: number, y: number, small = false) {
    this.small = small;
    const config = small ? SPLITTER_CONFIG.small : SPLITTER_CONFIG.large;
    this.maxHp = config.maxHp;
    this.hp = this.maxHp;
    this.speed = config.speed;
    this.contactDamage = config.contactDamage;
    this.contactDistance = config.contactDistance;
    this.collisionRadius = config.radius;

    const points = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
      return new Phaser.Math.Vector2(
        Math.cos(angle) * config.radius,
        Math.sin(angle) * config.radius,
      );
    });
    const color = small ? 0xc56cff : 0x9f4dff;
    const glow = scene.add.circle(0, 0, config.radius + 7, color, 0.15)
      .setBlendMode(Phaser.BlendModes.ADD);
    // AI 스프라이트가 있으면 사용한다. 대/소가 같은 클래스라 텍스처도 크기별로 가른다.
    // 무채색이라 타입 색을 틴트로 입히고, 알파를 딴 이미지라 일반 블렌딩으로 그린다.
    const spriteKey = small ? 'enemy-small-splitter' : 'enemy-splitter';
    this.body = scene.textures.exists(spriteKey)
      ? scene.add.image(0, 0, spriteKey)
        .setDisplaySize(config.radius * 2.3, config.radius * 2.3)
        .setTint(color)
      : scene.add.polygon(0, 0, points, color)
        // 점 좌표가 (0, 0)을 중심으로 하므로 Polygon의 표시·회전 원점도 맞춘다.
        .setDisplayOrigin(0, 0)
        .setStrokeStyle(2, 0xe0b3ff, 0.9);
    const barWidth = small ? 26 : 36;
    const barY = -(config.radius + 10);
    const healthBack = scene.add.rectangle(-barWidth / 2, barY, barWidth, 4, 0x24102f, 0.9)
      .setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(-barWidth / 2, barY, barWidth, 4, 0x72f1b8, 1)
      .setOrigin(0, 0.5);

    this.view = scene.add.container(x, y, [glow, this.body, healthBack, this.healthFill]);
  }

  get kind(): 'splitter' | 'small-splitter' {
    return this.small ? 'small-splitter' : 'splitter';
  }

  get canSplit(): boolean {
    return !this.small;
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
    const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
    if (direction.lengthSq() === 0) return [];

    direction.normalize();
    const moveScale = safeMovementMultiplier(movementMultiplier);
    this.view.x += direction.x * this.speed * deltaSeconds * moveScale;
    this.view.y += direction.y * this.speed * deltaSeconds * moveScale;
    this.body.rotation += (this.small ? 1.8 : 0.9) * deltaSeconds;
    return [];
  }

  startContactDamageCooldown(): void {
    this.contactDamageCooldownRemaining = SPLITTER_CONFIG.contactDamageCooldownSeconds;
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

function safeMovementMultiplier(multiplier: number): number {
  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}
