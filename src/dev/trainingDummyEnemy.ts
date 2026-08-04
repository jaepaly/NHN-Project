import Phaser from 'phaser';
import type {
  CombatEnemy,
  EnemyDestroyOptions,
  EnemyShotRequest,
} from '../combat-core/enemies/combatEnemy';
import { PRACTICE_DUMMY_CONFIG } from './practiceMode';

/**
 * DEV 피해 연습실 전용 표적. 실제 `CombatEnemy` 계약을 그대로 소비하되 움직임·공격·
 * 처치만 막아, 본 게임의 조준·피해·상태이상·피해 숫자 경로를 우회하지 않는다.
 */
export class TrainingDummyEnemy implements CombatEnemy {
  /** 단일 대상 합주가 보스전과 같은 경로를 타고 넉백에는 밀리지 않게 한다. */
  readonly kind = 'boss' as const;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number = PRACTICE_DUMMY_CONFIG.maxHp;
  readonly contactDamage = 0;
  readonly contactDistance = 0;
  readonly collisionRadius = 25;

  hp: number = this.maxHp;
  alive = true;

  private readonly core: Phaser.GameObjects.Arc;
  private readonly healthFill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const outer = scene.add.circle(0, 0, 28, 0x132238, 0.92)
      .setStrokeStyle(3, 0x8fe3c8, 0.82);
    const ring = scene.add.circle(0, 0, 20, 0x233b58, 0.62)
      .setStrokeStyle(2, 0xc7f9e0, 0.7);
    this.core = scene.add.circle(0, 0, 10, 0x8fe3c8, 0.9)
      .setStrokeStyle(2, 0xffffff, 0.75)
      .setBlendMode(Phaser.BlendModes.ADD);
    const healthBack = scene.add.rectangle(-36, -42, 72, 6, 0x101724, 0.95)
      .setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(-36, -42, 72, 6, 0x8fe3c8, 1)
      .setOrigin(0, 0.5);
    const label = scene.add.text(0, 42, '연습 허수아비', {
      fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
      fontSize: '13px',
      color: '#c7f9e0',
      stroke: '#05060f',
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.view = scene.add.container(x, y, [outer, ring, this.core, healthBack, this.healthFill, label]);
  }

  get x(): number { return this.view.x; }
  get y(): number { return this.view.y; }
  get canDealContactDamage(): boolean { return false; }

  update(deltaSeconds: number, _targetX: number, _targetY: number): EnemyShotRequest[] {
    if (!this.alive) return [];
    const recovery = PRACTICE_DUMMY_CONFIG.regenerationPerSecond * Math.max(0, deltaSeconds);
    this.hp = Math.min(this.maxHp, this.hp + recovery);
    this.healthFill.setScale(this.hp / this.maxHp, 1);
    return [];
  }

  startContactDamageCooldown(): void {
    // 연습 표적은 공격하지 않는다.
  }

  /** 실제 피해량은 받되 HP 1 아래로 내려가지 않아 방이 끝나지 않는다. */
  takeDamage(amount: number): boolean {
    if (!this.alive) return false;
    this.hp = Math.max(1, this.hp - Math.max(0, amount));
    this.healthFill.setScale(this.hp / this.maxHp, 1);
    this.view.scene?.tweens.add({
      targets: this.core,
      alpha: 0.35,
      duration: 55,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    return false;
  }

  destroy(_options: EnemyDestroyOptions = {}): void {
    this.alive = false;
    this.view.scene?.tweens.killTweensOf(this.core);
    if (this.view.active) this.view.destroy(true);
  }
}
