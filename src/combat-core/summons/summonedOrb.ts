import Phaser from 'phaser';
import type { SpellElement } from '../../spell/types';
import { ELEMENT_PALETTES } from '../../render/palette';
import { SUMMON_CONFIG } from './summonConfig';
import { SummonCombatState } from './summonCombatState';
import type { SummonBehavior } from '../../spell/summonBehavior';
import { SummonBehaviorRunner } from './behaviorRunner';

/** Phase 2 축소 소환체: 플레이어 주변을 돌며 자동 공격 요청을 만드는 마법 구체. */
export class SummonedOrb {
  readonly view: Phaser.GameObjects.Container;
  readonly element: SpellElement;
  readonly state: SummonCombatState;

  private orbitAngle = -Math.PI / 2;
  private readonly stationary: boolean;
  private readonly orbitRadius: number;
  /** L3 행동 프로그램 실행기 (없으면 기본 궤도/고정) */
  private behaviorRunner: SummonBehaviorRunner | null = null;

  constructor(
    scene: Phaser.Scene,
    playerX: number,
    playerY: number,
    element: SpellElement,
    power: number,
    options: {
      orbitOffset?: number;
      stationary?: boolean;
      orbitRadius?: number;
      damageScale?: number;
      attackIntervalScale?: number;
      /** L3(#101): LLM이 설계한 행동 프로그램 — 있으면 기본 궤도/고정 대신 이걸 실행 */
      behavior?: SummonBehavior;
    } = {},
  ) {
    this.element = element;
    this.state = new SummonCombatState(power, options.damageScale, options.attackIntervalScale);
    this.stationary = options.stationary ?? false;
    this.orbitRadius = options.orbitRadius ?? SUMMON_CONFIG.orbitRadius;
    this.orbitAngle = -Math.PI / 2 + (options.orbitOffset ?? 0);
    this.behaviorRunner = options.behavior ? new SummonBehaviorRunner(options.behavior) : null;
    const palette = ELEMENT_PALETTES[element];
    const ring = scene.add.circle(0, 0, 14, palette.glow, 0.12)
      .setStrokeStyle(2, palette.accent, 0.85)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = scene.add.circle(0, 0, 10, palette.glow, 0.3)
      .setBlendMode(Phaser.BlendModes.ADD);
    const core = scene.add.circle(0, 0, 5, palette.core, 0.95)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.view = scene.add.container(playerX, playerY, [ring, halo, core]);
    this.updatePosition(playerX, playerY, 0);
  }

  get x(): number {
    return this.view.x;
  }

  get y(): number {
    return this.view.y;
  }

  updatePosition(
    playerX: number,
    playerY: number,
    deltaSeconds: number,
    targetX?: number,
    targetY?: number,
  ): void {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    // L3: 행동 프로그램이 있으면 그것이 이동을 소유한다 (기본 궤도/고정 무시)
    if (this.behaviorRunner) {
      const next = this.behaviorRunner.advance(
        delta,
        { x: this.view.x, y: this.view.y },
        { x: playerX, y: playerY },
        targetX !== undefined && targetY !== undefined ? { x: targetX, y: targetY } : null,
      );
      this.view.setPosition(next.x, next.y);
      return;
    }
    if (this.stationary) return; // 포탑 — 시전 위치 고정
    this.orbitAngle += SUMMON_CONFIG.orbitAngularSpeed * delta;
    this.view.setPosition(
      playerX + Math.cos(this.orbitAngle) * this.orbitRadius,
      playerY + Math.sin(this.orbitAngle) * this.orbitRadius,
    );
  }

  destroy(): void {
    this.view.destroy(true);
  }
}
