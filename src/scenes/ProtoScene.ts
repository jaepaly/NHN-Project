import Phaser from 'phaser';
import { createSpriteLayers } from '../render/spriteLayers';
import { playHitReact, playImpactSquash } from '../combat-core/enemies/enemyJuice';
import type { SpellJudge } from '../spell/judge';
import { createJudge } from '../spell/createJudge';
import type { SpellElement, SpellSpec } from '../spell/types';
import { SpellHistory } from '../spell/spellHistory';
import type { JudgeSource } from '../spell/spellHistory';
import { castSpell, ensureParticleTexture } from '../render/spellRenderer';
import type { SpellImpact } from '../render/spellRenderer';
import type {
  EliteModifier, EvolveRewardData, RewardOption, RunController,
} from '../run/runContract';
import {
  ELEMENT_LABELS,
  ELEMENT_PALETTES,
  FORM_LABELS,
  SIZE_SCALE,
  paletteColorToCss,
} from '../render/palette';
import { applyWorldFx } from '../render/postFx';
import { TRAIL_CONFIG, spawnTrailGhost } from '../render/trailEffect';
import {
  backdropPaletteForEncounter,
  ROOM_BACKDROP_PALETTES,
} from '../render/roomBackdropConfig';
import type { RoomBackdropPalette } from '../render/roomBackdropConfig';
import { PlayerCombatState } from '../combat-core/player/playerCombatState';
import { ChaserEnemy } from '../combat-core/enemies/chaserEnemy';
import { ShooterEnemy } from '../combat-core/enemies/shooterEnemy';
import { SplitterEnemy } from '../combat-core/enemies/splitterEnemy';
import { ShieldSentinelEnemy } from '../combat-core/enemies/shieldSentinelEnemy';
import { EliteEnemy } from '../combat-core/enemies/eliteEnemy';
import {
  ACTIVE_MANA_CONFIG,
  crossedBossManaThresholds,
  manaDropAmount,
  manaPotionSpawnDelay,
} from '../combat-core/mana/activeManaConfig';
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
  spellHealFromPower,
  autoSpellImpactDamageFromPower,
  spellImpactDamageFromPower,
  spellPowerWithAffinity,
  spellShieldFromPower,
} from '../combat-core/combat/combatConfig';
import {
  EnemyHitStopController,
  enemyHitStopSeconds,
} from '../combat-core/combat/hitStopConfig';
import type { HitStopKind } from '../combat-core/combat/hitStopConfig';
import type { CameraShakeTier } from '../combat-core/combat/cameraShakeConfig';
import { requestCameraShake, resetCameraShake } from '../render/cameraShake';
import {
  KNOCKBACK_CONFIG,
  knockbackDistanceForForm,
} from '../combat-core/combat/knockbackConfig';
import { firstBoltCollision } from '../combat-core/combat/boltCollision';
import type { BoltCollision } from '../combat-core/combat/boltCollision';
import {
  CAGE_CONFIG,
  lockedPointTargetForForm,
  selectChainTargets,
} from '../combat-core/combat/advancedFormConfig';
import {
  ORBIT_CONFIG,
  WALL_CONFIG,
  orbitAngularVelocity,
  orbitCount,
  orbitPoint,
  repeatHitReady,
  sweepIntersectsPolyline,
  wallArcPoints,
  wallDurationSeconds,
} from '../combat-core/combat/persistentFormConfig';
import type { FormPoint } from '../combat-core/combat/persistentFormConfig';
import {
  RAIN_CONFIG,
  ZONE_CONFIG,
  densestAreaTarget,
  densestDirectionalTarget,
} from '../combat-core/combat/areaSpellConfig';
import {
  WAVE_CONFIG,
  WAVE_SETS,
  WaveManager,
} from '../combat-core/waves/waveManager';
import type { WaveDefinition } from '../combat-core/waves/waveManager';
import { CombatRunController } from '../combat-core/run/runController';
import { ELITE_MODIFIERS } from '../combat-core/run/encounterConfig';
import { drawRewardOptions } from '../combat-core/run/rewardConfig';
import { ENGRAVE_CONFIG, EngraveManager } from '../combat-core/engrave/engraveManager';
import { SpiritManager, SPIRIT_CONFIG } from '../combat-core/spirit/spiritManager';
import { resolveSelfBuff, SELF_BUFF_CONFIG } from '../combat-core/player/selfBuffConfig';
import { SpiritOrbView } from '../combat-core/spirit/spiritOrbView';
import { buildEvolveOption, injectEvolveReward } from '../combat-core/evolve/evolveRewards';
import {
  GrowthMarks,
  playRewardConvergence,
  showGainText,
} from '../render/growthFeedback';
import { getEvolvedName, templateEvolvedName } from '../spell/evolveName';
import type { EvolveNameRequest } from '../spell/evolveName';
import { BOSS_CHARGE_DISTANCE, BossEnemy } from '../combat-core/boss/bossEnemy';
import { BOSS_CONFIG } from '../combat-core/boss/bossConfig';
import { BossPatternController } from '../combat-core/boss/bossPatternController';
import type { BossPatternAction } from '../combat-core/boss/bossPatternController';
import {
  computeResistance,
  diversityBonus,
  getBossLine,
  loadRunMemory,
  longTermResistedElement,
  runEscalationProfile,
  saveRunMemory,
  summarizeRun,
  updateRunMemory,
} from '../spell/bossMemoryContract';
import type { BossResistanceProfile, RunEscalationProfile } from '../spell/bossMemoryContract';
import { EMPTY_RUN_MEMORY } from '../spell/runMemory';
import { showRunSummaryOverlay } from '../ui/runSummaryOverlay';
import { showRewardCards } from '../ui/rewardCardOverlay';
import {
  addEntry,
  bestEntryFromRun,
  loadGrimoire,
  offerEntries,
  saveGrimoire,
  specFromEntry,
} from '../spell/grimoire';
import { CONTROL_CONFIG } from '../combat-core/control/controlConfig';
import { EnemyControlState } from '../combat-core/control/enemyControlState';
import { SUMMON_CONFIG } from '../combat-core/summons/summonConfig';
import { SummonedOrb } from '../combat-core/summons/summonedOrb';
import { GameAudio } from '../audio/gameAudio';

// 임시값: 카메라 방식과 방 크기를 최종 확정한 뒤 조정한다.
const WORLD_SIZE_MULTIPLIER = 2;
/** 제품 기본값: 첫 번째 조우부터 전체 런을 시작한다. */
const DEBUG_START_ROOM = 1;
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
  knockbackDistance: number;
}

interface CastFeedbackState {
  resistanceNoticeShown: boolean;
}

interface EnemyKnockbackState {
  velocityX: number;
  velocityY: number;
  remainingSeconds: number;
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
  hitShakeTier: CameraShakeTier;
}

interface ActiveWall {
  spec: SpellSpec;
  points: readonly FormPoint[];
  view: Phaser.GameObjects.Graphics;
  remainingSeconds: number;
  contactedEnemies: Set<CombatEnemy>;
  slowedBosses: Set<CombatEnemy>;
}

interface ActiveOrbit {
  spec: SpellSpec;
  views: Phaser.GameObjects.Container[];
  elapsedSeconds: number;
  angle: number;
  lastHitAt: Map<CombatEnemy, number>;
}

interface HazardZone {
  view: Phaser.GameObjects.GameObject;
  contains(x: number, y: number): boolean;
  damageCooldown: number;
  onDamage?: () => void;
}

interface UnstableWarning {
  view: Phaser.GameObjects.Arc;
  pulse: Phaser.GameObjects.Arc;
  indicator: Phaser.GameObjects.Text;
  timers: Phaser.Time.TimerEvent[];
}

interface ManaCrystal {
  view: Phaser.GameObjects.Container;
  amount: number;
}

interface ManaPotion {
  view: Phaser.GameObjects.Container;
  lifetimeRemaining: number;
  collectable: boolean;
  fullNoticeShown: boolean;
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
  /** 마법진 두 겹(서로 반대로 회전) — 플레이어가 굳어 보이지 않게 상시 돈다. */
  private playerRingOuter!: Phaser.GameObjects.Graphics;
  private playerRingInner!: Phaser.GameObjects.Graphics;
  private playerHalo!: Phaser.GameObjects.Arc;
  /** 스프라이트 자체에 건 셰이더 발광 — 세기를 트윈해 이미지가 숨 쉬게 한다. */
  private playerGlowFx: Phaser.FX.Glow | null = null;
  private playerGlowPulse: Phaser.Tweens.Tween | null = null;
  /** 피격 플래시 대상 — 적과 같은 playHitReact를 쓴다. */
  private playerBody!: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  /** 최근 이동 방향 — 돌진(dash) 방향 결정에 쓴다. */
  private readonly lastMoveDir = new Phaser.Math.Vector2(0, 0);
  /** 활성 자기 강화 오라 (한 번에 하나) */
  private buffAura: Phaser.GameObjects.Arc | null = null;
  private playerState = new PlayerCombatState();
  private readonly spellHistory = new SpellHistory();
  private readonly engraveManager = new EngraveManager();
  private readonly spiritManager = new SpiritManager();
  private engraveRewardRand = createRunRandom(Date.now());
  // 명시적 타입: rewardDraw 클로저가 컨트롤러 상태(친화)를 읽어 자기참조 추론이 막히는 것 회피
  private readonly combatRunController: CombatRunController = new CombatRunController({
    playerState: this.playerState,
    initialRoomIndex: DEBUG_START_ROOM,
    rewardDraw: (roomIndex) => {
      const engraved = this.engraveManager.injectReward(
        drawRewardOptions(roomIndex, this.engraveRewardRand),
        roomIndex,
        this.engraveRewardRand,
      );
      const withSpirit = this.spiritManager.injectReward(
        engraved,
        roomIndex,
        this.engraveRewardRand,
      );
      // 성장의 정점(④) — 진화·융합 후보가 있으면 정적 카드 한 장을 치환
      return injectEvolveReward(
        withSpirit,
        buildEvolveOption(
          roomIndex,
          this.engraveManager,
          this.spiritManager,
          this.combatRunController.state.elementalAffinity,
          this.engraveRewardRand,
        ),
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
  private hazardZones: HazardZone[] = [];
  private hazardDecorations: Phaser.GameObjects.GameObject[] = [];
  private unstableWarnings: UnstableWarning[] = [];
  private manaCrystals: ManaCrystal[] = [];
  private readonly triggeredBossManaThresholds = new WeakMap<CombatEnemy, Set<number>>();
  private manaPotion: ManaPotion | null = null;
  private manaPotionSpawnRemaining = 0;
  private manaPotionSpawnedThisRoom = false;
  private roomClearPending = false;
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private attunementText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  /** 빌드 패널 — 각인·정령·주문서 보유 현황 (우하단 상시 표시) */
  private buildHudText!: Phaser.GameObjects.Text;
  /** 주문서 보유 수 캐시 — HUD는 매 프레임 갱신되므로 localStorage를 직접 읽지 않는다 */
  private grimoireCount = 0;
  /**
   * 이번 런의 격상 프로필(#77) — clears는 런 종료 시에만 바뀌므로 **런 중 불변**이다.
   * 시전마다 loadRunMemory()로 localStorage를 읽지 않도록 런 시작에 1회만 계산한다.
   */
  private runEscalation: RunEscalationProfile = runEscalationProfile(EMPTY_RUN_MEMORY);
  /** 약화 안내를 이미 띄운 원소 — 방마다 비워 같은 경고가 시전마다 반복되지 않게 한다 */
  private readonly escalationNoticed = new Set<SpellElement>();
  private waveManager = new WaveManager();
  private eliteModifierAssignments: EliteModifier[] = [];
  private eliteSpawnIndex = 0;
  private incantWrap!: HTMLElement;
  private incantBar!: HTMLInputElement;
  private incantState!: HTMLElement;
  private incantCount!: HTMLElement;
  private incantHint!: HTMLElement;
  private incantChargeLabel!: HTMLElement;
  private incanting = false;
  private casting = false;
  private timeScale = 1;
  private readonly enemyHitStop = new EnemyHitStopController<CombatEnemy>();
  private readonly enemyKnockbacks = new Map<CombatEnemy, EnemyKnockbackState>();
  private basicAttackCooldownRemaining = 0;
  private friendlyMissiles: FriendlyMissile[] = [];
  private activeSummon: SummonedOrb | null = null;
  private activeSummonKnockbackDistance = 0;
  private activeWall: ActiveWall | null = null;
  private activeOrbit: ActiveOrbit | null = null;
  /** 성장 누적 표식 (룬 링·친화 오라) — 보상 선택 때 갱신, 매 프레임 플레이어 추종 */
  private growthMarks!: GrowthMarks;
  /** 주문서 유산 선택 중 — 카드가 키를 캡처하는 동안 전투를 멈춘다 */
  private legacySelecting = false;
  private readonly spiritViews = new Map<string, SpiritOrbView>();
  private spiritOrbitAngle = -Math.PI / 2;
  private readonly enemyControlState = new EnemyControlState();
  private readonly controlIndicators = new Map<CombatEnemy, Phaser.GameObjects.Arc>();
  /** 보스방 진입 시 주문 히스토리로 계산 — R2 내성 모듈이 오면 계산부만 교체 */
  private bossResistance: BossResistanceProfile = { ...NO_BOSS_RESISTANCE };
  /** 페이즈를 넘어 유지되는 원소별 내성. 같은 원소는 더 강한(낮은) 배수 하나만 유지한다. */
  private readonly activeBossResistances = new Map<SpellElement, number>();
  private lastResistNoticeAt = 0;
  private activeBossPhase: 1 | 2 | 3 = 1;
  private bossPatternController: BossPatternController | null = null;
  private bossChargeTelegraph: Phaser.GameObjects.Graphics | null = null;
  private bossChargeTarget: Phaser.Math.Vector2 | null = null;
  private bossChargeTrailCooldown = 0;
  private bossVolleyTelegraph: Phaser.GameObjects.Graphics | null = null;
  private bossVolleyAngles: number[] = [];
  private bossEliteSummonIndex = 0;
  private bossHazardWarnings: Phaser.GameObjects.Container[] = [];
  private deathHandled = false;
  private audio!: GameAudio;
  private backdropBase!: Phaser.GameObjects.Rectangle;
  private backdropGrid!: Phaser.GameObjects.Graphics;
  private backdropImage: Phaser.GameObjects.Image | null = null;
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
    // GameAudio.preload가 load.path를 오디오 폴더로 설정하고 되돌리지 않는다. 그래서
    // 뒤따르는 배경 로드 URL 앞에 그 경로가 붙어(.../assets/audio//NHN-Project/...)
    // Vite SPA 폴백(index.html)이 200으로 반환되고, Phaser가 그 HTML을 이미지로
    // 처리하려다 "Failed to process file"로 실패했다(webp·jpg·png 공통 원인).
    // 경로를 비운 뒤 배경을 싣는다.
    this.load.setPath('');
    // Phase 5 프로토타입 — AI 생성 스테이지 배경 (도형 데모 탈피).
    // 월드 크기(1920×1280)로 업스케일 + 절차적 질감을 구워넣은 완전 스크롤 맵용 이미지.
    this.load.image(
      'bg-stage1',
      `${import.meta.env.BASE_URL}assets/backgrounds/arena-stage1.jpg`,
    );
    // 보스방 전용 AI 배경 — 탑다운 소환진 아레나 (일반 방과 확실히 구분되는 결전 공간)
    this.load.image(
      'bg-boss',
      `${import.meta.env.BASE_URL}assets/backgrounds/arena-boss.jpg`,
    );
    // 적 스프라이트 — 무채색으로 저장해두고 타입 색은 인게임 틴트로 입힌다
    // 파수꾼·보스는 코어만 잘라낸 버전 — 방패 링/저항 링은 정보를 담고 있어 절차적으로 남긴다.
    // 각 스프라이트는 재질(<key>)과 발광(<key>-glow) 두 장이다. 통째로 틴트하면 재질감이
    // 죽어 단색 덩어리가 되므로, 타입 색은 발광 레이어가 전담한다 (render/spriteLayers).
    for (const key of [
      'enemy-shooter', 'enemy-chaser', 'enemy-splitter', 'enemy-small-splitter',
      'enemy-shield-sentinel-core', 'enemy-boss-core', 'player-invoker',
    ]) {
      this.load.image(key, `${import.meta.env.BASE_URL}assets/sprites/${key}.png`);
      this.load.image(`${key}-glow`, `${import.meta.env.BASE_URL}assets/sprites/${key}-glow.png`);
    }
    // 로드 실패가 조용히 묻히지 않게 — 실패 시 원인·URL을 남기고 그리드 배경으로 폴백한다.
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      if (file.key === 'bg-stage1') {
        console.warn('[backdrop] 배경 이미지 로드 실패 — 그리드로 폴백:', file.src);
      }
    });
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
    this.growthMarks = new GrowthMarks(this);
    this.cameras.main
      .setBounds(
        this.worldBounds.x,
        this.worldBounds.y,
        this.worldBounds.width,
        this.worldBounds.height,
      )
      .startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.centerOn(startX, startY);
    applyWorldFx(this.cameras.main); // Phase 5 네온 후처리 (블룸+비네트)
    this.moveKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.createHud(width, height);
    this.setupRunFlow();
    this.startRoom(this.combatRunController.state.roomIndex);
    this.updateStatusText();

    this.setupIncantBar();
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (!this.incanting && !this.casting) this.tryOpenIncant();
    });

