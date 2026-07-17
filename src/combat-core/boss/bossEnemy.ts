/** R1 전투 코어: 최종 보스 — 대형 기하 조형물 (GDD §5). 총괄 1차 구현, 보스 PR은 이도원 리뷰. */
import Phaser from 'phaser';
import type { SpellElement } from '../../spell/types';
import type { BossCounterStrategy } from '../../spell/bossMemoryContract';
import { ELEMENT_PALETTES } from '../../render/palette';
import { BOSS_CONFIG } from './bossConfig';
import type { CombatEnemy, EnemyShotRequest } from '../enemies/combatEnemy';

export class BossEnemy implements CombatEnemy {
  readonly kind = 'boss' as const;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number = BOSS_CONFIG.maxHp;
  readonly contactDamage: number = BOSS_CONFIG.contactDamage;
  readonly contactDistance: number = BOSS_CONFIG.contactDistance;
  readonly collisionRadius: number = BOSS_CONFIG.collisionRadius;

  hp: number = this.maxHp;
  alive = true;

  private contactDamageCooldownRemaining = 0;
  private volleyCooldownRemaining: number = BOSS_CONFIG.volleyInitialDelaySeconds;
  /** 아직 발동하지 않은 하수인 소환 임계 (내림차순) */
  private pendingMinionThresholds = [...BOSS_CONFIG.minionThresholds];
  // R2 counterStrategy 적용 결과 (applyCounterStrategy)
  private speedMultiplier = 1;
  private volleyIntervalSeconds: number = BOSS_CONFIG.volleyIntervalSeconds;

  private readonly core: Phaser.GameObjects.Polygon;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly healthFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const glow = scene.add.circle(0, 0, 58, 0xb44dff, 0.14)
      .setBlendMode(Phaser.BlendModes.ADD);
    // 육각 코어 + 회전 링 — '대형 기하 조형물'
    const hexPoints: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      hexPoints.push(Math.cos(angle) * 34, Math.sin(angle) * 34);
    }
    this.core = scene.add.polygon(0, 0, hexPoints, 0x2a1245, 0.95)
      .setStrokeStyle(3, 0xb44dff, 1);
    this.ring = scene.add.circle(0, 0, 48, 0x000000, 0)
      .setStrokeStyle(2, 0xd0a8ff, 0.7)
      .setBlendMode(Phaser.BlendModes.ADD);

    const healthBack = scene.add.rectangle(-45, -66, 90, 7, 0x30121c, 0.9)
      .setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(-45, -66, 90, 7, 0xff6b86, 1)
      .setOrigin(0, 0.5);

    this.view = scene.add.container(x, y, [glow, this.ring, this.core, healthBack, this.healthFill]);
  }

  get x(): number {
    return this.view.x;
  }

  get y(): number {
    return this.view.y;
  }

  /** 기억 기반 내성 원소를 시각화 (링 색 = 내성 원소 팔레트) — GDD §4.1 "명시적 표시" */
  showResistance(element: SpellElement | null): void {
    if (!element) return;
    const pal = ELEMENT_PALETTES[element];
    this.ring.setStrokeStyle(4, pal.core, 0.95);
  }

  /** R2 카운터 전략 적용 — rush: 돌진 가속 / ranged: 볼리 강화 (GDD §4.1 카운터 패턴) */
  applyCounterStrategy(strategy: BossCounterStrategy): void {
    if (strategy === 'rush') {
      this.speedMultiplier = BOSS_CONFIG.rushSpeedMultiplier;
    } else {
      this.volleyIntervalSeconds =
        BOSS_CONFIG.volleyIntervalSeconds * BOSS_CONFIG.rangedVolleyIntervalMultiplier;
    }
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
    this.ring.rotation += 0.9 * deltaSeconds;
    this.core.rotation -= 0.25 * deltaSeconds;

    // 저속 추격
    const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
    if (direction.lengthSq() > 0) {
      direction.normalize();
      const moveScale = safeMovementMultiplier(movementMultiplier);
      const speed = BOSS_CONFIG.speed * this.speedMultiplier;
      this.view.x += direction.x * speed * deltaSeconds * moveScale;
      this.view.y += direction.y * speed * deltaSeconds * moveScale;
    }

    // 방사 볼리 패턴 (간격은 counterStrategy 'ranged' 시 단축)
    this.volleyCooldownRemaining -= deltaSeconds;
    if (this.volleyCooldownRemaining > 0) return [];
    this.volleyCooldownRemaining = this.volleyIntervalSeconds;

    const shots: EnemyShotRequest[] = [];
    const offset = Math.random() * Math.PI * 2;
    for (let i = 0; i < BOSS_CONFIG.volleyProjectiles; i++) {
      const angle = offset + (Math.PI * 2 * i) / BOSS_CONFIG.volleyProjectiles;
      shots.push({ x: this.x, y: this.y, angle });
    }
    return shots;
  }

  get canDealContactDamage(): boolean {
    return this.alive && this.contactDamageCooldownRemaining <= 0;
  }

  startContactDamageCooldown(): void {
    this.contactDamageCooldownRemaining = BOSS_CONFIG.contactDamageCooldownSeconds;
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

  /** HP 임계를 갓 통과했으면 true를 1회 반환 — 씬이 하수인 소환에 사용 */
  consumeMinionTrigger(): boolean {
    const ratio = this.hp / this.maxHp;
    if (this.pendingMinionThresholds.length === 0) return false;
    if (ratio > this.pendingMinionThresholds[0]) return false;
    this.pendingMinionThresholds.shift();
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
