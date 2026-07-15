import Phaser from 'phaser';
import type { SpellElement } from '../../spell/types';
import { ELEMENT_PALETTES } from '../../render/palette';
import { SUMMON_CONFIG } from './summonConfig';
import { SummonCombatState } from './summonCombatState';

/** Phase 2 축소 소환체: 플레이어 주변을 돌며 자동 공격 요청을 만드는 마법 구체. */
export class SummonedOrb {
  readonly view: Phaser.GameObjects.Container;
  readonly element: SpellElement;
  readonly state: SummonCombatState;

  private orbitAngle = -Math.PI / 2;

  constructor(
    scene: Phaser.Scene,
    playerX: number,
    playerY: number,
    element: SpellElement,
    power: number,
  ) {
    this.element = element;
    this.state = new SummonCombatState(power);
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

  updatePosition(playerX: number, playerY: number, deltaSeconds: number): void {
    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.orbitAngle += SUMMON_CONFIG.orbitAngularSpeed * delta;
    this.view.setPosition(
      playerX + Math.cos(this.orbitAngle) * SUMMON_CONFIG.orbitRadius,
      playerY + Math.sin(this.orbitAngle) * SUMMON_CONFIG.orbitRadius,
    );
  }

  destroy(): void {
    this.view.destroy(true);
  }
}