    // 주문서에 유산이 있으면 첫 전투 전에 하나를 고른다 (첫 런은 비어 있어 조용히 넘어감)
    void this.offerLegacyEngrave();
  }

  override update(_time: number, delta: number): void {
    this.checkPlayerDeath();
    if (this.isCombatActive()) {
      // 슬로모션: timeScale을 개체 이동에 직접 곱한다 (프로토 방식)
      const d = (delta / 1000) * this.timeScale;
      this.playerState.update(d);
      this.basicAttackCooldownRemaining = Math.max(0, this.basicAttackCooldownRemaining - d);
      this.updatePlayerMovement(delta / 1000);
      this.updatePlayerAura(d);
      this.updateEnemyControls(d);
      this.updateEnemies(d);
      this.updatePersistentForms(d);
      this.updateEnemyProjectiles(d);
      this.updateHazards(d);
      this.updateBasicAttack();
      this.updateEngravedSpells(d);
      this.updateSpirits(d);
      this.updateSummon(d);
      this.updateFriendlyMissiles(d);
      this.updateManaCrystals(d);
      this.updateManaPotion(d);
      this.updateWaveFlow(d);
    }
    // 성장 표식은 전투 정지 중(보상 선택·전환)에도 플레이어를 따라간다
    this.growthMarks.follow(this.player.x, this.player.y);
    this.updateStatusText();
  }

  private isCombatActive(): boolean {
    // 유산 선택 중에는 전투를 멈춘다 — 카드가 키를 캡처하는 동안 적에게 맞으면 안 된다
    if (this.legacySelecting) return false;
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
      // ⑤ 강화 체감: 보상 색이 플레이어로 수렴 → 증가분 부상 텍스트 → 누적 표식 갱신
      playRewardConvergence(this, this.player.x, this.player.y, chosen);
      showGainText(this, this.player.x, this.player.y, chosen);
      this.growthMarks.sync(
        state.rewards.length,
        state.elementalAffinity,
        this.player.x,
        this.player.y,
      );
      if (chosen.kind === 'evolve' && chosen.evolve) {
        // 진화·융합은 LLM 작명이 필요해 비동기 — 작명은 반드시 성공하므로(폴백) 미완료 상태가 없다
        void this.applyEvolution(chosen.evolve);
        console.info('[Run] reward-applied', chosen, state);
        return;
      }
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
  /**
   * 주문서 유산 선택 (Phase 5) — 보스가 기억하듯 플레이어도 기억한다.
   * 이전 런의 주문 중 하나를 Lv1 각인으로 장착하고 출발한다. 주문서가 비면 조용히 넘어간다.
   */
  private async offerLegacyEngrave(): Promise<void> {
    // 런 시작 시점에 격상 프로필을 확정한다 (이후 시전 경로는 이 캐시만 읽는다)
    const memory = loadRunMemory();
    this.runEscalation = runEscalationProfile(memory);
    this.escalationNoticed.clear();

    const book = loadGrimoire();
    this.grimoireCount = book.length; // 런 시작마다 1회 — HUD 캐시 갱신
    const offers = offerEntries(book);
    if (offers.length === 0) return;

    this.legacySelecting = true;
    try {
      const options: RewardOption[] = offers.map((entry) => {
        // 격상(#77)으로 약화된 원소는 카드에 명시한다 —
        // 모르고 고르면 "물려받았는데 약하다"가 되고, 알고 고르면 전략적 선택이 된다.
        const weakened = this.runEscalation.weakenedElements.includes(entry.element);
        const weakenPercent = Math.round((1 - this.runEscalation.weakenMultiplier) * 100);
        return {
          id: `legacy-${entry.normalized}`,
          kind: 'engrave' as const,
          title: `유산 · ${entry.name}`,
          description: `${ELEMENT_LABELS[entry.element]} ${FORM_LABELS[entry.form]} · 위력 ${Math.round(entry.power)}`
            + ` — 지난 런의 주문, Lv1 각인으로 시작`
            + (weakened ? `\n⚠ ${ELEMENT_LABELS[entry.element]} 약화 −${weakenPercent}%` : ''),
          element: entry.element,
          engrave: { spellKey: entry.normalized, level: 1 },
        };
      });
      const chosen = await showRewardCards(options, {
        kicker: 'GRIMOIRE',
        title: '주문서에서 유산을 꺼낸다',
      });
      const entry = offers.find((e) => `legacy-${e.normalized}` === chosen.id);
      if (entry) {
        // 후보로 등록한 뒤 각인 — 이후 보상에서 같은 주문 강화 카드도 자연히 이어진다
        this.engraveManager.rememberManualCast(entry.normalized, specFromEntry(entry));
        const engraved = this.engraveManager.applyReward(chosen);
        if (engraved) {
          this.announceSystemMessage(`유산 각인 — 『${engraved.spell.name}』`, '#ffd166', 2800);
        }
      }
    } finally {
      this.legacySelecting = false;
    }
  }

  private persistRunMemory(result: 'win' | 'lose'): void {
    saveRunMemory(updateRunMemory(loadRunMemory(), summarizeRun(this.spellHistory, result)));
    // 주문서 유산 기록 — 런을 클리어(승리)했을 때만. 큰 주문 하나 쓰고 자살해 유산을 파밍하는
    // 치즈를 막고, 유산 각인을 "클리어 보상"으로 만든다. (보스 기억은 위에서 승패 무관 유지)
    if (result !== 'win') return;
    const best = bestEntryFromRun(this.spellHistory, result);
    if (best) {
      const updated = addEntry(loadGrimoire(), best);
      saveGrimoire(updated);
      this.grimoireCount = updated.length;
    }
  }

  /** 새 런 — 씬 재시작 없이 상태만 초기화. 컨트롤러 reset이 room-started를 발화해 방 1부터 재개된다. */
  private restartRun(): void {
    this.deathHandled = false;
    this.bossResistance = { ...NO_BOSS_RESISTANCE };
    this.activeBossResistances.clear();
    this.lastResistNoticeAt = 0;
    this.spellHistory.reset();
    this.engraveManager.reset();
    this.spiritManager.reset();
    this.clearSpiritViews();
    this.growthMarks.reset();
    this.spiritOrbitAngle = -Math.PI / 2;
    this.engraveRewardRand = createRunRandom(Date.now());
    this.playerState.reset();
    this.combatRunController.reset();
    // 새 런에도 유산 선택 — 직전 런에서 기록된 주문이 곧바로 후보가 된다
    void this.offerLegacyEngrave();
  }

  private startRoom(roomIndex: number): void {
    const encounter = this.combatRunController.state;
    this.enemyHitStop.clear();
    this.enemyKnockbacks.clear();
    resetCameraShake(this);
    // 약화 안내는 방마다 다시 한 번씩 — 새 방에서 상황을 상기시키되 도배하지 않는다
    this.escalationNoticed.clear();
    this.roomClearPending = false;
    this.manaPotionSpawnedThisRoom = false;
    this.manaPotionSpawnRemaining = manaPotionSpawnDelay(Math.random());
    this.eliteSpawnIndex = 0;
    this.eliteModifierAssignments = [];
    this.clearCombatRoom();
    this.applyRoomBackdrop(roomIndex);
    this.basicAttackCooldownRemaining = 0;
    this.player.setPosition(this.worldBounds.centerX, this.worldBounds.centerY);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    if (this.isBossEncounter()) {
      this.startBossRoom(encounter.encounterKind === 'memory-boss');
      return;
    }
    const waveSet = encounter.waveSetId ? WAVE_SETS[encounter.waveSetId] : undefined;
    if (!waveSet) throw new Error(`Unknown wave set: ${encounter.waveSetId ?? '(missing)'}`);
    this.waveManager = new WaveManager(waveSet);
    this.audio.playBgm('combat');
    this.spawnWave(this.waveManager.start());
    this.announceSystemMessage(`방 ${roomIndex}`, '#8fa4ff');
  }

  /** 마지막 방 = 보스방 관례 (rewardConfig.maxRooms 참조) */
  private isBossEncounter(): boolean {
    const kind = this.combatRunController.state.encounterKind;
    return kind === 'stage-boss' || kind === 'memory-boss';
  }

  private startBossRoom(usesMemory: boolean): void {
    const bossRoomIndex = this.combatRunController.state.roomIndex;
    this.bossEliteSummonIndex = 0;
    this.audio.playBgm('boss');
    // 단기(이번 런) 적응 — R2 내성 계약 소비 (GDD §4.1)
    this.bossResistance = { ...NO_BOSS_RESISTANCE };
    this.activeBossResistances.clear();
    this.activeBossPhase = 1;
    const runMemory = loadRunMemory();
    // 장기(지난 런들) 기억 — 단기 표본 부족 시 부분 내성으로 발동 (GDD §4.2)
    if (usesMemory) {
      const longTerm = longTermResistedElement(runMemory);
      if (longTerm) {
        this.bossResistance = {
          resistedElement: longTerm,
          resistMultiplier: BOSS_CONFIG.longTermResistMultiplier,
          counterStrategy: this.bossResistance.counterStrategy,
        };
        this.activeBossResistances.set(longTerm, BOSS_CONFIG.longTermResistMultiplier);
        // 런 반복 격상 티어4(#77): 회차가 쌓이면 보스가 두 번째 원소까지 학습한다.
        // 최근 과의존 원소 중 1차와 다른 것을 골라 이중 저항으로 건다. activeBossResistances가
        // 링 색·실제 데미지·알림의 단일 소스라, 여기 넣으면 셋 다 이중으로 반영된다.
        // 캐시(this.runEscalation) 대신 이 시점 runMemory로 직접 판정 — 새 런의 clears를 확실히 반영.
        if (runEscalationProfile(runMemory).bossDualResistance) {
          const secondary = runMemory.recentDominantElements.find((element) => element !== longTerm);
          if (secondary) {
            this.addBossResistance(secondary, BOSS_CONFIG.longTermResistMultiplier);
          }
        }
      }
    }

    const boss = new BossEnemy(
      this,
      this.player.x,
      this.player.y - 340,
      usesMemory ? 'memory' : 'stage',
    );
    this.bossPatternController = new BossPatternController(usesMemory ? 'memory' : 'stage');
    const isCurrentBossRoom = (): boolean => {
      const state = this.combatRunController.state;
      return state.phase === 'combat'
        && state.roomIndex === bossRoomIndex
        && boss.alive
        && this.enemies.includes(boss);
    };
    boss.showResistances(this.sortedBossResistanceElements());
    if (this.bossResistance.counterStrategy) {
      boss.applyCounterStrategy(this.bossResistance.counterStrategy);
    }
    this.enemies.push(boss);
    this.audio.playSfx('boss-appear');
    requestCameraShake(this, 'medium');

    this.announceSystemMessage('보스의 방', '#ff6b86');
    // 오프닝 대사 — R2 /boss-line (프록시 생성 우선, 템플릿 폴백 내장)
    if (usesMemory) void getBossLine(runMemory).then((line) => {
      if (!isCurrentBossRoom()) return;
      this.time.delayedCall(500, () => {
        if (!isCurrentBossRoom()) return;
        this.announceSystemMessage(`"${line.text}"`, '#d0a8ff', 2800);
      });
    });
    // 저항 알림은 activeBossResistances(단일 소스)에서 뽑는다 — 격상 이중 저항이면 두 원소를
    // 함께 알려야 플레이어가 대응할 수 있다. 단일 저항이면 기존과 동일하게 한 원소만 나온다.
    const resistedElements = this.sortedBossResistanceElements();
    if (resistedElements.length > 0) {
      const [primary] = resistedElements;
      const labels = resistedElements.map((element) => ELEMENT_LABELS[element]).join('·');
      this.time.delayedCall(1500, () => {
        if (!isCurrentBossRoom()) return;
        this.announceSystemMessage(
          `보스가 ${labels}에 대비했다 — 해당 원소 피해 대폭 감소`,
          paletteColorToCss(ELEMENT_PALETTES[primary].core),
          2800,
        );
      });
    }
  }

  private clearCombatRoom(): void {
    this.enemyHitStop.clear();
    this.enemyKnockbacks.clear();
    this.clearBossPatternEffects();
    this.clearEnemyControls();
    for (const enemy of this.enemies) enemy.destroy({ animate: false });
    this.enemies = [];
    for (const decoration of this.hazardDecorations) decoration.destroy();
    this.hazardDecorations = [];
    this.clearManaCrystals();
    this.clearManaPotion();
    this.clearTransientCombatObjects();
  }

  private clearTransientCombatObjects(): void {
    this.clearEnemyProjectiles();
    this.clearFriendlyMissiles();
    this.clearSummon();
    this.clearActiveWall();
    this.clearActiveOrbit();
    this.clearUnstableWarnings();
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

    this.waveText = this.add.text(width - 34, 72, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#72f1b8',
      align: 'right',
      lineSpacing: 3,
      wordWrap: { width: 256, useAdvancedWrap: true },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

    // 빌드 패널 — "지금 내가 뭘 들고 있나"를 상시 노출 (각인·정령·주문서).
    // 우하단은 비어 있어 전투 시야를 가리지 않는다. 우상단은 ROOM/WAVE 전용으로 남긴다.
    this.buildHudText = this.add.text(width - 20, height - 26, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#8fa4ff',
      align: 'right',
      lineSpacing: 3,
      wordWrap: { width: 430, useAdvancedWrap: true },
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(100);

    this.add.text(20, height - 28, 'WASD 이동  ·  ENTER 영창', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#59679d',
    }).setScrollFactor(0).setDepth(100);
  }

  /** Phase 5 트레일 — 이동 중 잔상 스폰 간격 타이머 (Track C 아트 디렉션). */
  private playerTrailCooldown = 0;

  private updatePlayerMovement(deltaSeconds: number): void {
    if (this.incanting || this.casting || !this.playerState.alive) return;

    const direction = new Phaser.Math.Vector2(
      Number(this.moveKeys.right.isDown) - Number(this.moveKeys.left.isDown),
      Number(this.moveKeys.down.isDown) - Number(this.moveKeys.up.isDown),
    );
    if (direction.lengthSq() === 0) return;

      this.lastMoveDir.copy(direction).normalize(); // 돌진 방향용
      const speed = 220 * this.playerState.moveSpeedMultiplier; // haste 버프 반영
      direction.normalize().scale(speed * deltaSeconds);
      const previousX = this.player.x;
      const previousY = this.player.y;
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

      const actuallyMoved = this.player.x !== previousX || this.player.y !== previousY;
      if (!actuallyMoved) return;

      // 이동 중 잔상 트레일 (네온 잔광). 스폰 간격으로 오브젝트 폭증을 억제한다.
    this.playerTrailCooldown -= deltaSeconds;
    if (this.playerTrailCooldown <= 0) {
      this.playerTrailCooldown = TRAIL_CONFIG.spawnIntervalSeconds;
      spawnTrailGhost(this, this.player.x, this.player.y, 12, 0x8fa4ff, this.player.depth - 1);
    }
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

    // AI 생성 배경을 base 위·grid 아래에 깔아 도형 데모 느낌을 벗는다.
    // 방별 색조는 tint로 준다 (전용 stage2/보스 배경 생성 전까지 한 이미지 재사용).
    if (this.textures.exists('bg-stage1')) {
      // 완전 스크롤 맵 — 월드 전체(width×height)에 깔고 카메라를 따라 스크롤(scrollFactor 1).
      // 월드 크기 텍스처를 재생성했으므로 확대 흐림 없이 맵을 돌아다니는 느낌을 준다.
      this.backdropImage = this.add.image(width / 2, height / 2, 'bg-stage1')
        .setDisplaySize(width, height)
        .setDepth(-99.5)
        .setTint(initial.bgTint);
    }
    this.backdropGrid = this.add.graphics().setDepth(-99);
    this.redrawBackdropDetails(initial);
    // 리치 배경 위라 네온 그리드는 은은한 텍스처로만 남긴다
    this.backdropGrid.setAlpha(0.28);
  }

  private applyRoomBackdrop(_roomIndex: number): void {
    const state = this.combatRunController.state;
    const palette = backdropPaletteForEncounter(state.stage, this.isBossEncounter());
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
    // 보스방은 전용 배경으로 교체한다. setTexture가 표시 크기를 리셋하므로 월드 크기를 다시 준다.
    const bgKey = this.isBossEncounter() ? 'bg-boss' : 'bg-stage1';
    if (
      this.backdropImage
      && this.textures.exists(bgKey)
      && this.backdropImage.texture.key !== bgKey
    ) {
      this.backdropImage
        .setTexture(bgKey)
        .setDisplaySize(this.worldBounds.width, this.worldBounds.height);
    }
    this.backdropImage?.setTint(palette.bgTint); // 방별 배경 색조
    this.backdropColor = palette.base;
  }

  private redrawBackdropDetails(palette: RoomBackdropPalette): void {
    const { width, height } = this.worldBounds;
    this.backdropGrid.clear().lineStyle(1, palette.grid, palette.gridAlpha);
    for (let x = 0; x <= width; x += 48) this.backdropGrid.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += 48) this.backdropGrid.lineBetween(0, y, width, y);
  }

  private createPlayer(x: number, y: number): void {
    // 마법진은 **끊어진 호**로 그린다. 완전한 원은 돌려도 회전이 눈에 보이지 않아
    // 플레이어가 굳어 보였다. 두 겹을 서로 반대로 돌려 살아있는 느낌을 준다.
    this.playerRingOuter = this.drawArcRing(60, 3, 0x4c66ff, 0.30);
    this.playerRingInner = this.drawArcRing(44, 4, 0x8fa4ff, 0.22);
    // AI 스프라이트(인물만). 원본에는 마법진이 함께 그려져 있었지만 위 마법진과
    // 중복되고, 링이 에워싼 안쪽 배경이 누끼로 안 빠져서 인물만 잘라 쓴다.
    const bodyLayers = this.textures.exists('player-invoker')
      ? createSpriteLayers(this, 'player-invoker', 40, 0x8fa4ff)
      : [this.add.circle(0, 0, 14, 0x8fa4ff).setBlendMode(Phaser.BlendModes.ADD)];
    [this.playerBody] = bodyLayers;
    // 이미지 자체에 셰이더 발광을 건다. 주변 링만 돌면 정작 인물은 굳은 채로 남는다.
    // preFX는 GameObject 전용이라 Container(this.player)가 아니라 스프라이트에 건다.
    this.playerGlowFx = this.playerBody.preFX?.addGlow(0x8fa4ff, 3, 0, false) ?? null;
    if (this.playerGlowFx) {
      // 발광 세기 자체를 호흡시킨다 — 이미지가 숨 쉬는 것처럼 보인다.
      this.playerGlowPulse = this.tweens.add({
        targets: this.playerGlowFx,
        outerStrength: { from: 2.2, to: 4.6 },
        yoyo: true, repeat: -1, duration: 1500, ease: 'Sine.easeInOut',
      });
    }
    // 미세한 크기 호흡. setDisplaySize가 이미 스케일을 잡아놨으므로 절대값이 아니라
    // 현재 스케일 기준으로 트윈해야 한다(1로 넣으면 원본 256px로 튄다).
    for (const layer of bodyLayers) {
      const baseScale = layer.scaleX;
      this.tweens.add({
        targets: layer,
        scaleX: { from: baseScale, to: baseScale * 1.05 },
        scaleY: { from: baseScale, to: baseScale * 1.05 },
        yoyo: true, repeat: -1, duration: 1700, ease: 'Sine.easeInOut',
      });
    }
    this.playerHalo = this.add.circle(0, 0, 22, 0x4c66ff, 0.25)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.player = this.add.container(
      x,
      y,
      [this.playerRingOuter, this.playerRingInner, this.playerHalo, ...bodyLayers],
    );
    this.tweens.add({
      targets: this.playerHalo, scale: { from: 1, to: 1.25 },
      yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut',
    });
  }

  /** 회전이 보이도록 균등한 간격을 둔 호(arc) 링을 그린다. */
  private drawArcRing(
    radius: number,
    segments: number,
    color: number,
    alpha: number,
  ): Phaser.GameObjects.Graphics {
    const ring = this.add.graphics().lineStyle(2, color, alpha);
    const span = (Math.PI * 2) / segments;
    const gap = span * 0.32; // 끊긴 구간 — 이 틈 덕분에 회전이 읽힌다
    for (let i = 0; i < segments; i += 1) {
      const start = span * i;
      ring.beginPath();
      ring.arc(0, 0, radius, start, start + span - gap, false);
      ring.strokePath();
    }
    return ring;
  }

  /** 마법진 상시 회전 — 서 있든 영창 중이든 멈추지 않아야 살아 보인다. */
  private updatePlayerAura(deltaSeconds: number): void {
    if (!this.player?.active) return;
    this.playerRingOuter.rotation += 0.35 * deltaSeconds;
    this.playerRingInner.rotation -= 0.55 * deltaSeconds;
  }

  /** 영창 성공 순간의 발산 — 이 게임의 핵심 행동이라 피드백을 준다. */
  private playCastFlare(): void {
    if (!this.player?.active) return;
    for (const [ring, to] of [
      [this.playerRingOuter, 1.18] as const,
      [this.playerRingInner, 1.26] as const,
    ]) {
      this.tweens.killTweensOf(ring);
      ring.setScale(1).setAlpha(1);
      this.tweens.add({
        targets: ring,
        scale: { from: 0.9, to },
        alpha: { from: 1, to: 0.45 },
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => { if (ring.active) ring.setScale(1).setAlpha(1); },
      });
    }
    // 이미지의 발광도 함께 터뜨린다. 호흡 루프는 죽이지 않고 잠시 멈췄다 되살린다
    // (kill하면 이후 호흡이 영영 사라진다).
    if (this.playerGlowFx) {
      this.playerGlowPulse?.pause();
      this.tweens.add({
        targets: this.playerGlowFx,
        outerStrength: { from: 9, to: 2.6 },
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => this.playerGlowPulse?.resume(),
      });
    }
  }

  /** 플레이어 피격 반응 — 적과 동일한 규칙(흰 플래시 + squash)을 그대로 쓴다. */
  private playPlayerHit(shakeTier: CameraShakeTier = 'weak'): void {
    if (!this.player?.active || !this.playerBody) return;
    playHitReact(this, this.player, this.playerBody, 0x8fa4ff);
    requestCameraShake(this, shakeTier);
  }

  private spawnWave(definition: WaveDefinition): void {
    const sequence: EnemyKind[] = [
      ...Array<EnemyKind>(definition.chaserCount).fill('chaser'),
      ...Array<EnemyKind>(definition.shooterCount).fill('shooter'),
      ...Array<EnemyKind>(definition.splitterCount).fill('splitter'),
      ...Array<EnemyKind>(definition.shieldSentinelCount ?? 0).fill('shield-sentinel'),
    ];
    if (this.combatRunController.state.encounterKind === 'elite') {
      this.eliteModifierAssignments = this.createEliteAssignments(sequence.length);
      this.eliteSpawnIndex = 0;
    }
    sequence.forEach((kind, index) => {
      const position = this.waveSpawnPosition(index, sequence.length);
      this.spawnEnemy(kind, position.x, position.y, true);
    });
    if (definition.hazard && this.hazardZones.length === 0) this.spawnHazards();
    this.announceSystemMessage(`웨이브 ${this.waveManager.currentWaveNumber}`);
  }

  private clearBossPatternEffects(): void {
    this.bossPatternController = null;
    this.bossChargeTelegraph?.destroy();
    this.bossChargeTelegraph = null;
    this.bossChargeTarget = null;
    this.bossVolleyTelegraph?.destroy();
    this.bossVolleyTelegraph = null;
    this.bossVolleyAngles = [];
    for (const warning of this.bossHazardWarnings) {
      if (warning.active) warning.destroy();
    }
    this.bossHazardWarnings = [];
    for (const hazard of this.hazardZones) {
      if (hazard.view.active) hazard.view.destroy();
    }
    this.hazardZones = [];
    this.clearEnemyProjectiles();
  }

  private spawnHazards(): void {
    const radius = 72;
    const offsets = [
      [-180, -110],
      [170, 90],
      [20, 145],
    ] as const;
    for (const [offsetX, offsetY] of offsets) {
      const view = this.add.circle(
        Phaser.Math.Clamp(this.worldBounds.centerX + offsetX, this.worldBounds.left + radius, this.worldBounds.right - radius),
        Phaser.Math.Clamp(this.worldBounds.centerY + offsetY, this.worldBounds.top + radius, this.worldBounds.bottom - radius),
        radius,
        0xb52f57,
        0.42,
      ).setStrokeStyle(4, 0xff5370, 0.92);
      this.hazardZones.push({
        view,
        contains: (x, y) => Phaser.Math.Distance.Between(x, y, view.x, view.y) <= radius,
        damageCooldown: 0,
      });
    }

    this.spawnBoundaryHazards(900, 650);
  }

  private spawnBoundaryHazards(safeWidth: number, safeHeight: number): void {
    const safeLeft = this.worldBounds.centerX - safeWidth / 2;
    const safeRight = this.worldBounds.centerX + safeWidth / 2;
    const safeTop = this.worldBounds.centerY - safeHeight / 2;
    const safeBottom = this.worldBounds.centerY + safeHeight / 2;
    const boundaryRects = [
      new Phaser.Geom.Rectangle(
        this.worldBounds.left,
        this.worldBounds.top,
        this.worldBounds.width,
        safeTop - this.worldBounds.top,
      ),
      new Phaser.Geom.Rectangle(
        this.worldBounds.left,
        safeBottom,
        this.worldBounds.width,
        this.worldBounds.bottom - safeBottom,
      ),
      new Phaser.Geom.Rectangle(
        this.worldBounds.left,
        safeTop,
        safeLeft - this.worldBounds.left,
        safeHeight,
      ),
      new Phaser.Geom.Rectangle(
        safeRight,
        safeTop,
        this.worldBounds.right - safeRight,
        safeHeight,
      ),
    ];

    for (const bounds of boundaryRects) {
      const view = this.add.rectangle(
        bounds.centerX,
        bounds.centerY,
        bounds.width,
        bounds.height,
        0x8f183e,
        0.14,
      );
      this.hazardZones.push({
        view,
        contains: (x, y) => bounds.contains(x, y),
        damageCooldown: 0,
      });
    }

    const boundaryLine = this.add.graphics()
      .lineStyle(3, 0xff5370, 0.72)
      .strokeRect(safeLeft, safeTop, safeWidth, safeHeight);
    this.hazardDecorations.push(boundaryLine);
  }

  private updateHazards(deltaSeconds: number): void {
    for (const hazard of this.hazardZones) {
      hazard.damageCooldown = Math.max(0, hazard.damageCooldown - deltaSeconds);
      if (hazard.damageCooldown > 0) continue;
      if (!hazard.contains(this.player.x, this.player.y)) continue;
      const applied = this.playerState.takeDamage(9);
if (applied) this.playPlayerHit();
      this.announceIncomingDamage(applied.hpDamage, applied.shieldDamage);
      hazard.onDamage?.();
      hazard.damageCooldown = 0.75;
    }
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

  private spawnEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    applyEncounterModifier = false,
    explicitModifier?: EliteModifier,
  ): void {
    let enemy: CombatEnemy;
    switch (kind) {
      case 'shield-sentinel':
        enemy = new ShieldSentinelEnemy(this, x, y);
        break;
      case 'shooter':
        enemy = new ShooterEnemy(this, x, y);
        break;
      case 'splitter':
        enemy = new SplitterEnemy(this, x, y);
        break;
      case 'small-splitter':
        enemy = new SplitterEnemy(this, x, y, true);
        break;
      case 'chaser':
      default:
        enemy = new ChaserEnemy(this, x, y);
        break;
    }
    const modifier = explicitModifier ?? (
      applyEncounterModifier && this.eliteModifierAssignments.length > 0
        ? this.eliteModifierAssignments[this.eliteSpawnIndex++]
        : undefined
    );
    this.enemies.push(modifier ? new EliteEnemy(this, enemy, modifier) : enemy);
  }

  private createEliteAssignments(enemyCount: number): EliteModifier[] {
    const modifierPool = [...ELITE_MODIFIERS];
    const assignments: EliteModifier[] = modifierPool.slice(0, enemyCount);
    while (assignments.length < enemyCount) {
      assignments.push(Phaser.Utils.Array.GetRandom(modifierPool));
    }
    return Phaser.Utils.Array.Shuffle(assignments);
  }

  private updateWaveFlow(deltaSeconds: number): void {
    if (!this.playerState.alive) return;

    const nextWave = this.waveManager.update(deltaSeconds);
    if (nextWave) this.spawnWave(nextWave);
  }

  private updateEnemies(deltaSeconds: number): void {
    if (!this.playerState.alive) return;

    const stoppedEnemies = new Set<CombatEnemy>();
    for (const enemy of this.enemies) {
      this.updateEnemyKnockback(enemy, deltaSeconds);
      if (this.enemyHitStop.advance(enemy, deltaSeconds)) {
        stoppedEnemies.add(enemy);
        continue;
      }
      const previous = { x: enemy.x, y: enemy.y };
      const wasCharging = enemy instanceof BossEnemy && enemy.charging;
      const movementMultiplier = enemy instanceof BossEnemy
        && (this.bossChargeTarget || this.bossVolleyTelegraph)
        ? 0
        : this.enemyControlState.movementMultiplierFor(enemy);
      const shots = enemy.update(
        deltaSeconds,
        this.player.x,
        this.player.y,
        movementMultiplier,
      );
      if (enemy instanceof BossEnemy && enemy.phase !== this.activeBossPhase) {
        this.handleBossPhaseChanged(enemy);
      }
      if (enemy instanceof BossEnemy) {
        if (wasCharging || enemy.charging) this.updateBossChargeTrail(enemy, deltaSeconds);
        if (wasCharging && !enemy.charging) {
          this.showBossChargeShockwave(enemy.x, enemy.y, 0xd0a8ff);
          requestCameraShake(this, 'medium');
        }
      }
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
      this.resolveWallEnemyCollision(enemy, previous);
      if (enemy.alive) {
        for (const shot of shots) this.spawnEnemyProjectile(shot);
      }
    }
    const bossStopped = [...stoppedEnemies].some((enemy) => enemy instanceof BossEnemy);
    if (!bossStopped) this.updateBossPattern(deltaSeconds);

    let totalHpDamage = 0;
    let totalShieldDamage = 0;
    for (const enemy of this.enemies) {
      if (stoppedEnemies.has(enemy)) continue;
      const touching = Phaser.Math.Distance.Between(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
      ) <= enemy.contactDistance;
      if (!touching || !enemy.canDealContactDamage) continue;

      const applied = this.playerState.takeDamage(enemy.contactDamage);
if (applied) this.playPlayerHit(
        enemy instanceof BossEnemy && enemy.charging ? 'strong' : 'weak',
      );
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

  private updateEnemyKnockback(enemy: CombatEnemy, deltaSeconds: number): void {
    const state = this.enemyKnockbacks.get(enemy);
    if (!state || !enemy.alive) return;
    const step = Math.min(Math.max(0, deltaSeconds), state.remainingSeconds);
    enemy.view.x = Phaser.Math.Clamp(
      enemy.view.x + state.velocityX * step,
      this.worldBounds.left + enemy.collisionRadius,
      this.worldBounds.right - enemy.collisionRadius,
    );
    enemy.view.y = Phaser.Math.Clamp(
      enemy.view.y + state.velocityY * step,
      this.worldBounds.top + enemy.collisionRadius,
      this.worldBounds.bottom - enemy.collisionRadius,
    );
    state.remainingSeconds = Math.max(0, state.remainingSeconds - step);
    if (state.remainingSeconds === 0) this.enemyKnockbacks.delete(enemy);
  }

  private handleBossPhaseChanged(boss: BossEnemy): void {
    this.activeBossPhase = boss.phase;
    requestCameraShake(this, 'medium');
    this.clearEnemyProjectiles();
    this.bossChargeTelegraph?.destroy();
    this.bossChargeTelegraph = null;
    this.bossChargeTarget = null;
    this.bossVolleyTelegraph?.destroy();
    this.bossVolleyTelegraph = null;
    this.bossVolleyAngles = [];
    const isMemoryBoss = this.combatRunController.state.encounterKind === 'memory-boss';
    if (isMemoryBoss && boss.phase === 2) {
      this.bossResistance = computeResistance(this.spellHistory.bossMemory());
      if (this.bossResistance.resistedElement) {
        this.addBossResistance(
          this.bossResistance.resistedElement,
          this.bossResistance.resistMultiplier,
        );
      }
      boss.showResistances(this.sortedBossResistanceElements());
      if (this.bossResistance.counterStrategy) {
        boss.applyCounterStrategy(this.bossResistance.counterStrategy);
      }
      this.bossPatternController?.setCounterStrategy(this.bossResistance.counterStrategy);
      const resistanceLabel = this.bossResistance.resistedElement
        ? `${ELEMENT_LABELS[this.bossResistance.resistedElement]} 내성 · `
        : '';
      const counterLabel = this.bossResistance.counterStrategy === 'rush'
        ? '원거리 영창 대응: 돌진 강화'
        : this.bossResistance.counterStrategy === 'ranged'
          ? '근거리 영창 대응: 탄막·장판 강화'
          : '기억 부족: 혼합 패턴 유지';
      this.announceSystemMessage(
        `기억 적응 · ${resistanceLabel}${counterLabel}`,
        '#d0a8ff',
        2800,
      );
      return;
    }
    if (isMemoryBoss && boss.phase === 3) {
      this.announceSystemMessage(
        '기억 융합 · 엘리트 소환과 카운터 결합',
        '#ff8fa3',
        2800,
      );
    }
  }

  private updateBossPattern(deltaSeconds: number): void {
    const controller = this.bossPatternController;
    const boss = this.enemies.find((enemy): enemy is BossEnemy => enemy instanceof BossEnemy);
    if (!controller || !boss?.alive) return;
    const livingMinions = this.enemies.filter((enemy) => enemy !== boss && enemy.alive).length;
    const result = controller.update(deltaSeconds, boss.phase, livingMinions);
    for (const action of result.actions) this.executeBossPattern(action, boss);
  }

  private executeBossPattern(action: BossPatternAction, boss: BossEnemy): void {
    switch (action) {
      case 'volley-telegraph':
        this.showBossVolleyTelegraph(
          boss,
          this.isMemoryBossEncounter()
            && boss.phase >= 2
            && this.bossResistance.counterStrategy === 'ranged'
            ? 16
            : 12,
        );
        break;
      case 'volley-start':
        requestCameraShake(this, 'medium');
        this.spawnBossVolley(boss, this.bossVolleyAngles);
        this.bossVolleyTelegraph?.destroy();
        this.bossVolleyTelegraph = null;
        this.bossVolleyAngles = [];
        break;
      case 'summon':
        this.spawnBossMinions(boss);
        break;
      case 'summon-elite':
        requestCameraShake(this, 'medium');
        this.spawnBossEliteMinion(boss);
        break;
      case 'charge-telegraph':
        this.showBossChargeTelegraph(boss);
        break;
      case 'charge-start':
        if (this.bossChargeTarget) {
          requestCameraShake(this, 'weak');
          this.showBossChargeShockwave(boss.x, boss.y, 0xff5370);
          this.bossChargeTrailCooldown = 0;
          boss.startCharge(
            this.bossChargeTarget.x,
            this.bossChargeTarget.y,
            this.bossChargeDistance(boss),
          );
        }
        this.bossChargeTelegraph?.destroy();
        this.bossChargeTelegraph = null;
        this.bossChargeTarget = null;
        break;
      case 'surround':
        requestCameraShake(this, 'weak');
        this.spawnBossSurroundMinions();
        break;
      case 'hazard':
        requestCameraShake(this, 'medium');
        this.spawnBossHazard(boss);
        break;
    }
  }

  private showBossVolleyTelegraph(boss: BossEnemy, projectileCount: number): void {
    this.bossVolleyTelegraph?.destroy();
    const offset = Math.random() * Math.PI * 2;
    this.bossVolleyAngles = Array.from(
      { length: projectileCount },
      (_, index) => offset + (Math.PI * 2 * index) / projectileCount,
    );
    const warning = this.add.graphics().setDepth(-1).setBlendMode(Phaser.BlendModes.ADD);
    warning.lineStyle(3, 0xff8f70, 0.72);
    for (const angle of this.bossVolleyAngles) {
      const direction = new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle));
      const distance = this.rayDistanceToWorldBounds(boss.x, boss.y, direction.x, direction.y);
      warning.lineBetween(
        boss.x + direction.x * 48,
        boss.y + direction.y * 48,
        boss.x + direction.x * distance,
        boss.y + direction.y * distance,
      );
    }
    this.bossVolleyTelegraph = warning;
    this.tweens.add({
      targets: warning,
      alpha: { from: 0.28, to: 1 },
      duration: 175,
      yoyo: true,
      repeat: 1,
      ease: 'Sine.easeInOut',
    });
  }

  private spawnBossVolley(boss: BossEnemy, angles: readonly number[]): void {
    this.showBossChargeShockwave(boss.x, boss.y, 0xff8f70);
    for (const angle of angles) {
      this.spawnEnemyProjectile({
        x: boss.x,
        y: boss.y,
        angle,
        speedMultiplier: 4.5,
      });
    }
  }

  private rayDistanceToWorldBounds(x: number, y: number, dx: number, dy: number): number {
    const distances = [
      dx > 0 ? (this.worldBounds.right - x) / dx : Number.POSITIVE_INFINITY,
      dx < 0 ? (this.worldBounds.left - x) / dx : Number.POSITIVE_INFINITY,
      dy > 0 ? (this.worldBounds.bottom - y) / dy : Number.POSITIVE_INFINITY,
      dy < 0 ? (this.worldBounds.top - y) / dy : Number.POSITIVE_INFINITY,
    ];
    return Math.min(...distances.filter((distance) => distance >= 0));
  }

  private showBossChargeTelegraph(boss: BossEnemy): void {
    this.bossChargeTelegraph?.destroy();
    const direction = new Phaser.Math.Vector2(this.player.x - boss.x, this.player.y - boss.y);
    if (direction.lengthSq() === 0) direction.set(0, 1);
    direction.normalize();
    const chargeDistance = this.bossChargeDistance(boss);
    this.bossChargeTarget = new Phaser.Math.Vector2(
      Phaser.Math.Clamp(
        boss.x + direction.x * chargeDistance,
        this.worldBounds.left + 22,
        this.worldBounds.right - 22,
      ),
      Phaser.Math.Clamp(
        boss.y + direction.y * chargeDistance,
        this.worldBounds.top + 22,
        this.worldBounds.bottom - 22,
      ),
    );
    const perpendicular = new Phaser.Math.Vector2(-direction.y, direction.x).scale(48);
    const startLeft = new Phaser.Math.Vector2(boss.x, boss.y).add(perpendicular);
    const startRight = new Phaser.Math.Vector2(boss.x, boss.y).subtract(perpendicular);
    const endLeft = this.bossChargeTarget.clone().add(perpendicular);
    const endRight = this.bossChargeTarget.clone().subtract(perpendicular);
    // 기존 삼각형 화살표를 통로 테두리와 겹치지 않도록 안쪽에 둔다.
    const arrowTip = this.bossChargeTarget.clone().subtract(direction.clone().scale(18));
    const arrowBase = this.bossChargeTarget.clone().subtract(direction.clone().scale(56));
    const arrowWing = new Phaser.Math.Vector2(-direction.y, direction.x).scale(34);
    const arrowLeft = arrowBase.clone().add(arrowWing);
    const arrowRight = arrowBase.clone().subtract(arrowWing);
    this.bossChargeTelegraph = this.add.graphics()
      .fillStyle(0xff5370, 0.14)
      .fillPoints([startLeft, endLeft, endRight, startRight], true)
      .lineStyle(3, 0xff8fa3, 0.78)
      .lineBetween(startLeft.x, startLeft.y, endLeft.x, endLeft.y)
      .lineBetween(startRight.x, startRight.y, endRight.x, endRight.y)
      .lineBetween(endLeft.x, endLeft.y, endRight.x, endRight.y)
      .fillStyle(0xff8fa3, 0.85)
      .fillTriangle(
        arrowTip.x,
        arrowTip.y,
        arrowLeft.x,
        arrowLeft.y,
        arrowRight.x,
        arrowRight.y,
      )
      .setDepth(-1);
    this.tweens.add({
      targets: this.bossChargeTelegraph,
      alpha: { from: 0.5, to: 1 },
      duration: 180,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private bossChargeDistance(boss: BossEnemy): number {
    return this.isMemoryBossEncounter()
      && boss.phase >= 2
      && this.bossResistance.counterStrategy === 'rush'
      ? 340
      : BOSS_CHARGE_DISTANCE;
  }

  private isMemoryBossEncounter(): boolean {
    return this.combatRunController.state.encounterKind === 'memory-boss';
  }

  private updateBossChargeTrail(boss: BossEnemy, deltaSeconds: number): void {
    this.bossChargeTrailCooldown -= deltaSeconds;
    if (this.bossChargeTrailCooldown > 0) return;
    this.bossChargeTrailCooldown = 0.045;
    const trail = this.add.circle(boss.x, boss.y, boss.collisionRadius, 0xb44dff, 0.24)
      .setStrokeStyle(3, 0xd0a8ff, 0.55)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: trail,
      alpha: 0,
      scale: 0.72,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => trail.destroy(),
    });
  }

  private showBossChargeShockwave(x: number, y: number, color: number): void {
    const shockwave = this.add.circle(x, y, 22, color, 0.08)
      .setStrokeStyle(5, color, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: shockwave,
      radius: 78,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => shockwave.destroy(),
    });
  }

  private spawnBossSurroundMinions(): void {
    for (let i = 0; i < 3; i++) {
      const angle = (Math.PI * 2 * i) / 3;
      const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * 180, this.worldBounds.left + 30, this.worldBounds.right - 30);
      const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * 180, this.worldBounds.top + 30, this.worldBounds.bottom - 30);
      this.spawnEnemy('chaser', x, y);
    }
  }

  private spawnBossEliteMinion(boss: BossEnemy): void {
    const modifier = ELITE_MODIFIERS[this.bossEliteSummonIndex++ % ELITE_MODIFIERS.length];
    const angle = Math.random() * Math.PI * 2;
    const x = Phaser.Math.Clamp(
      boss.x + Math.cos(angle) * 120,
      this.worldBounds.left + 30,
      this.worldBounds.right - 30,
    );
    const y = Phaser.Math.Clamp(
      boss.y + Math.sin(angle) * 120,
      this.worldBounds.top + 30,
      this.worldBounds.bottom - 30,
    );
    this.spawnEnemy('chaser', x, y, false, modifier);
  }

  private spawnBossHazard(boss: BossEnemy): void {
    const enhanced = this.isMemoryBossEncounter()
      && boss.phase >= 2
      && this.bossResistance.counterStrategy === 'ranged';
    const radius = enhanced ? 165 : 130;
    const centers = this.bossHazardCenters(radius, 5, enhanced);
    for (const center of centers) {
      this.spawnBossHazardAt(center.x, center.y, radius);
    }
  }

  private spawnBossHazardAt(x: number, y: number, radius: number): void {
    const warningDurationMs = 1200;
    const outerRing = this.add.circle(0, 0, radius, 0xff5370, 0.06)
      .setStrokeStyle(4, 0xff5370, 0.92)
      .setBlendMode(Phaser.BlendModes.ADD);
    const warning = this.add.container(x, y, [outerRing]).setDepth(-1);
    this.bossHazardWarnings.push(warning);
    this.tweens.add({
      targets: outerRing,
      alpha: { from: 0.3, to: 1 },
      duration: 210,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.time.delayedCall(warningDurationMs, () => {
      this.bossHazardWarnings = this.bossHazardWarnings.filter(
        (candidate) => candidate !== warning,
      );
      if (!warning.active) return;
      if (!this.isBossEncounter() || !this.isCombatActive()) {
        warning.destroy();
        return;
      }
      this.tweens.killTweensOf(outerRing);
      outerRing.setAlpha(1).setFillStyle(0x8f183e, 0.32)
        .setStrokeStyle(5, 0xff6b86, 1);
      const particles = this.add.particles(0, 0, 'particle', {
        emitZone: new Phaser.GameObjects.Particles.Zones.RandomZone(
          {
            getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
              const angle = Math.random() * Math.PI * 2;
              const distance = Math.sqrt(Math.random()) * radius * 0.82;
              point.x = Math.cos(angle) * distance;
              point.y = Math.sin(angle) * distance;
            },
          },
        ),
        speed: { min: 25, max: 75 },
        angle: { min: 235, max: 305 },
        lifespan: { min: 380, max: 650 },
        frequency: 75,
        quantity: 2,
        scale: { start: 0.42, end: 0 },
        alpha: { start: 0.8, end: 0 },
        tint: [0xff5370, 0xff8fa3, 0xb44dff],
        blendMode: Phaser.BlendModes.ADD,
      });
      warning.add(particles);
      const zone: HazardZone = {
        view: warning,
        contains: (px, py) => Phaser.Math.Distance.Between(px, py, x, y) <= radius,
        damageCooldown: 0,
        onDamage: () => {
          if (!outerRing.active) return;
          this.tweens.killTweensOf(outerRing);
          outerRing.setAlpha(1).setStrokeStyle(7, 0xffc0c8, 1);
          this.tweens.add({
            targets: outerRing,
            alpha: 0.82,
            duration: 180,
            yoyo: true,
            onComplete: () => {
              if (!outerRing.active) return;
              outerRing.setStrokeStyle(5, 0xff6b86, 1);
            },
          });
        },
      };
      this.hazardZones.push(zone);
      this.time.delayedCall(3500, () => {
        this.hazardZones = this.hazardZones.filter((candidate) => candidate !== zone);
        if (!warning.active) return;
        this.tweens.add({
          targets: warning,
          alpha: 0,
          duration: 380,
          ease: 'Cubic.easeIn',
          onComplete: () => warning.destroy(),
        });
      });
    });
  }

  private bossHazardCenters(
    radius: number,
    count: number,
    includePlayerPosition = false,
  ): Phaser.Math.Vector2[] {
    const centers: Phaser.Math.Vector2[] = includePlayerPosition
      ? [new Phaser.Math.Vector2(this.player.x, this.player.y)]
      : [];
    const minimumSeparation = radius * 2 + 24;
    const minimumDistanceFromPlayer = radius * 0.35;
    const maximumDistanceFromPlayer = radius * 2.6;
    const left = this.worldBounds.left + radius + 10;
    const right = this.worldBounds.right - radius - 10;
    const top = this.worldBounds.top + radius + 10;
    const bottom = this.worldBounds.bottom - radius - 10;

    const tryAdd = (x: number, y: number): boolean => {
      const candidate = new Phaser.Math.Vector2(
        Phaser.Math.Clamp(x, left, right),
        Phaser.Math.Clamp(y, top, bottom),
      );
      if (centers.some((center) => center.distance(candidate) < minimumSeparation)) {
        return false;
      }
      centers.push(candidate);
      return true;
    };

    for (let attempt = 0; attempt < 240 && centers.length < count; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Phaser.Math.FloatBetween(
        minimumDistanceFromPlayer,
        maximumDistanceFromPlayer,
      );
      tryAdd(
        this.player.x + Math.cos(angle) * distance,
        this.player.y + Math.sin(angle) * distance,
      );
    }

    // Near corners, clamping can reject many random candidates. Fill any rare
    // remainder from the arena while preserving the same non-overlap contract.
    for (let attempt = 0; attempt < 240 && centers.length < count; attempt++) {
      tryAdd(
        Phaser.Math.FloatBetween(left, right),
        Phaser.Math.FloatBetween(top, bottom),
      );
    }
    return centers;
  }

  private spawnEnemyProjectile(request: EnemyShotRequest): void {
    const body = this.add.circle(request.x, request.y, 5, 0xff6b4a)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = this.add.circle(request.x, request.y, 9, 0xff9a62, 0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    const velocity = new Phaser.Math.Vector2(
      Math.cos(request.angle),
      Math.sin(request.angle),
    ).scale(SHOOTER_CONFIG.bulletSpeed * (request.speedMultiplier ?? 1));

    this.enemyProjectiles.push({
      body,
      halo,
      velocity,
      lifetimeRemaining: SHOOTER_CONFIG.bulletLifetimeSeconds,
      hitShakeTier: (request.speedMultiplier ?? 1) >= 4 ? 'medium' : 'weak',
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
      const previous = { x: projectile.body.x, y: projectile.body.y };
      projectile.body.x += projectile.velocity.x * deltaSeconds;
      projectile.body.y += projectile.velocity.y * deltaSeconds;
      projectile.halo.setPosition(projectile.body.x, projectile.body.y);

      const expired = projectile.lifetimeRemaining <= 0;
      const outsideWorld = !this.worldBounds.contains(projectile.body.x, projectile.body.y);
      if (expired || outsideWorld) {
        this.destroyEnemyProjectile(projectile);
        continue;
      }

      const wall = this.activeWall;
      if (wall && sweepIntersectsPolyline(
        previous,
        { x: projectile.body.x, y: projectile.body.y },
        5 + WALL_CONFIG.thickness / 2,
        wall.points,
      )) {
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
if (applied) this.playPlayerHit(projectile.hitShakeTier);
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
    knockbackDistance?: number;
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
      knockbackDistance: options.knockbackDistance ?? 0,
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
        const sourceX = missile.body.x;
        const sourceY = missile.body.y;
        this.destroyFriendlyMissile(missile);
        const damage = missile.element
          ? this.elementalDamageAgainst(missile.target, missile.element, missile.damage)
          : missile.damage;
        this.damageEnemy(
          missile.target,
          damage,
          missile.element,
          sourceX,
          sourceY,
          false,
          'standard',
          missile.knockbackDistance,
        );
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
      // 런 반복 격상(#77): 회차가 쌓이면 과의존한 원소가 이번 런 전체에서 약화된다.
      // 프로필은 런 시작에 확정된 캐시를 쓴다 (시전마다 localStorage를 읽지 않는다).
      const escalationWeaken = this.runEscalation.weakenedElements.includes(spec.element_primary)
        ? this.runEscalation.weakenMultiplier
        : 1;
      // 다양성 보너스(당근, #92): 최근과 다른 원소·폼이면 데미지↑. basePower 불변, 여기서만 곱한다.
      const priorCasts = this.spellHistory.all.slice(0, -1); // 방금 기록한 이번 시전 제외
      const diversity = diversityBonus(
        { element: spec.element_primary, form: spec.form },
        priorCasts.map((e) => ({ element: e.elementPrimary, form: e.form })),
      );
      const effectiveSpec: SpellSpec = {
        ...spec,
        power: Math.round(
          spellPowerWithAffinity(historyEntry.power, affinityBonus)
          * escalationWeaken * diversity * this.playerState.damageOutMultiplier, // empower 버프
        ),
      };
      // 같은 원소를 계속 쓰면 매 시전 반복되므로 방마다 원소별 1회만 알린다
      if (escalationWeaken < 1 && !this.escalationNoticed.has(spec.element_primary)) {
        this.escalationNoticed.add(spec.element_primary);
        this.announceSystemMessage(
          `${ELEMENT_LABELS[spec.element_primary]} 약화 ${Math.round((1 - escalationWeaken) * 100)}% · 세계가 네 수를 읽었다`,
          '#b18cff',
        );
      }
      if (historyEntry.power < historyEntry.basePower) {
        // 반복 패널티를 원인과 함께 표시 — 다양성 유도가 게임의 핵심 경험 (PHASE_2 R3 P1)
        const penaltyPct = Math.round(
          (1 - historyEntry.power / historyEntry.basePower) * 100,
        );
        this.announceSystemMessage(
          `REPEAT -${penaltyPct}% · 같은 주문은 힘을 잃는다`,
          '#ffa94d',
        );
      } else if (diversity > 1) {
        // 다양성 보상 — 최근과 다른 마법이면 더 크게 터진다 (당근, #92)
        const comboPct = Math.round((diversity - 1) * 100);
        this.announceSystemMessage(
          `COMBO +${comboPct}% · 낯선 마법이 세계를 뒤흔든다`,
          '#63e6be',
        );
      }

      this.audio.playCast(effectiveSpec.element_primary);
      this.applySpellPalette(effectiveSpec);
      this.announceSpell(effectiveSpec);
      this.applySpellEffect(effectiveSpec);
      this.playerState.startInputLock(ACTIVE_MANA_CONFIG.castInputLockSeconds);
      this.playCastFlare();
    } finally {
      this.finishCastingUx();
    }
  }

  private applySpellEffect(
    spec: SpellSpec,
    origin?: Phaser.Math.Vector2,
    auto = false,
  ): void {
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
      this.castSelfBuff(spec);
      return;
    }
    if (spec.form === 'wall' && (spec.effect === 'damage' || spec.effect === 'control')) {
      this.createWall(from, spec);
      return;
    }
    if (spec.form === 'orbit' && (spec.effect === 'damage' || spec.effect === 'control')) {
      this.createOrbit(spec);
      return;
    }
    if (spec.effect === 'control') {
      this.castControlSpell(from, spec, auto);
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
    const castFeedback: CastFeedbackState = {
      resistanceNoticeShown: false,
    };
    const chainOrigins = chainTargets.map((enemy) => ({ x: enemy.x, y: enemy.y }));
    const castRoomIndex = this.combatRunController.state.roomIndex;
    castSpell({
      scene: this,
      from,
      to,
      chainPath: chainTargets,
      allowCameraShake: !auto,
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
        this.onSpellHit(
          impact,
          spec,
          lockedTarget,
          hitEnemies,
          chainTargets,
          from,
          chainOrigins,
          auto,
          castFeedback,
        );
      },
    }, spec);
  }

  /**
   * 자기 강화(buff) — "이동속도 빠르게"·"무적"·"돌진" 등 자기 대상 표현을 실제 효과로.
   * 원소·주문명·위력으로 버프 종류/세기를 정한다(selfBuffConfig, 순수 함수).
   */
  private castSelfBuff(spec: SpellSpec): void {
    const outcome = resolveSelfBuff(spec.element_primary, spec.name, spec.power);
    if (outcome.kind === 'dash') {
      this.performDash(outcome.distance);
      this.announceSystemMessage(
        `${outcome.label}!`,
        paletteColorToCss(ELEMENT_PALETTES[spec.element_primary].core),
      );
      return;
    }
    this.playerState.applyTimedBuff(outcome.buff, outcome.multiplier, outcome.seconds);
    this.showBuffAura(outcome.color, outcome.seconds);
    const magnitude = outcome.buff === 'ward'
      ? (outcome.multiplier <= 0 ? '무적' : `피해 −${Math.round((1 - outcome.multiplier) * 100)}%`)
      : `+${Math.round((outcome.multiplier - 1) * 100)}%`;
    this.announceSystemMessage(
      `${outcome.label} · ${magnitude} · ${outcome.seconds.toFixed(1)}s`,
      paletteColorToCss(outcome.color),
    );
  }

  /** 돌진 — 최근 이동 방향(없으면 가까운 적)으로 순간 이동 + 짧은 무적. */
  private performDash(distance: number): void {
    const dir = this.lastMoveDir.clone();
    if (dir.lengthSq() === 0) {
      const enemy = this.nearestEnemy();
      if (enemy) dir.set(enemy.x - this.player.x, enemy.y - this.player.y);
      else dir.set(0, -1);
    }
    if (dir.lengthSq() === 0) dir.set(0, -1);
    dir.normalize();
    const targetX = Phaser.Math.Clamp(
      this.player.x + dir.x * distance,
      this.worldBounds.left + 22,
      this.worldBounds.right - 22,
    );
    const targetY = Phaser.Math.Clamp(
      this.player.y + dir.y * distance,
      this.worldBounds.top + 22,
      this.worldBounds.bottom - 22,
    );
    // 돌진 관통감 — 짧은 무적(ward 0배)
    this.playerState.applyTimedBuff('ward', 0, SELF_BUFF_CONFIG.dash.iframeSeconds);
    for (let i = 1; i <= 5; i += 1) {
      const t = i / 6;
      spawnTrailGhost(
        this,
        Phaser.Math.Linear(this.player.x, targetX, t),
        Phaser.Math.Linear(this.player.y, targetY, t),
        12,
        0x8fa4ff,
        this.player.depth - 1,
      );
    }
    this.tweens.add({
      targets: this.player, x: targetX, y: targetY, duration: 120, ease: 'Quad.easeOut',
    });
    requestCameraShake(this, 'weak');
  }

  /** 활성 버프 오라 — 플레이어 컨테이너 뒤에 색으로 표시, 지속시간 후 소멸. */
  private showBuffAura(color: number, seconds: number): void {
    this.buffAura?.destroy();
    const aura = this.add.circle(0, 0, 28, color, 0.22).setBlendMode(Phaser.BlendModes.ADD);
    this.player.addAt(aura, 0);
    this.buffAura = aura;
    this.tweens.add({
      targets: aura,
      scale: { from: 1, to: 1.28 },
      alpha: { from: 0.3, to: 0.12 },
      yoyo: true, repeat: -1, duration: 650, ease: 'Sine.easeInOut',
    });
    this.time.delayedCall(seconds * 1000, () => {
      if (aura.active) aura.destroy();
      if (this.buffAura === aura) this.buffAura = null;
    });
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
        this.applySpellEffect(request.spell, undefined, true);
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
        this.applySpellEffect(request.spell, origin, true);
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

  private createWall(from: Phaser.Math.Vector2, spec: SpellSpec): void {
    this.clearActiveWall();
    const target = spec.target === 'self'
      ? this.nearestEnemy()
      : densestDirectionalTarget(
        from.x,
        from.y,
        WALL_CONFIG.targetingRange,
        WALL_CONFIG.targetingHalfWidth,
        this.enemies.filter((enemy) => enemy.alive),
      ) ?? this.nearestEnemy();
    const points = wallArcPoints(
      from,
      target ? { x: target.x, y: target.y } : null,
      spec.size,
    );
    const palette = ELEMENT_PALETTES[spec.element_primary];
    const vectors = points.map((point) => new Phaser.Math.Vector2(point.x, point.y));
    const view = this.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    view.lineStyle(WALL_CONFIG.thickness + 10, palette.glow, 0.18).strokePoints(vectors, false);
    view.lineStyle(WALL_CONFIG.thickness, palette.core, 0.78).strokePoints(vectors, false);
    view.lineStyle(2, palette.accent, 0.95).strokePoints(vectors, false);
    this.activeWall = {
      spec: { ...spec, status: [...spec.status] },
      points,
      view,
      remainingSeconds: wallDurationSeconds(spec.speed),
      contactedEnemies: new Set(),
      slowedBosses: new Set(),
    };
  }

  private createOrbit(spec: SpellSpec): void {
    this.clearActiveOrbit();
    const palette = ELEMENT_PALETTES[spec.element_primary];
    const count = orbitCount(spec.size);
    const views = Array.from({ length: count }, () => {
      const halo = this.add.circle(0, 0, 13, palette.glow, 0.26)
        .setBlendMode(Phaser.BlendModes.ADD);
      const core = this.add.circle(0, 0, 6, palette.core, 0.95)
        .setStrokeStyle(1.5, palette.accent, 0.9)
        .setBlendMode(Phaser.BlendModes.ADD);
      return this.add.container(this.player.x, this.player.y, [halo, core]).setDepth(8);
    });
    this.activeOrbit = {
      spec: { ...spec, status: [...spec.status] },
      views,
      elapsedSeconds: 0,
      angle: -Math.PI / 2,
      lastHitAt: new Map(),
    };
  }

  private updatePersistentForms(deltaSeconds: number): void {
    const wall = this.activeWall;
    if (wall) {
      wall.remainingSeconds -= deltaSeconds;
      if (wall.remainingSeconds <= 0) this.clearActiveWall();
    }

    const orbit = this.activeOrbit;
    if (!orbit) return;
    orbit.elapsedSeconds += deltaSeconds;
    if (orbit.elapsedSeconds >= ORBIT_CONFIG.durationSeconds) {
      this.clearActiveOrbit();
      return;
    }
    orbit.angle += orbitAngularVelocity(orbit.spec.speed) * deltaSeconds;
    const center = { x: this.player.x, y: this.player.y - 8 };
    orbit.views.forEach((view, index) => {
      const point = orbitPoint(center, orbit.angle, index, orbit.views.length);
      view.setPosition(point.x, point.y);
      for (const enemy of [...this.enemies]) {
        if (!enemy.alive) continue;
        if (Phaser.Math.Distance.Between(point.x, point.y, enemy.x, enemy.y)
          > ORBIT_CONFIG.contactRadius + enemy.collisionRadius) continue;
        if (!repeatHitReady(orbit.lastHitAt.get(enemy), orbit.elapsedSeconds)) continue;
        orbit.lastHitAt.set(enemy, orbit.elapsedSeconds);
        if (orbit.spec.effect === 'control') {
          this.applyControl(enemy, orbit.spec.power, { kind: 'point', x: point.x, y: point.y });
          this.applyStatusKnockback(enemy, orbit.spec, this.player.x, this.player.y);
        } else {
          const damage = spellImpactDamageFromPower(
            orbit.spec.power,
            ORBIT_CONFIG.damageMultiplier,
          );
          this.damageEnemy(
            enemy,
            this.spellDamageAgainst(enemy, orbit.spec, damage),
            undefined,
            this.player.x,
            this.player.y,
            false,
            'persistent',
            orbit.spec.status.includes('knockback')
              ? knockbackDistanceForForm('orbit')
              : 0,
          );
        }
      }
    });
  }

  private resolveWallEnemyCollision(enemy: CombatEnemy, previous: FormPoint): void {
    const wall = this.activeWall;
    if (!wall || !enemy.alive) return;
    const crossed = sweepIntersectsPolyline(
      previous,
      { x: enemy.x, y: enemy.y },
      enemy.collisionRadius + WALL_CONFIG.thickness / 2,
      wall.points,
    );
    if (!crossed) return;

    const startedTouching = sweepIntersectsPolyline(
      previous,
      previous,
      enemy.collisionRadius + WALL_CONFIG.thickness / 2,
      wall.points,
    );
    if (enemy.kind !== 'boss' && !startedTouching) {
      enemy.view.setPosition(previous.x, previous.y);
    }
    if (enemy.kind === 'boss' && !wall.slowedBosses.has(enemy)) {
      wall.slowedBosses.add(enemy);
      this.applySlow(
        enemy,
        wall.spec.power,
        WALL_CONFIG.bossSlowDurationSeconds,
        WALL_CONFIG.bossSlowMovementMultiplier,
      );
    }
    if (wall.contactedEnemies.has(enemy)) return;
    wall.contactedEnemies.add(enemy);
    if (wall.spec.effect === 'control') {
      if (enemy.kind !== 'boss') {
        this.applyControl(enemy, wall.spec.power, { kind: 'point', x: enemy.x, y: enemy.y });
        this.applyStatusKnockback(enemy, wall.spec, this.player.x, this.player.y);
      }
      return;
    }
    const damage = spellImpactDamageFromPower(wall.spec.power, WALL_CONFIG.damageMultiplier);
    this.damageEnemy(
      enemy,
      this.spellDamageAgainst(enemy, wall.spec, damage),
      undefined,
      this.player.x,
      this.player.y,
      false,
      'standard',
      wall.spec.status.includes('knockback')
        ? knockbackDistanceForForm('wall')
        : 0,
    );
  }

  private clearActiveWall(): void {
    this.activeWall?.view.destroy();
    this.activeWall = null;
  }

  private clearActiveOrbit(): void {
    for (const view of this.activeOrbit?.views ?? []) view.destroy(true);
    this.activeOrbit = null;
  }

  private spiritName(role: 'attack' | 'heal' | 'guard', element?: SpellElement): string {
    if (role === 'heal') return '치유';
    if (role === 'guard') return '수호';
    return ELEMENT_LABELS[element ?? 'light'];
  }

  // ── 진화·융합 (성장 시스템 ④) ────────────────────────────────
  /**
   * 격상 이름 — 라이브 /evolve-name(캐시 포함) 우선.
   * Mock 모드에선 템플릿으로 고정해 개발·QA 중 라이브 호출을 막는다 (할당량 정책).
   */
  private async evolvedNameFor(req: EvolveNameRequest): Promise<string> {
    if (import.meta.env.VITE_JUDGE_MOCK === '1') return templateEvolvedName(req);
    return getEvolvedName(req);
  }

  /** 진화·융합 적용 — 작명은 반드시 성공하므로(템플릿 폴백) 실패 상태가 없다. */
  private async applyEvolution(data: EvolveRewardData): Promise<void> {
    if (data.target === 'engrave' && data.engraveKey) {
      const slot = this.engraveManager.entries
        .find((entry) => entry.spellKey === data.engraveKey);
      const name = await this.evolvedNameFor({
        kind: 'evolve',
        baseName: slot?.spell.name,
        elements: [...data.elements],
        level: slot?.level,
      });
      const evolved = this.engraveManager.evolve(data.engraveKey, name);
      if (evolved) {
        this.announceSystemMessage(`각인 진화 — 『${name}』`, '#ffd166', 2800);
      }
      return;
    }
    if (data.target === 'spirit-fuse' && data.spiritIds?.length === 2) {
      const name = await this.evolvedNameFor({
        kind: 'fuse',
        elements: [...data.elements],
      });
      const fused = this.spiritManager.fuse(data.spiritIds, name);
      if (fused) {
        this.syncSpiritViews();
        this.announceSystemMessage(`정령 융합 — 『${name}』`, '#ffd166', 2800);
      }
    }
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
    this.buildHudText.setText(this.buildSummaryLines());
    this.drawHudBars();
    if (runState.phase === 'run-over') {
      this.waveText.setText('RUN COMPLETE');
    } else if (runState.phase === 'reward-select') {
      this.waveText.setText('ROOM CLEAR');
    } else if (runState.phase === 'room-transition') {
      this.waveText.setText(`NEXT ROOM ${runState.roomIndex + 1}/${runState.maxRooms}`);
    } else if (this.isBossEncounter()) {
      const boss = this.enemies.find((enemy) => enemy.kind === 'boss');
      // 저항을 상시 노출한다 — 보스 링 색만으로는 "무엇이 안 통하는지" 알 수 없다
      const resistances = this.sortedBossResistanceEntries();
      const resistLabel = resistances.length > 0
        ? `\n저항 ${resistances
          .map(([element, multiplier]) => `${ELEMENT_LABELS[element]} ×${multiplier}`)
          .join(' / ')}`
        : '';
      this.waveText.setText(
        boss
          ? `BOSS ${Math.ceil(boss.hp)}/${boss.maxHp}${resistLabel}  ·  ENEMIES ${this.enemies.length}`
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

  /**
   * 빌드 요약 — 각인·정령·주문서를 각 한 줄로.
   * 슬롯이 비어 있어도 `0/2`를 보여준다: "채울 수 있는 자리가 있다"는 정보 자체가
   * 보상 선택의 근거가 되기 때문이다.
   */
  private buildSummaryLines(): string[] {
    const engraves = this.engraveManager.entries;
    const engraveLabel = engraves.length === 0
      ? `각인 0/${ENGRAVE_CONFIG.maxSlots}`
      : `각인 ${engraves.length}/${ENGRAVE_CONFIG.maxSlots} · ${engraves
        .map((e) => `${e.spell.name}${e.evolved ? '★' : ` Lv${e.level}`}`)
        .join(' · ')}`;

    const spirits = this.spiritManager.entries;
    const spiritLabel = spirits.length === 0
      ? `정령 0/${SPIRIT_CONFIG.maxSlots}`
      : `정령 ${this.spiritManager.slotCount()}/${SPIRIT_CONFIG.maxSlots} · ${spirits
        .map((e) => (e.fusedName
          ? `『${e.fusedName}』`
          : `${this.spiritName(e.role, e.element)} Lv${e.level}`))
        .join(' · ')}`;

    const lines = [engraveLabel, spiritLabel];
    // 주문서는 보유분이 있을 때만 — 첫 런에서 빈 줄로 혼란을 주지 않는다.
    // 캐시된 수를 쓴다: 이 메서드는 매 프레임 호출되므로 localStorage를 여기서 읽으면 안 된다.
    if (this.grimoireCount > 0) lines.push(`주문서 ${this.grimoireCount}`);
    return lines;
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
    g.fillRoundedRect(width - 306, 62, 288, 72, 12);
    g.lineStyle(1, 0x2a735c, 0.62);
    g.strokeRoundedRect(width - 306, 62, 288, 72, 12);
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
    castOrigin = new Phaser.Math.Vector2(this.player.x, this.player.y),
    chainOrigins: readonly { x: number; y: number }[] = [],
    auto = false,
    castFeedback: CastFeedbackState = {
      resistanceNoticeShown: false,
    },
  ): void {
    // Zone ticks may damage the same enemy again. Rain strikes share one cast-level
    // hit set so overlapping landing circles cannot multiply damage on one target.
    if (impact.hitGroup !== undefined && spec.form !== 'rain') hitEnemies.clear();
    const damageMultiplier = Number.isFinite(impact.damageMultiplier)
      ? Math.max(0, impact.damageMultiplier ?? 1)
      : 1;
    // 오토 시전은 비반올림·바닥 미적용 — 산술 게이트(≤40%)와 실전 피해 일치 (PR #39 R1 리뷰)
    const damage = auto
      ? autoSpellImpactDamageFromPower(spec.power, damageMultiplier)
      : spellImpactDamageFromPower(spec.power, damageMultiplier);
    const damageAgainst = (enemy: CombatEnemy): number => {
      const mayShowNotice = !auto && !castFeedback.resistanceNoticeShown;
      const adjustedDamage = this.spellDamageAgainst(enemy, spec, damage, mayShowNotice);
      if (mayShowNotice
        && enemy.kind === 'boss'
        && this.activeBossResistances.has(spec.element_primary)) {
        castFeedback.resistanceNoticeShown = true;
      }
      return adjustedDamage;
    };
    const applyDamage = (
      enemy: CombatEnemy,
      sourceX: number,
      sourceY: number,
      bypassDirectionalShield = false,
    ): void => {
      const hitStopKind: HitStopKind = spec.form === 'zone'
        ? 'persistent'
        : 'standard';
      const knockbackDistance = spec.status.includes('knockback')
        ? knockbackDistanceForForm(spec.form)
        : 0;
      this.damageEnemy(
        enemy,
        damageAgainst(enemy),
        spec.element_primary,
        sourceX,
        sourceY,
        bypassDirectionalShield,
        hitStopKind,
        knockbackDistance,
      );
    };
    if (impact.kind === 'point') {
      if (impact.chainIndex !== undefined) {
        const chainTarget = chainTargets[impact.chainIndex];
        if (chainTarget?.alive) {
          const chainSource = impact.chainIndex === 0
            ? castOrigin
            : chainOrigins[impact.chainIndex - 1] ?? castOrigin;
          applyDamage(chainTarget, chainSource.x, chainSource.y);
        }
        return;
      }
      if (lockedTarget?.alive) {
        applyDamage(lockedTarget, castOrigin.x, castOrigin.y);
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
      const bypassDirectionalShield = spec.form === 'zone' || spec.form === 'rain';
      const impactSource = impact.kind === 'line'
        ? { x: impact.fromX, y: impact.fromY }
        : impact.kind === 'circle'
          ? { x: impact.x, y: impact.y }
          : castOrigin;
      applyDamage(
        enemy,
        impactSource.x,
        impactSource.y,
        bypassDirectionalShield,
      );
    }
  }

  /** 보스 내성 반영 주문 피해 (GDD §4.1 — 내성 원소 피해 대폭 감소 + 플레이어에게 원인 표시) */
  private spellDamageAgainst(
    enemy: CombatEnemy,
    spec: SpellSpec,
    baseDamage: number,
    showResistanceNotice = true,
  ): number {
    return this.elementalDamageAgainst(
      enemy,
      spec.element_primary,
      baseDamage,
      showResistanceNotice,
    );
  }

  private elementalDamageAgainst(
    enemy: CombatEnemy,
    element: SpellElement,
    baseDamage: number,
    showResistanceNotice = false,
  ): number {
    if (enemy.kind !== 'boss') return baseDamage;
    const multiplier = this.activeBossResistances.get(element) ?? 1;
    if (showResistanceNotice
      && multiplier < 1
      && this.time.now - this.lastResistNoticeAt > 1500) {
      this.lastResistNoticeAt = this.time.now;
      const label = ELEMENT_LABELS[element];
      this.announceSystemMessage(`저항! ${label}이(가) 통하지 않는다 — 다른 원소를 창작하라`, '#ffa94d');
    }
    return baseDamage * multiplier;
  }

  private addBossResistance(element: SpellElement, multiplier: number): void {
    const current = this.activeBossResistances.get(element) ?? 1;
    this.activeBossResistances.set(element, Math.min(current, multiplier));
  }

  private sortedBossResistanceEntries(): [SpellElement, number][] {
    return [...this.activeBossResistances.entries()]
      .sort((a, b) => a[1] - b[1]);
  }

  private sortedBossResistanceElements(): SpellElement[] {
    return this.sortedBossResistanceEntries().map(([element]) => element);
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
    this.activeSummonKnockbackDistance = spec.status.includes('knockback')
      ? knockbackDistanceForForm('summon')
      : 0;
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
      knockbackDistance: this.activeSummonKnockbackDistance,
      coreColor: palette.core,
      glowColor: palette.glow,
    });
  }

  private clearSummon(): void {
    this.activeSummon?.destroy();
    this.activeSummon = null;
    this.activeSummonKnockbackDistance = 0;
  }

  private castControlSpell(from: Phaser.Math.Vector2, spec: SpellSpec, auto = false): void {
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
      allowCameraShake: !auto,
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
    if (impact.hitGroup !== undefined && spec.form !== 'rain') affectedEnemies.clear();
    const source = impact.kind === 'line'
      ? { x: impact.fromX, y: impact.fromY }
      : impact.kind === 'circle'
        ? { x: impact.x, y: impact.y }
        : { x: this.player.x, y: this.player.y };
    const applyControlImpact = (enemy: CombatEnemy): void => {
      this.applyControl(enemy, spec.power, impact);
      this.applyStatusKnockback(enemy, spec, source.x, source.y);
    };
    if (impact.kind === 'point') {
      if (impact.chainIndex !== undefined) {
        const chainTarget = chainTargets[impact.chainIndex];
        if (chainTarget?.alive) {
          applyControlImpact(chainTarget);
        }
        return;
      }
      if (lockedTarget?.alive) {
        applyControlImpact(lockedTarget);
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
      applyControlImpact(enemy);
    }
  }

  private applyStatusKnockback(
    enemy: CombatEnemy,
    spec: SpellSpec,
    sourceX: number,
    sourceY: number,
  ): void {
    if (!spec.status.includes('knockback') || enemy.kind === 'boss') return;
    const direction = new Phaser.Math.Vector2(enemy.x - sourceX, enemy.y - sourceY);
    if (direction.lengthSq() === 0) direction.set(0, -1);
    direction.normalize();
    const persistent = spec.form === 'zone' || spec.form === 'orbit';
    playImpactSquash(
      this,
      enemy.view,
      direction.x,
      direction.y,
      persistent ? 'persistent' : 'knockback',
    );
    this.requestEnemyKnockback(
      enemy,
      direction.x,
      direction.y,
      knockbackDistanceForForm(spec.form),
    );
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
    movementMultiplierOverride?: number,
  ): void {
    const remaining = this.enemyControlState.applySlow(
      enemy,
      power,
      durationOverrideSeconds,
      movementMultiplierOverride,
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
      movementMultiplier: this.enemyControlState.movementMultiplierFor(enemy),
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

  private damageEnemy(
    enemy: CombatEnemy,
    damage: number,
    _element?: SpellElement,
    sourceX = this.player.x,
    sourceY = this.player.y,
    bypassDirectionalShield = false,
    hitStopKind: HitStopKind = 'standard',
    knockbackDistance = 0,
  ): boolean {
    if (damage <= 0 || !enemy.alive) return false;
    const underlyingEnemy = enemy instanceof EliteEnemy ? enemy.baseEnemy : enemy;
    const bossHpBefore = underlyingEnemy instanceof BossEnemy ? underlyingEnemy.hp : null;
    let defeated: boolean;
    if (enemy instanceof ShieldSentinelEnemy && !bypassDirectionalShield) {
      const result = enemy.takeMechanicDamage(damage, sourceX, sourceY);
      if (result.blocked) {
        this.showShieldBlockEffect(enemy, sourceX, sourceY);
        return false;
      }
      defeated = result.defeated;
    } else {
      defeated = enemy.takeDamage(damage);
    }
    this.audio.playSfx('hit');
    if (!defeated) {
      const direction = new Phaser.Math.Vector2(enemy.x - sourceX, enemy.y - sourceY);
      if (direction.lengthSq() === 0) direction.set(0, -1);
      direction.normalize();
      const squashKind = underlyingEnemy instanceof BossEnemy
        ? 'boss'
        : knockbackDistance > 0
          ? 'knockback'
          : hitStopKind === 'persistent'
            ? 'persistent'
            : 'standard';
      playImpactSquash(this, enemy.view, direction.x, direction.y, squashKind);
      if (!(underlyingEnemy instanceof BossEnemy) && knockbackDistance > 0) {
        this.requestEnemyKnockback(enemy, direction.x, direction.y, knockbackDistance);
      }
      this.requestEnemyHitStop(
        enemy,
        hitStopKind,
        underlyingEnemy instanceof BossEnemy,
      );
    }
    if (bossHpBefore !== null) {
      this.dropCrossedBossManaCrystals(underlyingEnemy as BossEnemy, bossHpBefore);
    }
    if (!defeated) {
      // 보스는 HP 임계 통과 시 하수인을 부른다
      if (enemy instanceof BossEnemy && enemy.consumeMinionTrigger()) {
        this.spawnBossMinions(enemy);
      }
      return true;
    }
    this.audio.playSfx('enemy-defeat');

    const splitX = enemy.x;
    const splitY = enemy.y;
    const baseEnemy = enemy instanceof EliteEnemy ? enemy.baseEnemy : enemy;
    const wasBoss = baseEnemy instanceof BossEnemy;
    const shouldSplit = baseEnemy instanceof SplitterEnemy && baseEnemy.canSplit;
    const wasUnstable = enemy.eliteModifier === 'unstable';
    if (wasBoss) requestCameraShake(this, 'strong');
    else if (enemy instanceof EliteEnemy) requestCameraShake(this, 'weak');
    const droppedMana = manaDropAmount(enemy instanceof EliteEnemy, enemy.kind);
    this.removeEnemyControl(enemy);
    this.enemyHitStop.remove(enemy);
    this.enemyKnockbacks.delete(enemy);
    enemy.destroy();
    this.enemies = this.enemies.filter((candidate) => candidate !== enemy);
    if (wasBoss) {
      this.spawnManaCrystal(splitX, splitY, this.playerState.maxMana, true);
    } else {
      this.spawnManaCrystal(splitX, splitY, droppedMana);
    }
    if (wasBoss) this.clearBossPatternEffects();
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
    if (wasUnstable && this.enemies.length > 0) {
      this.scheduleUnstableExplosion(splitX, splitY);
    }
    if (this.enemies.length > 0) return true;

    this.clearEnemyProjectiles();
    // 보스방은 웨이브 흐름 없이 전멸(보스+하수인) 즉시 방 클리어
    if (this.isBossEncounter()) {
      this.scheduleRoomClearAfterManaSweep();
      return true;
    }
    const completedWave = this.waveManager.currentWaveNumber;
    this.waveManager.notifyEnemiesCleared();
    if (this.waveManager.phase === 'room-clear') {
      this.scheduleRoomClearAfterManaSweep();
    } else {
      this.announceSystemMessage(`웨이브 ${completedWave} 완료`);
    }
    return true;
  }

  private requestEnemyHitStop(
    enemy: CombatEnemy,
    kind: HitStopKind,
    boss: boolean,
  ): void {
    if (!this.isCombatActive()) return;
    this.enemyHitStop.request(enemy, enemyHitStopSeconds(kind, boss));
  }

  private requestEnemyKnockback(
    enemy: CombatEnemy,
    directionX: number,
    directionY: number,
    distance: number,
  ): void {
    const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
    if (safeDistance === 0 || enemy.kind === 'boss') return;
    const duration = KNOCKBACK_CONFIG.durationSeconds;
    this.enemyKnockbacks.set(enemy, {
      velocityX: directionX * safeDistance / duration,
      velocityY: directionY * safeDistance / duration,
      remainingSeconds: duration,
    });
  }

  private updateManaPotion(deltaSeconds: number): void {
    if (this.roomClearPending) return;
    if (!this.manaPotionSpawnedThisRoom) {
      this.manaPotionSpawnRemaining -= deltaSeconds;
      if (this.manaPotionSpawnRemaining <= 0) this.spawnManaPotion();
      return;
    }
    const potion = this.manaPotion;
    if (!potion?.collectable) return;

    potion.lifetimeRemaining -= deltaSeconds;
    const withinPickupRange = Phaser.Math.Distance.Between(
      potion.view.x,
      potion.view.y,
      this.player.x,
      this.player.y,
    ) <= ACTIVE_MANA_CONFIG.potionPickupRadius;
    if (withinPickupRange) {
      if (this.playerState.mana < this.playerState.maxMana) {
        const restored = this.playerState.restoreMana(ACTIVE_MANA_CONFIG.potionMana);
        this.showManaPickupFeedback(potion.view.x, potion.view.y, restored);
        this.clearManaPotion();
        return;
      }
      if (!potion.fullNoticeShown) {
        potion.fullNoticeShown = true;
        this.showManaPickupFeedback(potion.view.x, potion.view.y, 0);
      }
    } else {
      potion.fullNoticeShown = false;
    }
    if (potion.lifetimeRemaining <= 0) this.expireManaPotion(potion);
  }

  private spawnManaPotion(): void {
    const position = this.manaPotionSpawnPosition();
    if (!position) {
      this.manaPotionSpawnRemaining = 1;
      return;
    }
    this.manaPotionSpawnedThisRoom = true;
    const warning = this.add.circle(0, 0, 25, 0x5ee7ff, 0.08)
      .setStrokeStyle(2, 0x8eeeff, 0.85);
    const bottle = this.add.graphics();
    bottle.fillStyle(0x8eeeff, 0.95);
    bottle.fillRoundedRect(-8, -10, 16, 20, 5);
    bottle.fillStyle(0xd3faff, 1);
    bottle.fillRect(-4, -15, 8, 6);
    bottle.lineStyle(2, 0x143b5a, 0.9);
    bottle.strokeRoundedRect(-8, -10, 16, 20, 5);
    bottle.setAlpha(0).setScale(0.55);
    const view = this.add.container(position.x, position.y, [warning, bottle])
      .setDepth(-0.4);
    const potion: ManaPotion = {
      view,
      lifetimeRemaining: ACTIVE_MANA_CONFIG.potionLifetimeSeconds,
      collectable: false,
      fullNoticeShown: false,
    };
    this.manaPotion = potion;
    this.tweens.add({
      targets: warning,
      alpha: { from: 0.15, to: 0.65 },
      scale: { from: 0.75, to: 1.2 },
      duration: 220,
      yoyo: true,
      repeat: 1,
    });
    this.time.delayedCall(ACTIVE_MANA_CONFIG.potionTelegraphSeconds * 1000, () => {
      if (this.manaPotion !== potion || !view.active) return;
      potion.collectable = true;
      this.tweens.add({
        targets: bottle,
        alpha: 1,
        scale: 1,
        duration: 180,
        ease: 'Back.easeOut',
      });
      this.tweens.add({
        targets: warning,
        alpha: { from: 0.35, to: 0.12 },
        scale: { from: 1, to: 1.12 },
        duration: 650,
        yoyo: true,
        repeat: -1,
      });
    });
  }

  private manaPotionSpawnPosition(): Phaser.Math.Vector2 | null {
    let best: Phaser.Math.Vector2 | null = null;
    let bestDistance = -1;
    const cameraView = this.cameras.main.worldView;
    const margin = ACTIVE_MANA_CONFIG.potionCameraMargin;
    const minX = Math.max(this.worldBounds.left + 40, cameraView.left + margin);
    const maxX = Math.min(this.worldBounds.right - 40, cameraView.right - margin);
    const minY = Math.max(this.worldBounds.top + 40, cameraView.top + margin);
    const maxY = Math.min(this.worldBounds.bottom - 40, cameraView.bottom - margin);
    if (minX >= maxX || minY >= maxY) return null;
    for (let attempt = 0; attempt < 24; attempt++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const distance = Phaser.Math.Between(
        ACTIVE_MANA_CONFIG.potionSpawnDistanceMin,
        ACTIVE_MANA_CONFIG.potionSpawnDistanceMax,
      );
      const candidate = new Phaser.Math.Vector2(
        Phaser.Math.Clamp(
          this.player.x + Math.cos(angle) * distance,
          minX,
          maxX,
        ),
        Phaser.Math.Clamp(
          this.player.y + Math.sin(angle) * distance,
          minY,
          maxY,
        ),
      );
      const candidateDistance = candidate.distance(new Phaser.Math.Vector2(this.player.x, this.player.y));
      if (candidateDistance < ACTIVE_MANA_CONFIG.potionSpawnDistanceMin * 0.8) continue;
      if (!this.isManaPotionPositionSafe(candidate.x, candidate.y)) continue;
      if (candidateDistance <= bestDistance) continue;
      best = candidate;
      bestDistance = candidateDistance;
    }
    return best;
  }

  private isManaPotionPositionSafe(x: number, y: number): boolean {
    const clearance = ACTIVE_MANA_CONFIG.potionPickupRadius;
    const samples = [
      [0, 0],
      [clearance, 0],
      [-clearance, 0],
      [0, clearance],
      [0, -clearance],
    ] as const;
    return !this.hazardZones.some((hazard) => samples.some(
      ([offsetX, offsetY]) => hazard.contains(x + offsetX, y + offsetY),
    ));
  }

  private expireManaPotion(potion: ManaPotion): void {
    potion.collectable = false;
    this.tweens.add({
      targets: potion.view,
      alpha: 0,
      scale: 0.65,
      duration: 300,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        if (this.manaPotion === potion) this.clearManaPotion();
      },
    });
  }

  private clearManaPotion(): void {
    if (this.manaPotion?.view.active) this.manaPotion.view.destroy(true);
    this.manaPotion = null;
  }

  private spawnManaCrystal(x: number, y: number, amount: number, large = false): void {
    const size = large ? 1.65 : 1;
    const glow = this.add.circle(0, 0, 12 * size, 0x5ee7ff, 0.18)
      .setStrokeStyle(large ? 3 : 2, 0xa8f4ff, 0.75);
    const core = this.add.rectangle(0, 0, 10 * size, 10 * size, large ? 0xd3faff : 0x8eeeff, 1)
      .setRotation(Math.PI / 4);
    // Keep drops below enemy bodies so the defeat animation reads before the reward appears.
    const view = this.add.container(x, y, [glow, core])
      .setDepth(-0.5)
      .setAlpha(0)
      .setScale(0.65);
    this.tweens.add({
      targets: view,
      alpha: 1,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut',
    });
    this.tweens.add({
      targets: core,
      angle: 405,
      duration: 1800,
      repeat: -1,
      ease: 'Linear',
    });
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.16, to: 0.48 },
      scale: { from: 0.9, to: 1.18 },
      duration: 650,
      yoyo: true,
      repeat: -1,
    });
    this.manaCrystals.push({ view, amount });
  }

  private dropCrossedBossManaCrystals(boss: BossEnemy, previousHp: number): void {
    const triggered = this.triggeredBossManaThresholds.get(boss) ?? new Set<number>();
    this.triggeredBossManaThresholds.set(boss, triggered);
    for (const threshold of crossedBossManaThresholds(previousHp, boss.hp, boss.maxHp)) {
      if (triggered.has(threshold)) continue;
      triggered.add(threshold);
      const angle = threshold * Math.PI * 4;
      const x = Phaser.Math.Clamp(
        boss.x + Math.cos(angle) * ACTIVE_MANA_CONFIG.bossDropOffset,
        this.worldBounds.left + 24,
        this.worldBounds.right - 24,
      );
      const y = Phaser.Math.Clamp(
        boss.y + Math.sin(angle) * ACTIVE_MANA_CONFIG.bossDropOffset,
        this.worldBounds.top + 24,
        this.worldBounds.bottom - 24,
      );
      this.spawnManaCrystal(x, y, ACTIVE_MANA_CONFIG.bossThresholdMana);
    }
  }

  private updateManaCrystals(deltaSeconds: number): void {
    if (this.roomClearPending) return;
    for (let i = this.manaCrystals.length - 1; i >= 0; i--) {
      const crystal = this.manaCrystals[i];
      const distance = Phaser.Math.Distance.Between(
        crystal.view.x,
        crystal.view.y,
        this.player.x,
        this.player.y,
      );
      if (distance <= ACTIVE_MANA_CONFIG.pickupRadius * this.playerState.manaPickupRadiusMultiplier) {
        const restored = this.playerState.restoreMana(crystal.amount);
        this.showManaPickupFeedback(crystal.view.x, crystal.view.y, restored);
        crystal.view.destroy(true);
        this.manaCrystals.splice(i, 1);
        continue;
      }
      if (
        distance > ACTIVE_MANA_CONFIG.attractionRadius * this.playerState.manaPickupRadiusMultiplier
        || distance === 0
      ) continue;
      const step = Math.min(distance, ACTIVE_MANA_CONFIG.attractionSpeed * deltaSeconds);
      crystal.view.x += ((this.player.x - crystal.view.x) / distance) * step;
      crystal.view.y += ((this.player.y - crystal.view.y) / distance) * step;
    }
  }

  private showManaPickupFeedback(x: number, y: number, restored: number): void {
    const text = this.add.text(
      x,
      y - 12,
      restored > 0 ? `+${Math.round(restored)} MANA` : 'MANA FULL',
      {
        fontFamily: 'Consolas, monospace',
        fontSize: '14px',
        color: restored > 0 ? '#8eeeff' : '#8fa4b8',
        stroke: '#07111e',
        strokeThickness: 3,
      },
    ).setOrigin(0.5).setDepth(110);
    this.tweens.add({
      targets: text,
      y: y - 38,
      alpha: 0,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => text.destroy(),
    });
  }

  private clearManaCrystals(): void {
    for (const crystal of this.manaCrystals) crystal.view.destroy(true);
    this.manaCrystals = [];
  }

  private scheduleRoomClearAfterManaSweep(): void {
    if (this.roomClearPending) return;
    this.roomClearPending = true;
    const sweepDurationMs = 550;

    for (const crystal of [...this.manaCrystals]) {
      this.tweens.add({
        targets: crystal.view,
        x: this.player.x,
        y: this.player.y,
        scale: 0.35,
        alpha: 0.35,
        duration: sweepDurationMs - 80,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          if (!crystal.view.active) return;
          const restored = this.playerState.restoreMana(crystal.amount);
          this.showManaPickupFeedback(this.player.x, this.player.y, restored);
          crystal.view.destroy(true);
          this.manaCrystals = this.manaCrystals.filter((entry) => entry !== crystal);
        },
      });
    }

    this.time.delayedCall(sweepDurationMs, () => {
      this.combatRunController.notifyRoomCleared();
    });
  }

  private showShieldBlockEffect(
    enemy: ShieldSentinelEnemy,
    sourceX: number,
    sourceY: number,
  ): void {
    const direction = new Phaser.Math.Vector2(sourceX - enemy.x, sourceY - enemy.y);
    if (direction.lengthSq() === 0) direction.set(0, -1);
    direction.normalize();
    const contactX = enemy.x + direction.x * 31;
    const contactY = enemy.y + direction.y * 31;
    const baseAngle = direction.angle();

    const shockwave = this.add.circle(contactX, contactY, 8, 0x66d9ff, 0.16)
      .setStrokeStyle(4, 0xb9efff, 0.95)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: shockwave,
      radius: 27,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => shockwave.destroy(),
    });

    for (let i = 0; i < 12; i++) {
      const spread = Phaser.Math.FloatBetween(-1, 1);
      const distance = Phaser.Math.Between(30, 62);
      const particle = this.add.circle(
        contactX,
        contactY,
        Phaser.Math.Between(3, 6),
        i % 2 === 0 ? 0x66d9ff : 0xb9efff,
        0.95,
      ).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: particle,
        x: contactX + Math.cos(baseAngle + spread) * distance,
        y: contactY + Math.sin(baseAngle + spread) * distance,
        alpha: 0,
        scale: 0.35,
        duration: Phaser.Math.Between(260, 420),
        ease: 'Cubic.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private scheduleUnstableExplosion(x: number, y: number): void {
    const radius = 230;
    const warningDurationMs = 1500;
    const roomIndex = this.combatRunController.state.roomIndex;
    const warning = this.add.circle(x, y, radius, 0xff5370, 0.02)
      .setStrokeStyle(2, 0xff5370, 0.48)
      .setBlendMode(Phaser.BlendModes.ADD);
    const pulse = this.add.circle(x, y, radius, 0xff5370, 0.035)
      .setStrokeStyle(5, 0xff8fa3, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.18);
    this.tweens.add({
      targets: pulse,
      scale: 1,
      alpha: { from: 1, to: 0.72 },
      duration: warningDurationMs,
      ease: 'Cubic.easeIn',
    });
    const indicator = this.add.text(x, y, '!', {
      fontSize: '58px',
      fontStyle: 'bold',
      color: '#ff5370',
      stroke: '#3a0714',
      strokeThickness: 7,
    }).setOrigin(0.5).setDepth(20);
    this.tweens.add({
      targets: indicator,
      scale: { from: 0.88, to: 1.18 },
      alpha: { from: 0.72, to: 1 },
      duration: 250,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    const entry: UnstableWarning = { view: warning, pulse, indicator, timers: [] };
    const warningTimer = this.time.delayedCall(warningDurationMs, () => {
      if (!warning.active) return;
      if (pulse.active) pulse.destroy();
      if (indicator.active) indicator.destroy();
      warning.destroy();
      this.unstableWarnings = this.unstableWarnings.filter((candidate) => candidate !== entry);
      const state = this.combatRunController.state;
      if (state.phase !== 'combat' || state.roomIndex !== roomIndex) return;
      const blast = this.add.circle(x, y, 20, 0xff5370, 0.82)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: blast,
        radius,
        alpha: 0.72,
        duration: 120,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: blast,
            alpha: 0,
            delay: 0,
            duration: 650,
            ease: 'Cubic.easeIn',
            onComplete: () => blast.destroy(),
          });
        },
      });
      requestCameraShake(this, 'medium');
      if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= radius) {
        const applied = this.playerState.takeDamage(30);
if (applied) this.playPlayerHit('strong');
        this.announceIncomingDamage(applied.hpDamage, applied.shieldDamage);
      }
    });
    entry.timers.push(warningTimer);
    this.unstableWarnings.push(entry);
  }

  private clearUnstableWarnings(): void {
    for (const warning of this.unstableWarnings) {
      for (const timer of warning.timers) timer.remove(false);
      if (warning.view.active) warning.view.destroy();
      if (warning.pulse.active) warning.pulse.destroy();
      if (warning.indicator.active) warning.indicator.destroy();
    }
    this.unstableWarnings = [];
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
