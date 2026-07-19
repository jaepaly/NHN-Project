import Phaser from 'phaser';
import type { SpellJudge } from '../spell/judge';
import { createJudge } from '../spell/createJudge';
import type { SpellElement, SpellSpec } from '../spell/types';
import { SpellHistory } from '../spell/spellHistory';
import type { JudgeSource } from '../spell/spellHistory';
import { castSpell, ensureParticleTexture } from '../render/spellRenderer';
import type { SpellImpact } from '../render/spellRenderer';
import type { RunController } from '../run/runContract';
import {
  ELEMENT_LABELS,
  ELEMENT_PALETTES,
  SIZE_SCALE,
  paletteColorToCss,
} from '../render/palette';
import {
  backdropPaletteForRoom,
  ROOM_BACKDROP_PALETTES,
} from '../render/roomBackdropConfig';
import type { RoomBackdropPalette } from '../render/roomBackdropConfig';
import { PlayerCombatState } from '../combat-core/player/playerCombatState';
import { ChaserEnemy } from '../combat-core/enemies/chaserEnemy';
import { ShooterEnemy } from '../combat-core/enemies/shooterEnemy';
import { SplitterEnemy } from '../combat-core/enemies/splitterEnemy';
import type {
  CombatEnemy,
  EnemyKind,
  EnemyShotRequest,
} from '../combat-core/enemies/combatEnemy';
import {
  BASIC_ATTACK_CONFIG,
  SPELL_DAMAGE_CONFIG,
  SHOOTER_CONFIG,
  SPLITTER_CONFIG,
  spellBuffManaFromPower,
  spellHealFromPower,
  spellImpactDamageFromPower,
  spellPowerWithAffinity,
  spellShieldFromPower,
} from '../combat-core/combat/combatConfig';
import { firstBoltCollision } from '../combat-core/combat/boltCollision';
import type { BoltCollision } from '../combat-core/combat/boltCollision';
import {
  CAGE_CONFIG,
  lockedPointTargetForForm,
  selectChainTargets,
} from '../combat-core/combat/advancedFormConfig';
import {
  RAIN_CONFIG,
  ZONE_CONFIG,
  densestAreaTarget,
  densestDirectionalTarget,
} from '../combat-core/combat/areaSpellConfig';
import {
  WAVE_CONFIG,
  WaveManager,
} from '../combat-core/waves/waveManager';
import type { WaveDefinition } from '../combat-core/waves/waveManager';
import { CombatRunController } from '../combat-core/run/runController';
import { drawRewardOptions } from '../combat-core/run/rewardConfig';
import { EngraveManager } from '../combat-core/engrave/engraveManager';
import { SpiritManager } from '../combat-core/spirit/spiritManager';
import { SpiritOrbView } from '../combat-core/spirit/spiritOrbView';
import { BossEnemy } from '../combat-core/boss/bossEnemy';
import { BOSS_CONFIG } from '../combat-core/boss/bossConfig';
import {
  computeResistance,
  getBossLine,
  loadRunMemory,
  longTermResistedElement,
  saveRunMemory,
  summarizeRun,
  updateRunMemory,
} from '../spell/bossMemoryContract';
import type { BossResistanceProfile } from '../spell/bossMemoryContract';
import { showRunSummaryOverlay } from '../ui/runSummaryOverlay';
import { CONTROL_CONFIG } from '../combat-core/control/controlConfig';
import { EnemyControlState } from '../combat-core/control/enemyControlState';
import { SUMMON_CONFIG } from '../combat-core/summons/summonConfig';
import { SummonedOrb } from '../combat-core/summons/summonedOrb';
import { GameAudio } from '../audio/gameAudio';

// 임시값: 카메라 방식과 방 크기를 최종 확정한 뒤 조정한다.
const WORLD_SIZE_MULTIPLIER = 2;
/** 무내성 기본값 — R2 계약(BossResistanceProfile) 형태 유지 */
const NO_BOSS_RESISTANCE: BossResistanceProfile = {
  resistedElement: null,
  resistMultiplier: 1,
  counterStrategy: null,
};
const HUD = {
  x: 18,
  y: 18,
  width: 360,
  height: 186,
  barX: 34,
  barWidth: 270,
  barHeight: 7,
} as const;

interface FriendlyMissile {
  body: Phaser.GameObjects.Arc;
  halo: Phaser.GameObjects.Arc;
  target: CombatEnemy;
  damage: number;
  element?: SpellElement;
  speed: number;
  hitDistance: number;
}

/** 씬 보상 추첨과 각인 카드 치환이 한 런에서 재현 가능한 순서를 공유한다. */
function createRunRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

interface EnemyProjectile {
  body: Phaser.GameObjects.Arc;
  halo: Phaser.GameObjects.Arc;
  velocity: Phaser.Math.Vector2;
  lifetimeRemaining: number;
}

/**
 * 기술검증 프로토타입 씬 — W1 목표 (SUBMISSION_PLAN W1)
 * 검증 대상: 입력 → 판정(SpellJudge) → JSON → 파츠 조합 렌더링 1사이클
 * - Enter: 영창 모드 (슬로모션 + DOM 입력 바)
 * - 더미 타겟(삼각형)이 떠다니며, bolt는 가장 가까운 타겟으로 발사
 */
export class ProtoScene extends Phaser.Scene {
  private judge: SpellJudge = createJudge();
  private player!: Phaser.GameObjects.Container;
  private playerState = new PlayerCombatState();
  private readonly spellHistory = new SpellHistory();
  private readonly engraveManager = new EngraveManager();
  private readonly spiritManager = new SpiritManager();
  private engraveRewardRand = createRunRandom(Date.now());
  private readonly combatRunController = new CombatRunController({
    playerState: this.playerState,
    rewardDraw: (roomIndex) => {
      const engraved = this.engraveManager.injectReward(
        drawRewardOptions(roomIndex, this.engraveRewardRand),
        roomIndex,
        this.engraveRewardRand,
      );
      return this.spiritManager.injectReward(
        engraved,
        roomIndex,
        this.engraveRewardRand,
      );
    },
  });
  private moveKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private worldBounds = new Phaser.Geom.Rectangle();
  private enemies: CombatEnemy[] = [];
  /** 화면 중앙에 떠 있는 시스템 메시지들 — 세로 스택으로 겹침 방지 */
  private activeAnnouncements: Phaser.GameObjects.Text[] = [];
  private enemyProjectiles: EnemyProjectile[] = [];
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private attunementText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private spiritHudText!: Phaser.GameObjects.Text;
  private waveManager = new WaveManager();
  private incantWrap!: HTMLElement;
  private incantBar!: HTMLInputElement;
  private incantState!: HTMLElement;
  private incantCount!: HTMLElement;
  private incantHint!: HTMLElement;
  private incantChargeLabel!: HTMLElement;
  private incanting = false;
  private casting = false;
  private timeScale = 1;
  private basicAttackCooldownRemaining = 0;
  private friendlyMissiles: FriendlyMissile[] = [];
  private activeSummon: SummonedOrb | null = null;
  private readonly spiritViews = new Map<string, SpiritOrbView>();
  private spiritOrbitAngle = -Math.PI / 2;
  private readonly enemyControlState = new EnemyControlState();
  private readonly controlIndicators = new Map<CombatEnemy, Phaser.GameObjects.Arc>();
  /** 보스방 진입 시 주문 히스토리로 계산 — R2 내성 모듈이 오면 계산부만 교체 */
  private bossResistance: BossResistanceProfile = { ...NO_BOSS_RESISTANCE };
  private lastResistNoticeAt = 0;
  private deathHandled = false;
  private audio!: GameAudio;
  private backdropBase!: Phaser.GameObjects.Rectangle;
  private backdropGrid!: Phaser.GameObjects.Graphics;
  private backdropColor: number = ROOM_BACKDROP_PALETTES.stage1.base;

  constructor() {
    super('proto');
  }

  /** R3는 구체 전투 구현이 아니라 PR #12의 공개 계약만 소비한다. */
  get runController(): RunController {
    return this.combatRunController;
  }

  preload(): void {
    GameAudio.preload(this);
  }

