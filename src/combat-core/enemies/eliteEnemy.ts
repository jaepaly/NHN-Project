import Phaser from 'phaser';
import type { EliteModifier } from '../../run/runContract';
import type { CombatEnemy, EnemyKind, EnemyShotRequest } from './combatEnemy';

const ELITE_CONFIG = {
  swiftRateMultiplier: 1.3,
  swiftTrailIntervalSeconds: 0.11,
  guardShieldRatio: 0.4,
  guardRecoverySeconds: 4,
} as const;

/** 기존 적 행동을 보존하면서 런 단위 엘리트 속성 하나만 합성한다. */
export class EliteEnemy implements CombatEnemy {
  readonly eliteModifier: EliteModifier;
  readonly kind: EnemyKind;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number;
  readonly contactDamage: number;
  readonly contactDistance: number;
  readonly collisionRadius: number;
  private guardShield = 0;
  private guardRecoveryRemaining = 0;
  private swiftTrailCooldown = 0;
  private readonly marker: Phaser.GameObjects.Arc;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly inner: CombatEnemy,
    modifier: EliteModifier,
  ) {
    this.eliteModifier = modifier;
    this.kind = inner.kind;
    this.view = inner.view;
    this.maxHp = inner.maxHp;
    this.contactDamage = inner.contactDamage;
    this.contactDistance = inner.contactDistance;
    this.collisionRadius = inner.collisionRadius;
    this.guardShield = modifier === 'guard' ? this.guardShieldMax : 0;

    const colors: Record<EliteModifier, number> = {
      swift: 0xffd166,
      guard: 0x66d9ff,
      unstable: 0xff5370,
    };
    this.marker = scene.add.circle(0, 0, inner.collisionRadius + 9, colors[modifier], 0.08)
      .setStrokeStyle(3, colors[modifier], 0.9);
    this.view.addAt(this.marker, 0);
  }

  get hp(): number { return this.inner.hp; }
  set hp(value: number) { this.inner.hp = value; }
  get alive(): boolean { return this.inner.alive; }
  set alive(value: boolean) { this.inner.alive = value; }
  get x(): number { return this.inner.x; }
  get y(): number { return this.inner.y; }
  get canDealContactDamage(): boolean { return this.inner.canDealContactDamage; }
  get baseEnemy(): CombatEnemy { return this.inner; }
  private get guardShieldMax(): number { return this.inner.maxHp * ELITE_CONFIG.guardShieldRatio; }

  update(
    deltaSeconds: number,
    targetX: number,
    targetY: number,
    movementMultiplier = 1,
  ): EnemyShotRequest[] {
    if (this.eliteModifier === 'guard') this.updateGuard(deltaSeconds);
    if (this.eliteModifier === 'swift') {
      this.updateSwiftTrail(deltaSeconds);
      return this.inner.update(
        deltaSeconds * ELITE_CONFIG.swiftRateMultiplier,
        targetX,
        targetY,
        movementMultiplier,
      );
    }
    return this.inner.update(deltaSeconds, targetX, targetY, movementMultiplier);
  }

  startContactDamageCooldown(): void { this.inner.startContactDamageCooldown(); }

  takeDamage(amount: number): boolean {
    let damage = Math.max(0, amount);
    if (this.eliteModifier === 'guard' && this.guardShield > 0) {
      const absorbed = Math.min(this.guardShield, damage);
      this.guardShield -= absorbed;
      damage -= absorbed;
      this.marker.setAlpha(0.2 + 0.8 * (this.guardShield / this.guardShieldMax));
      if (this.guardShield <= 0) {
        this.guardRecoveryRemaining = ELITE_CONFIG.guardRecoverySeconds;
        this.marker.setAlpha(0.12);
      }
    }
    return this.inner.takeDamage(damage);
  }

  destroy(): void { this.inner.destroy(); }

  private updateGuard(deltaSeconds: number): void {
    if (this.guardShield > 0 || this.guardRecoveryRemaining <= 0) return;
    this.guardRecoveryRemaining = Math.max(0, this.guardRecoveryRemaining - deltaSeconds);
    if (this.guardRecoveryRemaining > 0) return;
    this.guardShield = this.guardShieldMax;
    this.marker.setAlpha(1);
  }

  private updateSwiftTrail(deltaSeconds: number): void {
    this.swiftTrailCooldown -= deltaSeconds;
    if (this.swiftTrailCooldown > 0) return;
    this.swiftTrailCooldown = ELITE_CONFIG.swiftTrailIntervalSeconds;
    const trail = this.scene.add.circle(
      this.x,
      this.y,
      this.collisionRadius + 4,
      0xffd166,
      0.2,
    ).setStrokeStyle(2, 0xffe5a3, 0.5);
    this.scene.tweens.add({
      targets: trail,
      alpha: 0,
      scale: 1.35,
      duration: 260,
      onComplete: () => trail.destroy(),
    });
  }
}
