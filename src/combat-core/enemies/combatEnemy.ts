/** R1 전투 코어의 공통 적 계약. */
import type Phaser from 'phaser';
import type { EliteModifier } from '../../run/runContract';

export type EnemyKind =
  | 'chaser'
  | 'shooter'
  | 'splitter'
  | 'small-splitter'
  | 'shield-sentinel'
  | 'boss';

export interface EnemyShotRequest {
  x: number;
  y: number;
  angle: number;
  speedMultiplier?: number;
}

export interface EnemyDestroyOptions {
  /** 방 전환·재시작 정리에서는 처치 연출 없이 즉시 뷰를 제거한다. */
  animate?: boolean;
}

export interface CombatEnemy {
  readonly kind: EnemyKind;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number;
  readonly contactDamage: number;
  readonly contactDistance: number;
  readonly collisionRadius: number;
  readonly eliteModifier?: EliteModifier;

  hp: number;
  alive: boolean;

  readonly x: number;
  readonly y: number;
  readonly canDealContactDamage: boolean;

  update(
    deltaSeconds: number,
    targetX: number,
    targetY: number,
    movementMultiplier?: number,
  ): EnemyShotRequest[];
  startContactDamageCooldown(): void;
  takeDamage(amount: number): boolean;
  destroy(options?: EnemyDestroyOptions): void;
}