  create(): void {
    const { width, height } = this.scale;
    this.worldBounds.setTo(
      0,
      0,
      width * WORLD_SIZE_MULTIPLIER,
      height * WORLD_SIZE_MULTIPLIER,
    );
    const startX = this.worldBounds.centerX;
    const startY = this.worldBounds.centerY;
    ensureParticleTexture(this);
    this.audio = new GameAudio(this);
    this.audio.playBgm();

    this.drawBackdrop(this.worldBounds.width, this.worldBounds.height);
    this.createPlayer(startX, startY);
    this.cameras.main
      .setBounds(
        this.worldBounds.x,
        this.worldBounds.y,
        this.worldBounds.width,
        this.worldBounds.height,
      )
      .startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.centerOn(startX, startY);
    this.moveKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.createHud(width, height);
    this.setupRunFlow();
    this.startRoom(1);
    this.updateStatusText();

    this.setupIncantBar();
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (!this.incanting && !this.casting) this.tryOpenIncant();
    });
  }

  override update(_time: number, delta: number): void {
    this.checkPlayerDeath();
    if (this.isCombatActive()) {
      // 슬로모션: timeScale을 개체 이동에 직접 곱한다 (프로토 방식)
      const d = (delta / 1000) * this.timeScale;
      this.playerState.update(d);
      this.basicAttackCooldownRemaining = Math.max(0, this.basicAttackCooldownRemaining - d);
      this.updatePlayerMovement(delta / 1000);
      this.updateEnemyControls(d);
      this.updateEnemies(d);
      this.updateEnemyProjectiles(d);
      this.updateBasicAttack();
      this.updateEngravedSpells(d);
      this.updateSpirits(d);
      this.updateSummon(d);
      this.updateFriendlyMissiles(d);
      this.updateWaveFlow(d);
    }
    this.updateStatusText();
  }

  private isCombatActive(): boolean {
    return this.combatRunController.state.phase === 'combat';
  }

  private setupRunFlow(): void {
    this.combatRunController.on('room-cleared', (options, state) => {
      this.audio.playSfx('room-clear');
      this.deferTransientCombatCleanup();
      this.stopCastingForRunPause();
      this.announceSystemMessage(`방 ${state.roomIndex} 클리어`, '#72f1b8');
      console.info('[Run] reward-ready', options, state);
    });
    this.combatRunController.on('reward-applied', (chosen, state) => {
      this.audio.playSfx('reward-select');
      const engraved = this.engraveManager.applyReward(chosen);
      const spirit = this.spiritManager.applyReward(chosen);
      if (spirit) this.syncSpiritViews();
      const message = engraved
        ? `${engraved.spell.name} · 각인 Lv${engraved.level}`
        : spirit
          ? `${this.spiritName(spirit.role, spirit.element)} · 정령 Lv${spirit.level}`
        : chosen.title;
      this.announceSystemMessage(message, '#ffd166');
      console.info('[Run] reward-applied', chosen, state);
    });
    this.combatRunController.on('room-transition', (state, durationMs) => {
      console.info('[Run] room-transition', { state, durationMs });
    });
    this.combatRunController.on('room-started', (state) => {
      this.startRoom(state.roomIndex);
      console.info('[Run] room-started', state);
    });
    this.combatRunController.on('run-completed', (state) => {
      this.deferTransientCombatCleanup();
      this.stopCastingForRunPause();
      console.info('[Run] completed', state);
      // 플레이어 사망이 먼저 확정된 동시 확정 레이스(사망 후 장판 틱이 보스 처치 등)
      // — 패배가 선점: 기억 저장·승리 연출 모두 생략해 한 런에 lose/win 이중 기록을 막는다
      if (this.deathHandled) return;
      this.announceSystemMessage('런 완료', '#72f1b8');
      this.persistRunMemory('win');
      // RUN COMPLETE 전환 연출(runUiBinding)이 걷힌 뒤 런 요약 → Enter로 새 런
      this.time.delayedCall(1400, () => {
        void showRunSummaryOverlay(this.buildRunSummary('victory'))
          .then(() => this.restartRun());
      });
    });
  }

  /** 사망은 1회만 처리 — 요약 오버레이 → Enter로 새 런 (GDD §2 사망 흐름) */
  private checkPlayerDeath(): void {
    if (this.playerState.alive || this.deathHandled) return;
    // 보스가 먼저 죽어 런이 완주된 뒤의 사망(지연 판정 등)은 승리가 선점 — 패배 처리 안 함
    if (this.combatRunController.state.phase === 'run-over') return;
    this.deathHandled = true;
    this.persistRunMemory('lose');
    this.stopCastingForRunPause();
    this.deferTransientCombatCleanup();
    this.time.delayedCall(900, () => {
      void showRunSummaryOverlay(this.buildRunSummary('defeat'))
        .then(() => this.restartRun());
    });
  }

  private buildRunSummary(result: 'victory' | 'defeat') {
    const memory = this.spellHistory.bossMemory();
    const runState = this.combatRunController.state;
    return {
      result,
      roomIndex: runState.roomIndex,
      maxRooms: runState.maxRooms,
      totalCasts: memory.totalCasts,
      dominantElementLabel: memory.dominantElement
        ? ELEMENT_LABELS[memory.dominantElement]
        : null,
      recentSpellNames: memory.recentSpellNames,
    };
  }

  /** 런 간 기억 저장 (GDD §4.2) — 요약은 리셋 전 히스토리 기준, 다음 런 보스가 소비 */
  private persistRunMemory(result: 'win' | 'lose'): void {
    saveRunMemory(updateRunMemory(loadRunMemory(), summarizeRun(this.spellHistory, result)));
  }

  /** 새 런 — 씬 재시작 없이 상태만 초기화. 컨트롤러 reset이 room-started를 발화해 방 1부터 재개된다. */
  private restartRun(): void {
    this.deathHandled = false;
    this.bossResistance = { ...NO_BOSS_RESISTANCE };
    this.lastResistNoticeAt = 0;
    this.spellHistory.reset();
    this.engraveManager.reset();
    this.spiritManager.reset();
    this.clearSpiritViews();
    this.spiritOrbitAngle = -Math.PI / 2;
    this.engraveRewardRand = createRunRandom(Date.now());
    this.playerState.reset();
    this.combatRunController.reset();
  }

  private startRoom(roomIndex: number): void {
    this.clearCombatRoom();
    this.applyRoomBackdrop(roomIndex);
    this.waveManager = new WaveManager();
    this.basicAttackCooldownRemaining = 0;
    this.player.setPosition(this.worldBounds.centerX, this.worldBounds.centerY);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    if (this.isBossRoom(roomIndex)) {
      this.startBossRoom();
      return;
    }
    this.audio.playBgm('combat');
    this.spawnWave(this.waveManager.start());
    this.announceSystemMessage(`방 ${roomIndex}`, '#8fa4ff');
  }

  /** 마지막 방 = 보스방 관례 (rewardConfig.maxRooms 참조) */
  private isBossRoom(roomIndex: number): boolean {
    return roomIndex >= this.combatRunController.state.maxRooms;
  }

  private startBossRoom(): void {
    const bossRoomIndex = this.combatRunController.state.roomIndex;
    this.audio.playBgm('boss');
    // 단기(이번 런) 적응 — R2 내성 계약 소비 (GDD §4.1)
    this.bossResistance = computeResistance(this.spellHistory.bossMemory());
    const runMemory = loadRunMemory();
    // 장기(지난 런들) 기억 — 단기 표본 부족 시 부분 내성으로 발동 (GDD §4.2)
    if (!this.bossResistance.resistedElement) {
      const longTerm = longTermResistedElement(runMemory);
      if (longTerm) {
        this.bossResistance = {
          resistedElement: longTerm,
          resistMultiplier: BOSS_CONFIG.longTermResistMultiplier,
          counterStrategy: this.bossResistance.counterStrategy,
        };
      }
    }

    const boss = new BossEnemy(
      this,
      this.player.x,
      this.player.y - 340,
    );
    const isCurrentBossRoom = (): boolean => {
      const state = this.combatRunController.state;
      return state.phase === 'combat'
        && state.roomIndex === bossRoomIndex
        && boss.alive
        && this.enemies.includes(boss);
    };
    boss.showResistance(this.bossResistance.resistedElement);
    if (this.bossResistance.counterStrategy) {
      boss.applyCounterStrategy(this.bossResistance.counterStrategy);
    }
    this.enemies.push(boss);
    this.audio.playSfx('boss-appear');

    this.announceSystemMessage('보스의 방', '#ff6b86');
    // 오프닝 대사 — R2 /boss-line (프록시 생성 우선, 템플릿 폴백 내장)
    void getBossLine(runMemory).then((line) => {
      if (!isCurrentBossRoom()) return;
      this.time.delayedCall(500, () => {
        if (!isCurrentBossRoom()) return;
        this.announceSystemMessage(`"${line.text}"`, '#d0a8ff', 2800);
      });
    });
    if (this.bossResistance.resistedElement) {
      const resisted = this.bossResistance.resistedElement;
      const label = ELEMENT_LABELS[resisted];
      this.time.delayedCall(1500, () => {
        if (!isCurrentBossRoom()) return;
        this.announceSystemMessage(
          `보스가 ${label}에 대비했다 — ${label} 피해 대폭 감소`,
          paletteColorToCss(ELEMENT_PALETTES[resisted].core),
          2800,
        );
      });
    }
  }

  private clearCombatRoom(): void {
    this.clearEnemyControls();
    for (const enemy of this.enemies) enemy.destroy();
    this.enemies = [];
    this.clearTransientCombatObjects();
  }

  private clearTransientCombatObjects(): void {
    this.clearEnemyProjectiles();
    this.clearFriendlyMissiles();
    this.clearSummon();
  }

  /** 투사체 update 순회가 끝난 다음 tick에 안전하게 일괄 제거한다. */
  private deferTransientCombatCleanup(): void {
    this.time.delayedCall(0, () => this.clearTransientCombatObjects());
  }

  private stopCastingForRunPause(): void {
    if (this.incanting) this.closeIncant();
    if (this.casting) this.finishCastingUx();
  }

  private createHud(width: number, height: number): void {
    this.hudGraphics = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(99);

    this.statusText = this.add.text(34, 29, 'READY', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#72f1b8',
    }).setScrollFactor(0).setDepth(100);
    this.hpText = this.add.text(34, 54, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#ff91ad',
    }).setScrollFactor(0).setDepth(100);
    this.manaText = this.add.text(34, 88, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#91b7ff',
    }).setScrollFactor(0).setDepth(100);
    this.shieldText = this.add.text(34, 122, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#72d8ff',
    }).setScrollFactor(0).setDepth(100);
    this.attunementText = this.add.text(34, 160, 'ARCANE // UNBOUND', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#8fa4ff',
    }).setScrollFactor(0).setDepth(100);

    this.waveText = this.add.text(width - 34, 29, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#72f1b8',
      align: 'right',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

    this.spiritHudText = this.add.text(width - 34, 59, 'SPIRIT 0/2', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#8fa4ff',
      align: 'right',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

    this.add.text(20, height - 28, 'WASD 이동  ·  ENTER 영창', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#59679d',
    }).setScrollFactor(0).setDepth(100);
  }

  private updatePlayerMovement(deltaSeconds: number): void {
    if (this.incanting || this.casting || !this.playerState.alive) return;

    const direction = new Phaser.Math.Vector2(
      Number(this.moveKeys.right.isDown) - Number(this.moveKeys.left.isDown),
      Number(this.moveKeys.down.isDown) - Number(this.moveKeys.up.isDown),
    );
    if (direction.lengthSq() === 0) return;

    const speed = 220;
    direction.normalize().scale(speed * deltaSeconds);
    this.player.x = Phaser.Math.Clamp(
      this.player.x + direction.x,
      this.worldBounds.left + 22,
      this.worldBounds.right - 22,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + direction.y,
      this.worldBounds.top + 22,
      this.worldBounds.bottom - 22,
    );
  }

  // ── 배경: 방 진행에 따라 색조가 바뀌는 네온 그리드 ──────────
  private drawBackdrop(width: number, height: number): void {
    const initial = ROOM_BACKDROP_PALETTES.stage1;
    this.backdropBase = this.add.rectangle(
      width / 2,
      height / 2,
      width,
      height,
      initial.base,
    ).setDepth(-100);

    this.backdropGrid = this.add.graphics().setDepth(-99);
    this.redrawBackdropDetails(initial);
  }

  private applyRoomBackdrop(roomIndex: number): void {
    const palette = backdropPaletteForRoom(
      roomIndex,
      this.combatRunController.state.maxRooms,
    );
    const from = Phaser.Display.Color.IntegerToColor(this.backdropColor);
    const to = Phaser.Display.Color.IntegerToColor(palette.base);
    this.tweens.addCounter({
      from: 0,
      to: 100,
      duration: 700,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => {
        const mixed = Phaser.Display.Color.Interpolate.ColorWithColor(
          from,
          to,
          100,
          tween.getValue() ?? 100,
        );
        this.backdropBase.setFillStyle(Phaser.Display.Color.GetColor(mixed.r, mixed.g, mixed.b));
      },
    });
    this.redrawBackdropDetails(palette);
    this.backdropColor = palette.base;
  }

  private redrawBackdropDetails(palette: RoomBackdropPalette): void {
    const { width, height } = this.worldBounds;
    this.backdropGrid.clear().lineStyle(1, palette.grid, palette.gridAlpha);
    for (let x = 0; x <= width; x += 48) this.backdropGrid.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += 48) this.backdropGrid.lineBetween(0, y, width, y);
  }

  private createPlayer(x: number, y: number): void {
    const magicCircle = this.add.graphics();
    magicCircle.lineStyle(2, 0x4c66ff, 0.25);
    magicCircle.strokeCircle(0, 0, 60);
    magicCircle.strokeCircle(0, 0, 44);
    const body = this.add.circle(0, 0, 14, 0x8fa4ff)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = this.add.circle(0, 0, 22, 0x4c66ff, 0.25)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.player = this.add.container(x, y, [magicCircle, halo, body]);
    this.tweens.add({
      targets: halo, scale: { from: 1, to: 1.25 },
      yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut',
    });
  }

  private spawnWave(definition: WaveDefinition): void {
    const sequence: EnemyKind[] = [
      ...Array<EnemyKind>(definition.chaserCount).fill('chaser'),
      ...Array<EnemyKind>(definition.shooterCount).fill('shooter'),
      ...Array<EnemyKind>(definition.splitterCount).fill('splitter'),
    ];
    sequence.forEach((kind, index) => {
      const position = this.waveSpawnPosition(index, sequence.length);
      this.spawnEnemy(kind, position.x, position.y);
    });
    this.announceSystemMessage(`웨이브 ${this.waveManager.currentWaveNumber}`);
  }

  private waveSpawnPosition(index: number, total: number): Phaser.Math.Vector2 {
    const angleOffset = this.waveManager.currentWaveNumber * (Math.PI / 7);
    const angle = angleOffset - Math.PI / 2 + (Math.PI * 2 * index) / total;
    const x = Phaser.Math.Clamp(
      this.player.x + Math.cos(angle) * WAVE_CONFIG.spawnDistance,
      this.worldBounds.left + 80,
      this.worldBounds.right - 80,
    );
    const y = Phaser.Math.Clamp(
      this.player.y + Math.sin(angle) * WAVE_CONFIG.spawnDistance,
      this.worldBounds.top + 80,
      this.worldBounds.bottom - 80,
    );
    return new Phaser.Math.Vector2(x, y);
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number): void {
    switch (kind) {
      case 'shooter':
        this.enemies.push(new ShooterEnemy(this, x, y));
        break;
      case 'splitter':
        this.enemies.push(new SplitterEnemy(this, x, y));
        break;
      case 'small-splitter':
        this.enemies.push(new SplitterEnemy(this, x, y, true));
        break;
      case 'chaser':
      default:
        this.enemies.push(new ChaserEnemy(this, x, y));
        break;
    }
  }

  private updateWaveFlow(deltaSeconds: number): void {
    if (!this.playerState.alive) return;

    const nextWave = this.waveManager.update(deltaSeconds);
    if (nextWave) this.spawnWave(nextWave);
  }

  private updateEnemies(deltaSeconds: number): void {
    if (!this.playerState.alive) return;

    for (const enemy of this.enemies) {
      const shots = enemy.update(
        deltaSeconds,
        this.player.x,
        this.player.y,
        this.enemyControlState.movementMultiplierFor(enemy),
      );
      enemy.view.x = Phaser.Math.Clamp(
        enemy.view.x,
        this.worldBounds.left + 22,
        this.worldBounds.right - 22,
      );
      enemy.view.y = Phaser.Math.Clamp(
        enemy.view.y,
        this.worldBounds.top + 22,
        this.worldBounds.bottom - 22,
      );
      for (const shot of shots) this.spawnEnemyProjectile(shot);
    }

    let totalHpDamage = 0;
    let totalShieldDamage = 0;
    for (const enemy of this.enemies) {
      const touching = Phaser.Math.Distance.Between(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
      ) <= enemy.contactDistance;
      if (!touching || !enemy.canDealContactDamage) continue;

      const applied = this.playerState.takeDamage(enemy.contactDamage);
      enemy.startContactDamageCooldown();
      totalHpDamage += applied.hpDamage;
      totalShieldDamage += applied.shieldDamage;
      if (!this.playerState.alive) break;
    }
    if (totalHpDamage === 0 && totalShieldDamage === 0) return;

    this.announceIncomingDamage(totalHpDamage, totalShieldDamage);

    if (!this.playerState.alive) {
      if (this.incanting) this.closeIncant();
      this.announceSystemMessage('사망');
    }
  }

  private spawnEnemyProjectile(request: EnemyShotRequest): void {
    const body = this.add.circle(request.x, request.y, 5, 0xff6b4a)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = this.add.circle(request.x, request.y, 9, 0xff9a62, 0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    const velocity = new Phaser.Math.Vector2(
      Math.cos(request.angle),
      Math.sin(request.angle),
    ).scale(SHOOTER_CONFIG.bulletSpeed);

    this.enemyProjectiles.push({
      body,
      halo,
      velocity,
      lifetimeRemaining: SHOOTER_CONFIG.bulletLifetimeSeconds,
    });
  }

  private updateEnemyProjectiles(deltaSeconds: number): void {
    const active: EnemyProjectile[] = [];
    let totalHpDamage = 0;
    let totalShieldDamage = 0;

    for (const projectile of this.enemyProjectiles) {
      if (!this.playerState.alive) {
        this.destroyEnemyProjectile(projectile);
        continue;
      }

      projectile.lifetimeRemaining -= deltaSeconds;
      projectile.body.x += projectile.velocity.x * deltaSeconds;
      projectile.body.y += projectile.velocity.y * deltaSeconds;
      projectile.halo.setPosition(projectile.body.x, projectile.body.y);

      const expired = projectile.lifetimeRemaining <= 0;
      const outsideWorld = !this.worldBounds.contains(projectile.body.x, projectile.body.y);
      if (expired || outsideWorld) {
        this.destroyEnemyProjectile(projectile);
        continue;
      }

      const hitPlayer = Phaser.Math.Distance.Between(
        projectile.body.x,
        projectile.body.y,
        this.player.x,
        this.player.y,
      ) <= SHOOTER_CONFIG.bulletHitDistance;
      if (hitPlayer) {
        const applied = this.playerState.takeDamage(SHOOTER_CONFIG.bulletDamage);
        totalHpDamage += applied.hpDamage;
        totalShieldDamage += applied.shieldDamage;
        this.destroyEnemyProjectile(projectile);
        continue;
      }

      active.push(projectile);
    }

    this.enemyProjectiles = active;
    if (totalHpDamage === 0 && totalShieldDamage === 0) return;

    this.announceIncomingDamage(totalHpDamage, totalShieldDamage);
    if (!this.playerState.alive) {
      if (this.incanting) this.closeIncant();
      this.clearEnemyProjectiles();
      this.announceSystemMessage('사망');
    }
  }

  private destroyEnemyProjectile(projectile: EnemyProjectile): void {
    projectile.body.destroy();
    projectile.halo.destroy();
  }

  private clearEnemyProjectiles(): void {
    for (const projectile of this.enemyProjectiles) {
      this.destroyEnemyProjectile(projectile);
    }
    this.enemyProjectiles = [];
  }

  private updateBasicAttack(): void {
    if (!this.playerState.alive || this.basicAttackCooldownRemaining > 0) return;

    const target = this.nearestEnemy(BASIC_ATTACK_CONFIG.range);
    if (!target) return;

    this.basicAttackCooldownRemaining = BASIC_ATTACK_CONFIG.intervalSeconds;
    this.fireBasicMissile(target);
  }

  private fireBasicMissile(target: CombatEnemy): void {
    const fromX = this.player.x;
    const fromY = this.player.y - 14;
    this.fireFriendlyMissile({
      fromX,
      fromY,
      target,
      damage: BASIC_ATTACK_CONFIG.damage,
      speed: BASIC_ATTACK_CONFIG.projectileSpeed,
      hitDistance: BASIC_ATTACK_CONFIG.hitDistance,
      coreColor: 0xc8d3ff,
      glowColor: 0x6b7cff,
    });
  }

  private fireFriendlyMissile(options: {
    fromX: number;
    fromY: number;
    target: CombatEnemy;
    damage: number;
    element?: SpellElement;
    speed: number;
    hitDistance: number;
    coreColor: number;
    glowColor: number;
  }): void {
    const body = this.add.circle(options.fromX, options.fromY, 5, options.coreColor)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = this.add.circle(options.fromX, options.fromY, 10, options.glowColor, 0.3)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.friendlyMissiles.push({
      body,
      halo,
      target: options.target,
      damage: options.damage,
      element: options.element,
      speed: options.speed,
      hitDistance: options.hitDistance,
    });
  }

  private updateFriendlyMissiles(deltaSeconds: number): void {
    const active: FriendlyMissile[] = [];
    for (const missile of this.friendlyMissiles) {
      if (!this.playerState.alive || !missile.target.alive) {
        this.destroyFriendlyMissile(missile);
        continue;
      }

      const direction = new Phaser.Math.Vector2(
        missile.target.x - missile.body.x,
        missile.target.y - missile.body.y,
      );
      const distance = direction.length();
      const travelDistance = missile.speed * deltaSeconds;
      if (distance <= missile.hitDistance + travelDistance) {
        this.destroyFriendlyMissile(missile);
        const damage = missile.element
          ? this.elementalDamageAgainst(missile.target, missile.element, missile.damage)
          : missile.damage;
        this.damageEnemy(missile.target, damage);
        continue;
      }

      direction.normalize().scale(travelDistance);
      missile.body.x += direction.x;
      missile.body.y += direction.y;
      missile.halo.setPosition(missile.body.x, missile.body.y);
      active.push(missile);
    }
    this.friendlyMissiles = active;
  }

  private destroyFriendlyMissile(missile: FriendlyMissile): void {
    missile.body.destroy();
    missile.halo.destroy();
  }

  private clearFriendlyMissiles(): void {
    for (const missile of this.friendlyMissiles) {
      this.destroyFriendlyMissile(missile);
    }
    this.friendlyMissiles = [];
  }

  // ── 영창 모드 (DOM 입력 바 + 슬로모션) ───────────────────────
  private setupIncantBar(): void {
    this.incantWrap = document.getElementById('incant-wrap')!;
    this.incantBar = document.getElementById('incant-bar') as HTMLInputElement;
    this.incantState = document.getElementById('incant-state')!;
    this.incantCount = document.getElementById('incant-count')!;
    this.incantHint = document.getElementById('incant-hint')!;
    this.incantChargeLabel = document.getElementById('incant-charge-label')!;

    this.incantBar.addEventListener('input', () => this.updateIncantCharge());

    this.incantBar.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 게임 키 입력과 충돌 방지
      if (e.key === 'Enter') {
        const text = this.incantBar.value.trim();
        if (!text) {
          this.closeIncant();
          return;
        }
        this.beginJudging();
        void this.castFromText(text);
      } else if (e.key === 'Escape') {
        this.closeIncant();
      }
    });
  }

  private tryOpenIncant(): void {
    if (!this.isCombatActive()) {
      this.announceSystemMessage('전투 대기');
      return;
    }
    if (!this.playerState.alive) {
      this.announceSystemMessage('행동 불가');
      return;
    }
    if (this.playerState.cooldownRemaining > 0) {
      this.announceSystemMessage(
        `쿨다운 ${this.playerState.cooldownRemaining.toFixed(1)}초`,
      );
      return;
    }
    this.openIncant();
  }

  private openIncant(): void {
    this.audio.playSfx('incant-enter');
    this.incanting = true;
    this.timeScale = 0.1; // 슬로모션
    this.input.keyboard!.disableGlobalCapture();
    this.incantWrap.classList.add('active');
    this.incantWrap.classList.remove('judging');
    this.incantWrap.setAttribute('aria-hidden', 'false');
    this.incantBar.disabled = false;
    this.incantBar.value = '';
    this.incantState.textContent = '시간 흐름 10%';
    this.incantHint.textContent = 'Enter 발동 · Esc 취소';
    this.updateIncantCharge();
    this.focusIncantBar();
  }

  /** Enter의 keyup과 캔버스 포커스 복구가 끝날 때까지 입력 포커스를 짧게 재확인한다. */
  private focusIncantBar(attempt = 0): void {
    if (!this.incanting) return;
    this.incantBar.focus({ preventScroll: true });
    if (attempt >= 7) return;
    requestAnimationFrame(() => this.focusIncantBar(attempt + 1));
  }

  private closeIncant(): void {
    this.incanting = false;
    this.timeScale = 1;
    this.input.keyboard!.enableGlobalCapture();
    this.incantWrap.classList.remove('active', 'judging');
    this.incantWrap.setAttribute('aria-hidden', 'true');
    this.incantBar.disabled = false;
    this.incantBar.blur();
  }

  private updateIncantCharge(): void {
    const length = Array.from(this.incantBar.value).length;
    const percent = Math.min(100, Math.round((length / 24) * 100));
    this.incantWrap.style.setProperty('--charge', `${percent}%`);
    this.incantCount.textContent = `${length}/60`;
    this.incantChargeLabel.textContent = length === 0
      ? '공명 대기'
      : percent < 45
        ? '문장 공명 중'
        : percent < 100
          ? '공명 상승'
          : '최대 공명';
  }

  private beginJudging(): void {
    this.incanting = false;
    this.casting = true;
    this.timeScale = 0.15;
    this.input.keyboard!.enableGlobalCapture();
    this.incantWrap.classList.add('active', 'judging');
    this.incantBar.disabled = true;
    this.incantState.textContent = '마법 해석 중';
    this.incantHint.textContent = '문장의 의미를 현실에 연결합니다';
    this.incantChargeLabel.textContent = 'SPELL JUDGING';
    this.incantBar.blur();
  }

  private finishCastingUx(): void {
    this.casting = false;
    this.timeScale = 1;
    this.input.keyboard!.enableGlobalCapture();
    this.incantWrap.classList.remove('active', 'judging');
    this.incantWrap.setAttribute('aria-hidden', 'true');
    this.incantBar.disabled = false;
  }

  // ── 판정 → 렌더링 사이클 ────────────────────────────────────
  private async castFromText(text: string): Promise<void> {
    this.casting = true;
    try {
      const judgement = await this.judge.judge(text);
      if (!this.playerState.alive || !this.isCombatActive()) {
        this.announceSystemMessage('행동 불가');
        return;
      }
      if (judgement.disposition !== 'cast') {
        this.audio.playSfx('fizzle');
        const prefix = judgement.disposition === 'fizzle' ? '불발' : '영창 차단';
        const color = judgement.disposition === 'fizzle' ? '#ffd166' : '#ff6b86';
        this.announceSystemMessage(`${prefix} · ${judgement.message}`, color);
        return;
      }

      const spec = judgement.spell;
      if (!this.playerState.trySpendMana(spec.cost)) {
        this.audio.playSfx('fizzle');
        this.announceSystemMessage('마나 부족');
        return;
      }

      const historyEntry = this.spellHistory.record({
        rawText: text,
        spell: spec,
        source: this.currentJudgeSource(),
        castAt: Date.now(),
      });
      this.engraveManager.rememberManualCast(historyEntry.normalized, spec);
      const affinityBonus = this.combatRunController.state
        .elementalAffinity[spec.element_primary] ?? 0;
      const effectiveSpec: SpellSpec = {
        ...spec,
        power: spellPowerWithAffinity(historyEntry.power, affinityBonus),
      };
      if (historyEntry.power < historyEntry.basePower) {
        // 반복 패널티를 원인과 함께 표시 — 다양성 유도가 게임의 핵심 경험 (PHASE_2 R3 P1)
        const penaltyPct = Math.round(
          (1 - historyEntry.power / historyEntry.basePower) * 100,
        );
        this.announceSystemMessage(
          `REPEAT -${penaltyPct}% · 같은 주문은 힘을 잃는다`,
          '#ffa94d',
        );
      }

      this.playerState.startGlobalCooldown();
      this.audio.playCast(effectiveSpec.element_primary);
      this.applySpellPalette(effectiveSpec);
      this.announceSpell(effectiveSpec);
      this.applySpellEffect(effectiveSpec);
    } finally {
      this.finishCastingUx();
    }
  }

  private applySpellEffect(spec: SpellSpec, origin?: Phaser.Math.Vector2): void {
    const from = origin?.clone()
      ?? new Phaser.Math.Vector2(this.player.x, this.player.y - 20);
    if (spec.effect === 'heal') {
      const healed = this.playerState.heal(spellHealFromPower(spec.power));
      this.announceSystemMessage(`회복 +${Math.round(healed)} HP`, '#72f1a8');
      return;
    }
    if (spec.effect === 'shield') {
      const shielded = this.playerState.addShield(spellShieldFromPower(spec.power));
      this.announceSystemMessage(`보호막 +${Math.round(shielded)}`, '#72d8ff');
      return;
    }
    if (spec.effect === 'buff') {
      const restored = this.playerState.restoreMana(spellBuffManaFromPower(spec.power));
      this.announceSystemMessage(`강화 · MANA +${Math.round(restored)}`, '#c7a6ff');
      return;
    }
    if (spec.effect === 'control') {
      this.castControlSpell(from, spec);
      return;
    }
    if (spec.effect === 'summon') {
      this.createSummon(spec);
      return;
    }

    const chainTargets = spec.form === 'chain'
      ? selectChainTargets(
        from.x,
        from.y,
        this.enemies.filter((enemy) => enemy.alive),
      )
      : [];
    const target = spec.form === 'chain'
      ? chainTargets[0] ?? null
      : this.nearestEnemy();
    const to = this.spellTargetPoint(from, spec, target);
    let lockedTarget = lockedPointTargetForForm(spec.form, target);
    const hitEnemies = new Set<CombatEnemy>();
    const castRoomIndex = this.combatRunController.state.roomIndex;
    castSpell({
      scene: this,
      from,
      to,
      chainPath: chainTargets,
      resolveBoltCollision: (fromX, fromY, toX, toY, projectileRadius) => {
        const collision = this.findBoltCollision(
          fromX,
          fromY,
          toX,
          toY,
          projectileRadius,
        );
        lockedTarget = collision?.target ?? null;
        return collision ? { x: collision.x, y: collision.y } : null;
      },
      onHit: (impact) => {
        const currentRunState = this.combatRunController.state;
        if (currentRunState.phase !== 'combat'
          || currentRunState.roomIndex !== castRoomIndex) return;
        this.onSpellHit(impact, spec, lockedTarget, hitEnemies, chainTargets);
      },
    }, spec);
  }

  /** 마나·글로벌 쿨다운·히스토리·발동음 없이 축소 주문만 자동 시전한다. */
  private updateEngravedSpells(deltaSeconds: number): void {
    const roomIndex = this.combatRunController.state.roomIndex;
    for (const request of this.engraveManager.update(deltaSeconds)) {
      const cast = (): void => {
        const state = this.combatRunController.state;
        if (!this.playerState.alive
          || state.phase !== 'combat'
          || state.roomIndex !== roomIndex) return;
        this.applySpellEffect(request.spell);
      };
      if (request.delaySeconds === 0) cast();
      else this.time.delayedCall(request.delaySeconds * 1000, cast);
    }
  }

  /** 마나·쿨다운·수동 주문 기억에 개입하지 않는 정령 자동 발동. */
  private updateSpirits(deltaSeconds: number): void {
    this.spiritOrbitAngle += deltaSeconds * 1.35;
    this.syncSpiritViews();
    const entries = this.spiritManager.entries;
    entries.forEach((entry, index) => {
      const angle = this.spiritOrbitAngle + (Math.PI * 2 * index) / Math.max(1, entries.length);
      this.spiritViews.get(entry.spiritId)?.updatePosition(
        this.player.x,
        this.player.y - 8,
        angle,
        68,
      );
    });

    for (const request of this.spiritManager.update(deltaSeconds)) {
      const view = this.spiritViews.get(request.spiritId);
      view?.pulse(this);
      if (request.kind === 'attack') {
        if (!this.nearestEnemy()) continue;
        const origin = view
          ? new Phaser.Math.Vector2(view.x, view.y)
          : new Phaser.Math.Vector2(this.player.x, this.player.y - 20);
        this.applySpellEffect(request.spell, origin);
        continue;
      }
      if (request.kind === 'heal') {
        const amount = this.playerState.heal(request.amount);
        if (amount > 0) this.announceSystemMessage(`치유 정령 · HP +${Math.round(amount)}`, '#72f1a8');
        continue;
      }
      const amount = this.playerState.addShield(request.amount);
      if (amount > 0) this.announceSystemMessage(`수호 정령 · 보호막 +${Math.round(amount)}`, '#72d8ff');
    }
  }

  private syncSpiritViews(): void {
    const entries = this.spiritManager.entries;
    const activeIds = new Set(entries.map((entry) => entry.spiritId));
    for (const [spiritId, view] of this.spiritViews) {
      if (activeIds.has(spiritId)) continue;
      view.destroy();
      this.spiritViews.delete(spiritId);
    }
    for (const entry of entries) {
      if (this.spiritViews.has(entry.spiritId)) continue;
      const visualElement = entry.element ?? (entry.role === 'heal' ? 'light' : 'earth');
      this.spiritViews.set(entry.spiritId, new SpiritOrbView(this, visualElement));
    }
  }

  private clearSpiritViews(): void {
    for (const view of this.spiritViews.values()) view.destroy();
    this.spiritViews.clear();
  }

  private spiritName(role: 'attack' | 'heal' | 'guard', element?: SpellElement): string {
    if (role === 'heal') return '치유';
    if (role === 'guard') return '수호';
    return ELEMENT_LABELS[element ?? 'light'];
  }

  private currentJudgeSource(): JudgeSource {
    switch (this.judge.lastSource) {
      case 'gemini':
      case 'cache':
      case 'fallback':
      case 'local':
        return this.judge.lastSource;
      default:
        return this.judge.name.startsWith('MockJudge') ? 'mock' : 'local';
    }
  }

  private updateStatusText(): void {
    const hp = Math.ceil(this.playerState.hp);
    const mana = Math.floor(this.playerState.mana);
    const shield = Math.ceil(this.playerState.shield);
    const runState = this.combatRunController.state;
    let actionState = 'READY';
    if (!this.playerState.alive) actionState = 'DEAD';
    else if (runState.phase === 'run-over') actionState = 'RUN COMPLETE';
    else if (runState.phase === 'reward-select') actionState = 'REWARD SELECT';
    else if (runState.phase === 'room-transition') actionState = 'NEXT ROOM';
    else if (this.casting) actionState = 'JUDGING';
    else if (this.incanting) actionState = 'INCANTING';
    else if (this.playerState.cooldownRemaining > 0) {
      actionState = `COOLDOWN ${this.playerState.cooldownRemaining.toFixed(1)}s`;
    }

    const statusColor = !this.playerState.alive
      ? '#ff5c7a'
      : this.casting
        ? '#ffd166'
        : this.incanting
          ? '#8fa4ff'
          : this.playerState.cooldownRemaining > 0
            ? '#ffb86b'
            : '#72f1b8';
    this.statusText.setText(`● ${actionState}`).setColor(statusColor);
    this.hpText.setText(`HP    ${hp.toString().padStart(3)} / ${this.playerState.maxHp}`);
    this.manaText.setText(`MANA  ${mana.toString().padStart(3)} / ${this.playerState.maxMana}`);
    this.shieldText.setText(`SHIELD ${shield.toString().padStart(3)} / ${this.playerState.maxHp}`);
    const spirits = this.spiritManager.entries;
    const spiritSummary = spirits.length === 0
      ? 'SPIRIT 0/2'
      : `SPIRIT ${spirits.length}/2 · ${spirits
        .map((entry) => `${this.spiritName(entry.role, entry.element)} Lv${entry.level}`)
        .join(' · ')}`;
    this.spiritHudText.setText(spiritSummary);
    this.drawHudBars();

    if (runState.phase === 'run-over') {
      this.waveText.setText('RUN COMPLETE');
    } else if (runState.phase === 'reward-select') {
      this.waveText.setText(`ROOM ${runState.roomIndex}/${runState.maxRooms} CLEAR`);
    } else if (runState.phase === 'room-transition') {
      this.waveText.setText(`NEXT ROOM ${runState.roomIndex + 1}/${runState.maxRooms}`);
    } else if (this.isBossRoom(runState.roomIndex)) {
      const boss = this.enemies.find((enemy) => enemy.kind === 'boss');
      this.waveText.setText(
        boss
          ? `BOSS ${Math.ceil(boss.hp)}/${boss.maxHp}  ·  ENEMIES ${this.enemies.length}`
          : 'BOSS',
      );
    } else if (this.waveManager.phase === 'waiting') {
      this.waveText.setText(
        `NEXT WAVE ${this.waveManager.delayRemaining.toFixed(1)}s`,
      );
    } else {
      this.waveText.setText(
        `WAVE ${this.waveManager.currentWaveNumber}/${this.waveManager.totalWaves}`
        + `  ·  ENEMIES ${this.enemies.length}`,
      );
    }
  }

  private drawHudBars(): void {
    const hpRatio = Phaser.Math.Clamp(this.playerState.hp / this.playerState.maxHp, 0, 1);
    const manaRatio = Phaser.Math.Clamp(this.playerState.mana / this.playerState.maxMana, 0, 1);
    const shieldRatio = Phaser.Math.Clamp(this.playerState.shield / this.playerState.maxHp, 0, 1);
    const cooldownRatio = Phaser.Math.Clamp(
      this.playerState.cooldownRemaining / this.playerState.globalCooldownSeconds,
      0,
      1,
    );
    const g = this.hudGraphics.clear();

    g.fillStyle(0x080b1c, 0.9);
    g.fillRoundedRect(HUD.x, HUD.y, HUD.width, HUD.height, 12);
    g.lineStyle(1, 0x33447f, 0.72);
    g.strokeRoundedRect(HUD.x, HUD.y, HUD.width, HUD.height, 12);

    g.fillStyle(0x141a35, 1);
    g.fillRoundedRect(HUD.barX, 73, HUD.barWidth, HUD.barHeight, 4);
    g.fillRoundedRect(HUD.barX, 107, HUD.barWidth, HUD.barHeight, 4);
    g.fillRoundedRect(HUD.barX, 141, HUD.barWidth, HUD.barHeight, 4);
    g.fillStyle(0xff5c82, 1);
    g.fillRoundedRect(HUD.barX, 73, HUD.barWidth * hpRatio, HUD.barHeight, 4);
    g.fillStyle(0x5b8cff, 1);
    g.fillRoundedRect(HUD.barX, 107, HUD.barWidth * manaRatio, HUD.barHeight, 4);
    g.fillStyle(0x48c9ff, 1);
    g.fillRoundedRect(HUD.barX, 141, HUD.barWidth * shieldRatio, HUD.barHeight, 4);

    g.fillStyle(0x1d2445, 1);
    g.fillRoundedRect(HUD.x + 8, HUD.y + HUD.height - 5, HUD.width - 16, 3, 2);
    g.fillStyle(cooldownRatio > 0 ? 0xffb86b : 0x72f1b8, 1);
    g.fillRoundedRect(
      HUD.x + 8,
      HUD.y + HUD.height - 5,
      (HUD.width - 16) * (cooldownRatio > 0 ? 1 - cooldownRatio : 1),
      3,
      2,
    );

    const { width } = this.scale;
    g.fillStyle(0x080b1c, 0.86);
    g.fillRoundedRect(width - 306, 18, 288, 72, 12);
    g.lineStyle(1, 0x2a735c, 0.62);
    g.strokeRoundedRect(width - 306, 18, 288, 72, 12);
  }

  private applySpellPalette(spec: SpellSpec): void {
    const palette = ELEMENT_PALETTES[spec.element_primary];
    this.incantWrap.style.setProperty('--spell-core', paletteColorToCss(palette.core));
    this.incantWrap.style.setProperty('--spell-glow', paletteColorToCss(palette.glow));
    this.incantWrap.style.setProperty('--spell-accent', paletteColorToCss(palette.accent));

    const secondary = spec.element_secondary
      ? ` + ${ELEMENT_LABELS[spec.element_secondary]}`
      : '';
    const source = this.judge.lastSource ?? this.judge.name;
    this.attunementText
      .setText(`${ELEMENT_LABELS[spec.element_primary]}${secondary} // ${source.toUpperCase()}`)
      .setColor(paletteColorToCss(palette.core));
  }

  private announceSystemMessage(message: string, color = '#ff8fa3', holdMs = 1800): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height * 0.42, message, {
      fontSize: '24px',
      fontStyle: 'bold',
      color,
      stroke: '#05060f',
      strokeThickness: 4,
      align: 'center',
      wordWrap: { width: width - 80, useAdvancedWrap: true },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setAlpha(0);

    // 동시에 뜨는 메시지는 세로로 쌓아 겹침을 막는다
    this.activeAnnouncements.push(label);
    this.repositionAnnouncements();

    this.tweens.add({
      targets: label,
      alpha: 1,
      duration: 150,
      onComplete: () => {
        this.tweens.add({
          targets: label,
          alpha: 0,
          delay: holdMs,
          duration: 450,
          ease: 'Cubic.easeOut',
          onComplete: () => {
            label.destroy();
            this.activeAnnouncements = this.activeAnnouncements.filter((l) => l !== label);
            this.repositionAnnouncements();
          },
        });
      },
    });
  }

  /** 살아 있는 시스템 메시지를 화면 중앙 기준 세로 스택으로 재배치 (겹침 방지) */
  private repositionAnnouncements(): void {
    const { height } = this.scale;
    const baseY = height * 0.42;
    const lineHeight = 34;
    const n = this.activeAnnouncements.length;
    this.activeAnnouncements.forEach((label, i) => {
      label.y = baseY + (i - (n - 1) / 2) * lineHeight;
    });
  }

  private announceIncomingDamage(hpDamage: number, shieldDamage: number): void {
    const shieldPart = shieldDamage > 0 ? `보호막 -${Math.round(shieldDamage)}` : '';
    const hpPart = hpDamage > 0 ? `HP -${Math.round(hpDamage)}` : '';
    const separator = shieldPart && hpPart ? ' · ' : '';
    this.announceSystemMessage(
      `${shieldPart}${separator}${hpPart}`,
      hpDamage > 0 ? '#ff8fa3' : '#72d8ff',
    );
  }

  private nearestEnemy(maxDistance = Number.POSITIVE_INFINITY): CombatEnemy | null {
    return this.nearestEnemyFrom(this.player.x, this.player.y, maxDistance);
  }

  private nearestEnemyFrom(
    fromX: number,
    fromY: number,
    maxDistance = Number.POSITIVE_INFINITY,
  ): CombatEnemy | null {
    let best: CombatEnemy | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const d = Phaser.Math.Distance.Between(fromX, fromY, enemy.x, enemy.y);
      if (d < bestD) { bestD = d; best = enemy; }
    }
    return bestD <= maxDistance ? best : null;
  }

  private findBoltCollision(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    projectileRadius: number,
  ): BoltCollision<CombatEnemy> | null {
    return firstBoltCollision(
      fromX,
      fromY,
      toX,
      toY,
      projectileRadius,
      this.enemies.filter((enemy) => enemy.alive),
    );
  }

  private spellTargetPoint(
    from: Phaser.Math.Vector2,
    spec: SpellSpec,
    nearestTarget: CombatEnemy | null,
  ): Phaser.Math.Vector2 | undefined {
    const scale = SIZE_SCALE[spec.size];
    const areaConfig = spec.form === 'zone'
      ? {
        castRange: ZONE_CONFIG.castRange,
        effectRadius: ZONE_CONFIG.baseRadius * scale,
      }
      : spec.form === 'rain'
        ? {
          castRange: RAIN_CONFIG.castRange,
          effectRadius: RAIN_CONFIG.baseAreaRadius * scale,
        }
        : null;
    if (areaConfig) {
      const target = densestAreaTarget(
        from.x,
        from.y,
        areaConfig.castRange,
        areaConfig.effectRadius,
        this.enemies.filter((enemy) => enemy.alive),
      );
      if (target) return new Phaser.Math.Vector2(target.x, target.y);
    }

    const directionalConfig = spec.form === 'beam'
      ? {
        range: SPELL_DAMAGE_CONFIG.beamRange,
        halfWidth: SPELL_DAMAGE_CONFIG.beamBaseWidth * scale / 2,
      }
      : spec.form === 'wave'
        ? {
          range: SPELL_DAMAGE_CONFIG.waveRange,
          halfWidth: SPELL_DAMAGE_CONFIG.waveBaseWidth * scale / 2,
        }
        : null;
    if (directionalConfig) {
      const target = densestDirectionalTarget(
        from.x,
        from.y,
        directionalConfig.range,
        directionalConfig.halfWidth,
        this.enemies.filter((enemy) => enemy.alive),
      );
      if (target) return new Phaser.Math.Vector2(target.x, target.y);
    }

    return nearestTarget
      ? new Phaser.Math.Vector2(nearestTarget.x, nearestTarget.y)
      : undefined;
  }

  private onSpellHit(
    impact: SpellImpact,
    spec: SpellSpec,
    lockedTarget: CombatEnemy | null,
    hitEnemies: Set<CombatEnemy>,
    chainTargets: readonly CombatEnemy[] = [],
  ): void {
    if (impact.hitGroup !== undefined) hitEnemies.clear();
    const damageMultiplier = Number.isFinite(impact.damageMultiplier)
      ? Math.max(0, impact.damageMultiplier ?? 1)
      : 1;
    const damage = spellImpactDamageFromPower(spec.power, damageMultiplier);
    if (impact.kind === 'point') {
      if (impact.chainIndex !== undefined) {
        const chainTarget = chainTargets[impact.chainIndex];
        if (chainTarget?.alive) {
          this.damageEnemy(
            chainTarget,
            this.spellDamageAgainst(chainTarget, spec, damage),
          );
        }
        return;
      }
      if (lockedTarget?.alive) {
        this.damageEnemy(lockedTarget, this.spellDamageAgainst(lockedTarget, spec, damage));
      }
      return;
    }

    for (const enemy of [...this.enemies]) {
      if (!enemy.alive || hitEnemies.has(enemy)) continue;

      const isHit = impact.kind === 'circle'
        ? Phaser.Math.Distance.Between(impact.x, impact.y, enemy.x, enemy.y)
          <= impact.radius
        : this.pointToSegmentDistance(
          enemy.x,
          enemy.y,
          impact.fromX,
          impact.fromY,
          impact.toX,
          impact.toY,
        ) <= impact.width / 2;
      if (!isHit) continue;

      hitEnemies.add(enemy);
      this.damageEnemy(enemy, this.spellDamageAgainst(enemy, spec, damage));
    }
  }

  /** 보스 내성 반영 주문 피해 (GDD §4.1 — 내성 원소 피해 대폭 감소 + 플레이어에게 원인 표시) */
  private spellDamageAgainst(
    enemy: CombatEnemy,
    spec: SpellSpec,
    baseDamage: number,
  ): number {
    return this.elementalDamageAgainst(enemy, spec.element_primary, baseDamage);
  }

  private elementalDamageAgainst(
    enemy: CombatEnemy,
    element: SpellElement,
    baseDamage: number,
  ): number {
    if (enemy.kind !== 'boss') return baseDamage;
    const multiplier = this.bossResistance.resistedElement === element
      ? this.bossResistance.resistMultiplier
      : 1;
    if (multiplier < 1 && this.time.now - this.lastResistNoticeAt > 1500) {
      this.lastResistNoticeAt = this.time.now;
      const label = ELEMENT_LABELS[element];
      this.announceSystemMessage(`저항! ${label}이(가) 통하지 않는다 — 다른 원소를 창작하라`, '#ffa94d');
    }
    return baseDamage * multiplier;
  }

  private createSummon(spec: SpellSpec): void {
    this.clearSummon();
    this.activeSummon = new SummonedOrb(
      this,
      this.player.x,
      this.player.y,
      spec.element_primary,
      spec.power,
    );
    this.announceSystemMessage(
      `소환 · ${this.activeSummon.state.durationSeconds.toFixed(1)}초`,
      paletteColorToCss(ELEMENT_PALETTES[spec.element_primary].core),
    );
  }

  private updateSummon(deltaSeconds: number): void {
    const summon = this.activeSummon;
    if (!summon) return;
    if (!this.playerState.alive) {
      this.clearSummon();
      return;
    }

    summon.updatePosition(this.player.x, this.player.y, deltaSeconds);
    const target = this.nearestEnemyFrom(summon.x, summon.y, SUMMON_CONFIG.attackRange);
    const tick = summon.state.update(deltaSeconds, target !== null);
    if (tick.expired) {
      this.clearSummon();
      return;
    }
    if (!tick.shouldAttack || !target) return;

    const palette = ELEMENT_PALETTES[summon.element];
    this.fireFriendlyMissile({
      fromX: summon.x,
      fromY: summon.y,
      target,
      damage: summon.state.damage,
      element: summon.element,
      speed: SUMMON_CONFIG.projectileSpeed,
      hitDistance: SUMMON_CONFIG.projectileHitDistance,
      coreColor: palette.core,
      glowColor: palette.glow,
    });
  }

  private clearSummon(): void {
    this.activeSummon?.destroy();
    this.activeSummon = null;
  }

  private castControlSpell(from: Phaser.Math.Vector2, spec: SpellSpec): void {
    const chainTargets = spec.form === 'chain'
      ? selectChainTargets(
        from.x,
        from.y,
        this.enemies.filter((enemy) => enemy.alive),
      )
      : [];
    const target = spec.form === 'chain'
      ? chainTargets[0] ?? null
      : this.nearestEnemy();
    const to = this.spellTargetPoint(from, spec, target);
    let lockedTarget = lockedPointTargetForForm(spec.form, target);
    const affectedEnemies = new Set<CombatEnemy>();
    const castRoomIndex = this.combatRunController.state.roomIndex;
    castSpell({
      scene: this,
      from,
      to,
      chainPath: chainTargets,
      resolveBoltCollision: (fromX, fromY, toX, toY, projectileRadius) => {
        const collision = this.findBoltCollision(
          fromX,
          fromY,
          toX,
          toY,
          projectileRadius,
        );
        lockedTarget = collision?.target ?? null;
        return collision ? { x: collision.x, y: collision.y } : null;
      },
      onHit: (impact) => {
        const currentRunState = this.combatRunController.state;
        if (currentRunState.phase !== 'combat'
          || currentRunState.roomIndex !== castRoomIndex) return;
        this.onControlHit(impact, spec, lockedTarget, affectedEnemies, chainTargets);
      },
    }, spec);
  }

  private onControlHit(
    impact: SpellImpact,
    spec: SpellSpec,
    lockedTarget: CombatEnemy | null,
    affectedEnemies: Set<CombatEnemy>,
    chainTargets: readonly CombatEnemy[] = [],
  ): void {
    if (impact.hitGroup !== undefined) affectedEnemies.clear();
    if (impact.kind === 'point') {
      if (impact.chainIndex !== undefined) {
        const chainTarget = chainTargets[impact.chainIndex];
        if (chainTarget?.alive) {
          this.applyControl(chainTarget, spec.power, impact);
        }
        return;
      }
      if (lockedTarget?.alive) {
        this.applyControl(lockedTarget, spec.power, impact);
      }
      return;
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive || affectedEnemies.has(enemy)) continue;
      const isHit = impact.kind === 'circle'
        ? Phaser.Math.Distance.Between(impact.x, impact.y, enemy.x, enemy.y)
          <= impact.radius
        : this.pointToSegmentDistance(
          enemy.x,
          enemy.y,
          impact.fromX,
          impact.fromY,
          impact.toX,
          impact.toY,
        ) <= impact.width / 2;
      if (!isHit) continue;

      affectedEnemies.add(enemy);
      this.applyControl(enemy, spec.power, impact);
    }
  }

  private applyControl(enemy: CombatEnemy, power: number, impact: SpellImpact): void {
    if (impact.controlMode === 'root') {
      this.applyRoot(enemy, impact.controlDurationSeconds ?? CAGE_CONFIG.rootDurationSeconds);
      return;
    }
    this.applySlow(enemy, power, impact.controlDurationSeconds);
  }

  private applySlow(
    enemy: CombatEnemy,
    power: number,
    durationOverrideSeconds?: number,
  ): void {
    const remaining = this.enemyControlState.applySlow(
      enemy,
      power,
      durationOverrideSeconds,
    );
    if (!this.controlIndicators.has(enemy)) {
      const indicator = this.add.circle(
        0,
        0,
        CONTROL_CONFIG.indicatorRadius,
        CONTROL_CONFIG.indicatorColor,
        0.08,
      ).setStrokeStyle(2, CONTROL_CONFIG.indicatorColor, 0.85)
        .setBlendMode(Phaser.BlendModes.ADD);
      enemy.view.addAt(indicator, 0);
      this.controlIndicators.set(enemy, indicator);
    }
    console.info('[Control] slow-applied', {
      enemy: enemy.kind,
      durationSeconds: remaining,
      movementMultiplier: CONTROL_CONFIG.slowMovementMultiplier,
    });
  }

  private applyRoot(enemy: CombatEnemy, durationSeconds: number): void {
    const remaining = this.enemyControlState.applyRoot(enemy, durationSeconds);
    let indicator = this.controlIndicators.get(enemy);
    if (!indicator) {
      indicator = this.add.circle(
        0,
        0,
        CAGE_CONFIG.baseRadius,
        CAGE_CONFIG.indicatorColor,
        0.08,
      ).setBlendMode(Phaser.BlendModes.ADD);
      enemy.view.addAt(indicator, 0);
      this.controlIndicators.set(enemy, indicator);
    }
    indicator
      .setRadius(CAGE_CONFIG.baseRadius)
      .setFillStyle(CAGE_CONFIG.indicatorColor, 0.08)
      .setStrokeStyle(3, CAGE_CONFIG.indicatorColor, 0.95);
    console.info('[Control] root-applied', {
      enemy: enemy.kind,
      durationSeconds: remaining,
      movementMultiplier: 0,
    });
  }

  private updateEnemyControls(deltaSeconds: number): void {
    for (const enemy of this.enemyControlState.update(deltaSeconds)) {
      this.removeControlIndicator(enemy);
    }
    for (const [enemy, indicator] of this.controlIndicators) {
      if (!indicator.active) continue;
      if (this.enemyControlState.movementMultiplierFor(enemy) === 0) {
        indicator
          .setRadius(CAGE_CONFIG.baseRadius)
          .setFillStyle(CAGE_CONFIG.indicatorColor, 0.08)
          .setStrokeStyle(3, CAGE_CONFIG.indicatorColor, 0.95);
      } else {
        indicator
          .setRadius(CONTROL_CONFIG.indicatorRadius)
          .setFillStyle(CONTROL_CONFIG.indicatorColor, 0.08)
          .setStrokeStyle(2, CONTROL_CONFIG.indicatorColor, 0.85);
      }
    }
  }

  private removeEnemyControl(enemy: CombatEnemy): void {
    this.enemyControlState.remove(enemy);
    this.removeControlIndicator(enemy);
  }

  private clearEnemyControls(): void {
    for (const enemy of this.enemyControlState.clear()) {
      this.removeControlIndicator(enemy);
    }
    for (const enemy of [...this.controlIndicators.keys()]) {
      this.removeControlIndicator(enemy);
    }
  }

  private removeControlIndicator(enemy: CombatEnemy): void {
    const indicator = this.controlIndicators.get(enemy);
    if (!indicator) return;
    if (indicator.active) indicator.destroy();
    this.controlIndicators.delete(enemy);
  }

  private pointToSegmentDistance(
    pointX: number,
    pointY: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): number {
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (lengthSquared === 0) {
      return Phaser.Math.Distance.Between(pointX, pointY, startX, startY);
    }

    const projection = Phaser.Math.Clamp(
      ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / lengthSquared,
      0,
      1,
    );
    const nearestX = startX + projection * segmentX;
    const nearestY = startY + projection * segmentY;
    return Phaser.Math.Distance.Between(pointX, pointY, nearestX, nearestY);
  }

  private damageEnemy(enemy: CombatEnemy, damage: number): void {
    if (damage <= 0 || !enemy.alive) return;
    this.audio.playSfx('hit');
    if (!enemy.takeDamage(damage)) {
      // 보스는 HP 임계 통과 시 하수인을 부른다
      if (enemy instanceof BossEnemy && enemy.consumeMinionTrigger()) {
        this.spawnBossMinions(enemy);
      }
      return;
    }
    this.audio.playSfx('enemy-defeat');

    const splitX = enemy.x;
    const splitY = enemy.y;
    const shouldSplit = enemy instanceof SplitterEnemy && enemy.canSplit;
    this.removeEnemyControl(enemy);
    enemy.destroy();
    this.enemies = this.enemies.filter((candidate) => candidate !== enemy);
    if (shouldSplit) {
      for (let i = 0; i < SPLITTER_CONFIG.splitCount; i++) {
        const angle = (Math.PI * 2 * i) / SPLITTER_CONFIG.splitCount;
        const x = Phaser.Math.Clamp(
          splitX + Math.cos(angle) * SPLITTER_CONFIG.splitOffset,
          this.worldBounds.left + 22,
          this.worldBounds.right - 22,
        );
        const y = Phaser.Math.Clamp(
          splitY + Math.sin(angle) * SPLITTER_CONFIG.splitOffset,
          this.worldBounds.top + 22,
          this.worldBounds.bottom - 22,
        );
        this.spawnEnemy('small-splitter', x, y);
      }
    }
    if (this.enemies.length > 0) return;

    this.clearEnemyProjectiles();
    // 보스방은 웨이브 흐름 없이 전멸(보스+하수인) 즉시 방 클리어
    if (this.isBossRoom(this.combatRunController.state.roomIndex)) {
      this.combatRunController.notifyRoomCleared();
      return;
    }
    const completedWave = this.waveManager.currentWaveNumber;
    this.waveManager.notifyEnemiesCleared();
    if (this.waveManager.phase === 'room-clear') {
      this.combatRunController.notifyRoomCleared();
    } else {
      this.announceSystemMessage(`웨이브 ${completedWave} 완료`);
    }
  }

  private spawnBossMinions(boss: BossEnemy): void {
    for (let i = 0; i < BOSS_CONFIG.minionsPerTrigger; i++) {
      const angle = Math.random() * Math.PI * 2;
      const x = Phaser.Math.Clamp(
        boss.x + Math.cos(angle) * 110,
        this.worldBounds.left + 22,
        this.worldBounds.right - 22,
      );
      const y = Phaser.Math.Clamp(
        boss.y + Math.sin(angle) * 110,
        this.worldBounds.top + 22,
        this.worldBounds.bottom - 22,
      );
      this.spawnEnemy('chaser', x, y);
    }
    this.announceSystemMessage('보스가 하수인을 불렀다', '#d0a8ff');
  }

  /** 주문명 각인 연출 — "내 문장이 게임이 됐다"는 순간 (GDD §3.1) */
  private announceSpell(spec: SpellSpec): void {
    const { width, height } = this.scale;
    const pal = ELEMENT_PALETTES[spec.element_primary];
    const colorHex = paletteColorToCss(pal.core);

    const label = this.add.text(width / 2, height * 0.32, spec.name, {
      fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
      fontSize: '42px',
      fontStyle: 'bold',
      color: colorHex,
      stroke: '#05060f',
      strokeThickness: 6,
      align: 'center',
      wordWrap: { width: width - 80, useAdvancedWrap: true },
    }).setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(100)
      .setBlendMode(Phaser.BlendModes.ADD);

    // [디버그] 판정 출처(gemini/cache/fallback)는 개발 모드에서만 노출 — 데모에선 숨김
    const debugTail = import.meta.env.DEV
      ? ` · [${this.judge.lastSource ?? this.judge.name}]`
      : '';
    const meta = this.add.text(width / 2, height * 0.32 + 36,
      `${spec.element_primary}${spec.element_secondary ? '+' + spec.element_secondary : ''}`
      + ` · ${spec.effect}/${spec.target} · ${spec.form} · power ${spec.power}${debugTail}`,
      { fontSize: '14px', color: '#8fa4ff' },
    ).setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(100);

    this.tweens.add({
      targets: [label, meta],
      alpha: { from: 0, to: 1 },
      scale: { from: 1.4, to: 1 },
      duration: 250,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: [label, meta],
          alpha: 0,
          delay: 900,
          duration: 400,
          onComplete: () => { label.destroy(); meta.destroy(); },
        });
      },
    });
  }
}
