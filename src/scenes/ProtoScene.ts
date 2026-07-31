import Phaser from 'phaser';
import { createSpriteLayers } from '../render/spriteLayers';
import { playHitReact, playImpactSquash } from '../combat-core/enemies/enemyJuice';
import type { SpellJudge } from '../spell/judge';
import { createJudge } from '../spell/createJudge';
import { postPlayLog } from '../spell/playLog';
import type { SpellElement, SpellForm, SpellSpec } from '../spell/types';
import { ELEMENTS } from '../spell/types';
import { SpellHistory } from '../spell/spellHistory';
import type { JudgeSource } from '../spell/spellHistory';
import {
  castSpell,
  ensureParticleTexture,
  playAffinityImpactFlourish,
} from '../render/spellRenderer';
import type { SpellImpact } from '../render/spellRenderer';
import type {
  EliteModifier,
  EncounterDefinition,
  EvolveRewardData,
  RewardOption,
  RunController,
  RunStateSnapshot,
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
  backdropPaletteForNode,
  roomKindTexture,
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
import { reducedAffinityVfxIntensity } from '../render/affinityVfx';
import { VFX_BUDGET_CONFIG } from '../render/vfxBudget';
import type { AwakeningState } from '../combat-core/run/awakening';
import {
  AWAKENING_CONFIG,
  AWAKENING_KINDS,
  AWAKENING_LABELS,
  applyAwakening,
  awakenableElement,
  awakeningDescription,
  awakeningFor,
  awakeningOptions,
  searingStatus,
} from '../combat-core/run/awakening';
import { allGlyphTextures, formGlyphTextureKey } from '../render/formGlyphs';
import type { BuildChip } from '../run/buildChipModel';
import { buildChipModel } from '../run/buildChipModel';
import { bandAffordances, reachableBand } from '../run/incantBands';
import { drawTreasureReward } from '../combat-core/run/treasureRewardConfig';
import { ALTAR_OFFER_CONFIG, drawAltarOffer } from '../combat-core/run/altarOffer';
import { rewardOptionCount, rewardScaleFor } from '../combat-core/run/roomRewardScale';
import { showSettingsOverlay } from '../ui/settingsOverlay';
import { showRoomChoices } from '../ui/roomChoiceOverlay';
import { UI_COLOR, UI_HEX, UI_SEMANTIC, hex } from '../ui/uiTokens';
import { drawGrimoirePanel, drawSectionRule } from '../render/grimoireFrame';
import type { GameSettings } from '../run/gameSettings';
import { DEFAULT_SETTINGS, loadSettings } from '../run/gameSettings';
import { setVfxBrightness } from '../render/vfxBrightness';
import { degradedCastPlan } from '../combat-core/mana/degradedCast';
import { devInfo } from '../debug/devLog';
import { FusionGauge } from '../combat-core/player/fusionGauge';
import { enemyHpScale, loopDamageScale } from '../combat-core/run/loopDifficulty';
import { playerPowerIndex } from '../combat-core/run/playerPower';
import { flooredResistMultiplier } from '../combat-core/combat/debuffFloor';
import { showBossChoice } from '../ui/bossChoiceOverlay';
import { showSystemBanner } from '../render/systemBanner';
import { bossResistanceLines, bossResistanceReadout } from '../render/bossResistanceReadout';
import { playAwakeningSigil } from '../render/awakeningSigil';
import {
  PARTICLE_TEXTURES, ensureParticleTextures, particleKey,
} from '../render/particleTextures';
import {
  DAMAGE_NUMBER, damageColor, damageEmphasis, damageLabel,
} from '../render/damageNumber';
import type { SystemBannerCopy } from '../render/systemBanner';
import { codexEntryFromSpec, codexEntryFromSequence, recordCodexEntry } from '../spell/spellCodex';
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
  selectChainTargetsFromFirst,
} from '../combat-core/combat/advancedFormConfig';
import {
  ORBIT_CONFIG,
  WALL_CONFIG,
  isBattlefieldWall,
  orbitAngularVelocity,
  orbitCount,
  orbitPoint,
  repeatHitReady,
  sweepIntersectsPolyline,
  shapedWallPoints,
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
import { ELITE_MODIFIERS, RUN_ENCOUNTERS } from '../combat-core/run/encounterConfig';
import {
  createRoomCursePlan,
  curseForRoom,
  ROOM_CURSE_CONFIG,
  silenceManaDrainPerSecond,
} from '../combat-core/run/roomCurse';
import {
  advanceHeatwaveTimers,
  HEATWAVE_CURSE_CONFIG,
  heatwaveCoolingHeal,
  heatwaveDamagePerSecond,
  isHeatwaveDamaging,
  isHeatwaveCoolingElement,
} from '../combat-core/run/heatwaveCurse';
import {
  WORD_LIMIT_CURSE_CONFIG,
  wordLimitCost,
} from '../combat-core/run/wordLimitCurse';
import type {
  RoomCurseAssignment,
  RoomCursePlan,
} from '../combat-core/run/roomCurse';
import { drawRewardOptions, RUN_REWARD_CONFIG } from '../combat-core/run/rewardConfig';
import { AFFINITY_ROWS, rankAffinities } from '../combat-core/run/useAffinity';
import { ENGRAVE_CONFIG, EngraveManager } from '../combat-core/engrave/engraveManager';
import { SpiritManager } from '../combat-core/spirit/spiritManager';
import {
  resolveSelfBuff, SELF_BUFF_CONFIG, formatSelfBuffStatus, selfBuffColor,
} from '../combat-core/player/selfBuffConfig';
import { EnemyAilmentState } from '../combat-core/status/enemyAilmentState';
import {
  AILMENT_CONFIG,
  burnDpsFromPower,
  freezeSecondsFromPower,
  slowSecondsFromPower,
  weakenMultiplierFromPower,
} from '../combat-core/status/ailmentConfig';
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
  RESISTANCE,
  computeResistance,
  diversityBonus,
  resolveBossLine,
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
import { MinimapHud } from '../ui/minimapHud';
import { pushOutOfBlocks, segmentBlocked } from '../combat-core/combat/terrainBlock';
import type { TerrainBlock } from '../combat-core/combat/terrainBlock';
import {
  FLOOR_HAZARD_CONFIG,
  floorHazardTickDamage,
  isInFloorHazard,
} from '../combat-core/combat/floorHazardConfig';
import type { FloorHazardKind, FloorHazardZone } from '../combat-core/combat/floorHazardConfig';
import {
  FLOOR_HAZARD_KINDS,
  advanceFloorHazardTimers,
  createFloorHazardPlayerState,
  floorHazardTickKinds,
  isFloorHazardImmune,
  tryCleanseFloorHazards,
} from '../combat-core/combat/floorHazardState';
import { PortalField } from '../render/portalField';
import { cleanseReadoutLine } from '../render/floorHazardReadout';
import { blocksFromPlacements, terrainForRoom } from '../run/roomTerrainConfig';
import { RoomFixture } from '../render/roomFixture';
import { ROOM_FIXTURE_CONFIG, ROOM_FIXTURE_GUIDE } from '../run/roomFixtureConfig';
import { mockMinimapModel } from '../run/mapGraphMock';
import { RunMapGraph, maximumMapPathRooms, toMinimapModel } from '../run/mapGraph';
import { MAP_GRAPH_PRESET_01 } from '../run/mapGraphPreset';
import { generateRunMap } from '../run/mapGenerator';
import type { MapGraphDefinition } from '../run/mapGraph';
import { encounterFromMapNode } from '../run/mapEncounter';
import {
  DEMO_SAMPLE_INCANTATIONS,
  DEMO_START_ROOM,
  applyDemoLoadout,
  consumeDemoRunRequest,
} from '../run/demoLoadout';
import {
  MIRROR_CAST_CONFIG,
  mirrorImpactHitsPlayer,
  pickMirrorSpell,
} from '../combat-core/boss/mirrorCast';
import { BOSS_ARCANA_CONFIG, bossArcanaSpell } from '../combat-core/boss/bossArcana';
import {
  addEntry,
  bestEntryFromRun,
  loadGrimoire,
  offerEntries,
  saveGrimoire,
  specFromEntry,
} from '../spell/grimoire';
import { onboardingPlaceholderAt } from '../spell/onboardingExamples';
import { CONTROL_CONFIG } from '../combat-core/control/controlConfig';
import { EnemyControlState } from '../combat-core/control/enemyControlState';
import { SUMMON_CONFIG, summonGroupPlan } from '../combat-core/summons/summonConfig';
import { SummonedOrb } from '../combat-core/summons/summonedOrb';
import { GameAudio } from '../audio/gameAudio';
import {
  behaviorElements,
  behaviorUsesAnyElement,
  resolveSpellPlan,
  moveChainRoles,
  screenDirectionFromAngle,
  SEQUENCE_PLAN_LIMITS,
  sequenceFlowTimeline,
  tuningScale,
} from '../spell/sequencePlan';
import type {
  FormBehavior,
  MoveBehavior,
  MoveChainRole,
  SequenceFlowTimeline,
  ResolvedSpellPlan,
  SpellPlan,
} from '../spell/sequencePlan';
import { sequenceEngraveCandidate } from '../spell/sequenceEngraveCandidate';
import { runSpellMatrixAudit, summarizeMatrix } from '../dev/spellMatrixAudit';
import { SilenceCurseField } from '../render/silenceCurseField';
import { BlackoutCurseField } from '../render/blackoutCurseField';
import { HeatwaveCurseField } from '../render/heatwaveCurseField';
import { showRoomCurseBanner } from '../render/roomCurseBanner';
import {
  debugTrapProfileFromEnv,
  trapHazardCirclePlacements,
  trapProfileFromLegacyCurse,
} from '../run/trapRoomProfile';
import type { TrapRoomProfile, TrapSafeCorridor } from '../run/mapGraphContract';

// 임시값: 카메라 방식과 방 크기를 최종 확정한 뒤 조정한다.
const WORLD_SIZE_MULTIPLIER = 2;
/** 중앙에서 시작하는 플레이어와 보스가 겹치지 않도록 둔 초기 세로 간격. */
const BOSS_INITIAL_OFFSET_Y = 340;
/** 제품 기본값: 첫 번째 조우부터 전체 런을 시작한다. */
const DEBUG_START_ROOM = 1;
/** 무내성 기본값 — R2 계약(BossResistanceProfile) 형태 유지 */
const NO_BOSS_RESISTANCE: BossResistanceProfile = {
  resistedElement: null,
  resistMultiplier: 1,
  counterStrategy: null,
};
/**
 * 좌상단 전투 HUD (총괄 지적: "네모 박스 크기를 더 줄여도 될 것 같음. 최대한 컴팩트하게").
 *
 * 종전 360×186의 실제 내용은 **270×7 바 세 개**였다 — 라벨을 바 위에 따로 두어
 * 스탯 하나가 34px을 먹었고, 나머지는 죽은 공간이었다.
 *
 * 바꾼 방식: **라벨·수치·바를 한 줄에** 놓는다. 스탯당 34 → 22px로 줄고, 바가
 * 짧아지는 대신(270 → 196) 같은 비율 정보를 그대로 전달한다 — 바의 정보량은 길이가
 * 아니라 채움 비율이다. 높이 186 → 130 (−30%), 폭 360 → 300 (−17%).
 *
 * 높이가 118이 아닌 130인 이유: 마지막 줄(attunement·버프)이 박스 밖으로 나가고
 * 하단 쿨다운 띠(height − 5)와 겹쳤다. 실측으로 잡은 값이다.
 *
 * 친화 바가 이 박스 **아래**에 붙으므로(HUD.y + HUD.height 기준) 박스가 줄면
 * 친화 바도 함께 올라와 좌상단 전체가 조여진다.
 */
const HUD = {
  x: 18,
  y: 18,
  width: 300,
  height: 130,
  /** 스탯 행 시작 y (박스 상단 기준 오프셋) */
  rowTop: 44,
  /** 행 간격 — 종전 34에서 축소 */
  rowPitch: 22,
  /**
   * ⚠️ 한 줄 배치의 함정 (총괄 제보: "숫자랑 바랑 겹침"):
   * 라벨+수치를 한 텍스트로 두면 `SHIELD 100 / 100`이 x=138까지 뻗어 바(x=104)를 덮었다.
   * 폰트 폭에 의존하는 배치는 내용이 길어지는 순간 깨진다.
   *
   * 그래서 **라벨(왼쪽 고정) · 바(가운데) · 수치(오른쪽 정렬)**로 셋을 분리한다.
   * 수치는 origin(1,0)으로 박스 우측에 붙어 자라므로 어떤 값이 와도 바를 침범하지 않고,
   * 바는 두 고정 좌표 사이라 폭이 항상 확정된다.
   */
  labelX: 14,
  barX: 78,
  /**
   * 바 폭 — 수치 자리수가 늘어도(보상·제단으로 최대 체력이 4자리까지) 침범하지 않게
   * 우측에 80px을 비워둔 값이다. 실측으로 잡았다: `100/100`(7자)이 47px, 4자리
   * `1000/1000`(9자)이 60px.
   */
  barWidth: 140,
  barHeight: 6,
  /** 수치 오른쪽 끝 (박스 우측에서 안쪽으로) */
  valueRight: 10,
} as const;

/**
 * 우상단 상태 패널 — ROOM·WAVE·BOSS를 한 판에 담는다.
 * 종전엔 ROOM 칩(DOM)·WAVE 패널·미니맵이 **3단**으로 쌓여 있었다 (총괄 지적).
 */
const RIGHT_PANEL = {
  y: 18,
  /** 텍스트 위 여백 */
  padTop: 10,
  /** 텍스트 아래 여백 */
  padBottom: 12,
  /** 패널과 미니맵 사이 간격 */
  gap: 10,
  /** 평시(2줄) 텍스트 높이 — 미니맵 초기 위치 계산용 */
  baseTextHeight: 35,
} as const;

/** 상태 텍스트 높이 → 패널 높이. 보스전(저항·관통 줄)에서 늘어난다. */
function rightPanelHeight(textHeight: number): number {
  const h = Number.isFinite(textHeight) ? Math.max(0, textHeight) : 0;
  return Math.round(RIGHT_PANEL.padTop + h + RIGHT_PANEL.padBottom);
}

/** 스탯 행 i(0=HP, 1=마나, 2=보호막)의 y 중심 */
function hudRowY(index: number): number {
  return HUD.y + HUD.rowTop + index * HUD.rowPitch;
}

interface PauseRow {
  id: 'resume' | 'settings' | 'quit';
  label: string;
}

/**
 * 일시정지 메뉴는 한 장이다. "설정"은 **타이틀과 같은 DOM 오버레이**를 연다 —
 * 같은 기능이 화면마다 다르게 생기면 안 된다(총괄 지적). 깊이 배치로 빌드 칩을
 * 밝게 남기는 논리는 이 메인 화면에만 필요하지, 설정 하위 화면엔 필요 없다.
 */
/** 일시정지 메뉴 세로 배치 — 여기서만 쓰인다 */
const PAUSE_LAYOUT = { titleY: 186, firstY: 252, rowGap: 42 } as const;

const PAUSE_MAIN: readonly PauseRow[] = [
  { id: 'resume', label: '게임 재개' },
  { id: 'settings', label: '설정' },
  { id: 'quit', label: '타이틀로 나가기' },
];


/**
 * 빌드 칩 기하 — 2×2로 65×65px. 기존 텍스트 2줄(229×27=6183px²)보다 작은
 * 4225px²면서 글리프는 11px→17px로 커진다 (면적·가독성 동시 개선).
 */
const BUILD_CHIP = {
  size: 30,
  gap: 5,
  glyph: 17,
  tooltipWidth: 210,
} as const;

/** 친화 경험치 바가 채워지는 이정표 — 각성 임계(MASTERY_REDESIGN §5-b, 친화 0.9). */
const AFFINITY_BAR_MILESTONE = 0.9;

/** 친화 바 한 행(라벨+바)의 세로 간격 — 3행이면 HUD 아래 ~66px를 쓴다 */
const AFFINITY_ROW_HEIGHT = 22;

/**
 * 미러 캐스트 판정용 플레이어 히트 반경(px). 적 탄환 판정(bulletHitDistance 14)과
 * 같은 결 — 시각 스프라이트보다 약간 후하게 잡아 "스쳤는데 맞았다"를 피한다.
 */
const PLAYER_HIT_RADIUS = 16;

interface FriendlyMissile {
  body: Phaser.GameObjects.Arc;
  halo: Phaser.GameObjects.Arc;
  target: CombatEnemy;
  damage: number;
  element?: SpellElement;
  speed: number;
  hitDistance: number;
  knockbackDistance: number;
  source: DamageSource;
}

/**
 * 피해 귀속 — 오토 비중 실런 계측용 (GATE_DECISION_0728 #67 필수 2번).
 * manual=수동 영창(지속형 wall/orbit 포함) · auto=각인+정령+소환 · basic=기본탄 ·
 * status=상태이상 파생(burn DoT·shock 전이, 시전 주체 미추적이라 별도 버킷)
 */
type DamageSource = 'manual' | 'auto' | 'basic' | 'status';

interface CastFeedbackState {
  resistanceNoticeShown: boolean;
}

interface SequenceTargetState {
  lockedEnemy: CombatEnemy | null;
  lastTargetPoint: Phaser.Math.Vector2 | null;
}

interface SpellExecutionOptions {
  sequenceTarget?: SequenceTargetState;
  onAffectEnemy?: (enemy: CombatEnemy) => void;
  damageScale?: number;
  rangeScale?: number;
  radiusScale?: number;
  controlDurationScale?: number;
  controlStrengthScale?: number;
  shieldAmountScale?: number;
  /**
   * 장식 VFX 밝기 배율 — 에코(제단 거래)가 원본보다 **투명하게** 나가는 데 쓴다
   * (총괄 지적: "에코라는 걸 알 수 있게, 유저가 쓴 영창보다는 좀 더 투명하게").
   * 미지정이면 자동 시전 여부로 결정하는 기존 동작 그대로.
   */
  decorVfxScale?: number;
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
  options?: SpellExecutionOptions;
}

interface ActiveOrbit {
  spec: SpellSpec;
  views: Phaser.GameObjects.Container[];
  elapsedSeconds: number;
  angle: number;
  lastHitAt: Map<CombatEnemy, number>;
  durationSeconds: number;
  radiusScale: number;
  options?: SpellExecutionOptions;
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
  private heatDamageAura!: Phaser.GameObjects.Arc;
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
  /** 원소별 각성 — 원소당 1회. 런 리셋에서 비운다 (AWAKENING_PROPOSAL) */
  private awakenings: AwakeningState = {};
  /** 제단 최상위 거래 — 수동 단일 영창이 한 번 더 울린다 (#214). 런 리셋에서 끈다 */
  private echoUnlocked = false;
  /**
   * 런 맵 그래프가 실제 방 내용의 단일 원본이다. 포탈 선택은 보상 적용 전에 끝나므로
   * 선택된 조우를 방 번호별로 고정해 현재 방 이벤트에 다음 노드가 섞이지 않게 한다.
   */
  private mapGraph: RunMapGraph = new RunMapGraph(MAP_GRAPH_PRESET_01);
  private readonly mapEncounterByRoom = new Map<number, EncounterDefinition>([[
    DEBUG_START_ROOM,
    encounterFromMapNode(this.mapGraph.current()),
  ]]);
  // 명시적 타입: rewardDraw 클로저가 컨트롤러 상태(친화)를 읽어 자기참조 추론이 막히는 것 회피
  /**
   * 방 전환 게이트 (#214 · 총괄 제보 후속).
   *
   * `chooseReward()`는 보상 적용과 전환 타이머를 **같이** 건다. 보상을 즉시 반영하려면
   * chooseReward를 먼저 불러야 하는데, 그러면 포탈을 고르기 전에 방이 넘어간다.
   *
   * 그래서 전환 콜백을 여기 보관하고, 포탈 진입이 끝나면 그때 실행한다. 컨트롤러는
   * 자기가 타이머를 걸었다고 믿고 있고 실제로는 씬이 시점을 정한다 — 계약을 넘지 않는다.
   */
  private pendingRunTransition: { delayMs: number; run: () => void } | null = null;

  private readonly combatRunController: CombatRunController = new CombatRunController({
    playerState: this.playerState,
    /**
     * 전환 타이머 주입 — 미지정이면 컨트롤러가 setTimeout으로 바로 걸어버린다.
     * 포탈 선택이 있는 방에서는 붙잡아 두고, 없으면 종전대로 즉시 예약한다.
     */
    scheduleTransition: (delayMs, callback) => {
      if (this.transitionNeedsRoomChoice()) {
        this.pendingRunTransition = { delayMs, run: callback };
        return;
      }
      this.time.delayedCall(delayMs, () => {
        if (!this.scene?.isActive?.()) return;
        callback();
      });
    },
    initialRoomIndex: DEBUG_START_ROOM,
    /**
     * ⚠️ 컨트롤러의 `maxRooms`는 `readonly`라 런 중에 바꿀 수 없다. 그래서 생성 맵도
     * **프리셋과 같은 8방이어야** `ROOM x/8` 표시와 보스 판정(`roomIndex >= maxRooms`)이
     * 맞는다. #272에서 미니맵·포탈 라벨이 상수 2칸 어긋난 것과 같은 종류의 결합이다.
     *
     * 생성기는 파티션 예산이 `1 + 2 + 1 + 3 + 1`로 고정이고 한 파티션의 모든 분기가
     * 같은 길이를 갖기 때문에 **모든 경로가 정확히 8방**이다. 실측 500시드에서 나타난
     * 경로 길이는 8 하나뿐이었고 한 맵 안에서 길이가 갈린 경우도 0이었다.
     *
     * 우연이 아니라 구조적 성질이지만, 예산을 건드리면 조용히 깨진다 —
     * `map-generator-regression`이 이 일치를 못박는다.
     */
    maxRooms: maximumMapPathRooms(MAP_GRAPH_PRESET_01),
    encounterProvider: (roomIndex) => this.mapEncounterForRoom(roomIndex),
    rewardDraw: (roomIndex) => {
      // 무전투 방(보물·제단)은 전용 보상표를 쓴다 — 포탈에 붙은 라벨이 지켜져야 한다.
      // 종전엔 그래프 노드 종류가 표시만 되고 보상·내용에 반영되지 않아, "보물"로
      // 들어가도 일반 전투방 보상이 나왔다(총괄 제보).
      const roomless = this.rewardlessNodeKind();
      if (roomless === 'treasure') {
        return drawTreasureReward(
          roomIndex,
          this.combatRunController.state.maxRooms,
          this.engraveRewardRand,
        );
      }
      if (roomless === 'altar') {
        // 대가와 보상이 한 장에 붙은 거래 카드 + 거절 카드 (#214 재설계)
        return drawAltarOffer(this.playerState.maxHp, this.altarAwakenElement());
      }
      // 방 종류별 배율 (총괄 지적: "누가 함정방을 선택하겠어"). 종전엔 정예·함정이
      // 일반 전투방과 **완전히 같은 보상**이라 더 위험한 방을 고를 이유가 없었다.
      const kind = this.mapGraph.current().kind;
      const kindScale = rewardScaleFor(kind).scale;
      const engraved = this.engraveManager.injectReward(
        drawRewardOptions(roomIndex, this.engraveRewardRand, kindScale)
          .slice(0, rewardOptionCount(kind)),
        roomIndex,
        this.engraveRewardRand,
      );
      const withSpirit = this.spiritManager.injectReward(
        engraved,
        roomIndex,
        this.engraveRewardRand,
      );
      // 각성 — 친화 임계(1.2)에 닿은 원소가 있으면 **3택 전체**를 각성 갈래로 바꾼다.
      // 한 장만 끼우지 않는 이유: 세 갈래 중 고르는 것이 각성의 핵심이고, 일반 카드와
      // 섞으면 "스타일 선택"이 아니라 "운 좋으면 각성"이 된다.
      const awakenTarget = awakenableElement(
        this.combatRunController.state.elementalAffinity,
        this.awakenings,
      );
      if (awakenTarget) return awakeningOptions(awakenTarget);
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

  /**
   * 주요 공지 큐 — 판 있는 배너는 **한 번에 하나만** 띄운다. 겹쳐 띄우면 판끼리
   * 포개져 오히려 못 읽는다. 진화·각성처럼 연달아 터지는 순간이 실제로 있다.
   */
  private bannerQueue: SystemBannerCopy[] = [];

  private activeBanner: Phaser.GameObjects.Container | null = null;
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
  /** 친화 경험치 바 라벨 — 상위 원소별 1행씩 (HUD 박스 아래, 주력이 맨 위) */
  private affinityLabelTexts: Phaser.GameObjects.Text[] = [];
  /** 필살기(융합) 게이지 라벨 — 하단 중앙 미터 위 (충전%·준비 알림) */
  private fusionLabelText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  /** 빌드 칩 — 각인 2 + 정령 2를 우하단 2×2 아이콘 그리드로 (buildChipModel) */
  private buildChipRoot!: Phaser.GameObjects.Container;

  private buildChipGraphics!: Phaser.GameObjects.Graphics;

  private buildChipIcons: Phaser.GameObjects.Image[] = [];

  private buildChipZones: Phaser.GameObjects.Zone[] = [];

  private buildChips: BuildChip[] = [];

  /** DOM 설정 오버레이가 떠 있나 — ESC가 두 겹을 한 번에 닫는 걸 막는다 */
  private settingsOverlayOpen = false;
  /** ESC 검사 모드 — 전투를 멈추고 칩에 마우스를 올려 상세를 본다 */
  private buildInspectOpen = false;

  /** 일시정지 암막 — 게임 월드만 덮는다(깊이 97). HUD·칩은 위에 남아 밝게 읽힌다. */
  private pauseDim!: Phaser.GameObjects.Graphics;

  private pauseMenuPlate!: Phaser.GameObjects.Graphics;

  private pauseMenuTitle!: Phaser.GameObjects.Text;

  private pauseMenuItems: Phaser.GameObjects.Text[] = [];

  private pauseMenuIndex = 0;

  /** 나가기 오확인 방지 — 한 번 더 눌러야 확정된다 (런이 사라지는 되돌릴 수 없는 선택) */
  private quitArmed = false;





  private settings: GameSettings = { ...DEFAULT_SETTINGS };

  /** 밝기 오버레이 — 1 미만은 검은 막, 초과는 흰 막 (깊이 98: 월드 위·HUD 아래) */
  private brightnessVeil!: Phaser.GameObjects.Graphics;

  private buildInspectPlate!: Phaser.GameObjects.Graphics;

  private buildInspectText!: Phaser.GameObjects.Text;

  private hoveredChipIndex = -1;
  /** 활성 자기 강화 표시 (종류·세기·남은 시간) */
  private buffStatusText!: Phaser.GameObjects.Text;
  private sequenceProgressGraphics!: Phaser.GameObjects.Graphics;
  private sequenceProgressText!: Phaser.GameObjects.Text;
  private sequenceProgressStartedAt = 0;
  private sequenceProgressDurationMs = 0;
  private sequenceProgressName = '';
  private sequenceProgressBoundaries: number[] = [];
  /**
   * 영창 시퀀스 판정 기능 플래그 (R2 2일 게이트 안전망). 기본 ON.
   * VITE_SEQUENCE_JUDGE=0 이면 판정이 plan을 실어도 무시하고 v2 단일 경로로 즉시 복귀한다.
   */
  private readonly sequenceJudgeEnabled = import.meta.env.VITE_SEQUENCE_JUDGE !== '0';
  /** 주문서 보유 수 캐시 — HUD는 매 프레임 갱신되므로 localStorage를 직접 읽지 않는다 */
  private grimoireCount = 0;
  /**
   * 이번 런의 격상 프로필(#77) — clears는 런 종료 시에만 바뀌므로 **런 중 불변**이다.
   * 시전마다 loadRunMemory()로 localStorage를 읽지 않도록 런 시작에 1회만 계산한다.
   */
  private runEscalation: RunEscalationProfile = runEscalationProfile(EMPTY_RUN_MEMORY);
  /** 격상 Tier 3부터 스테이지별 일부 방에 배정되는 결정적 저주 계획. */
  private roomCursePlan: RoomCursePlan = {
    selectedKinds: {},
    curseWeights: { silence: 0.5, blackout: 0.5, heatwave: 0.5, 'word-limit': 0.5 },
    assignments: [],
  };
  private activeRoomCurse: RoomCurseAssignment | null = null;
  /** MapGraph 연결 전 함정방 규칙을 검증하기 위한 DEV 전용 첫 방 강제 프로필입니다. */
  private readonly debugTrapProfile = debugTrapProfileFromEnv();
  private activeTrapProfile: TrapRoomProfile | null = null;
  private silenceCurseField: SilenceCurseField | null = null;
  private blackoutCurseField: BlackoutCurseField | null = null;
  private heatwaveCurseField: HeatwaveCurseField | null = null;
  private heatwaveGraceRemaining = 0;
  private heatwaveImmunityRemaining = 0;
  private heatwaveDamageNotice = 0;
  private heatwaveDamageNoticeElapsed = 0;
  private activeCurseBanner: Phaser.GameObjects.Container | null = null;
  /** 약화 안내를 이미 띄운 원소 — 방마다 비워 같은 경고가 시전마다 반복되지 않게 한다 */
  private readonly escalationNoticed = new Set<SpellForm>();
  private waveManager = new WaveManager();
  private eliteModifierAssignments: EliteModifier[] = [];
  private eliteSpawnIndex = 0;
  private incantWrap!: HTMLElement;
  private incantBar!: HTMLInputElement;
  private incantState!: HTMLElement;
  private incantCount!: HTMLElement;
  private incantHint!: HTMLElement;
  private incantChargeLabel!: HTMLElement;
  /** 대역 칩 컨테이너 (속삭임·영창·외침) — incantBands 모델로 채운다 */
  private incantBands!: HTMLElement;
  private incantGuideEl!: HTMLElement;
  /**
   * 영창 창 안에 띄울 첫 영창 안내 (총괄 지적: 영창하면 화면이 흐려져 배너가 안 읽힌다).
   * 배너는 캔버스에 그려지는데 영창 창은 그 위를 덮는 DOM이라 어둠·블러가 통째로 걸린다.
   * 안내 내용이 하필 "ENTER를 눌러 이렇게 쳐라"라서, 시킨 대로 누르면 예시가 흐려졌다.
   * 그래서 같은 내용을 **입력창 안에서** 다시 준다. 첫 성공 영창까지만 산다.
   */
  private incantGuide: { title: string; lines: string[] } | null = null;
  private incanting = false;
  private casting = false;
  /**
   * 영창 바 리스너 — #incant-bar는 씬 밖 영속 DOM이라, 익명 등록은 씬 재진입
   * (런 종료→타이틀→새 런)마다 누적돼 Enter 한 번에 영창이 겹으로 나갔다
   * (#216 P0: 알림 2회·가짜 마나부족). 안정된 참조로 보관해 제거 후 재등록한다.
   */
  private readonly onIncantInput = (): void => this.updateIncantCharge();

  private readonly onIncantKeydown = (e: KeyboardEvent): void => {
    e.stopPropagation(); // 게임 키 입력과 충돌 방지
    if (e.key === 'Enter') {
      const text = this.incantBar.value.trim();
      if (!text) {
        this.closeIncant();
        return;
      }
      if (
        this.activeRoomCurse?.kind === 'word-limit'
        && wordLimitCost(text) > WORD_LIMIT_CURSE_CONFIG.budget
      ) {
        this.blockWordLimitCast();
        return;
      }
      this.beginJudging();
      void this.castFromText(text);
    } else if (e.key === 'Escape') {
      this.closeIncant();
    }
  };

  /** setupRunFlow 1회 가드 — 컨트롤러도 씬 필드로 영속이라 재진입마다 on()을 걸면 겹알림 */
  private runFlowBound = false;
  /**
   * 시퀀스 이동 트윈들 — **이전 트윈을 멈추지 않는다.**
   * tweens.add는 다음 틱부터 움직이는데 이전 것을 같은 프레임에 stop하면
   * 인계 프레임이 1프레임 정지(속도 0)됐다가 다음 프레임에 2프레임치를 몰아
   * 이동한다(실측: 인계마다 0 → 스파이크). 이전 트윈을 살려두면 그 프레임을
   * 이전 경로가 채우고, 새 트윈이 첫 틱에 현재 위치를 캡처해 자연 인계된다
   * (같은 속성은 나중 add가 덮어쓴다). 배열은 시퀀스 종료 시 일괄 정리용.
   */
  private sequenceMoveTweens: Phaser.Tweens.Tween[] = [];
  /** 영창 연 횟수 — 온보딩 예시 placeholder를 순환시키는 인덱스 */
  private incantOpenCount = 0;
  /** 첫 영창 안내를 이미 띄웠는지 (localStorage로 재플레이엔 생략) */
  private onboardingHintShown = false;
  private timeScale = 1;
  private readonly enemyHitStop = new EnemyHitStopController<CombatEnemy>();
  private readonly enemyKnockbacks = new Map<CombatEnemy, EnemyKnockbackState>();
  private basicAttackCooldownRemaining = 0;
  private friendlyMissiles: FriendlyMissile[] = [];

  /** 필살기 — 수동 영창으로만 차는 융합 게이지 (fusionGauge.ts) */
  private readonly fusionGauge = new FusionGauge();

  /** 속삭임 힌트 최근 노출 시각 — 15초 쿨다운 (announceManaShortage) */
  private lastWhisperHintAt = 0;

  /** 런 누적 피해 귀속 원장 — restartRun에서 리셋, 방·런 종료 시 리포트 */
  private damageLedger: Record<DamageSource, number> = {
    manual: 0, auto: 0, basic: 0, status: 0,
  };
  /** 활성 소환체들 — 분신 1 / 군체 N / 포탑 1 / 기본 오브 1 (#97 ②) */
  private activeSummons: SummonedOrb[] = [];
  private activeSummonKnockbackDistance = 0;
  private activeWall: ActiveWall | null = null;
  private activeOrbit: ActiveOrbit | null = null;
  /** 성장 누적 표식 (룬 링·친화 오라) — 보상 선택 때 갱신, 매 프레임 플레이어 추종 */
  private growthMarks!: GrowthMarks;
  /** 주문서 유산 선택 중 — 카드가 키를 캡처하는 동안 전투를 멈춘다 */
  private legacySelecting = false;
  /** 시연 런("각성한 영창가로 시작")인가 — 유산 선택을 건너뛰는 데 쓴다 */
  private demoRun = false;
  /** #214 선행 개발 프리뷰 전용 (DEV 콘솔 훅이 생성) — 본 게임 경로 미배선 */
  private devMinimap: MinimapHud | null = null;
  private devPortalField: PortalField | null = null;
  private runMinimap: MinimapHud | null = null;
  /** 방 중앙 설치물 (보물상자·제단) — 다가가야 보상이 열린다 (#214) */
  private roomFixture: RoomFixture | null = null;
  /**
   * 정적 지형 장벽 (#214 지형 Tier 2). 배치 데이터는 R1 소유이고 여기는 기전만 —
   * 방 진입 시 채우고 방 전환 시 비운다. 비어 있으면 전 경로가 무비용으로 통과한다.
   */
  /** 방 구조물 (정사각 블록) — 이동·투사체·**플레이어 주문**을 모두 막는다 */
  private terrainBarriers: TerrainBlock[] = [];
  private terrainBarrierView: Phaser.GameObjects.Graphics | null = null;
  /**
   * 바닥형 지형 (#214 지형 Tier 1 R2) — 용암·독지대. 배치는 R1 소유, 여기는 렌더·판정만.
   * 방 진입 시 채우고 방 전환 시 비운다. 장벽(막는 것)과 달리 밟으면 아픈 것.
   */
  private floorHazards: FloorHazardZone[] = [];
  /** 종류별 데칼 — 정화 면역 중에 그 종류만 흐리게 하려면 따로 그려야 한다 (#239) */
  private floorHazardViews = new Map<FloorHazardKind, Phaser.GameObjects.Graphics>();
  /** 잔류 도트·면역·정화 횟수 — 방마다 초기화 (floorHazardState) */
  private floorHazardPlayer = createFloorHazardPlayerState();
  /** 스케일된 게임 시간 기준 지형 틱 쿨다운. */
  private floorHazardTickCooldown = 0;
  /**
   * 진행 중인 미러 캐스트(예고 단계). 타이머는 update에서 **스케일된 델타**로
   * 감소한다 — 영창 슬로모(timeScale 0.1) 중엔 예고도 같이 느려져, "예고를 보고
   * 슬로모를 열어 보호막을 친다"는 카운터플레이가 성립한다.
   */
  private pendingMirrorCast: {
    spec: SpellSpec;
    targetX: number;
    targetY: number;
    remainingSeconds: number;
    marker: Phaser.GameObjects.Graphics;
    /** 화면 가장자리 붉은 맥동 — "티가 안 남" 피드백의 답 */
    vignette: Phaser.GameObjects.Graphics;
    /** 수축 링 + 보스→표적 수렴 마력선 (매 프레임 다시 그림) */
    beamLine: Phaser.GameObjects.Graphics;
    caster: BossEnemy;
  } | null = null;
  /** 이 보스전에서 미러 캐스트를 이미 썼는가 — 페이즈2 1회 (페이즈3 패턴은 force) */
  private mirrorCastUsed = false;
  /** 비전 마법(bossArcana) 상태 — 스펠북 예고·어둠 장막·중력 인력 */
  private pendingBossArcana: {
    spec: SpellSpec;
    targetX: number;
    targetY: number;
    remainingSeconds: number;
    marker: Phaser.GameObjects.Graphics;
  } | null = null;
  private bossArcanaIndex = 0;
  private bossShroud: BlackoutCurseField | null = null;
  private bossShroudRemaining = 0;
  private bossPullRemaining = 0;
  private readonly spiritViews = new Map<string, SpiritOrbView>();
  private spiritOrbitAngle = -Math.PI / 2;
  private readonly enemyControlState = new EnemyControlState();
  /** 적별 지속 상태이상 — burn(지속피해)·weaken(취약). freeze/slow는 enemyControlState. */
  private readonly enemyAilments = new EnemyAilmentState();

  /**
   * 화상 잔불 — 타는 적에 붙는 작은 불씨 이미터 (#216 항목5).
   * 화상 틱이 일반 피격 연출(SFX·squash·hitstop)을 타서 "안 때렸는데 맞는
   * 소리·모션"이 나던 것을, 지속 상태 VFX + 약한 틱 펄스로 원인을 보여주는
   * 방식으로 바꾼다. 틱 자체는 무음이다 — 잔불이 "타고 있다"를 전담한다.
   */
  private readonly burnEmbers = new Map<CombatEnemy, Phaser.GameObjects.Particles.ParticleEmitter>();

  /**
   * 적별 피해 숫자 — 짧은 창(mergeWindowMs) 안의 재타격은 새 숫자를 띄우지 않고
   * **기존 것에 누적**한다. zone 틱·chain 재적중이 숫자를 도배하는 걸 막고,
   * 오히려 "이 장판이 총 얼마를 넣었나"로 읽힌다.
   */
  private readonly damageNumbers = new Map<CombatEnemy, {
    text: Phaser.GameObjects.Text; total: number; expireAt: number; resisted: boolean;
  }>();
  /** 연쇄 감전 남발 방지 — 적별 마지막 발동 시각 */
  private readonly shockCooldowns = new Map<CombatEnemy, number>();
  private readonly controlIndicators = new Map<CombatEnemy, Phaser.GameObjects.Arc>();
  /** 보스방 진입 시 주문 히스토리로 계산 — R2 내성 모듈이 오면 계산부만 교체 */
  private bossResistance: BossResistanceProfile = { ...NO_BOSS_RESISTANCE };
  /** 페이즈를 넘어 유지되는 원소별 내성. 같은 원소는 더 강한(낮은) 배수 하나만 유지한다. */
  private readonly activeBossResistances = new Map<SpellElement, number>();
  private lastResistNoticeAt = 0;
  /** 마스터리 관통 안내는 보스전당 1회 — 매 타격마다 뜨면 잔소리가 된다 */
  private masteryPierceAnnounced = false;
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
  /** 다음 room-started가 새 런의 첫 방이면, 방 로그보다 먼저 남길 시작 사유. */
  private pendingRunStartReason: 'continue' | 'death-restart' | null = null;
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
    // 폼 글리프 — 빌드 칩용 텍스처(data URI SVG, 흰색으로 구워 setTint로 원소색을 입힌다).
    // 도감·보상 카드와 같은 어휘라 한 곳(formGlyphs.ts)에서 온다.
    for (const { key, dataUri } of allGlyphTextures()) {
      this.load.svg(key, dataUri, { width: 48, height: 48 });
    }
    // Phase 5 프로토타입 — AI 생성 스테이지 배경 (도형 데모 탈피).
    // 월드 크기(1920×1280)로 업스케일 + 절차적 질감을 구워넣은 완전 스크롤 맵용 이미지.
    this.load.image(
      'bg-stage1',
      `${import.meta.env.BASE_URL}assets/backgrounds/arena-stage1.jpg`,
    );
    // 스테이지2 전용 AI 배경 — 부패한 보라 아케인 석재 (stage1+틴트 대체, #72)
    // 후처리: 워터마크 제거·발광 하이라이트 롤오프(몹 씻김 방지)·3:2 크롭·1920×1280.
    this.load.image(
      'bg-stage2',
      `${import.meta.env.BASE_URL}assets/backgrounds/arena-stage2.jpg`,
    );
    // 보스방 전용 AI 배경 — 탑다운 소환진 아레나 (일반 방과 확실히 구분되는 결전 공간)
    this.load.image(
      'bg-boss',
      `${import.meta.env.BASE_URL}assets/backgrounds/arena-boss.jpg`,
    );
    // 방 종류별 전용 배경 (총괄 생성, 2026-07-30) — 정예·함정·보물·제단.
    // 종전엔 이 넷이 스테이지 배경 + 색 틴트로만 구분됐다(#285). 검수 실측:
    // 워터마크 제거 확인(0.7 초과 화소 0개) · 2528×1696 → 1920×1280 리샘플.
    for (const [key, file] of [
      ['bg-elite', 'arena-elite.jpg'],
      ['bg-trap', 'arena-trap.jpg'],
      ['bg-treasure', 'arena-treasure.jpg'],
      ['bg-altar', 'arena-altar.jpg'],
    ] as const) {
      this.load.image(key, `${import.meta.env.BASE_URL}assets/backgrounds/${file}`);
    }
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
      if (file.key === 'bg-stage1' || file.key === 'bg-stage2') {
        console.warn('[backdrop] 배경 이미지 로드 실패 — 그리드로 폴백:', file.src);
      }
    });
  }

  create(): void {
    // 실런 재측정용 디버그 접근자 — 콘솔에서 __autoShare()로 현재 누적 확인
    (window as unknown as { __autoShare?: () => unknown }).__autoShare
      = () => this.autoShareSnapshot();
    // 씬 재시작(타이틀 → 다시 시작) 대비 — Phaser가 shutdown에서 view를 파괴하므로
    // 낡은 래퍼를 그대로 들고 create로 들어가면 clearCombatRoom이 죽은 view를 만져 크래시난다.
    // 참조만 끊는다(파괴는 Phaser 몫).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dropStaleRunObjects());
    // 씬은 재사용된다 — 검사 모드가 열린 채 나갔다면 정지가 남는다. 진입 시 무조건 해제.
    this.buildInspectOpen = false;
    this.hoveredChipIndex = -1;
    this.pauseMenuIndex = 0;
    this.quitArmed = false;
    this.time.paused = false;
    // 저장된 설정 — 씬 재진입마다 다시 읽어 적용한다(오디오·밝기는 씬 소유 객체다)
    try {
      this.settings = loadSettings(localStorage);
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
    // 주문 소비 매트릭스 감사 — 콘솔에서 __spellMatrix(step)로 effect×form×target 전수 점검.
    // 프레임 진행은 호출측이 넘긴다(백그라운드 탭에서는 game.loop.step을 감싸야 하므로).
    if (import.meta.env.DEV) {
      // #214 미니맵·포탈 선행 개발 프리뷰 — R1 그래프 없이 목데이터로 렌더 확인.
      // 콘솔에서 __mapPreview() 호출. 본 게임 경로에는 배선되지 않는다(프리뷰 전용).
      (window as unknown as { __mapPreview?: () => unknown }).__mapPreview = () => {
        this.devMinimap?.destroy();
        this.devPortalField?.destroy();
        const { width } = this.scale;
        this.devMinimap = new MinimapHud(this, width - 306, 150);
        this.devMinimap.update(mockMinimapModel());
        this.devPortalField = new PortalField(
          this,
          this.player.x,
          this.player.y - 120,
          [
            { nodeId: 'b1', kind: 'elite' },
            { nodeId: 'b2', kind: 'altar' },
            { nodeId: 'b3', kind: 'trap' },
          ],
          (choice) => {
            this.announceSystemMessage(`[프리뷰] 포탈 진입 — ${choice.nodeId}`, '#8fa4ff');
            this.devPortalField?.destroy();
            this.devPortalField = null;
          },
        );
        // 지형 장벽 프리뷰 — 개방형 배치 원칙대로 중앙 기둥 + 가장자리 짧은 벽
        const cx = this.worldBounds.centerX;
        const cy = this.worldBounds.centerY;
        this.setTerrainBarriers([
          { x: cx, y: cy, half: 68 },
          { x: cx - 420, y: cy - 260, half: 56 },
          { x: cx + 420, y: cy + 260, half: 56 },
        ]);
        // 바닥지형 프리뷰 — 용암·독지대 (배치는 R1 프리셋, 여기선 눈으로 확인용)
        this.setFloorHazards([
          { kind: 'lava', x: cx - 240, y: cy + 150, radius: 72 },
          { kind: 'poison', x: cx + 240, y: cy - 150, radius: 84 },
        ]);
        return '미니맵 + 포탈 3개 + 지형 장벽 3개 + 바닥지형(용암·독) 프리뷰 생성';
      };
      (window as unknown as { __spellMatrix?: (step: () => void) => unknown }).__spellMatrix
        = (step: () => void) => {
          const rows = runSpellMatrixAudit(
            this as unknown as Parameters<typeof runSpellMatrixAudit>[0],
            step,
          );
          console.info(summarizeMatrix(rows));
          return rows;
        };
    }
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
    ensureParticleTextures(this);
    this.audio = new GameAudio(this);
    // BGM을 켜기 전에 설정을 반영해야 첫 재생부터 저장된 볼륨으로 나온다
    this.audio.applySettings(this.settings);
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
    // 밝기 막은 createHud(→createPauseMenu)에서 만들어지므로 그 뒤에 적용한다
    this.applyBrightness();
    this.setupRunFlow();
    // 씬 재진입(런 종료→타이틀→새 런) 대비: 매니저·컨트롤러는 필드라 create마다
    // 리셋해야 이전 런의 친화·각인·정령·HP·루프가 남지 않는다 (총괄 제보 버그).
    this.resetForNewRun();
    // 시연 로드아웃 — 타이틀의 "각성한 영창가로 시작"으로 들어온 경우에만.
    // resetForNewRun 뒤에 심어야 리셋에 지워지지 않는다.
    const demo = consumeDemoRunRequest();
    if (demo) this.seedDemoRun();
    this.prepareRunEscalation();
    const initialRunState = this.combatRunController.state;
    this.logRunStarted('new', initialRunState);
    this.logRoomStarted(initialRunState);
    this.startRoom(initialRunState.roomIndex);
    this.updateStatusText();

    this.setupIncantBar();
    this.input.keyboard!.on('keydown-ENTER', () => {
      // 일시정지 중엔 Enter가 메뉴 선택 — 영창 열기보다 우선한다
      if (this.buildInspectOpen) { this.activatePauseMenuItem(); return; }
      if (!this.incanting && !this.casting) this.tryOpenIncant();
    });
    this.input.keyboard!.on('keydown-UP', () => {
      if (this.buildInspectOpen) this.movePauseMenu(-1);
    });
    this.input.keyboard!.on('keydown-DOWN', () => {
      if (this.buildInspectOpen) this.movePauseMenu(+1);
    });
    /**
     * 일시정지·빌드 검사 = **ESC** (총괄 지시: "화면 멈추는 거 tab 대신 esc키로 바꿔").
     *
     * 이 화면은 빌드 칩 검사이자 일시정지 메뉴(재개·설정·나가기)라 ESC가 관례에 맞다.
     * TAB은 더 이상 열지 않는다.
     *
     * ⚠️ TAB 캡처는 **남긴다.** 토글을 뗐다고 캡처까지 풀면 브라우저 기본 포커스
     * 이동이 살아나 포커스가 영창 입력창이나 브라우저 UI로 튀고, 그 뒤 키 입력이
     * 통째로 엉킨다. 아무 동작도 안 하는 게 포커스가 튀는 것보다 낫다.
     */
    this.input.keyboard!.addCapture('TAB');
    this.input.keyboard!.on('keydown-TAB', (event: KeyboardEvent) => {
      event.preventDefault();
    });
    this.input.keyboard!.on('keydown-ESC', () => {
      // ⚠️ DOM 설정 오버레이가 열려 있으면 건드리지 않는다. 그쪽도 Escape로 닫히는데
      // Phaser 키보드는 window에서 듣기 때문에 **둘 다 발화한다** — 설정이 닫히면서
      // 일시정지까지 같이 풀려 한 번에 두 겹이 사라진다. 설정만 닫고 메뉴에 남아야 한다.
      if (this.settingsOverlayOpen) return;
      this.toggleBuildInspect();
    });

    // 시연 런은 유산 선택을 건너뛴다 — 이미 후반 상태라 카드가 겹치고,
    // 심사위원을 시작하자마자 선택 UI로 막는 게 이 모드의 취지에 어긋난다.
    if (!this.demoRun) void this.offerLegacyEngrave();
  }

  /**
   * 시연 상태 주입 — 각인 2종(Lv3 진화)·정령 2체 Lv2·친화 2원소, 보스 직전 엘리트부터.
   * 실제 보상 경로(applyReward)를 그대로 쓴다 — 별도 주입로면 도달 불가능한 상태를
   * 보여주게 되고, 그건 심사위원에게 거짓말이다.
   */
  private seedDemoRun(): void {
    this.demoRun = true;
    // 방 지정 리셋을 **먼저** 한다 — reset()이 elementalAffinity를 비우므로
    // 친화를 심은 뒤에 부르면 그대로 지워진다.
    this.resetMapGraph(MAP_GRAPH_PRESET_01.lastBeforeBossNodeId, DEMO_START_ROOM);
    this.combatRunController.reset(Date.now(), false, DEMO_START_ROOM);
    applyDemoLoadout(this.engraveManager, this.spiritManager, this.combatRunController);
    this.syncSpiritViews();
    this.announceSystemMessage(
      `각성한 영창가 — ${DEMO_START_ROOM}번 방부터`,
      '#ffd166',
      3200,
    );
    // 온보딩 힌트는 1번 방에서만 뜬다(startRoom). 시연은 후반 방에서 시작하므로
    // 여기서 따로 알려줘야 한다 — **강해진 상태로 떨어뜨려도 뭘 칠지 모르면
    // 아무 일도 안 일어난다.** 이 게임의 훅은 성장이 아니라 자유 영창이다.
    // 같은 내용을 영창 창 안에도 세운다 — 배너는 캔버스라 영창 창의 어둠·블러에 묻힌다.
    // "ENTER를 눌러 이렇게 쳐라"는 안내가 정작 누르면 안 읽히는 걸 막는다(총괄 지적).
    this.incantGuide = {
      title: '이렇게 쳐보세요',
      lines: DEMO_SAMPLE_INCANTATIONS.map((sample) => `· ${sample}`),
    };
    this.time.delayedCall(1600, () => {
      if (!this.scene?.isActive?.()) return;
      this.announceBanner({
        title: 'ENTER — 문장을 쳐서 마법을 만든다',
        lines: DEMO_SAMPLE_INCANTATIONS.map((sample) => `· ${sample}`),
        color: 0xc7f9e0,
        holdMs: 6000,
      });
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
      this.updateRoomCurse(delta / 1000, d);
      this.updatePlayerAura(d);
      this.updateEnemyControls(d);
      this.updateEnemies(d);
      this.pushEnemiesOutOfTerrain();
      this.updatePersistentForms(d);
      this.updateEnemyProjectiles(d);
      this.updateHazards(d);
      this.updateFloorHazards(d);
      this.updateBasicAttack();
      this.updateEngravedSpells(d);
      this.updateMirrorCast(d);
      this.updateBossArcana(d);
      // #214 프리뷰 전용 (DEV 훅이 만든 경우만 — 본 게임에선 항상 null)
      this.devPortalField?.update(this.player.x, this.player.y);
      this.devMinimap?.pulse();
      this.updateSpirits(d);
      this.updateSummon(d);
      this.updateFriendlyMissiles(d);
      this.updateManaCrystals(d);
      this.updateManaPotion(d);
      this.updateWaveFlow(d);
    } else if (this.roomFixture) {
      // 설치물 단계에서는 **이동만** 허용한다 — 전투는 멈춘 채 직접 다가간다.
      // 이게 없으면 무전투 방에서 조작이 잠겨 설치물을 열 수 없다(런이 갇힌다).
      const d = (delta / 1000) * this.timeScale;
      this.updatePlayerMovement(delta / 1000);
      // ⚠️ **따라다니는 것들은 여기서도 갱신해야 한다** (총괄 제보: "보상 선택시 정령이
      // 갑자기 거기에 멈추는 버그").
      //
      // 플레이어만 움직이고 updateSpirits가 멈추면 정령이 마지막 궤도 좌표에 박힌다.
      // 설치물에 다가가는 짧은 구간에도 동행 개체는 계속 플레이어를 따라야 한다.
      //
      // 전투 없이 따라다니기만 하는 것들만 고른다 — 적·투사체·웨이브는 멈춘 채로 둔다.
      this.updateSpirits(d);
      this.updateSummon(d);
      this.updateFriendlyMissiles(d);
      // 마나 결정·물약도 걸어가면서 줍는 게 자연스럽다 (전투가 아니라 수거다)
      this.updateManaCrystals(d);
      this.updateManaPotion(d);
    }
    // 성장 표식은 전투 정지 중(보상 선택·전환)에도 플레이어를 따라간다
    this.growthMarks.follow(this.player.x, this.player.y);
    // 설치물도 게이트 밖에서 — 보상 카드가 뜬 뒤에도 좌표 갱신이 멈추면 안 된다
    this.roomFixture?.update(this.player.x, this.player.y);
    // 숨겨져 있으면 다시 그리지 않는다 — 펄스는 보일 때만 의미가 있다
    if (this.shouldShowMinimap()) this.runMinimap?.pulse();
    this.updateStatusText();
    this.updateSequenceProgress();
  }

  private isCombatActive(): boolean {
    // 유산 선택 중에는 전투를 멈춘다 — 카드가 키를 캡처하는 동안 적에게 맞으면 안 된다
    if (this.legacySelecting) return false;
    // Tab 빌드 검사 중에도 멈춘다 — 상세를 읽는 동안 맞으면 안 된다 (같은 근거)
    if (this.buildInspectOpen) return false;
    return this.combatRunController.state.phase === 'combat';
  }

  private setupRunFlow(): void {
    // 컨트롤러는 씬 필드로 1회 생성·영속 — 씬 재진입마다 on()을 다시 걸면 핸들러가
    // 겹으로 쌓여 알림·연출이 2회씩 나간다 (#216 P0). 핸들러는 this만 캡처하므로
    // 한 번만 걸면 씬이 재시작돼도 계속 유효하다.
    if (this.runFlowBound) return;
    this.runFlowBound = true;
    this.combatRunController.on('room-cleared', (options, state) => {
      this.audio.playSfx('room-clear');
      // 포탈/보상 선택 구간은 안전 상태여야 한다. 다음 방 시작까지 함정 판정과
      // 저주 연출을 남겨 두면 출구 접근을 방해하거나 전투 종료 뒤에도 피해처럼 보인다.
      this.clearRoomGimmicks();
      this.deferTransientCombatCleanup();
      this.stopCastingForRunPause();
      this.announceSystemMessage(`방 ${state.roomIndex} 클리어`, '#72f1b8');
      devInfo('[Run] reward-ready', options, state);
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
      // ── 제단 거래 (#214) — 대가를 먼저 치르고 보상을 건다 ──────────────
      if (chosen.altar) {
        this.applyAltarDeal(chosen);
        if (chosen.kind === 'all-affinity') {
          const raised: Partial<Record<SpellElement, number>> = {};
          for (const element of ELEMENTS) {
            raised[element] = (state.elementalAffinity[element] ?? 0)
              + ALTAR_OFFER_CONFIG.allAffinityBonus;
          }
          this.combatRunController.seedAffinity(raised);
          this.announceSystemMessage('모든 원소가 함께 깊어졌다', '#8fe3c8', 2600);
          return;
        }
        if (chosen.kind === 'echo') {
          this.echoUnlocked = true;
          this.announceBanner({
            title: '영창 에코 — 말이 두 번 울린다',
            lines: ['수동 단일 영창이 한 번 더 · 시퀀스는 울리지 않는다'],
            color: 0xd0a8ff,
            holdMs: 3000,
          });
          return;
        }
        if (chosen.kind === 'awaken' && chosen.element) {
          // 제단 각성은 갈래를 고르지 않는다 — 대가를 이미 치렀으므로 바로 부여한다
          const kind = AWAKENING_KINDS[
            Math.floor(this.engraveRewardRand() * AWAKENING_KINDS.length) % AWAKENING_KINDS.length
          ];
          this.awakenings = applyAwakening(this.awakenings, chosen.element, kind);
          this.announceBanner({
            title: `${ELEMENT_LABELS[chosen.element]} 각성 — ${AWAKENING_LABELS[kind]}`,
            lines: [awakeningDescription(kind, chosen.element)],
            color: 0xd0a8ff,
            holdMs: 3000,
          });
          return;
        }
        return; // 거절·잠김
      }
      if (chosen.kind === 'awaken' && chosen.awaken) {
        const { element, awakening } = chosen.awaken;
        this.awakenings = applyAwakening(this.awakenings, element, awakening);
        this.announceBanner({
          title: `${ELEMENT_LABELS[element]} 각성 — ${AWAKENING_LABELS[awakening]}`,
          lines: [awakeningDescription(awakening, element)],
          color: 0xd0a8ff,
          holdMs: 3000,
        });
        devInfo('[Run] awakened', chosen.awaken, state);
        return;
      }
      if (chosen.kind === 'evolve' && chosen.evolve) {
        // 진화·융합은 LLM 작명이 필요해 비동기 — 작명은 반드시 성공하므로(폴백) 미완료 상태가 없다
        void this.applyEvolution(chosen.evolve);
        devInfo('[Run] reward-applied', chosen, state);
        return;
      }
      if (chosen.kind === 'spirit-haste') {
        const rate = this.spiritManager.applyHaste(
          RUN_REWARD_CONFIG.spiritHasteScale,
          RUN_REWARD_CONFIG.spiritHasteFloorMultiplier,
        );
        this.announceSystemMessage(
          `신속 정령 · 시전 ${(1 / rate).toFixed(2)}배 속도`,
          '#ffd166',
        );
        devInfo('[Run] reward-applied', chosen, state);
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
      devInfo('[Run] reward-applied', chosen, state);
    });
    this.combatRunController.on('room-transition', (state, durationMs) => {
      devInfo('[Run] room-transition', { state, durationMs });
    });
    this.combatRunController.on('room-started', (state) => {
      if (this.pendingRunStartReason) {
        this.logRunStarted(this.pendingRunStartReason, state);
        this.pendingRunStartReason = null;
      }
      this.logRoomStarted(state);
      this.startRoom(state.roomIndex);
      devInfo('[Run] room-started', state);
      this.reportAutoShare(`방 ${state.roomIndex} 진입 누적`);
    });
    this.combatRunController.on('run-completed', (state) => {
      this.deferTransientCombatCleanup();
      this.stopCastingForRunPause();
      devInfo('[Run] completed', state);
      // 플레이어 사망이 먼저 확정된 동시 확정 레이스(사망 후 장판 틱이 보스 처치 등)
      // — 패배가 선점: 기억 저장·승리 연출 모두 생략해 한 런에 lose/win 이중 기록을 막는다
      if (this.deathHandled) return;
      if (import.meta.env.DEV) {
        void postPlayLog({
          type: 'run_completed',
          loopIndex: state.loopIndex,
        });
      }
      this.announceSystemMessage('런 완료', '#72f1b8');
      this.reportAutoShare('런 완주');
      if (import.meta.env.DEV) {
        const share = this.autoShareSnapshot();
        this.announceSystemMessage(`[DEV] 오토 비중 ${share.autoSharePercent}%`, '#8fa4ff', 3200);
      }
      // 보스 처치 = 유산 은행 저장. 이어가다 죽어도 이건 남는다 (총괄 리스크 구조).
      this.persistRunMemory('win');
      // 보스 후 선택: 마칠까(시작 화면) vs 이어갈까(빌드 유지·난이도↑)
      this.time.delayedCall(1400, () => {
        const completedLoops = this.combatRunController.state.loopIndex + 1;
        const nextDamagePct = Math.round(loopDamageScale(completedLoops) * 100);
        void showBossChoice(completedLoops, nextDamagePct).then((choice) => {
          if (choice === 'continue') {
            this.continueToNextLoop();
          } else {
            void showRunSummaryOverlay(this.buildRunSummary('victory'))
              .then(() => { this.destroyRunMapUi(); this.scene.start('title'); });
          }
        });
      });
    });
  }

  /** 적이 주는 피해 — 이어가기 루프 난이도(loopDamageScale)를 반영해 감쇠 전 원본에 곱한다 */
  private damagePlayer(amount: number): { hpDamage: number; shieldDamage: number } {
    const scale = loopDamageScale(this.combatRunController.state.loopIndex);
    return this.playerState.takeDamage(amount * scale);
  }

  /** 사망은 1회만 처리 — 요약 오버레이 → Enter로 새 런 (GDD §2 사망 흐름) */
  private checkPlayerDeath(): void {
    if (this.playerState.alive || this.deathHandled) return;
    // 보스가 먼저 죽어 런이 완주된 뒤의 사망(지연 판정 등)은 승리가 선점 — 패배 처리 안 함
    if (this.combatRunController.state.phase === 'run-over') return;
    this.deathHandled = true;
    this.reportAutoShare('사망');
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
    const book = loadGrimoire();
    this.grimoireCount = book.length; // 런 시작마다 1회 — HUD 캐시 갱신
    const offers = offerEntries(book);
    if (offers.length === 0) return;

    this.legacySelecting = true;
    try {
      const options: RewardOption[] = offers.map((entry) => {
        // 격상(#77)으로 약화된 **폼**은 카드에 명시한다 —
        // 모르고 고르면 "물려받았는데 약하다"가 되고, 알고 고르면 전략적 선택이 된다.
        const weakened = this.runEscalation.weakenedForms.includes(entry.form);
        const weakenPercent = Math.round((1 - this.runEscalation.weakenMultiplier) * 100);
        return {
          id: `legacy-${entry.normalized}`,
          kind: 'engrave' as const,
          title: `유산 · ${entry.name}`,
          description: `${ELEMENT_LABELS[entry.element]} ${FORM_LABELS[entry.form]} · 위력 ${Math.round(entry.power)}`
            + ` — 지난 런의 주문, Lv1 각인으로 시작`
            + (weakened ? `\n⚠ ${FORM_LABELS[entry.form]} 약화 −${weakenPercent}%` : ''),
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
      if (this.activeRoomCurse && !this.activeCurseBanner?.active) {
        this.scheduleRoomCurseBanner(this.activeRoomCurse);
      }
    }
  }

  private persistRunMemory(result: 'win' | 'lose'): void {
    saveRunMemory(updateRunMemory(
      loadRunMemory(),
      summarizeRun(this.spellHistory, result, this.runMovementDistance),
    ));
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
  /**
   * 씬 shutdown에서 런 중 생성물의 **참조만** 끊는다.
   * destroy를 부르지 않는 이유: 이 시점엔 Phaser가 이미 GameObject를 파괴해
   * view.scene이 사라진 상태라, 만지면 그게 곧 재시작 크래시가 된다.
   */
  private dropStaleRunObjects(): void {
    this.enemies = [];
    this.friendlyMissiles = [];
    this.hazardZones = [];
    this.activeSummons = [];
    this.hazardDecorations = [];
    this.activeWall = null;
    this.activeOrbit = null;
  }
  /** 오토 비중 스냅샷 — 콘솔 리포트·재측정(window.__autoShare)용 */
  private autoShareSnapshot(): Record<DamageSource, number> & { autoSharePercent: number } {
    const { manual, auto, basic, status } = this.damageLedger;
    const total = manual + auto + basic + status;
    return {
      manual: Math.round(manual),
      auto: Math.round(auto),
      basic: Math.round(basic),
      status: Math.round(status),
      autoSharePercent: total > 0 ? Math.round((auto / total) * 1000) / 10 : 0,
    };
  }

  private reportAutoShare(tag: string): void {
    const s = this.autoShareSnapshot();
    devInfo(
      `[auto-share] ${tag} — 오토 ${s.autoSharePercent}% `
      + `(수동 ${s.manual} · 오토 ${s.auto} · 기본탄 ${s.basic} · 상태이상 ${s.status})`,
    );
  }

  /**
   * 보스 후 이어가기 — 빌드는 유지하고 전투만 새로. restartRun과 달리 playerState·각인·
   * 정령·융합 게이지·주문 히스토리·성장 표식·친화를 **비우지 않는다**. 컨트롤러는
   * continueRun으로 친화·보상을 지킨 채 방만 새로 뽑고 루프를 올린다 (난이도↑).
   */
  private continueToNextLoop(): void {
    this.deathHandled = false;
    // 전투 전용 상태만 초기화 (다음 보스가 내성 재계산, 장판·쿨다운은 방 단위)
    this.damageLedger = { manual: 0, auto: 0, basic: 0, status: 0 };
    this.bossResistance = { ...NO_BOSS_RESISTANCE };
    this.activeBossResistances.clear();
    this.enemyAilments.clear();
    this.clearBurnEmbers();
    this.clearDamageNumbers();
    this.shockCooldowns.clear();
    // 이어가기는 친화를 유지하므로 각성도 유지한다 — 비우면 같은 원소를
    // 매 루프 재각성하는 무한 파밍이 된다 (친화가 이미 임계 위이므로).
    this.lastResistNoticeAt = 0;
    this.runMovementDistance = 0;
    // 새 루프 = 새 맵. 그래프는 cleared/current가 인스턴스에 쌓이므로 재사용하면
    // 지난 루프의 방들이 계속 '클리어됨'으로 남는다 (#241 리뷰 지적).
    this.resetMapGraph();
    this.pendingRunStartReason = 'continue';
    this.combatRunController.continueRun();
    const loop = this.combatRunController.state.loopIndex;
    this.announceSystemMessage(
      `${loop}순환 진입 — 적 피해 ×${loopDamageScale(loop).toFixed(1)}`,
      '#e2b7ff',
      3200,
    );
  }

  /**
   * 새 런 진입 시 지속 매니저를 깨끗이 (create가 씬 재진입마다 호출). 컨트롤러는 silent
   * 리셋 — create가 곧 startRoom을 직접 부르므로 room-started 이중 발화를 막는다.
   * restartRun(런 중 재시작)과 달리 offerLegacy/prepareEscalation은 create가 따로 한다.
   */
  private resetForNewRun(): void {
    this.deathHandled = false;
    this.pendingRunStartReason = null;
    this.fusionGauge.reset();
    this.damageLedger = { manual: 0, auto: 0, basic: 0, status: 0 };
    this.bossResistance = { ...NO_BOSS_RESISTANCE };
    this.activeBossResistances.clear();
    this.enemyAilments.clear();
    this.clearBurnEmbers();
    this.clearDamageNumbers();
    this.shockCooldowns.clear();
    this.awakenings = {};
    this.echoUnlocked = false;
    this.lastResistNoticeAt = 0;
    this.spellHistory.reset();
    this.engraveManager.reset();
    this.spiritManager.reset();
    this.clearSpiritViews();
    this.playerState.reset();
    this.runMovementDistance = 0;
    this.resetMapGraph();
    this.combatRunController.reset(Date.now(), false);
  }

  private restartRun(): void {
    this.deathHandled = false;
    this.fusionGauge.reset();
    this.damageLedger = { manual: 0, auto: 0, basic: 0, status: 0 };
    this.bossResistance = { ...NO_BOSS_RESISTANCE };
    this.activeBossResistances.clear();
    this.enemyAilments.clear();
    this.clearBurnEmbers();
    this.clearDamageNumbers();
    this.shockCooldowns.clear();
    this.awakenings = {};
    this.echoUnlocked = false;
    this.lastResistNoticeAt = 0;
    this.spellHistory.reset();
    this.engraveManager.reset();
    this.spiritManager.reset();
    this.clearSpiritViews();
    this.growthMarks.reset();
    this.spiritOrbitAngle = -Math.PI / 2;
    this.engraveRewardRand = createRunRandom(Date.now());
    this.playerState.reset();
    this.runMovementDistance = 0;
    this.resetMapGraph();
    this.prepareRunEscalation();
    this.pendingRunStartReason = 'death-restart';
    this.combatRunController.reset();
    // 새 런에도 유산 선택 — 직전 런에서 기록된 주문이 곧바로 후보가 된다
    void this.offerLegacyEngrave();
  }

  private logRunStarted(
    reason: 'new' | 'continue' | 'death-restart',
    state: Readonly<RunStateSnapshot>,
  ): void {
    if (!import.meta.env.DEV) return;
    void postPlayLog({
      type: 'run_started',
      reason,
      loopIndex: state.loopIndex,
    });
  }

  private logRoomStarted(state: Readonly<RunStateSnapshot>): void {
    if (!import.meta.env.DEV) return;
    void postPlayLog({
      type: 'room_started',
      roomIndex: state.roomIndex,
      encounterId: state.encounterId,
      loopIndex: state.loopIndex,
    });
  }

  /** 런 시작 시 한 번만 격상과 저주방 계획을 확정한다. */
  private prepareRunEscalation(): void {
    const memory = loadRunMemory();
    this.runEscalation = runEscalationProfile(memory);
    this.escalationNoticed.clear();
    // 승패 누계 기반 시드: 같은 런 기억에서는 같은 방을 뽑아 재현 가능하고,
    // 런이 끝나 기억이 갱신되면 다음 계획이 달라진다.
    const curseSeed = Math.imul(memory.clears + 1, 0x9e3779b1)
      ^ Math.imul(memory.deaths + 1, 0x85ebca6b);
    this.roomCursePlan = createRoomCursePlan(
      RUN_ENCOUNTERS,
      this.runEscalation.gimmicksUnlocked,
      createRunRandom(curseSeed),
      undefined,
      memory.lastCurseBehavior,
    );
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
    this.applyRoomTerrain();
    this.basicAttackCooldownRemaining = 0;
    // 방 선택 즉시 전환하므로 물리 포탈의 좌측 도착점은 더 이상 없다.
    // 모든 방을 중앙에서 시작해 선택 직후 전투까지의 이동 공백을 없앤다.
    this.player.setPosition(this.worldBounds.centerX, this.worldBounds.centerY);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.activateRoomCurse(roomIndex);
    if (this.isBossEncounter()) {
      this.startBossRoom(encounter.encounterKind === 'memory-boss');
      return;
    }
    // 보물·제단은 **전투가 없는 방**이다 (총괄 제보: "보상 포탈로 들어갔는데 보상은
    // 안 주고 몹만 나왔다"). 웨이브를 뿌리지 않고 바로 클리어 처리해 보상표를 띄운다.
    const roomless = this.rewardlessNodeKind();
    if (roomless) {
      this.startRewardlessRoom(roomless);
      return;
    }
    // ⚠️ 없는 웨이브셋에 **예외를 던지지 않는다** (총괄 제보로 드러난 사고):
    // 프리셋이 'room-c'(WAVE_SETS에 없음)를 가리켜 여기서 throw했고, 이미 방을 비운
    // 뒤였으므로 몹도 포탈도 없는 빈 방이 되어 런이 진행 불가가 됐다. 데이터 오타 하나가
    // 플레이를 벽돌로 만들면 안 된다 — 대체 웨이브로 계속 가고 DEV에서 크게 알린다.
    // (오타 자체는 map-graph-regression이 프리셋 전 노드를 검사해 막는다.)
    const requestedWaveSet = encounter.waveSetId;
    let waveSet = requestedWaveSet ? WAVE_SETS[requestedWaveSet] : undefined;
    if (!waveSet) {
      waveSet = WAVE_SETS['room-a'];
      devInfo('[Room] 알 수 없는 웨이브셋 — room-a로 대체', { requested: requestedWaveSet });
      if (import.meta.env.DEV) {
        this.announceSystemMessage(
          `[DEV] 웨이브셋 '${requestedWaveSet ?? '(없음)'}' 없음 — room-a로 대체`,
          '#ff8fa3',
          4000,
        );
      }
    }
    this.waveManager = new WaveManager(waveSet);
    this.audio.playBgm('combat');
    this.spawnWave(this.waveManager.start());
    if (this.activeTrapProfile?.kind === 'hazard') {
      this.spawnHazards(this.activeTrapProfile.safeCorridor);
      this.announceSystemMessage('함정: 위험지대', '#db73ff');
    }
    this.announceSystemMessage(`방 ${roomIndex}`, '#8fa4ff');
    // 첫 방 진입 시, 아직 한 번도 영창해본 적 없는 플레이어에게 조작을 안내한다.
    if (roomIndex === 1) this.maybeShowOnboardingHint();
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
    // 미러 캐스트는 보스전마다 1회 — 새 보스전이 시작되면 다시 쓸 수 있다.
    this.mirrorCastUsed = false;
    this.clearPendingMirrorCast();
    this.clearBossArcana();
    this.bossArcanaIndex = 0;
    this.masteryPierceAnnounced = false;
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

    // 플레이어가 방 중앙에서 시작하므로 보스는 기존에 검증됐던 340px 위에서 시작한다.
    // 둘 다 중앙에 겹쳐 즉시 접촉 피해가 발생하지 않게 절대 좌표로 유지한다.
    const boss = new BossEnemy(
      this,
      this.worldBounds.centerX,
      this.worldBounds.centerY - BOSS_INITIAL_OFFSET_Y,
      usesMemory ? 'memory' : 'stage',
      // 보스는 절반 배율 — 내성 누적(#77)과 이중 강화가 되지 않게
      enemyHpScale(this.combatRunController.state.loopIndex, true),
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

    this.announceBanner({ title: '보스의 방', color: 0xff6b86, holdMs: 2000 });
    // 오프닝 대사 — Mock은 원격 호출 없이 템플릿, 라이브는 사용자 지정 프록시를 우선한다.
    if (usesMemory) {
      const mockForced = import.meta.env.VITE_JUDGE_MOCK === '1';
      const proxyUrl = import.meta.env.VITE_JUDGE_PROXY_URL?.trim() || undefined;
      const startedAt = import.meta.env.DEV ? Date.now() : 0;
      void resolveBossLine(runMemory, { mockForced, proxyUrl }).then((line) => {
        if (import.meta.env.DEV) {
          void postPlayLog({
            type: 'boss_line',
            source: line.source,
            elapsedMs: Date.now() - startedAt,
            remoteAttempted: !mockForced,
          });
        }
        if (!isCurrentBossRoom()) return;
        this.time.delayedCall(500, () => {
          if (!isCurrentBossRoom()) return;
          this.announceSystemMessage(`"${line.text}"`, '#d0a8ff', 2800);
        });
      });
    }
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
    this.clearRoomGimmicks();
    this.clearManaCrystals();
    this.clearManaPotion();
    this.clearTransientCombatObjects();
  }

  /** 전투 종료 즉시 포탈 접근을 방해할 수 있는 모든 룸 기믹을 제거한다. */
  private clearRoomGimmicks(): void {
    this.clearHazardZones();
    for (const decoration of this.hazardDecorations) decoration.destroy();
    this.hazardDecorations = [];
    this.clearRoomCurse();
  }

  private activateRoomCurse(roomIndex: number): void {
    if (roomIndex === 1 && this.debugTrapProfile) {
      if (this.debugTrapProfile.kind === 'hazard') {
        this.activeRoomCurse = null;
        this.activeTrapProfile = this.debugTrapProfile;
        return;
      }
      const kind = this.debugTrapProfile.kind;
      this.activateRoomCurseAssignment({
        roomIndex,
        stage: this.combatRunController.state.stage,
        kind,
      }, this.debugTrapProfile);
      return;
    }
    const graphProfile = this.mapGraph.current().trapProfile;
    if (graphProfile) {
      if (graphProfile.kind === 'hazard') {
        this.activeRoomCurse = null;
        this.activeTrapProfile = graphProfile;
        return;
      }
      this.activateRoomCurseAssignment({
        roomIndex,
        stage: this.combatRunController.state.stage,
        kind: graphProfile.kind,
      }, graphProfile);
      return;
    }
    const assignment = curseForRoom(this.roomCursePlan, roomIndex);
    this.activateRoomCurseAssignment(assignment);
  }

  private activateRoomCurseAssignment(
    assignment: RoomCurseAssignment | null,
    profile = assignment ? trapProfileFromLegacyCurse(assignment.kind) : null,
  ): void {
    this.activeRoomCurse = assignment;
    this.activeTrapProfile = profile;
    if (!assignment) return;

    if (assignment.kind === 'silence') {
      this.silenceCurseField = new SilenceCurseField(
        this,
        this.worldBounds.centerX,
        this.worldBounds.centerY,
        this.worldBounds,
        profile?.safeCorridor,
      );
    } else if (assignment.kind === 'blackout') {
      this.blackoutCurseField = new BlackoutCurseField(
        this,
        this.worldBounds,
        this.player.x,
        this.player.y,
      );
    } else if (assignment.kind === 'heatwave') {
      this.heatwaveCurseField = new HeatwaveCurseField(this);
      this.heatwaveGraceRemaining = HEATWAVE_CURSE_CONFIG.entryGraceSeconds;
      this.heatwaveImmunityRemaining = 0;
      this.heatwaveDamageNotice = 0;
      this.heatwaveDamageNoticeElapsed = 0;
    }
    this.scheduleRoomCurseBanner(assignment);
  }

  /** 유산 선택 UI가 먼저 뜬 경우, 선택이 끝난 뒤 저주 규칙을 반드시 한 번 안내한다. */
  private scheduleRoomCurseBanner(assignment: RoomCurseAssignment): void {
    this.time.delayedCall(250, () => {
      if (this.activeRoomCurse !== assignment) return;
      if (this.legacySelecting) return;
      if (!this.isCombatActive()) return;
      if (assignment.kind === 'silence') {
        const drainPercent = Math.round(
          ROOM_CURSE_CONFIG.silenceManaDrainRatio * 100,
        );
        this.activeCurseBanner = showRoomCurseBanner(this, {
          title: '저주: 침묵',
          subtitle: '공허가 전장을 잠식했습니다',
          rule: `중앙 결계 밖: 영창 불가 · 최대 마나 ${drainPercent}%/초 감소`,
          color: 0xdb73ff,
        });
      } else if (assignment.kind === 'blackout') {
        this.activeCurseBanner = showRoomCurseBanner(this, {
          title: '저주: 암전',
          subtitle: '어둠이 시야를 삼킵니다',
          rule: '빛/불꽃 기술을 쓰면 밝아집니다',
          color: 0x8d7dff,
        });
      } else if (assignment.kind === 'word-limit') {
        this.activeCurseBanner = showRoomCurseBanner(this, {
          title: '저주: 금언',
          subtitle: '공허는 긴 주문을 허락하지 않습니다',
          rule: `언령 예산 ${WORD_LIMIT_CURSE_CONFIG.budget} · 짧은 말로 마법을 완성하십시오`,
          color: 0xc084fc,
        });
      } else if (assignment.kind === 'heatwave') {
        this.activeCurseBanner = showRoomCurseBanner(this, {
          title: '저주: 폭염',
          subtitle: '타오르는 열기가 생명력을 앗아갑니다',
          rule: '물·얼음·바람 영창으로 몸을 식히세요',
          color: 0xffa04d,
        });
      }
    });
  }

  private updateRoomCurse(realDeltaSeconds: number, combatDeltaSeconds: number): void {
    const field = this.silenceCurseField;
    field?.update(realDeltaSeconds, this.player.x, this.player.y);
    this.blackoutCurseField?.update(combatDeltaSeconds, this.player.x, this.player.y);
    const heatwave = this.heatwaveCurseField;
    if (heatwave && this.activeRoomCurse?.kind === 'heatwave') {
      const timerStep = advanceHeatwaveTimers({
        graceRemaining: this.heatwaveGraceRemaining,
        immunityRemaining: this.heatwaveImmunityRemaining,
      }, combatDeltaSeconds);
      this.heatwaveGraceRemaining = timerStep.graceRemaining;
      this.heatwaveImmunityRemaining = timerStep.immunityRemaining;
      heatwave.update(
        combatDeltaSeconds,
        this.player.x,
        this.player.y,
        this.heatwaveImmunityRemaining,
      );
      if (timerStep.damagingSeconds > 0) {
        const hpDamage = this.playerState.takeEnvironmentalDamage(
          heatwaveDamagePerSecond(this.playerState.maxHp) * timerStep.damagingSeconds,
        );
        this.heatwaveDamageNotice += hpDamage;
        this.heatwaveDamageNoticeElapsed += combatDeltaSeconds;
        if (this.heatwaveDamageNoticeElapsed >= HEATWAVE_CURSE_CONFIG.damageNoticeIntervalSeconds) {
          if (this.heatwaveDamageNotice > 0) this.playHeatwaveDamageReact();
          this.heatwaveDamageNotice = 0;
          this.heatwaveDamageNoticeElapsed = 0;
        }
      } else {
        this.heatwaveDamageNotice = 0;
        this.heatwaveDamageNoticeElapsed = 0;
      }
    }
    if (
      field
      && this.activeRoomCurse?.kind === 'silence'
      && !field.contains(this.player.x, this.player.y)
    ) {
      this.playerState.drainMana(
        silenceManaDrainPerSecond(this.playerState.maxMana)
          * realDeltaSeconds,
      );
    }
  }

  /** 누적된 폭염 피해를 플레이어 본체의 짧은 열손상 반응으로 전달한다. */
  private playHeatwaveDamageReact(): void {
    if (!this.player?.active) return;

    // 환경 피해는 버프처럼 밖으로 퍼뜨리지 않고, 본체가 짧게 눌리고 달아오르는 반응으로만 보인다.
    this.tweens.killTweensOf(this.heatDamageAura);
    this.heatDamageAura.setScale(0.78).setAlpha(0);
    this.tweens.add({
      targets: this.heatDamageAura,
      scale: { from: 0.78, to: 1.02 },
      alpha: { from: 0, to: 0.58 },
      duration: 95,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (!this.heatDamageAura?.active) return;
        this.tweens.add({
          targets: this.heatDamageAura,
          alpha: { from: 0.58, to: 0 },
          duration: 330,
          ease: 'Sine.easeOut',
        });
      },
    });
    this.tweens.add({
      targets: this.player,
      scaleX: { from: 1.025, to: 1 },
      scaleY: { from: 0.955, to: 1 },
      duration: 220,
      ease: 'Sine.easeOut',
    });
  }

  private tryApplyHeatwaveCooling(elements: readonly (SpellElement | null | undefined)[]): boolean {
    if (
      this.activeRoomCurse?.kind !== 'heatwave'
      || !this.heatwaveCurseField
    ) return false;
    const coolingElement = elements.find(isHeatwaveCoolingElement);
    if (!coolingElement) return false;

    const healed = this.playerState.heal(heatwaveCoolingHeal(this.playerState.maxHp));
    this.heatwaveImmunityRemaining = HEATWAVE_CURSE_CONFIG.coolingImmunitySeconds;
    this.heatwaveCurseField.showCooling(this.player.x, this.player.y, coolingElement);
    const healLabel = healed > 0 ? `HP +${Math.round(healed)} · ` : '';
    this.announceSystemMessage(
      `냉각 ${healLabel}${HEATWAVE_CURSE_CONFIG.coolingImmunitySeconds}초`,
      '#8be8ff',
      1400,
    );
    return true;
  }

  /** 환경 피해는 중앙 알림 대신 플레이어 위의 작은 열기 피해 수치로 보여 준다. */
  private clearRoomCurse(): void {
    if (this.activeCurseBanner?.active) this.activeCurseBanner.destroy(true);
    this.activeCurseBanner = null;
    this.silenceCurseField?.destroy();
    this.silenceCurseField = null;
    this.blackoutCurseField?.destroy();
    this.blackoutCurseField = null;
    this.heatwaveCurseField?.destroy();
    this.heatwaveCurseField = null;
    this.heatwaveGraceRemaining = 0;
    this.heatwaveImmunityRemaining = 0;
    this.heatwaveDamageNotice = 0;
    this.heatwaveDamageNoticeElapsed = 0;
    this.clearWordLimitIncantStyle();
    this.activeRoomCurse = null;
    this.activeTrapProfile = null;
  }

  private clearTransientCombatObjects(): void {
    this.clearEnemyProjectiles();
    this.clearFriendlyMissiles();
    this.clearSummon();
    this.clearActiveWall();
    this.clearActiveOrbit();
    this.clearUnstableWarnings();
    this.clearPendingMirrorCast();
    this.clearBossArcana();
    this.clearTerrainBarriers();
    this.clearFloorHazards();
    this.clearRoomFixture();
  }

  /** 예고 중인 미러 캐스트 취소 — 방 전환·사망 후 마커가 남거나 유령 발사되는 것 방지 */
  private clearPendingMirrorCast(): void {
    if (this.pendingMirrorCast) {
      this.pendingMirrorCast.marker.destroy();
      this.pendingMirrorCast.vignette.destroy();
      this.pendingMirrorCast.beamLine.destroy();
    }
    this.pendingMirrorCast = null;
  }

  /** 투사체 update 순회가 끝난 다음 tick에 안전하게 일괄 제거한다. */
  private deferTransientCombatCleanup(): void {
    this.time.delayedCall(0, () => this.clearTransientCombatObjects());
  }

  private stopCastingForRunPause(): void {
    if (this.incanting) this.closeIncant();
    if (this.casting) this.finishCastingUx();
    // 검사 모드가 열린 채 방 클리어·사망·런 종료로 넘어가면 time.paused가 남아
    // 보상 화면의 타이머·연출이 전부 멈춘다 — 여기서 반드시 되돌린다.
    this.closeBuildInspect();
  }

  private createHud(width: number, height: number): void {
    this.hudGraphics = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(99);

    this.statusText = this.add.text(HUD.x + 14, HUD.y + 12, 'READY', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: UI_SEMANTIC.ok,
    }).setScrollFactor(0).setDepth(100);
    // 정적 라벨 — 값이 안 바뀌므로 한 번만 만든다
    (['HP', 'MANA', 'SHIELD'] as const).forEach((label, index) => {
      this.add.text(HUD.x + HUD.labelX, hudRowY(index), label, {
        fontFamily: 'Consolas, monospace',
        fontSize: '11px',
        color: UI_COLOR.textMuted,
      }).setScrollFactor(0).setDepth(100);
    });
    this.hpText = this.add.text(HUD.x + HUD.width - HUD.valueRight, hudRowY(0), '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: UI_SEMANTIC.hp,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.manaText = this.add.text(HUD.x + HUD.width - HUD.valueRight, hudRowY(1), '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: UI_SEMANTIC.mana,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.shieldText = this.add.text(HUD.x + HUD.width - HUD.valueRight, hudRowY(2), '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: UI_SEMANTIC.shield,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);
    this.attunementText = this.add.text(HUD.x + HUD.labelX, hudRowY(3) - 4, 'ARCANE // UNBOUND', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: UI_COLOR.accent,
    }).setScrollFactor(0).setDepth(100);
    // 활성 자기 강화 — 종류·세기·남은 시간 (버프 없으면 빈 줄)
    this.buffStatusText = this.add.text(HUD.x + 152, hudRowY(3) - 4, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      fontStyle: 'bold',
      color: UI_SEMANTIC.buff,
    }).setScrollFactor(0).setDepth(100);
    // 친화 경험치 바 라벨 — 메인 HUD 박스 아래. 원소별로 1행씩(주력이 맨 위) 세워
    // "다른 원소도 오르고 있다"가 보이게 한다 (사용 성장 #166 체감 · 총괄 제보)
    this.affinityLabelTexts = Array.from({ length: AFFINITY_ROWS }, (_, i) =>
      this.add.text(HUD.x + 6, HUD.y + HUD.height + 6 + i * AFFINITY_ROW_HEIGHT, '', {
        fontFamily: '"Noto Serif KR", Consolas, monospace',
        fontSize: i === 0 ? '11px' : '10px',
        fontStyle: 'bold',
        color: '#8fa4ff',
      }).setScrollFactor(0).setDepth(100));
    // 필살기(융합) 미터 라벨 — 하단 중앙, 궁극기 게이지처럼 항상 노출해 존재를 가르친다
    this.fusionLabelText = this.add.text(width / 2, height - 62, '', {
      fontFamily: '"Noto Serif KR", Consolas, monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#a99cff',
      stroke: '#05060f',
      strokeThickness: 4,
      align: 'center',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(100);

    this.waveText = this.add.text(width - 34, RIGHT_PANEL.y + 10, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#72f1b8',
      // 블록은 우측 고정(origin 1,0)이되 **안쪽은 왼쪽 정렬** — 우측 정렬은 오른쪽 끝만
      // 맞고 줄 시작점이 어긋나 눈이 매 줄 시작을 다시 찾는다 (중앙 정렬 지적의 거울상).
      align: 'left',
      lineSpacing: 3,
      wordWrap: { width: 256, useAdvancedWrap: true },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

    // 빌드 패널 — "지금 내가 뭘 들고 있나"를 상시 노출.
    // 우하단은 비어 있어 전투 시야를 가리지 않는다. 우상단은 ROOM/WAVE 전용으로 남긴다.
    this.createBuildChips(width, height);

    this.add.text(20, height - 28, 'WASD 이동  ·  ENTER 영창  ·  ESC 일시정지', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#59679d',
    }).setScrollFactor(0).setDepth(100);

    this.sequenceProgressGraphics = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(101)
      .setVisible(false);
    this.sequenceProgressText = this.add.text(width / 2, height - 82, '', {
      fontFamily: 'Consolas, "Malgun Gothic", monospace',
      fontSize: '12px',
      fontStyle: 'bold',
      color: '#dce4ff',
      align: 'center',
    }).setOrigin(0.5, 1).setScrollFactor(0).setDepth(102).setVisible(false);
  }

  /** Phase 5 트레일 — 이동 중 잔상 스폰 간격 타이머 (Track C 아트 디렉션). */
  private playerTrailCooldown = 0;
  /** 다음 런 저주 후보 가중치에 사용할 실제 WASD 이동 거리. */
  private runMovementDistance = 0;
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

      // 지형 장벽 — 이동 후 파고든 만큼 밀어낸다. 이동을 막는 게 아니라 밀어내는
      // 방식이라 모서리에 끼지 않고, 벽을 따라 미끄러진다.
      if (this.terrainBarriers.length > 0) {
        const pushed = pushOutOfBlocks(this.player.x, this.player.y, 16, this.terrainBarriers);
        this.player.setPosition(pushed.x, pushed.y);
      }

      const actuallyMoved = this.player.x !== previousX || this.player.y !== previousY;
      if (!actuallyMoved) return;
      this.runMovementDistance += Phaser.Math.Distance.Between(
        previousX,
        previousY,
        this.player.x,
        this.player.y,
      );
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
    // 배경은 **노드 종류**로 고른다 (총괄 지적). 종전엔 stage + isBoss 세 가지뿐이라
    // 정예·함정·보물·제단이 전부 그 스테이지의 일반 방과 똑같이 생겼다 — 포탈 라벨을
    // 보고 고른 방이 구분되지 않으면 선택이 무의미해 보인다.
    // 보스 조우는 그래프 종류보다 우선한다: 두 축이 어긋나도 보스방은 보스로 보여야 한다.
    const palette = this.isBossEncounter()
      ? backdropPaletteForEncounter(state.stage, true)
      : backdropPaletteForNode(this.mapGraph.current().kind, state.stage);
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
    // 방 종류·스테이지별 전용 배경으로 교체한다. setTexture가 표시 크기를 리셋하므로 월드 크기를 다시 준다.
    // 스테이지2는 부패한 보라 아케인 배경(#72) — 없으면(로드 실패) stage1로 폴백.
    // 방 종류 전용 배경이 있으면 그것을 쓰고, 없거나 **로드 실패면 스테이지 배경으로
    // 폴백**한다. 배경 한 장이 없다고 방이 안 뜨면 안 된다(#283 교훈).
    const kindKey = this.isBossEncounter() ? null : roomKindTexture(this.mapGraph.current().kind);
    const stageKey = state.stage === 2 && this.textures.exists('bg-stage2')
      ? 'bg-stage2'
      : 'bg-stage1';
    const bgKey = this.isBossEncounter()
      ? 'bg-boss'
      : kindKey && this.textures.exists(kindKey)
        ? kindKey
        : stageKey;
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
    this.heatDamageAura = this.add.circle(0, 0, 21, 0xe65a35, 0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.player = this.add.container(
      x,
      y,
      [this.playerRingOuter, this.playerRingInner, this.playerHalo, ...bodyLayers, this.heatDamageAura],
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
  /**
   * 미러 캐스트 예고 — 표적은 **이 순간의 플레이어 위치로 고정**된다.
   * 예고 동안 이동하면 즉발 폼도 빗나간다 — 즉발(beam/slash/chain)은 이동 시간이
   * 없어 이 예고가 유일한 회피 창이다. 지연 폼은 발사 후에도 이동으로 피한다.
   *
   * 예고 연출은 3겹이다(총괄 피드백 "티가 안 남, 위압감 없음" 반영):
   * 화면 가장자리 붉은 맥동(어딜 보고 있어도 전달) + 보스→표적 수렴 마력선
   * (누가 쏘는지) + 수축 링(착탄까지 남은 시간이 몸으로 읽힘).
   *
   * @param force 페이즈3 패턴 재발동 — 1회 제한(mirrorCastUsed)을 넘되
   *              예고 중복·재료 검사는 그대로 지킨다.
   */
  private queueMirrorCast(boss: BossEnemy, force = false): void {
    if ((this.mirrorCastUsed && !force) || this.pendingMirrorCast) return;
    const spec = pickMirrorSpell(this.spellHistory);
    // 재료가 없으면(수동 damage 주문 미달) 조용히 생략 — 밋밋한 미러는 역효과다.
    if (!spec) return;
    this.mirrorCastUsed = true;

    const targetX = this.player.x;
    const targetY = this.player.y;
    const pal = ELEMENT_PALETTES[spec.element_primary];
    // 표적 마커 — 되돌아오는 주문의 원소색. 위험 관례색(주황)은 링·비네트가 맡는다.
    const marker = this.add.graphics().setDepth(6);
    marker.lineStyle(3, pal.core, 0.95).strokeCircle(targetX, targetY, 44);
    marker.lineStyle(1.5, pal.glow, 0.5).strokeCircle(targetX, targetY, 66);
    // 화면 가장자리 붉은 맥동 — 구석에서 벌어져도 "큰 게 온다"가 전달된다.
    const vignette = this.add.graphics().setScrollFactor(0).setDepth(96);
    const { width, height } = this.scale;
    vignette.fillStyle(0xff3b30, 1);
    const EDGE = 26;
    vignette.fillRect(0, 0, width, EDGE);
    vignette.fillRect(0, height - EDGE, width, EDGE);
    vignette.fillRect(0, 0, EDGE, height);
    vignette.fillRect(width - EDGE, 0, EDGE, height);
    // 보스 → 표적 수렴 마력선 (updateMirrorCast가 매 프레임 다시 그린다)
    const beamLine = this.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);

    this.pendingMirrorCast = {
      spec,
      targetX,
      targetY,
      remainingSeconds: MIRROR_CAST_CONFIG.telegraphSeconds,
      marker,
      vignette,
      beamLine,
      caster: boss,
    };
    this.audio.playSfx('boss-appear');
    requestCameraShake(this, 'weak', 1);
    this.announceSystemMessage(
      `보스가 『${spec.name}』을(를) 역영창한다 —`,
      '#ff8f70',
      2200,
    );
    devInfo('[MirrorCast] queued', { spec: spec.name, form: spec.form, force });
  }

  /** 예고 타이머 진행(스케일된 델타 = 슬로모 존중) → 만료 시 발사 */
  private updateMirrorCast(deltaSeconds: number): void {
    const pending = this.pendingMirrorCast;
    if (!pending) return;
    pending.remainingSeconds -= deltaSeconds;
    const total = MIRROR_CAST_CONFIG.telegraphSeconds;
    const progress = Phaser.Math.Clamp(1 - pending.remainingSeconds / total, 0, 1);
    // 맥동 — 남은 시간이 줄수록 빨라져 "곧 온다"를 몸으로 알린다
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(this.time.now / (90 - 40 * progress)));
    pending.marker.setAlpha(pulse);
    pending.vignette.setAlpha(0.10 + 0.14 * pulse * (0.5 + progress));
    // 수축 링 — 남은 시간에 비례해 조여든다. 착탄 타이밍의 카운트다운.
    pending.beamLine.clear();
    const ringR = 150 - 106 * progress;
    pending.beamLine.lineStyle(2.5, 0xff8f70, 0.5 + 0.5 * progress);
    pending.beamLine.strokeCircle(pending.targetX, pending.targetY, ringR);
    // 수렴 마력선 — 보스가 살아 있으면 보스 몸에서 표적으로 흐른다
    if (pending.caster.alive) {
      pending.beamLine.lineStyle(2 + 2 * progress, 0xff5a6e, 0.35 + 0.45 * pulse);
      pending.beamLine.lineBetween(
        pending.caster.x, pending.caster.y, pending.targetX, pending.targetY,
      );
    }
    if (pending.remainingSeconds > 0) return;

    pending.marker.destroy();
    pending.vignette.destroy();
    pending.beamLine.destroy();
    this.pendingMirrorCast = null;
    this.fireMirrorCast(pending.spec, pending.targetX, pending.targetY);
  }

  private fireMirrorCast(spec: SpellSpec, targetX: number, targetY: number): void {
    this.bossCastSpellAt(spec, targetX, targetY, MIRROR_CAST_CONFIG.damageScale);
    devInfo('[MirrorCast] fired', { spec: spec.name, targetX, targetY });
  }

  /**
   * 보스 영창 공통 발사부 — 미러 캐스트와 비전(스펠북) 마법이 같은 관문을 쓴다.
   * 렌더는 castSpell 그대로(시전자 중립), 피해만 **임팩트 시점의 플레이어 위치**와
   * 대조한다 — 이동 회피가 성립하는 근거.
   */
  private bossCastSpellAt(
    spec: SpellSpec,
    targetX: number,
    targetY: number,
    damageScale: number,
  ): void {
    const boss = this.enemies.find(
      (enemy): enemy is BossEnemy => enemy instanceof BossEnemy && enemy.alive,
    );
    // 예고 중 보스가 죽었으면 불발 — 시전자가 없는 마법은 없다.
    if (!boss) return;
    const castRoomIndex = this.combatRunController.state.roomIndex;
    // 다중 임팩트(nova 링·zone 틱) 연타 방지 — 시전 단위 지역 쿨다운
    let lastHitAt = 0;

    castSpell({
      scene: this,
      from: new Phaser.Math.Vector2(boss.x, boss.y),
      to: new Phaser.Math.Vector2(targetX, targetY),
      // chain은 경로가 비면 미스 연출만 나온다 — 고정 표적 지점을 1홉 경로로 준다.
      chainPath: spec.form === 'chain' ? [{ x: targetX, y: targetY }] : undefined,
      allowCameraShake: true,
      shouldResolveImpact: () => {
        const state = this.combatRunController.state;
        return state.phase === 'combat' && state.roomIndex === castRoomIndex;
      },
      onHit: (impact) => {
        // 명중 시점의 플레이어 위치와 대조 — 이동 회피의 근거가 되는 한 줄.
        if (!this.playerState.alive) return;
        if (this.time.now - lastHitAt
          < MIRROR_CAST_CONFIG.hitCooldownSeconds * 1000) return;
        if (!mirrorImpactHitsPlayer(
          impact, this.player.x, this.player.y, PLAYER_HIT_RADIUS,
        )) return;
        lastHitAt = this.time.now;
        const per = Number.isFinite(impact.damageMultiplier)
          ? Math.max(0, impact.damageMultiplier as number)
          : 1;
        this.damagePlayer(Math.max(0, spec.power) * damageScale * per);
        this.playPlayerHit('medium');
      },
    }, spec);
  }

  // ── 보스 비전 마법 (bossArcana, 총괄 발안 07-26) ─────────────────────

  /** 스펠북 원소 마법 예고 — 미러보다 가볍다(일상 패턴). 표적은 예고 시점 고정. */
  private queueBossArcana(): void {
    if (this.pendingBossArcana) return;
    const spec = bossArcanaSpell(this.bossArcanaIndex++);
    const pal = ELEMENT_PALETTES[spec.element_primary];
    const targetX = this.player.x;
    const targetY = this.player.y;
    const marker = this.add.graphics().setDepth(6);
    marker.lineStyle(2, pal.core, 0.85).strokeCircle(targetX, targetY, 36);
    this.pendingBossArcana = {
      spec,
      targetX,
      targetY,
      remainingSeconds: BOSS_ARCANA_CONFIG.castTelegraphSeconds,
      marker,
    };
    devInfo('[BossArcana] queued', { spec: spec.name, form: spec.form });
  }

  /** 어둠 장막 — 암전 저주의 시야 시스템을 짧은 방해로 재사용 (피해 0) */
  private castBossShroud(): void {
    // 암전 저주 방이면 이미 어두움 — 겹치면 아무것도 안 보인다. 생략.
    if (this.bossShroud || this.blackoutCurseField) return;
    this.bossShroud = new BlackoutCurseField(
      this, this.worldBounds, this.player.x, this.player.y,
    );
    this.bossShroudRemaining = BOSS_ARCANA_CONFIG.shroudSeconds;
    this.announceSystemMessage('어둠의 장막 — 시야가 조여든다', '#b18cff', 2200);
  }

  /** 중력 인력 — 보스 쪽으로 흡인. 이속(220)보다 느려 걸어서 저항 가능. */
  private castBossPull(): void {
    if (this.bossPullRemaining > 0) return;
    this.bossPullRemaining = BOSS_ARCANA_CONFIG.pullDurationSeconds
      + BOSS_ARCANA_CONFIG.pullTelegraphSeconds;
    this.announceSystemMessage('중력 인력 — 붙잡히기 전에 벗어나라', '#b18cff', 2200);
  }

  /** 비전 마법 상태 진행 — 스케일된 델타(슬로모 존중) */
  private updateBossArcana(deltaSeconds: number): void {
    const pending = this.pendingBossArcana;
    if (pending) {
      pending.remainingSeconds -= deltaSeconds;
      pending.marker.setAlpha(0.5 + 0.5 * Math.abs(Math.sin(this.time.now / 80)));
      if (pending.remainingSeconds <= 0) {
        pending.marker.destroy();
        this.pendingBossArcana = null;
        this.bossCastSpellAt(
          pending.spec, pending.targetX, pending.targetY, BOSS_ARCANA_CONFIG.damageScale,
        );
      }
    }

    if (this.bossShroud) {
      this.bossShroudRemaining -= deltaSeconds;
      this.bossShroud.update(deltaSeconds, this.player.x, this.player.y);
      if (this.bossShroudRemaining <= 0) {
        this.bossShroud.destroy();
        this.bossShroud = null;
      }
    }

    if (this.bossPullRemaining > 0) {
      this.bossPullRemaining -= deltaSeconds;
      const telegraphLeft = this.bossPullRemaining - BOSS_ARCANA_CONFIG.pullDurationSeconds;
      // 예고 구간(첫 0.6초)에는 끌지 않는다 — 반응할 시간을 준다.
      if (telegraphLeft <= 0) {
        const boss = this.enemies.find(
          (enemy): enemy is BossEnemy => enemy instanceof BossEnemy && enemy.alive,
        );
        if (boss && this.playerState.alive) {
          const dx = boss.x - this.player.x;
          const dy = boss.y - this.player.y;
          const distance = Math.hypot(dx, dy);
          // 접촉 거리 안까지 끌어붙이지 않는다 — 흡인은 위치 교란이지 즉사 콤보가 아니다.
          if (distance > BOSS_CONFIG.contactDistance * 1.6) {
            const step = BOSS_ARCANA_CONFIG.pullSpeedPerSecond * deltaSeconds;
            this.player.x += (dx / distance) * step;
            this.player.y += (dy / distance) * step;
          }
        } else {
          this.bossPullRemaining = 0; // 보스가 죽으면 인력도 사라진다
        }
      }
    }
  }

  /** 비전 마법 상태 정리 — 방 전환·사망 후 장막·인력·예고가 남지 않게 */
  private clearBossArcana(): void {
    this.pendingBossArcana?.marker.destroy();
    this.pendingBossArcana = null;
    this.bossShroud?.destroy();
    this.bossShroud = null;
    this.bossShroudRemaining = 0;
    this.bossPullRemaining = 0;
  }

  // ── 정적 지형 장벽 (#214 지형 Tier 2) ──────────────────────────────

  /**
   * 방 장벽 배치 — R1 프리셋이 준 데이터를 그대로 세운다.
   * 빈 배열이면 장벽 없는 방(기존 동작과 동일).
   */
  /**
   * 방 구조물을 세운다 — 정사각 석재 블록 (총괄 지시: "정사각형 형태의 지형지물로,
   * 구조물답게 너무 허접하게 생기면 안 된다").
   *
   * 종전엔 두께 14px 선분 3겹이었다. 얇은 막대는 구조물이 아니라 울타리로 읽힌다.
   *
   * ⚠️ **ADD 블렌드를 쓰지 않는다.** 구조물은 발광체가 아니라 돌이고, 광과민성
   * 예산(#220)은 장식 VFX가 아닌 것도 화면을 밝히면 안 된다고 본다. 정지 상태로
   * 계속 떠 있는 물체라 미세한 깜빡임도 누적 피로가 된다 — 애니메이션도 없다.
   *
   * 다섯 겹으로 부피를 만든다: 바닥 그림자 → 본체 → 상단 경사면(빛) →
   * 하단 경사면(그늘) → 테두리. 여기에 룬 균열을 얹어 "마력 구조물"임을 드러낸다.
   */
  private setTerrainBarriers(blocks: readonly TerrainBlock[]): void {
    this.clearTerrainBarriers();
    if (blocks.length === 0) return;
    this.terrainBarriers = blocks.map((block) => ({ ...block }));

    const view = this.add.graphics().setDepth(4);
    for (const block of this.terrainBarriers) {
      const { x, y, half } = block;
      const size = half * 2;
      const bevel = Math.max(6, half * 0.22);

      // ① 바닥 그림자 — 아래로 살짝 밀어 부피감을 만든다
      view.fillStyle(0x030304, 0.62);
      view.fillRoundedRect(x - half + 3, y - half + 8, size, size, 6);
      // ② 본체 — 원소광이 아닌 흑요석 먹회색
      view.fillStyle(0x211d23, 1);
      view.fillRoundedRect(x - half, y - half, size, size, 6);
      // ③ 상단 경사면 — 배경에서 구조물 윤곽을 잃지 않을 정도의 명암만 남긴다
      view.fillStyle(0x3b343e, 1);
      view.fillRect(x - half + bevel * 0.5, y - half + 3, size - bevel, bevel);
      // ④ 하단 경사면 — 그늘
      view.fillStyle(0x120f14, 1);
      view.fillRect(x - half + bevel * 0.5, y + half - bevel - 3, size - bevel, bevel);
      // ⑤ 테두리 — 저채도 회보라 안쪽 선 + 먹색 바깥 선
      view.lineStyle(2, 0x716476, 0.72);
      view.strokeRoundedRect(x - half + 2, y - half + 2, size - 4, size - 4, 5);
      view.lineStyle(2, 0x070609, 0.95);
      view.strokeRoundedRect(x - half, y - half, size, size, 6);

      // 룬 균열 — 대각 한 줄 + 짧은 가지. 마력 구조물임을 드러내되 정지 상태다
      view.lineStyle(2, 0x8b748f, 0.32);
      view.lineBetween(x - half * 0.45, y - half * 0.5, x + half * 0.2, y + half * 0.45);
      view.lineBetween(x - half * 0.1, y - half * 0.05, x + half * 0.4, y - half * 0.35);
    }
    this.terrainBarrierView = view;
  }

  /**
   * 이 전환이 포탈 선택을 기다려야 하나.
   *
   * 다음 노드가 둘 이상이면 플레이어가 골라야 하고, 하나여도 그 방이 무전투 방이면
   * 자동 진입하지 않는다(`rewardlessNodeKind` 규칙). 선택지가 없으면(보스 직전 등)
   * 붙잡을 이유가 없으므로 종전대로 즉시 예약한다.
   */
  private transitionNeedsRoomChoice(): boolean {
    return this.mapGraph.choices().length > 0;
  }

  /**
   * 붙잡아 둔 전환을 실행한다 — 포탈 진입이 끝난 시점에 씬이 부른다.
   * 보관된 게 없으면 아무 일도 하지 않는다(선택지가 없어 즉시 예약된 경우).
   */
  private releaseRunTransition(): void {
    const pending = this.pendingRunTransition;
    if (!pending) return;
    this.pendingRunTransition = null;
    this.time.delayedCall(pending.delayMs, () => {
      if (!this.scene?.isActive?.()) return;
      pending.run();
    });
  }

  /**
   * 방 종류에 맞는 지형 장벽을 세운다 (#214 지형 Tier 2 배선).
   *
   * 기전은 진작 완성돼 있었다 — 플레이어·보행 적을 밀어내고 적 투사체까지 막는다.
   * 그런데 `setTerrainBarriers` 호출이 **DEV 프리뷰 한 곳뿐**이어서 실제 런에서는
   * 장벽이 한 번도 나오지 않았다. 방이 전부 텅 빈 사각 아레나였고, 슈터 적의 사격을
   * 피하는 방법이 발로 도는 것밖에 없었다.
   *
   * R1이 노드 `terrain`에 장벽을 채우면 **그것이 이긴다**. 비어 있으면 방 종류별
   * 기본 배치를 쓴다(`roomTerrainConfig`).
   */
  private applyRoomTerrain(): void {
    const node = this.mapGraph.current();
    const fromNode = blocksFromPlacements(node.terrain);
    if (fromNode.length > 0) {
      this.setTerrainBarriers(fromNode);
      return;
    }
    const stage = node.stage === 2 ? 2 : 1;
    this.setTerrainBarriers(terrainForRoom(node.kind, stage));
  }

  private clearTerrainBarriers(): void {
    this.terrainBarrierView?.destroy();
    this.terrainBarrierView = null;
    this.terrainBarriers = [];
  }

  // ── 맵 그래프 · 포탈 · 미니맵 (#214 본배선) ──────────────────────────

  /**
   * 런의 맵 정의를 고른다 (#240 배선).
   *
   * 기본은 **생성기**다 — 런마다 분기 구조와 방 구성이 달라진다. 두 경우에 프리셋으로
   * 돌아간다:
   *
   *  1. `useGenerator === false` — **시연 로드아웃**. 심사자가 하는 판은 고정 판이어야
   *     한다. 매번 다른 맵을 뽑으면 시연 중에만 드러나는 조합을 만날 수 있고, 그건
   *     생성기를 붙여서 얻는 것보다 잃는 게 크다. 시드 재현이 되더라도 심사 자리에서
   *     "다시 뽑아보자"를 할 수는 없다.
   *  2. 생성 실패 — 상한(160회)까지 규칙을 만족하는 후보를 못 찾은 경우. 실측
   *     600시드에서 0%였지만 **폴백이 없으면 런이 시작되지 않는다**. 안전망은 남긴다.
   */
  private runMapDefinition(useGenerator: boolean): MapGraphDefinition {
    if (!useGenerator) return MAP_GRAPH_PRESET_01;
    const generated = generateRunMap((Date.now() ^ (Math.random() * 0xffffffff)) >>> 0);
    if (!generated) {
      // 조용히 넘어가면 "왜 항상 같은 맵이지"를 아무도 모른다
      console.warn('[map] 생성 상한 초과 — 고정 프리셋으로 폴백');
      return MAP_GRAPH_PRESET_01;
    }
    return generated.definition;
  }

  /**
   * 런 시작·이어가기마다 그래프와 방별 조우를 같이 새로 만든다.
   *
   * @param initialNodeId 시작 노드. 시연 로드아웃이 중간 방부터 시작할 때 쓴다.
   *   **생성 맵에는 프리셋 노드 id가 없으므로**, 이 값이 주어지면 프리셋을 쓴다.
   */
  private resetMapGraph(
    initialNodeId: string | null = null,
    roomIndex = DEBUG_START_ROOM,
  ): void {
    // **먼저 걷어낸다** — Phaser는 씬 인스턴스를 재사용하므로(타이틀→새 런) 필드는
    // 남아 있는데 가리키는 GameObject는 이미 파괴돼 있다. 그대로 update하면 죽는다.
    this.destroyRunMapUi();
    // 보관된 전환을 버린다 — 남겨두면 새 런에서 지난 런의 전환이 터진다
    this.pendingRunTransition = null;
    const definition = this.runMapDefinition(initialNodeId === null);
    this.mapGraph = new RunMapGraph(definition, initialNodeId ?? definition.startNodeId);
    this.mapEncounterByRoom.clear();
    this.mapEncounterByRoom.set(roomIndex, encounterFromMapNode(this.mapGraph.current()));
    this.refreshMinimap();
  }

  private mapEncounterForRoom(roomIndex: number): EncounterDefinition {
    const encounter = this.mapEncounterByRoom.get(roomIndex);
    if (!encounter) throw new Error(`Map encounter is missing for run room ${roomIndex}`);
    return encounter;
  }

  private refreshMinimap(): void {
    if (!this.runMinimap) {
      // 상단 우측 — ROOM 칩(DOM) 아래. 전투 중에도 떠 있어야 "어디까지 왔나"가 읽힌다.
      this.runMinimap = new MinimapHud(
        this,
        this.scale.width - 306,
        // 초기 y는 평시 2줄 기준. 이후 drawHudBars가 패널 높이에 맞춰 옮긴다.
        RIGHT_PANEL.y + rightPanelHeight(RIGHT_PANEL.baseTextHeight) + RIGHT_PANEL.gap,
      );
    }
    this.runMinimap.update(toMinimapModel(this.mapGraph.snapshot()));
    this.syncMinimapVisibility();
  }

  /**
   * 미니맵을 지금 보여야 하나 (총괄 결정: "탭을 눌렀을 때만 띄우는 건 어떻게 생각함?").
   * ⚠️ 그 뒤 일시정지 키가 TAB → ESC로 바뀌었다(총괄 지시). 미니맵은 검사 모드에
   * 묶여 있으므로 **함께 ESC로 옮겨간다** — 판단 근거("상시 노출은 시야를 좁힌다")는
   * 그대로고 여는 키만 달라졌다.
   *
   * 상시 노출을 접은 이유: 미니맵은 초당 정보가 아니라 **가끔 확인하는 정보**다.
   * 전투 중엔 우상단 자리만 먹고, Tab이 이미 "내 상태를 들여다본다"는 제스처라
   * (빌드 검사·일시정지·툴팁) 거기 얹으면 의미가 일관된다.
   *
   * 다음 방 선택은 전체 경로를 그리는 중앙 DOM 오버레이가 담당한다. 작은 Phaser
   * 미니맵까지 함께 띄우면 같은 정보가 두 번 보이므로 빌드 검사에서만 표시한다.
   */
  private shouldShowMinimap(): boolean {
    return this.buildInspectOpen;
  }

  /** 가시성 동기화 — update와 상태 전환 지점에서 호출 (setVisible은 동일 값이면 무해) */
  private syncMinimapVisibility(): void {
    this.runMinimap?.setVisible(this.shouldShowMinimap());
  }

  private destroyRunMapUi(): void {
    this.runMinimap?.destroy();
    this.runMinimap = null;
  }

  /**
   * 보상 선택 후 UI에서 다음 방을 고른다 (runUiBinding.chooseNextRoom).
   *
   * ⚠️ 종전엔 이게 resolve될 때까지 `chooseReward` 자체를 미뤘다. 그런데 그 호출이
   * **보상 적용도 같이** 하므로, 카드를 골라도 포탈에 진입할 때까지 최대 체력·마나가
   * 바뀌지 않았다(총괄 제보). 이제 보상은 즉시 적용되고, 붙잡히는 건 **전환 타이머**
   * 하나다(`scheduleTransition` 주입 → `pendingRunTransition`).
   *
   * 그래서 이 함수의 **모든 종료 경로**가 `releaseRunTransition()`을 불러야 한다.
   * 하나라도 빠뜨리면 보상은 반영됐는데 방이 영영 안 넘어간다 — 런이 갇힌다.
   * 갈래 수와 관계없이 전체 경로 지도를 열어 현재 위치와 다음 목적지를 확인시킨다.
   */
  async chooseRoomDestination(): Promise<void> {
    const choices = this.mapGraph.choices();
    if (choices.length === 0) {
      this.releaseRunTransition();
      return;
    }

    try {
      const selected = await showRoomChoices({
        map: toMinimapModel(this.mapGraph.snapshot()),
        options: choices.map((node) => ({
          nodeId: node.id,
          kind: node.kind,
        })),
      });
      const selectedId = choices.some((node) => node.id === selected.nodeId)
        && this.mapGraph.canEnter(selected.nodeId)
        ? selected.nodeId
        : choices[0].id;
      this.enterMapNode(selectedId);
    } catch (error) {
      // UI 실패가 런 고착으로 번지지 않게 첫 도달 가능 노드로 진행한다.
      devInfo('[Map] room choice failed — 첫 갈래로 진행', error);
      this.enterMapNode(choices[0].id);
    } finally {
      this.releaseRunTransition();
    }
  }

  /**
   * 지금 방이 **전투 없는 방**인가 (보물·제단). 아니면 null.
   * 포탈 라벨·보상·실제 방 내용이 모두 같은 MapNode를 보게 하는 판정점이다.
   */
  private rewardlessNodeKind(): 'treasure' | 'altar' | null {
    const kind = this.mapGraph.current().kind;
    return kind === 'treasure' || kind === 'altar' ? kind : null;
  }

  /**
   * 무전투 방 — 웨이브 없이 즉시 클리어해 전용 보상표를 띄운다.
   *
   * 제단은 먼저 **대가(HP)를 치른다**(altarHpCost). 대가가 보상보다 먼저여야
   * "지불하고 얻는다"가 성립하고, 카드를 보고 무를 수도 없다.
   */
  private startRewardlessRoom(kind: 'treasure' | 'altar'): void {
    // WaveManager는 빈 정의에 예외를 던진다. 적 0인 웨이브 하나를 두되 start()를 부르지
    // 않는다 — waveIndex가 -1이라 update()도 아무것도 스폰하지 않는다.
    this.waveManager = new WaveManager([{ chaserCount: 0, shooterCount: 0, splitterCount: 0 }]);
    this.audio.playBgm('combat');
    if (kind === 'altar') {
      // ⚠️ 여기서 걷지 않는다 — 대가는 **카드를 고를 때** 치른다(reward-applied).
      // 방에 들어선 것만으로 징수하면 거절권이 사라져 선택이 아니라 함정이 된다.
      this.announceBanner({
        title: '제단',
        lines: ['생명을 내어주고 힘을 산다 · 거절할 수도 있다', ROOM_FIXTURE_GUIDE.altar],
        color: 0xd0a8ff,
        holdMs: 2800,
      });
    } else {
      this.announceBanner({
        title: '보물방',
        lines: ['싸우지 않고 얻는다', ROOM_FIXTURE_GUIDE.treasure],
        color: 0xffd166,
        holdMs: 2600,
      });
    }
    // ⚠️ `방 N`과 설치물 안내를 따로 띄우지 않는다 (총괄 제보: "중앙에 뜨는 창이 중복으로
    // 겹치던데"). 배너(중앙 판)와 시스템 메시지(height×0.42)는 **다른 채널**이라 서로의
    // 스택을 모른다 — 셋이 동시에 뜨면 겹친다. 배너 한 판에 합치고, 방 번호는 이미
    // 우상단 상태 패널이 그린다(#281).
    // ⚠️ 여기서 보상을 띄우지 않는다 (총괄 지적: "들어가자마자 주는 것보다는 중앙까지
    // 이동해서 상호작용했을 때 비로소 선택지가 뜨는 게 맞지 않나").
    //
    // 종전엔 900ms 타이머로 notifyRoomCleared를 강제 호출해 방이 아니라 **팝업**이었다.
    // 도착(왼쪽)과 출구(오른쪽) 사이를 걸을 이유가 없어 포탈로 만든 좌→우 진행 구조가
    // 이 방들에서만 무의미해졌다. 이제 중앙 설치물이 트리거다 — 타이머도 필요 없다.
    this.roomClearPending = true;
    this.setRoomFixture(kind);
  }

  /**
   * 방 중앙에 설치물을 세운다. 다가가면 보상이 열린다.
   * 도착이 왼쪽 중앙(#245)이므로 중앙까지 걸어야 하고, 그 뒤 출구는 오른쪽이다.
   */
  private setRoomFixture(kind: 'treasure' | 'altar'): void {
    this.clearRoomFixture();
    this.roomFixture = new RoomFixture(
      this,
      this.worldBounds.centerX + ROOM_FIXTURE_CONFIG.offsetX,
      this.worldBounds.centerY,
      kind,
      () => this.openRewardlessRoomChoice(),
    );
    // 안내는 startRewardlessRoom의 배너에 합쳤다 — 중앙 채널이 겹치지 않게.
  }

  private clearRoomFixture(): void {
    this.roomFixture?.destroy();
    this.roomFixture = null;
  }

  /**
   * 설치물 상호작용 — 여기서 비로소 보상표가 열린다.
   * 설치물은 즉시 걷어낸다: 카드를 고르는 동안 남아 있으면 다시 닿아 이중 발화한다.
   */
  private openRewardlessRoomChoice(): void {
    this.clearRoomFixture();
    this.audio.playSfx('room-clear');
    this.combatRunController.notifyRoomCleared();
  }

  private enterMapNode(nodeId: string): void {
    if (!this.mapGraph.canEnter(nodeId)) return;
    const from = this.mapGraph.current().id;
    const node = this.mapGraph.enter(nodeId);
    this.mapEncounterByRoom.set(
      this.combatRunController.state.roomIndex + 1,
      encounterFromMapNode(node),
    );
    this.refreshMinimap();
    // 실제 배치는 startRoom에서 공통 중앙 좌표로 수행한다.
    devInfo('[Map] entered', { from, to: node.id, kind: node.kind });
  }

  // ── 바닥형 지형 (#214 지형 Tier 1 R2) ──────────────────────────────

  /** 방 바닥지형 배치 — R1 프리셋 데이터를 그대로 깐다. 빈 배열이면 지형 없는 방. */
  private setFloorHazards(zones: readonly FloorHazardZone[]): void {
    this.clearFloorHazards();
    if (zones.length === 0) return;
    this.floorHazards = zones.map((zone) => ({ ...zone }));

    // 바닥 데칼 — 위험 예고(-1)와 개체(0)보다 아래에 깔아 "밟는 것"으로 읽힌다.
    // 용암=주황, 독지대=초록. 3겹(외곽 글로우·본체·테두리)으로 위험지대를 뚜렷이.
    // **종류별로 따로 그린다** — 정화 면역 중에 그 종류만 흐려져야 하기 때문(#239).
    for (const kind of FLOOR_HAZARD_KINDS) {
      const zonesOfKind = this.floorHazards.filter((zone) => zone.kind === kind);
      if (zonesOfKind.length === 0) continue;
      const view = this.add.graphics().setDepth(-1.5);
      const [glow, body, edge] = kind === 'lava'
        ? [0x5a1e00, 0xff6a1a, 0xffb066]
        : [0x0e2e12, 0x39b54a, 0x9be89b];
      for (const zone of zonesOfKind) {
        view.fillStyle(glow, 0.28).fillCircle(zone.x, zone.y, zone.radius + 6);
        view.fillStyle(body, 0.30).fillCircle(zone.x, zone.y, zone.radius);
        view.lineStyle(2, edge, 0.7).strokeCircle(zone.x, zone.y, zone.radius);
      }
      this.floorHazardViews.set(kind, view);
    }
    this.floorHazardTickCooldown = FLOOR_HAZARD_CONFIG.tickIntervalSeconds;
  }

  private clearFloorHazards(): void {
    this.floorHazardTickCooldown = 0;
    for (const view of this.floorHazardViews.values()) view.destroy();
    this.floorHazardViews.clear();
    this.floorHazards = [];
    // 잔류·면역·정화 횟수는 **방마다 초기화** — 정화 1회는 방당 예산이다
    this.floorHazardPlayer = createFloorHazardPlayerState();
  }

  /**
   * 제단 각성이 걸릴 원소 — **친화가 가장 높은 것 중 아직 각성 안 한 것**.
   * 아무 원소나 주면 안 쓰는 원소에 걸려 대가만 날린다. 후보가 없으면 null이고
   * 그 등급은 잠긴다(drawAltarOffer).
   */
  private altarAwakenElement(): SpellElement | null {
    const affinity = this.combatRunController.state.elementalAffinity;
    let best: { element: SpellElement; value: number } | null = null;
    for (const [key, raw] of Object.entries(affinity)) {
      const element = key as SpellElement;
      const value = Number.isFinite(raw) ? (raw as number) : 0;
      if (value <= 0 || this.awakenings[element]) continue;
      if (!best || value > best.value) best = { element, value };
    }
    return best?.element ?? null;
  }

  /**
   * 제단 거래 집행 — 대가를 치르고 보상을 건다 (reward-applied에서 호출).
   * 잠긴 카드·거절 카드는 cost 0이라 아무 일도 일어나지 않는다.
   */
  private applyAltarDeal(chosen: RewardOption): void {
    const cost = chosen.altar?.cost ?? 0;
    if (cost <= 0) return;
    const before = this.playerState.maxHp;
    const paid = this.playerState.reduceMaxHp(cost, ALTAR_OFFER_CONFIG.minMaxHp);
    this.announceBanner({
      title: '대가를 치렀다',
      lines: [`최대 생명 ${before} → ${this.playerState.maxHp}`],
      color: 0xd0a8ff,
      holdMs: 2400,
    });
    devInfo('[Altar] paid', { cost, paid, kind: chosen.kind });
  }

  /** 이 방에 깔린 지형 종류 — 정화 대상 판정에 쓴다(없는 지형은 정화하지 않는다). */
  private presentFloorHazardKinds(): FloorHazardKind[] {
    return FLOOR_HAZARD_KINDS.filter(
      (kind) => this.floorHazards.some((zone) => zone.kind === kind),
    );
  }

  /** 기존 장판과 같은 스케일된 게임 시간으로 지형 틱을 진행한다. */
  private updateFloorHazards(deltaSeconds: number): void {
    if (this.floorHazards.length === 0) return;
    this.floorHazardPlayer = advanceFloorHazardTimers(this.floorHazardPlayer, deltaSeconds);
    this.syncFloorHazardImmunityView();
    this.floorHazardTickCooldown = Math.max(0, this.floorHazardTickCooldown - deltaSeconds);
    if (this.floorHazardTickCooldown > 0) return;
    this.tickFloorHazards();
    this.floorHazardTickCooldown = FLOOR_HAZARD_CONFIG.tickIntervalSeconds;
  }

  /** 면역 중인 지형은 데칼을 흐린다 — "위험하던 것이 지금은 안 위험하다"가 눈에 보여야 한다. */
  private syncFloorHazardImmunityView(): void {
    for (const [kind, view] of this.floorHazardViews) {
      view.setAlpha(isFloorHazardImmune(this.floorHazardPlayer, kind) ? 0.3 : 1);
    }
  }

  /**
   * 틱 간격마다 — 밟고 있거나(용암·독) **나온 뒤 잔류 중이면**(독) 그 지형의 틱 피해를 준다.
   * damagePlayer는 자체로 무음(HP만 감소)이라 "안 때렸는데 맞는 소리"가 안 난다.
   */
  private tickFloorHazards(): void {
    if (!this.playerState.alive || !this.isCombatActive()) return;
    const insideKinds = FLOOR_HAZARD_KINDS.filter((kind) => this.floorHazards.some(
      (zone) => zone.kind === kind && isInFloorHazard(this.player.x, this.player.y, zone),
    ));
    const { kinds, state } = floorHazardTickKinds(this.floorHazardPlayer, insideKinds);
    this.floorHazardPlayer = state;
    for (const kind of kinds) this.damagePlayer(floorHazardTickDamage(kind));
  }

  /**
   * 시전한 주문이 이 방의 지형을 정화하는가 (#239 축소안 — 상태 해제가 아니라 **면역**).
   *
   * 판정이 준 element/effect의 **카테고리**로 매칭하므로 `얼음 갑옷`·`서리 장화`·
   * `물의 보호막`이 전부 용암을 카운터한다 — 정해진 단어가 아니라 자기가 지어낸 말이
   * 작동하는 게 이 게임의 명제다. 방당 1회라 아무 때나 쓰면 안 되는 카드이기도 하다.
   */
  private tryCleanseFloorHazard(spec: SpellSpec): void {
    if (this.floorHazards.length === 0) return;
    const { state, cleansed } = tryCleanseFloorHazards(
      this.floorHazardPlayer,
      spec.element_primary,
      spec.effect,
      this.presentFloorHazardKinds(),
    );
    if (cleansed.length === 0) return;
    this.floorHazardPlayer = state;
    this.syncFloorHazardImmunityView();
    const labels = cleansed.map((kind) => (kind === 'lava' ? '용암' : '독지대')).join('·');
    this.announceBanner({
      title: `${labels} 정화 — ${FLOOR_HAZARD_CONFIG.immunitySeconds}초 면역`,
      lines: [`『${spec.name}』이(가) 발밑을 지켜낸다`],
      color: cleansed.includes('lava') ? 0x72d8ff : 0xc7f9e0,
      holdMs: 2200,
    });
  }

  /**
   * 보행 적을 장벽 밖으로 밀어낸다 — 추격이 직선이라 벽에 파고들 수 있다.
   * ⚠️ 밀어내기만 할 뿐 우회는 못 한다. 그래서 배치가 **개방형**이어야 한다
   * (terrainBarrier.ts 주석의 원칙 1). 미로면 적이 벽에 비빈다.
   */
  private pushEnemiesOutOfTerrain(): void {
    if (this.terrainBarriers.length === 0) return;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      // 보스 돌진 중엔 통과 — 돌진은 "밀고 지나가는" 행동이다(원칙 2와 같은 결)
      if (enemy instanceof BossEnemy && enemy.charging) continue;
      // view를 직접 옮긴다 — 넉백(updateEnemyKnockback)이 쓰는 것과 같은 경로.
      const pushed = pushOutOfBlocks(
        enemy.view.x, enemy.view.y, enemy.collisionRadius, this.terrainBarriers,
      );
      enemy.view.x = pushed.x;
      enemy.view.y = pushed.y;
    }
  }

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
    this.clearHazardZones();
    this.clearEnemyProjectiles();
  }

  private clearHazardZones(): void {
    for (const hazard of this.hazardZones) {
      if (hazard.view.active) hazard.view.destroy();
    }
    this.hazardZones = [];
  }

  private spawnHazards(safeCorridor?: TrapSafeCorridor): void {
    const placements = trapHazardCirclePlacements(
      this.worldBounds.centerX,
      this.worldBounds.centerY,
      safeCorridor,
      PLAYER_HIT_RADIUS,
    );
    for (const placement of placements) {
      const view = this.add.circle(
        Phaser.Math.Clamp(placement.x, this.worldBounds.left + placement.radius, this.worldBounds.right - placement.radius),
        Phaser.Math.Clamp(placement.y, this.worldBounds.top + placement.radius, this.worldBounds.bottom - placement.radius),
        placement.radius,
        0x8f183e,
        0.14,
      ).setStrokeStyle(4, 0xff5370, 0.92);
      this.hazardZones.push({
        view,
        contains: (x, y) => Phaser.Math.Distance.Between(x, y, view.x, view.y) <= placement.radius,
        damageCooldown: 0,
      });
    }

    this.spawnBoundaryHazards(900, 650, safeCorridor);
  }

  private spawnBoundaryHazards(
    safeWidth: number,
    safeHeight: number,
    safeCorridor?: TrapSafeCorridor,
  ): void {
    if (safeCorridor) {
      const halfWidth = safeCorridor.halfWidth;
      const centerX = this.worldBounds.centerX;
      const centerY = this.worldBounds.centerY;
      const safeLeft = centerX - safeWidth / 2;
      const safeRight = centerX + safeWidth / 2;
      const safeTop = centerY - safeHeight / 2;
      const safeBottom = centerY + safeHeight / 2;
      const boundaryRects = [
        // 중앙 안전사각형은 기존 위험지대 방과 동일하게 유지한다. 십자 통로는
        // 이 사각형 바깥에서 입구와 중앙을 연결하는 예외 경로만 추가한다.
        new Phaser.Geom.Rectangle(this.worldBounds.left, this.worldBounds.top, centerX - halfWidth - this.worldBounds.left, safeTop - this.worldBounds.top),
        new Phaser.Geom.Rectangle(centerX + halfWidth, this.worldBounds.top, this.worldBounds.right - (centerX + halfWidth), safeTop - this.worldBounds.top),
        new Phaser.Geom.Rectangle(this.worldBounds.left, safeTop, safeLeft - this.worldBounds.left, centerY - halfWidth - safeTop),
        new Phaser.Geom.Rectangle(safeRight, safeTop, this.worldBounds.right - safeRight, centerY - halfWidth - safeTop),
        new Phaser.Geom.Rectangle(this.worldBounds.left, centerY + halfWidth, safeLeft - this.worldBounds.left, safeBottom - (centerY + halfWidth)),
        new Phaser.Geom.Rectangle(safeRight, centerY + halfWidth, this.worldBounds.right - safeRight, safeBottom - (centerY + halfWidth)),
        new Phaser.Geom.Rectangle(this.worldBounds.left, safeBottom, centerX - halfWidth - this.worldBounds.left, this.worldBounds.bottom - safeBottom),
        new Phaser.Geom.Rectangle(centerX + halfWidth, safeBottom, this.worldBounds.right - (centerX + halfWidth), this.worldBounds.bottom - safeBottom),
      ];
      for (const bounds of boundaryRects) {
        const view = this.add.rectangle(bounds.centerX, bounds.centerY, bounds.width, bounds.height, 0x8f183e, 0.14);
        this.hazardZones.push({
          view,
          contains: (x, y) => bounds.contains(x, y),
          damageCooldown: 0,
        });
      }
      // 중앙 사각형과 십자 통로는 같은 안전영역이다. 두 영역의 연결부에는
      // 경계선을 그리지 않고, 합쳐진 안전영역의 외곽선만 표시한다.
      const boundaryLine = this.add.graphics().lineStyle(3, 0xff5370, 0.72);
      const outlineSegments = [
        [centerX - halfWidth, this.worldBounds.top, centerX - halfWidth, safeTop],
        [centerX + halfWidth, this.worldBounds.top, centerX + halfWidth, safeTop],
        [safeLeft, safeTop, centerX - halfWidth, safeTop],
        [centerX + halfWidth, safeTop, safeRight, safeTop],
        [safeLeft, safeTop, safeLeft, centerY - halfWidth],
        [safeRight, safeTop, safeRight, centerY - halfWidth],
        [this.worldBounds.left, centerY - halfWidth, safeLeft, centerY - halfWidth],
        [this.worldBounds.left, centerY + halfWidth, safeLeft, centerY + halfWidth],
        [safeRight, centerY - halfWidth, this.worldBounds.right, centerY - halfWidth],
        [safeRight, centerY + halfWidth, this.worldBounds.right, centerY + halfWidth],
        [safeLeft, centerY + halfWidth, safeLeft, safeBottom],
        [safeRight, centerY + halfWidth, safeRight, safeBottom],
        [safeLeft, safeBottom, centerX - halfWidth, safeBottom],
        [centerX + halfWidth, safeBottom, safeRight, safeBottom],
        [centerX - halfWidth, safeBottom, centerX - halfWidth, this.worldBounds.bottom],
        [centerX + halfWidth, safeBottom, centerX + halfWidth, this.worldBounds.bottom],
      ];
      for (const [x1, y1, x2, y2] of outlineSegments) {
        boundaryLine.lineBetween(x1, y1, x2, y2);
      }
      this.hazardDecorations.push(boundaryLine);
      return;
    }
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
      const applied = this.damagePlayer(9);
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

  /**
   * 지금 빌드의 파워 배율 (1 = 런 시작).
   *
   * ⚠️ **적 스탯 계산에는 쓰지 않는다** (#267) — 성장에 연동하면 분기 맵의 위험–보상이
   * 상쇄된다. 남겨둔 이유는 **측정**이다: #258의 프리셋 목표시간 검증에서
   * "이 판은 파워 2.4였고 41초 걸렸다"를 기록해야 티어 고정 보정값의 근거가 생긴다.
   * 순수 함수라 같은 빌드 = 같은 값이 보장돼 로그 간 비교가 된다.
   */
  currentPlayerPower(): number {
    return playerPowerIndex({
      affinity: this.combatRunController.state.elementalAffinity,
      engraves: this.engraveManager.entries,
      spirits: this.spiritManager.entries,
      awakenings: this.awakenings,
    });
  }

  private spawnEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    applyEncounterModifier = false,
    explicitModifier?: EliteModifier,
  ): void {
    // 적 체력은 **이어가기 루프 단계만** 본다 (#267) — 플레이어 실제 성장에 연동하면
    // 분기 맵의 위험–보상이 상쇄되고 프리셋별 목표시간을 측정할 수 없다.
    const hpScale = enemyHpScale(this.combatRunController.state.loopIndex);
    let enemy: CombatEnemy;
    switch (kind) {
      case 'shield-sentinel':
        enemy = new ShieldSentinelEnemy(this, x, y, hpScale);
        break;
      case 'shooter':
        enemy = new ShooterEnemy(this, x, y, hpScale);
        break;
      case 'splitter':
        enemy = new SplitterEnemy(this, x, y, false, hpScale);
        break;
      case 'small-splitter':
        enemy = new SplitterEnemy(this, x, y, true, hpScale);
        break;
      case 'chaser':
      default:
        enemy = new ChaserEnemy(this, x, y, hpScale);
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

  /**
   * 화상 잔불 동기화 — 타는 적에게만 작은 불씨 이미터를 붙이고, 꺼지면 뗀다.
   * "적이 계속 맞는 것처럼 보인다" 대신 "타고 있다"가 보이게 하는 원인 표시 (#216 항목5).
   * 적 하나에 붙는 국소 저강도 연출이라 장식 예산(vfxBudget)과는 무관하다.
   */
  private syncBurnEmbers(): void {
    for (const enemy of this.enemies) {
      const burning = enemy.alive && this.enemyAilments.isBurning(enemy);
      const existing = this.burnEmbers.get(enemy);
      if (burning && !existing) {
        const pal = ELEMENT_PALETTES.fire;
        const emitter = this.add.particles(enemy.x, enemy.y - 8, particleKey(this, PARTICLE_TEXTURES.glow), {
          speedY: { min: -36, max: -16 },
          speedX: { min: -10, max: 10 },
          scale: { start: 0.16, end: 0 },
          alpha: { start: 0.5, end: 0 },
          lifespan: 460,
          frequency: 140,
          quantity: 1,
          tint: [pal.core, pal.accent],
          blendMode: Phaser.BlendModes.ADD,
        });
        emitter.startFollow(enemy.view, 0, -8);
        this.burnEmbers.set(enemy, emitter);
      } else if (!burning && existing) {
        existing.destroy();
        this.burnEmbers.delete(enemy);
      }
    }
    // 목록에서 이미 빠진 적(사망 등)의 잔불 정리 — 죽은 컨테이너를 따라다니지 않게
    for (const [enemy, emitter] of this.burnEmbers) {
      if (!enemy.alive || !this.enemies.includes(enemy)) {
        emitter.destroy();
        this.burnEmbers.delete(enemy);
      }
    }
  }

  private dropBurnEmber(enemy: CombatEnemy): void {
    this.burnEmbers.get(enemy)?.destroy();
    this.burnEmbers.delete(enemy);
  }

  private clearDamageNumbers(): void {
    for (const { text } of this.damageNumbers.values()) text.destroy();
    this.damageNumbers.clear();
  }

  private clearBurnEmbers(): void {
    for (const emitter of this.burnEmbers.values()) emitter.destroy();
    this.burnEmbers.clear();
  }

  /** 화상 틱 펄스 — 틱 순간의 약한 불빛. 무음 틱의 "지금 피해가 들어갔다" 신호. */
  private showBurnTickPulse(enemy: CombatEnemy): void {
    if (!enemy.alive) return;
    const pal = ELEMENT_PALETTES.fire;
    const pulse = this.add.circle(enemy.x, enemy.y - 6, 9, pal.core, 0.4)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: pulse,
      scale: 1.7,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => pulse.destroy(),
    });
  }

  private updateEnemies(deltaSeconds: number): void {
    if (!this.playerState.alive) return;

    // burn(지속피해) 0.5초 틱 — 일반 피격 연출은 끈다(#216 항목5: 공격 이펙트가
    // 없는데 맞는 소리·모션이 나던 문제). 원인 표시는 잔불 이미터 + 약한 틱 펄스가 전담.
    this.enemyAilments.update(deltaSeconds, (enemy, damage) => {
      this.damageEnemy(
        enemy, damage, undefined, enemy.x, enemy.y, true, 'persistent', 0, 'status', 'status-tick',
      );
      this.showBurnTickPulse(enemy);
    });
    this.syncBurnEmbers();

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

      const applied = this.damagePlayer(enemy.contactDamage);
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
      // 미러 캐스트 — "기억 적응" 발표 직후, 플레이어의 최강 주문을 되돌려 영창한다.
      // 발표 텍스트가 스쳐도 이건 못 놓친다 — 내 주문이 그 모습 그대로 날아오니까.
      this.queueMirrorCast(boss);
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
      // ── 비전 마법 (bossArcana, 총괄 발안) — 보스도 영창한다 ──
      case 'arcane-cast':
        this.queueBossArcana();
        break;
      case 'shroud':
        this.castBossShroud();
        break;
      case 'pull':
        this.castBossPull();
        break;
      case 'mirror':
        // 페이즈3 순환 재발동 — 1회 제한을 넘되 재료·중복 검사는 그대로.
        this.queueMirrorCast(boss, true);
        break;
    }
  }

  /** 암전에서도 회피에 필수인 위험 예고만 어둠 위에 남긴다. */
  private dangerTelegraphDepth(): number {
    return this.blackoutCurseField ? 10 : -1;
  }

  private showBossVolleyTelegraph(boss: BossEnemy, projectileCount: number): void {
    this.bossVolleyTelegraph?.destroy();
    const offset = Math.random() * Math.PI * 2;
    this.bossVolleyAngles = Array.from(
      { length: projectileCount },
      (_, index) => offset + (Math.PI * 2 * index) / projectileCount,
    );
    const warning = this.add.graphics()
      .setDepth(this.dangerTelegraphDepth())
      .setBlendMode(Phaser.BlendModes.ADD);
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
      .setDepth(this.dangerTelegraphDepth());
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
    const warning = this.add.container(x, y, [outerRing]).setDepth(this.dangerTelegraphDepth());
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
      const particles = this.add.particles(0, 0, particleKey(this, PARTICLE_TEXTURES.glow), {
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

      // 지형 장벽도 적 투사체를 막는다 — 전장 장벽과 같은 스윕 판정을 재사용해
      // "벽 뒤에 숨는다"가 두 종류 장벽에서 똑같이 통한다.
      const blockedByTerrain = segmentBlocked(
        previous,
        { x: projectile.body.x, y: projectile.body.y },
        this.terrainBarriers,
        5,
      );
      if (blockedByTerrain) {
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
        const applied = this.damagePlayer(SHOOTER_CONFIG.bulletDamage);
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
      source: 'basic',
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
    source: DamageSource;
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
      source: options.source,
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
          missile.source,
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
    this.incantBands = document.getElementById('incant-bands')!;
    this.incantGuideEl = document.getElementById('incant-guide')!;

    // 재진입 대비 — 같은 참조를 제거 후 등록해 누적을 차단한다 (#216 P0 겹시전).
    // 첫 호출에선 remove가 no-op이라 안전하고, 몇 번 들어와도 리스너는 정확히 1쌍이다.
    this.incantBar.removeEventListener('input', this.onIncantInput);
    this.incantBar.removeEventListener('keydown', this.onIncantKeydown);
    this.incantBar.addEventListener('input', this.onIncantInput);
    this.incantBar.addEventListener('keydown', this.onIncantKeydown);
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
    if (
      this.activeRoomCurse?.kind === 'silence'
      && this.silenceCurseField
      && !this.silenceCurseField.contains(this.player.x, this.player.y)
    ) {
      this.audio.playSfx('fizzle');
      this.announceSystemMessage(
        '침묵 · 중앙의 결계 안에서만 영창할 수 있습니다',
        '#d0a8ff',
      );
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

  /**
   * 첫 영창 안내 — "무엇을 눌러 무엇을 입력하는가"를 처음 켠 사람에게 알린다.
   * 한 번이라도 성공적으로 영창했으면(localStorage) 다시는 뜨지 않는다.
   * 실패해도 이번 세션 재시작마다 다시 떠서, 놓쳐도 다음 기회에 안내한다.
   */
  private maybeShowOnboardingHint(): void {
    if (this.onboardingHintShown || this.hasOnboarded()) return;
    this.onboardingHintShown = true;
    this.incantGuide = {
      title: '한 문장이면 됩니다',
      lines: ['떠오르는 대로 적으면, 그게 곧 마법이 된다'],
    };
    // "방 1" 안내가 지나간 뒤 떠서, 조작 안내가 또렷하게 남도록 한다.
    this.time.delayedCall(900, () => {
      if (this.hasOnboarded() || this.incanting || this.casting) return;
      this.announceBanner({
        title: '⌨  ENTER 를 눌러 영창',
        lines: ['떠오르는 한 문장을 그대로 적으면, 그게 곧 마법이 된다'],
        color: 0x9ecbff,
        holdMs: 5200,
      });
    });
  }

  private static readonly ONBOARDED_KEY = 'incant:onboarded:v1';

  private hasOnboarded(): boolean {
    try {
      if (typeof localStorage === 'undefined') return false;
      return localStorage.getItem(ProtoScene.ONBOARDED_KEY) === '1';
    } catch {
      return false;
    }
  }

  private markOnboarded(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(ProtoScene.ONBOARDED_KEY, '1');
    } catch {
      /* localStorage 불가(사생활 모드 등) — 안내가 매번 떠도 치명적이지 않다 */
    }
  }

  /**
   * 마나 부족 안내 — 실제 비용을 공개해 가격 감각을 만들고,
   * 쿨다운마다 속삭임(저비용 영창) 존재를 가르친다. "약한 말은 싸다"는
   * 이 게임의 답인데 발견되지 않으면 없는 기능이다.
   */
  private announceManaShortage(cost: number): void {
    const held = Math.floor(this.playerState.mana);
    const hintDue = this.time.now - this.lastWhisperHintAt > 15000;
    if (hintDue) {
      this.lastWhisperHintAt = this.time.now;
      this.announceSystemMessage(
        `마나 부족 · 비용 ${cost} / 보유 ${held} — 작은 주문을 속삭여 보라`,
        '#ffd166',
        3000,
      );
      return;
    }
    this.announceSystemMessage(`마나 부족 · 비용 ${cost} / 보유 ${held}`, '#ffd166');
  }

  private openIncant(): void {
    this.audio.playSfx('incant-enter');
    this.incanting = true;
    this.timeScale = 0.1; // 슬로모션
    this.input.keyboard!.disableGlobalCapture();
    this.incantWrap.classList.add('active');
    this.incantWrap.classList.remove('judging');
    this.incantWrap.classList.toggle(
      'word-limit',
      this.activeRoomCurse?.kind === 'word-limit',
    );
    this.incantWrap.setAttribute('aria-hidden', 'false');
    this.incantBar.disabled = false;
    this.incantBar.value = '';
    // 온보딩: 열 때마다 예시 문장을 순환해 "이렇게 쓰면 된다"를 보여준다
    this.incantBar.placeholder = onboardingPlaceholderAt(this.incantOpenCount);
    this.incantOpenCount += 1;
    // 위계: 마나(예산) → 입력 → 대역(선택지) → 조작 안내. 종전에는 요금표와 조작 안내가
    // 12px 회색 한 줄에 뭉쳐 있어 둘 다 안 읽혔다 — 이제 요금표는 대역 칩이 맡는다.
    this.incantHint.textContent = this.activeRoomCurse?.kind === 'word-limit'
      ? '한글 6자 · 영문 10자 상당 — Enter 발동 · Esc 취소'
      : 'Enter 발동 · Esc 취소';
    this.incantChargeLabel.textContent = '시간 흐름 10%';
    this.renderIncantGuide();
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
    this.incantWrap.classList.remove(
      'active',
      'judging',
      'word-limit',
      'word-limit-over',
      'word-limit-blocked',
      'mana-dry',
    );
    this.incantWrap.setAttribute('aria-hidden', 'true');
    this.incantBar.disabled = false;
    this.incantBar.blur();
  }

  private updateIncantCharge(): void {
    // 마나는 두 경로 공통 — 금언 방에서도 예산은 마나다 (금언은 그 위에 얹힌 제약)
    this.incantState.textContent = `마나 ${Math.floor(this.playerState.mana)}`;
    this.incantWrap.classList.toggle(
      'mana-dry', reachableBand(Math.floor(this.playerState.mana)) === null,
    );
    if (this.activeRoomCurse?.kind === 'word-limit') {
      const cost = wordLimitCost(this.incantBar.value);
      const overBudget = cost > WORD_LIMIT_CURSE_CONFIG.budget;
      const percent = Math.min(
        100,
        Math.round((cost / WORD_LIMIT_CURSE_CONFIG.budget) * 100),
      );
      this.incantWrap.style.setProperty('--charge', `${percent}%`);
      this.incantWrap.classList.remove('word-limit-blocked');
      this.incantWrap.classList.toggle('word-limit-over', overBudget);
      this.incantHint.textContent = '한글 6자 · 영문 10자 상당 — Enter 발동 · Esc 취소';
      this.incantCount.textContent = `금언 ${cost} / ${WORD_LIMIT_CURSE_CONFIG.budget}`;
      this.incantChargeLabel.textContent = cost === 0
        ? '언령 대기'
        : overBudget
          ? '금언 초과'
          : cost >= WORD_LIMIT_CURSE_CONFIG.budget * 0.7
            ? '언령 한계 접근'
            : '언령 압축 중';
      return;
    }

    this.incantWrap.classList.remove('word-limit-over', 'word-limit-blocked');
    const length = Array.from(this.incantBar.value).length;
    this.incantCount.textContent = `${length}/60`;
    // 길이 기반 "공명" 게이지는 걷어냈다 — 위력은 심판이 문장의 구체성으로 매기는데
    // 글자수로 차오르는 게이지가 가장 밝게 빛나며 "길게 쓰면 세진다"를 가르치고 있었다.
    // 자리는 대역 칩(감당 가능 여부 = 거짓말하지 않는 정보)이 대신 쓴다.
    this.refreshIncantBands();
  }

  /**
   * 첫 영창 안내를 영창 창 안에 세운다.
   *
   * 배너가 아직 화면에 있으면 **지운다** — 남겨두면 어둠·블러 뒤에 흐릿하게 겹쳐 보여
   * 같은 글이 두 겹으로 읽힌다. 지우는 게 아니라 **자리를 옮기는** 것이다.
   */
  private renderIncantGuide(): void {
    const guide = this.incantGuide;
    if (!guide) {
      this.incantGuideEl.hidden = true;
      return;
    }
    if (this.activeBanner?.active) {
      this.activeBanner.destroy();
      this.activeBanner = null;
    }
    const title = document.createElement('div');
    title.className = 'incant-guide-title';
    title.textContent = guide.title;
    this.incantGuideEl.replaceChildren(title, ...guide.lines.map((text) => {
      const line = document.createElement('div');
      line.className = 'incant-guide-line';
      line.textContent = text;
      return line;
    }));
    this.incantGuideEl.hidden = false;
  }

  /** 첫 성공 영창 — 안내는 역할을 다했다. 배너·패널 양쪽에서 사라진다. */
  private clearIncantGuide(): void {
    this.incantGuide = null;
    if (this.incantGuideEl) this.incantGuideEl.hidden = true;
  }

  /**
   * 대역 칩 갱신 — 지금 마나로 어디까지 닿는지.
   *
   * 매번 다시 그리지 않고 첫 호출에만 만든 뒤 클래스만 토글한다 (영창 창은 자주 열린다).
   */
  private refreshIncantBands(): void {
    const mana = Math.floor(this.playerState.mana);
    const entries = bandAffordances(mana);
    const reach = reachableBand(mana);

    if (this.incantBands.childElementCount !== entries.length) {
      this.incantBands.replaceChildren(...entries.map((entry) => {
        const chip = document.createElement('div');
        chip.className = 'incant-band';
        chip.innerHTML = `<span class="incant-band-name">${entry.band.label}</span>`
          + `<span class="incant-band-cost">${entry.cost}</span>`
          + `<span class="incant-band-hint">${entry.band.hint}</span>`;
        return chip;
      }));
    }
    entries.forEach((entry, index) => {
      const chip = this.incantBands.children[index] as HTMLElement;
      chip.classList.toggle('locked', !entry.affordable);
      chip.classList.toggle('reach', reach?.key === entry.band.key);
    });

  }

  private blockWordLimitCast(): void {
    this.audio.playSfx('fizzle');
    this.incantHint.textContent = '금언 · 더 짧은 언령으로 압축하세요';
    this.incantWrap.classList.remove('word-limit-blocked');
    void this.incantWrap.offsetWidth;
    this.incantWrap.classList.add('word-limit-blocked');
    this.announceSystemMessage(
      '금언 · 더 짧은 언령으로 압축하세요',
      '#e3b4ff',
      2400,
    );
    this.focusIncantBar();
  }

  private clearWordLimitIncantStyle(): void {
    if (!this.incantWrap) return;
    this.incantWrap.classList.remove(
      'word-limit',
      'word-limit-over',
      'word-limit-blocked',
    );
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
    this.clearSequenceProgress();
    this.timeScale = 1;
    this.input.keyboard!.enableGlobalCapture();
    this.incantWrap.classList.remove(
      'active',
      'judging',
      'word-limit',
      'word-limit-over',
      'word-limit-blocked',
      'mana-dry',
    );
    this.incantWrap.setAttribute('aria-hidden', 'true');
    this.incantBar.disabled = false;
  }

  /**
   * 검증된 SpellPlan을 실행한다 — DEV 쇼케이스와 실판정 시퀀스의 공통 경로.
   * 마나(plan 단위 1회)·시퀀스 기록·각인 대표 투영·반복 페널티·무적/UX·실행을 한 번에.
   */
  private async runSequenceCast(
    rawPlan: SpellPlan,
    text: string,
    source: JudgeSource,
  ): Promise<void> {
    const plan = resolveSpellPlan(rawPlan);
    if (!this.playerState.trySpendMana(plan.manaCost)) {
      this.audio.playSfx('fizzle');
      this.announceManaShortage(plan.manaCost);
      return;
    }
    if (import.meta.env.DEV) {
      void postPlayLog({
        type: 'sequence_exec',
        input: text,
        source,
        fixture: source === 'local',
        name: plan.name,
        sequenceCount: plan.sequences.length,
        behaviorCount: plan.sequences.reduce(
          (sum, sequence) => sum + sequence.behaviors.length,
          0,
        ),
        durationMs: plan.sequences.reduce(
          (sum, sequence) => sum + sequence.durationMs,
          0,
        ),
        power: plan.power,
        manaCost: plan.manaCost,
      });
    }
    // 융합 게이지 — 시퀀스도 수동 영창이므로 충전한다 (방출 격상은 v1에선 단일 주문만)
    if (this.fusionGauge.charge(plan.manaCost)) {
      this.announceSystemMessage('융합의 힘이 응축됐다 — 두 원소를 담아 영창하라 (마나 무소모)', '#e2b7ff', 3400);
    }
    const sequenceElements = [...new Set(plan.sequences.flatMap((sequence) => (
      sequence.behaviors.flatMap(behaviorElements)
    )))];
    // 사용 기반 친화 성장 — 시퀀스도 수동 영창. 대표(첫) 원소만 올려 다원소 폭증 방지.
    if (sequenceElements[0]) {
      const grown = this.combatRunController.growAffinityFromUse(sequenceElements[0]);
      if (grown.added > 0) this.showAffinityGrowthFloat(sequenceElements[0], grown.total);
    }
    const sequenceHistoryEntry = this.spellHistory.recordSequence({
      rawText: text,
      name: plan.name,
      elements: sequenceElements,
      power: plan.power,
      cost: plan.manaCost,
      source,
      castAt: Date.now(),
    });
    // 주문 도감 — 다단계 주문도 "내가 쓴 마법"으로 새긴다
    recordCodexEntry(
      window.localStorage,
      codexEntryFromSequence(plan, sequenceElements[0] ?? 'light', Date.now()),
    );
    const engraveCandidate = sequenceEngraveCandidate(plan);
    if (engraveCandidate) {
      this.engraveManager.rememberManualCast(
        sequenceHistoryEntry.normalized,
        engraveCandidate,
      );
    }
    this.markOnboarded();
    this.clearIncantGuide();
    this.beginSequenceExecutionUx(plan);
    if (sequenceHistoryEntry.power < sequenceHistoryEntry.basePower) {
      const penaltyPct = Math.round(
        (1 - sequenceHistoryEntry.power / sequenceHistoryEntry.basePower) * 100,
      );
      this.announceSystemMessage(
        `REPEAT -${penaltyPct}% · 같은 영창은 힘을 잃는다`,
        '#ff9f43',
      );
    }
    await this.executeSpellSequencePlan(
      plan,
      plan.power > 0 ? sequenceHistoryEntry.power / plan.power : 1,
    );
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

      // 영창 시퀀스(복합 주문) — 판정이 plan을 실었고 기능 플래그가 켜져 있으면 시퀀스 런타임으로.
      // 플래그(VITE_SEQUENCE_JUDGE=0)로 언제든 v2 단일 경로로 즉시 복귀할 수 있다.
      if (this.sequenceJudgeEnabled && judgement.plan) {
        await this.runSequenceCast(judgement.plan, text, this.currentJudgeSource());
        return;
      }

      const spec = judgement.spell;
      // 필살기(융합 게이지) — 만충 + 이중 원소 판정이면 이 시전이 융합 방출로 격상된다.
      // 방출 시전은 충전하지 않는다(리셋 직후 자기 마나로 재충전 방지).
      //
      // **마나 검사보다 먼저** 판정한다(총괄 결정: 필살기는 마나 소모 없음).
      // 자원은 게이지 자체다 — 순서가 반대면 마나가 바닥일 때 만충 필살기가
      // 거부되는 모순이 생긴다. 다 떨어졌을 때 뒤집는 한 방이 필살기의 존재 이유다.
      const fusedSpec = this.fusionGauge.tryRelease(spec);
      // 감쇠 시전 — 마나 부족은 거부가 아니라 잦아든 주문 (바닥 미만일 때만 거부)
      const castPlan = fusedSpec
        ? { spend: 0, ratio: 1 }
        : degradedCastPlan(spec.cost, this.playerState.mana);
      if (!castPlan) {
        this.audio.playSfx('fizzle');
        this.announceManaShortage(spec.cost);
        return;
      }
      this.playerState.trySpendMana(castPlan.spend);

      if (!fusedSpec && this.fusionGauge.charge(castPlan.spend)) {
        this.announceSystemMessage(
          '융합의 힘이 응축됐다 — 두 원소를 담아 영창하라 (마나 무소모)',
          '#e2b7ff',
          3400,
        );
      }

      // 첫 성공 영창 — 이후 온보딩 안내는 다시 뜨지 않는다.
      this.markOnboarded();
      this.clearIncantGuide();

      // 바닥지형 정화 — 판정이 준 원소·효과가 이 방의 지형을 카운터하면 면역을 준다 (#239).
      // 융합본이 있으면 실제로 나가는 쪽(fusedSpec)의 원소로 판정한다.
      this.tryCleanseFloorHazard(fusedSpec ?? spec);

      const historyEntry = this.spellHistory.record({
        rawText: text,
        spell: spec,
        source: this.currentJudgeSource(),
        castAt: Date.now(),
      });
      this.engraveManager.rememberManualCast(historyEntry.normalized, spec);
      // 주문 도감 — 원판(판정) 스펙으로 새긴다 (감쇠·페널티 반영 전 = 발견의 기록)
      recordCodexEntry(window.localStorage, codexEntryFromSpec(spec, Date.now()));
      // 사용 기반 친화 성장 — 이 시전이 그 원소 친화를 조금 올린다 (소프트캡). 오른 값은 화면에.
      const affinityGrowth = this.combatRunController.growAffinityFromUse(spec.element_primary);
      if (affinityGrowth.added > 0) {
        this.showAffinityGrowthFloat(spec.element_primary, affinityGrowth.total);
      }
      const affinityBonus = this.combatRunController.state
        .elementalAffinity[spec.element_primary] ?? 0;
      // 런 반복 격상(#77): 회차가 쌓이면 과의존한 **폼**이 이번 런 전체에서 약화된다.
      // 원소가 아니라 폼이다(#171) — 다채로운 화염 마스터는 안 맞고, 같은 수를
      // 반복하는 사람만 맞는다. 프로필은 런 시작에 확정된 캐시를 쓴다.
      const escalationWeaken = this.runEscalation.weakenedForms.includes(spec.form)
        ? this.runEscalation.weakenMultiplier
        : 1;
      // 다양성 보너스(당근, #92): 최근과 다른 원소·폼이면 데미지↑. basePower 불변, 여기서만 곱한다.
      const priorCasts = this.spellHistory.allBehaviorUsages.slice(0, -1); // 방금 기록한 이번 행동 제외
      const diversity = diversityBonus(
        { element: spec.element_primary, form: spec.form },
        priorCasts.map((e) => ({ element: e.elementPrimary, form: e.form })),
      );
      // 융합 방출은 페널티·친화·감쇠 체인을 덮는 고정 최대치 — "최대 방출"의 약속
      // 각성 — 수동 경로이므로 auto=false. 인장은 시전마다 발치에 잠깐 새겨진다
      // (밝기가 아니라 형태로 구분 — 친화 VFX는 이미 강도 상한이다).
      const awakened = awakeningFor(this.awakenings, spec, false);
      if (awakened) {
        playAwakeningSigil(this, this.player.x, this.player.y, spec.element_primary, awakened);
      }
      const searing = awakened === 'searing';
      const effectiveSpec: SpellSpec = fusedSpec ?? {
        ...spec,
        status: searing ? searingStatus(spec) : spec.status,
        power: Math.round(
          spellPowerWithAffinity(historyEntry.power, affinityBonus)
          * escalationWeaken * diversity * this.playerState.damageOutMultiplier // empower 버프
          * castPlan.ratio, // 감쇠 시전 — 모자란 마나만큼 잦아든다
        ),
      };
      if (fusedSpec) this.playFusionRelease(fusedSpec);
      // [dev] 실뎀 breakdown 로깅 — "같은 속성 뎀감" 스택 진단용 (logs/play.jsonl, 읽기전용)
      if (import.meta.env.DEV) {
        const base = historyEntry.basePower;
        const bossResist = this.activeBossResistances.get(spec.element_primary) ?? 1;
        void postPlayLog({
          t: Math.round(this.time.now / 100) / 10,
          type: 'dmg',
          input: text,
          el: spec.element_primary,
          base,
          repeat: base > 0 ? Number((historyEntry.power / base).toFixed(2)) : 1,
          affinity: Number(affinityBonus.toFixed(2)),
          escalation: Number(escalationWeaken.toFixed(2)),
          diversity: Number(diversity.toFixed(2)),
          empower: Number(this.playerState.damageOutMultiplier.toFixed(2)),
          degraded: Number(castPlan.ratio.toFixed(2)),
          effective: effectiveSpec.power,
          bossResist: Number(bossResist.toFixed(2)),
          finalVsBoss: Math.round(effectiveSpec.power * bossResist),
        });
      }
      if (castPlan.ratio < 1) {
        this.announceSystemMessage(
          `마나가 모자라 주문이 잦아들었다 · 위력 ${Math.round(castPlan.ratio * 100)}%`,
          '#ffd166',
          2600,
        );
      }
      // 같은 폼을 계속 쓰면 매 시전 반복되므로 방마다 폼별 1회만 알린다
      if (escalationWeaken < 1 && !this.escalationNoticed.has(spec.form)) {
        this.escalationNoticed.add(spec.form);
        this.announceSystemMessage(
          `${FORM_LABELS[spec.form]} 약화 ${Math.round((1 - escalationWeaken) * 100)}% · 세계가 네 수를 읽었다`,
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

      if (
        this.activeRoomCurse?.kind === 'blackout'
        && this.blackoutCurseField
        && (effectiveSpec.element_primary === 'light' || effectiveSpec.element_primary === 'fire')
      ) {
        this.blackoutCurseField.illuminate();
      }
      this.tryApplyHeatwaveCooling([
        effectiveSpec.element_primary,
        effectiveSpec.element_secondary,
      ]);
      this.audio.playCast(effectiveSpec.element_primary);
      this.applySpellPalette(effectiveSpec);
      this.announceSpell(effectiveSpec);
      this.applySpellEffect(effectiveSpec);
      this.scheduleSpellEcho(effectiveSpec);
      this.playerState.startCastLock(); // 신속 영창 감소분 반영된 입력락
      this.playCastFlare();
    } finally {
      this.finishCastingUx();
    }
  }

  /**
   * 영창 에코 (제단 최상위 거래 #214) — 수동 단일 영창이 한 번 더 울린다.
   *
   * **시퀀스는 여기 안 온다.** 시퀀스는 executeSequenceForm 경로라 이 함수를 거치지
   * 않는다 — 다단 시퀀스가 통째로 반복되면 길고 정신없다(총괄 결정).
   *
   * 마나를 쓰지 않으므로 융합 게이지도 추가 충전되지 않는다(게이지는 소모 마나 기준).
   * 사용 친화도 오르지 않는다 — 한 번의 영창이지 두 번이 아니다.
   *
   * 확률은 **위쪽에만** 둔다: 1회는 확정이고 낮은 확률로 한 번 더 울린다.
   * 보상 추첨 난수(engraveRewardRand)를 쓰지 않는다 — 그걸 소비하면 같은 시드에서
   * 보상 3택이 달라져 재현성이 깨진다.
   */
  private scheduleSpellEcho(spec: SpellSpec): void {
    if (!this.echoUnlocked) return;
    const { delayMs, powerScale, extraChance, decorScales } = ALTAR_OFFER_CONFIG.echo;
    const count = 1 + (Math.random() < extraChance ? 1 : 0);
    for (let i = 1; i <= count; i += 1) {
      // 겹이 깊어질수록 옅어진다 — 원본 1.0 > 첫 에코 > 둘째 에코.
      // 같은 밝기로 세 발이 나가면 "왜 세 번인지" 읽히지 않는다(총괄 지적).
      const decorVfxScale = decorScales[i - 1] ?? decorScales[decorScales.length - 1];
      this.time.delayedCall(delayMs * i, () => {
        if (!this.scene?.isActive?.() || !this.playerState.alive) return;
        if (!this.isCombatActive()) return;
        this.applySpellEffect(
          { ...spec, power: Math.max(1, Math.round(spec.power * powerScale)) },
          undefined,
          false,
          // 친화 격상 연출도 함께 낮춘다 — 장식만 옅고 플러리시는 만개하면 어긋난다
          i,
          { decorVfxScale },
        );
        // 소리도 옅게 — 원본과 같은 크기로 울리면 "두 번 쐈다"로 들린다
        this.audio.playCast(spec.element_primary);
      });
    }
    if (count > 1) this.announceSystemMessage('메아리가 세 겹으로 울렸다', '#d0a8ff', 1800);
  }

  private beginSequenceExecutionUx(plan: ResolvedSpellPlan): void {
    this.timeScale = 1;
    this.input.keyboard!.enableGlobalCapture();
    this.incantWrap.classList.remove('active', 'judging');
    this.incantWrap.setAttribute('aria-hidden', 'true');
    this.incantBar.disabled = false;
    this.incantBar.blur();
    this.announceSequencePlan(plan);
    this.playCastFlare();
  }

  private announceSequencePlan(plan: ResolvedSpellPlan): void {
    const forms = plan.sequences.flatMap((sequence) => (
      sequence.behaviors.filter((behavior): behavior is FormBehavior => behavior.type === 'form')
    ));
    const elements = [...new Set(forms.flatMap((behavior) => (
      behavior.spec.element_secondary
        ? [behavior.spec.element_primary, behavior.spec.element_secondary]
        : [behavior.spec.element_primary]
    )))];
    const primary = forms[0]?.spec.element_primary ?? null;
    const { width, height } = this.scale;
    const colorHex = primary
      ? paletteColorToCss(ELEMENT_PALETTES[primary].core)
      : '#b7c8ff';
    const elementLabel = elements.length > 0 ? elements.join('+') : '무속성';
    const label = this.add.text(width / 2, height * 0.32, plan.name, {
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
    const meta = this.add.text(
      width / 2,
      height * 0.32 + 36,
      `${elementLabel} · sequence ${plan.sequences.length} · power ${plan.power}`,
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

  private async executeSpellSequencePlan(
    plan: ResolvedSpellPlan,
    repeatPowerScale = 1,
  ): Promise<void> {
    const targetState: SequenceTargetState = {
      lockedEnemy: null,
      lastTargetPoint: null,
    };
    // 오버랩 타임라인(총괄 발안): 이전 시퀀스 70% 시점에 다음 발동 — 행동이 끊기지
    // 않고 이어진다. 무적·진행바도 실효 시간 기준이라 화면·판정·보호가 전부 일치.
    const timeline = sequenceFlowTimeline(plan.sequences);
    const chainRoles = moveChainRoles(plan.sequences);
    this.beginSequenceProgress(plan, timeline);
    this.playerState.applyInvulnerability(timeline.totalMs / 1000);
    let blackoutIlluminated = false;
    let heatwaveCooled = false;

    for (const [sequenceIndex, sequence] of plan.sequences.entries()) {
      if (!this.playerState.alive || !this.isCombatActive()) break;
      this.refreshSequenceTarget(targetState);
      for (const behavior of sequence.behaviors) {
        if (
          !blackoutIlluminated
          && this.activeRoomCurse?.kind === 'blackout'
          && this.blackoutCurseField
          && behaviorUsesAnyElement(behavior, ['light', 'fire'])
        ) {
          this.blackoutCurseField.illuminate();
          blackoutIlluminated = true;
        }
        if (
          !heatwaveCooled
          && behaviorUsesAnyElement(behavior, ['water', 'ice', 'wind'])
        ) {
          heatwaveCooled = this.tryApplyHeatwaveCooling(behaviorElements(behavior));
        }
        if (behavior.type === 'move') {
          this.executeSequenceMove(
            behavior, sequence.durationMs, targetState, chainRoles[sequenceIndex] ?? 'solo',
          );
        } else if (behavior.type === 'form') {
          this.executeSequenceForm(behavior, targetState, repeatPowerScale);
        }
      }
      const waitMs = timeline.waitsMs[sequenceIndex];
      if (waitMs > 0) {
        await new Promise<void>((resolve) => {
          this.time.delayedCall(waitMs, resolve);
        });
      }
    }

    for (const tween of this.sequenceMoveTweens) tween.stop();
    this.sequenceMoveTweens = [];
    this.clearSequenceProgress();
  }

  private beginSequenceProgress(plan: ResolvedSpellPlan, timeline: SequenceFlowTimeline): void {
    this.sequenceProgressStartedAt = this.time.now;
    this.sequenceProgressDurationMs = Math.max(0, timeline.totalMs);
    this.sequenceProgressName = plan.name;
    // 경계 = 각 시퀀스의 **실제 발동 시점** (오버랩 반영) — 바와 화면이 어긋나지 않는다
    this.sequenceProgressBoundaries = [...timeline.boundaries];
    this.sequenceProgressGraphics.setVisible(timeline.totalMs > 0);
    this.sequenceProgressText.setVisible(timeline.totalMs > 0);
    this.updateSequenceProgress();
  }

  private clearSequenceProgress(): void {
    this.sequenceProgressDurationMs = 0;
    this.sequenceProgressBoundaries = [];
    this.sequenceProgressGraphics?.clear().setVisible(false);
    this.sequenceProgressText?.setVisible(false);
  }

  private updateSequenceProgress(): void {
    if (!this.sequenceProgressGraphics || this.sequenceProgressDurationMs <= 0) return;
    const elapsedMs = Math.max(0, this.time.now - this.sequenceProgressStartedAt);
    const remainingMs = Math.max(0, this.sequenceProgressDurationMs - elapsedMs);
    const remainingRatio = Phaser.Math.Clamp(
      remainingMs / this.sequenceProgressDurationMs,
      0,
      1,
    );
    const width = 420;
    const height = 10;
    const x = this.scale.width / 2 - width / 2;
    const y = this.scale.height - 70;
    const g = this.sequenceProgressGraphics.clear();
    g.fillStyle(0x06091a, 0.92).fillRoundedRect(x - 4, y - 4, width + 8, height + 8, 8);
    g.lineStyle(1, 0x596ba8, 0.8).strokeRoundedRect(x - 4, y - 4, width + 8, height + 8, 8);
    g.fillStyle(0x20294f, 1).fillRoundedRect(x, y, width, height, 5);
    if (remainingRatio > 0) {
      const fillColor = remainingRatio <= 0.2 ? 0xf7d774 : 0x8fa4ff;
      g.fillStyle(fillColor, 1).fillRoundedRect(x, y, width * remainingRatio, height, 5);
    }
    g.lineStyle(1, 0xdce4ff, 0.5);
    for (const boundary of this.sequenceProgressBoundaries) {
      const boundaryX = x + width * boundary;
      g.lineBetween(boundaryX, y - 2, boundaryX, y + height + 2);
    }
    this.sequenceProgressText.setText(
      `${this.sequenceProgressName} · 영창 유지 ${Math.max(0, remainingMs / 1000).toFixed(1)}초`,
    );
    if (remainingMs <= 0) this.clearSequenceProgress();
  }

  private refreshSequenceTarget(state: SequenceTargetState): void {
    if (state.lockedEnemy?.alive) {
      state.lastTargetPoint = new Phaser.Math.Vector2(state.lockedEnemy.x, state.lockedEnemy.y);
      return;
    }
    if (!state.lockedEnemy) return;
    const point = state.lastTargetPoint
      ?? new Phaser.Math.Vector2(state.lockedEnemy.x, state.lockedEnemy.y);
    state.lockedEnemy = this.nearestEnemyFrom(point.x, point.y);
    if (state.lockedEnemy) {
      state.lastTargetPoint = new Phaser.Math.Vector2(state.lockedEnemy.x, state.lockedEnemy.y);
    }
  }

  private executeSequenceForm(
    behavior: FormBehavior,
    targetState: SequenceTargetState,
    repeatPowerScale: number,
  ): void {
    const { spec: baseSpec, tuning } = behavior;
    const priorUsages = this.spellHistory.allBehaviorUsages;
    const affinityBonus = this.combatRunController.state
      .elementalAffinity[baseSpec.element_primary] ?? 0;
    const escalationWeaken = this.runEscalation.weakenedForms.includes(baseSpec.form)
      ? this.runEscalation.weakenMultiplier
      : 1;
    const diversity = diversityBonus(
      { element: baseSpec.element_primary, form: baseSpec.form },
      priorUsages.map((entry) => ({ element: entry.elementPrimary, form: entry.form })),
    );
    const spec: SpellSpec = {
      ...baseSpec,
      status: [...baseSpec.status],
      power: Math.round(
        spellPowerWithAffinity(baseSpec.power * repeatPowerScale, affinityBonus)
        * escalationWeaken
        * diversity
        * this.playerState.damageOutMultiplier,
      ),
    };
    this.spellHistory.recordBehaviorUsage(baseSpec, Date.now());
    if (escalationWeaken < 1 && !this.escalationNoticed.has(baseSpec.form)) {
      this.escalationNoticed.add(baseSpec.form);
      this.announceSystemMessage(
        `${FORM_LABELS[baseSpec.form]} 약화 ${Math.round((1 - escalationWeaken) * 100)}% · 세계가 네 수를 읽었다`,
        '#b18cff',
      );
    }
    this.audio.playCast(spec.element_primary);
    this.applySpellPalette(spec);
    const options: SpellExecutionOptions = {
      sequenceTarget: targetState,
      damageScale: tuningScale(tuning, 'damage'),
      rangeScale: tuningScale(tuning, 'range'),
      radiusScale: tuningScale(tuning, 'radius'),
      controlDurationScale: tuningScale(tuning, 'duration'),
      controlStrengthScale: tuningScale(tuning, 'strength'),
      shieldAmountScale: tuningScale(tuning, 'amount'),
      onAffectEnemy: (enemy) => {
        if (targetState.lockedEnemy?.alive) return;
        targetState.lockedEnemy = enemy;
        targetState.lastTargetPoint = new Phaser.Math.Vector2(enemy.x, enemy.y);
      },
    };
    this.applySpellEffect(spec, undefined, false, 0, options);
  }

  private executeSequenceMove(
    behavior: MoveBehavior,
    durationMs: number,
    targetState: SequenceTargetState,
    chainRole: MoveChainRole = 'solo',
  ): void {
    const from = new Phaser.Math.Vector2(this.player.x, this.player.y);
    const livingEnemies = this.enemies.filter((enemy) => enemy.alive);
    const targetEnemy = targetState.lockedEnemy?.alive
      ? targetState.lockedEnemy
      : behavior.destination === 'random-enemy' && livingEnemies.length > 0
        ? Phaser.Utils.Array.GetRandom(livingEnemies)
        : this.nearestEnemy();
    const targetPoint = targetEnemy
      ? new Phaser.Math.Vector2(targetEnemy.x, targetEnemy.y)
      : from.clone().add(this.lastMoveDir.clone().scale(180));
    const baseDirection = targetPoint.clone().subtract(from);
    if (baseDirection.lengthSq() === 0) baseDirection.copy(this.lastMoveDir);
    if (baseDirection.lengthSq() === 0) baseDirection.set(0, -1);
    baseDirection.normalize();

    let destination: Phaser.Math.Vector2;
    const requestedDistance = Math.min(
      SEQUENCE_PLAN_LIMITS.maxDirectionalMoveDistance,
      Math.max(0, behavior.distance ?? 180),
    );
    switch (behavior.destination) {
      case 'cast-point':
      case 'random-enemy':
        destination = targetPoint;
        break;
      case 'arena-center':
        destination = new Phaser.Math.Vector2(
          this.worldBounds.centerX,
          this.worldBounds.centerY,
        );
        break;
      case 'random-direction':
        destination = from.clone().add(new Phaser.Math.Vector2(1, 0)
          .rotate(Phaser.Math.FloatBetween(-Math.PI, Math.PI))
          .scale(requestedDistance));
        break;
      case 'custom-vector': {
        // 화면 절대 방향(위=0 기준 시계방향). 표적 위치와 무관 — "왼쪽"은 항상 화면 왼쪽.
        // (기존엔 baseDirection(표적 방향) 기준 상대각이라 적 위치에 따라 방향이 어긋났다.)
        const dir = screenDirectionFromAngle(behavior.angle ?? 0);
        destination = from.clone().add(
          new Phaser.Math.Vector2(dir.x, dir.y).scale(requestedDistance),
        );
        break;
      }
      case 'away-from-target':
        destination = from.clone().subtract(baseDirection.clone().scale(requestedDistance));
        break;
      case 'cast-direction':
      case 'target-direction':
      default:
        destination = from.clone().add(baseDirection.scale(requestedDistance));
        break;
    }
    destination.set(
      Phaser.Math.Clamp(destination.x, this.worldBounds.left + 22, this.worldBounds.right - 22),
      Phaser.Math.Clamp(destination.y, this.worldBounds.top + 22, this.worldBounds.bottom - 22),
    );

    this.lastMoveDir.copy(destination).subtract(from).normalize();

    if (durationMs <= 0) {
      // 즉시 이동은 예외적으로 잔여 트윈을 멈춘다 — 안 멈추면 다음 프레임에
      // 살아 있는 이전 트윈이 순간이동을 도로 덮어쓴다.
      for (const tween of this.sequenceMoveTweens) tween.stop();
      this.sequenceMoveTweens = [];
      this.player.setPosition(destination.x, destination.y);
      return;
    }
    // 체인 이징 — 이동이 이어질 자리는 끝에서 멈추지 않는다 (moveChainRoles 주석 참조).
    // 인계는 오버랩 70% 시점에 일어나므로, lead/mid는 그 시점에 아직 고속이어야
    // 다음 move가 속도감을 이어받는다. easeInOut 연쇄는 "슥—뚝—슥"이 된다.
    const chainEase = chainRole === 'lead'
      ? 'Sine.easeIn'
      : chainRole === 'mid'
        ? 'Linear'
        : chainRole === 'tail'
          ? 'Sine.easeOut'
          : 'Sine.easeInOut';
    const tween = this.tweens.add({
      targets: this.player,
      x: destination.x,
      y: destination.y,
      duration: durationMs,
      ease: chainEase,
      onUpdate: (activeTween) => {
        if (!this.playerState.alive || !this.isCombatActive()) activeTween.stop();
      },
      onComplete: () => {
        this.sequenceMoveTweens = this.sequenceMoveTweens.filter((t) => t !== tween);
      },
      onStop: () => {
        this.sequenceMoveTweens = this.sequenceMoveTweens.filter((t) => t !== tween);
      },
    });
    this.sequenceMoveTweens.push(tween);
  }

  private applySpellEffect(
    spec: SpellSpec,
    origin?: Phaser.Math.Vector2,
    auto = false,
    vfxTierReduction = 0,
    options?: SpellExecutionOptions,
  ): void {
    const from = origin?.clone()
      ?? new Phaser.Math.Vector2(this.player.x, this.player.y - 20);
    if (spec.effect === 'heal') {
      const healed = this.playerState.heal(spellHealFromPower(spec.power));
      this.announceSystemMessage(`회복 +${Math.round(healed)} HP`, '#72f1a8');
      return;
    }
    // 전장 장벽은 보호막보다 먼저 — "장벽으로 길을 막는다"를 자기 보호막으로 삼키지 않는다.
    if (isBattlefieldWall(spec)) {
      this.createWall(from, spec, options);
      return;
    }
    if (spec.effect === 'shield') {
      const shielded = this.playerState.addShield(
        spellShieldFromPower(spec.power) * (options?.shieldAmountScale ?? 1),
      );
      this.announceSystemMessage(`보호막 +${Math.round(shielded)}`, UI_SEMANTIC.shield);
      return;
    }
    if (spec.effect === 'buff') {
      this.castSelfBuff(spec);
      return;
    }
    if (spec.form === 'orbit' && (spec.effect === 'damage' || spec.effect === 'control')) {
      this.createOrbit(spec, options);
      return;
    }
    if (spec.effect === 'control') {
      this.castControlSpell(from, spec, auto, vfxTierReduction, options);
      return;
    }
    if (spec.effect === 'summon') {
      this.createSummon(spec);
      return;
    }

    const preferredTarget = options?.sequenceTarget?.lockedEnemy?.alive
      ? options.sequenceTarget.lockedEnemy
      : null;
    const chainCandidates = this.enemies.filter((enemy) => enemy.alive);
    const chainTargets = spec.form === 'chain'
      ? preferredTarget
        ? selectChainTargetsFromFirst(preferredTarget, chainCandidates)
        : selectChainTargets(from.x, from.y, chainCandidates)
      : [];
    const target = spec.form === 'chain'
      ? chainTargets[0] ?? null
      : preferredTarget ?? this.nearestEnemy();
    const to = preferredTarget
      ? new Phaser.Math.Vector2(preferredTarget.x, preferredTarget.y)
      : this.spellTargetPoint(from, spec, target);
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
      // 자동 시전은 셰이크를 막는다(4초마다 흔들리면 피로하다). 단 **진화 각인만**
      // 예외다 — auto인데 연출 격하가 0인 조합은 진화뿐이라 그걸로 판별한다.
      // 진화는 huge라 spellRenderer가 셰이크 등급을 이미 한 단계 올려놨는데,
      // auto 전체를 막는 바람에 그 격상이 사장돼 있었다.
      allowCameraShake: !auto || vfxTierReduction === 0,
      // 플레이어 장식 VFX 중첩 예산 참여 (#216 P0-1) — 자동 시전은 추가 감쇠.
      // 보스 시전은 이 필드를 안 넘겨 면제된다(위험구역은 정보, 항상 최대 밝기).
      // options로 명시하면 그 값이 이긴다 — 에코가 원본보다 투명하게 나가는 경로.
      decorVfxScale: options?.decorVfxScale ?? (auto ? VFX_BUDGET_CONFIG.autoCastScale : 1),
      damageScale: options?.damageScale,
      rangeScale: options?.rangeScale,
      radiusScale: options?.radiusScale,
      // 친화 격상 연출(영창가 빌드 동기) — 위력·판정 불변, 순수 오버레이
      vfxIntensity: reducedAffinityVfxIntensity(
        this.combatRunController.state.elementalAffinity[spec.element_primary] ?? 0,
        vfxTierReduction,
      ),
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
      shouldResolveImpact: () => {
        const state = this.combatRunController.state;
        return state.phase === 'combat' && state.roomIndex === castRoomIndex;
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
          vfxTierReduction,
          options?.onAffectEnemy,
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
        // 진화 각인의 3발은 **서로 다른 적**을 문다. Lv3는 한 놈에게 2발을 박아
        // 잡몹이 먼저 죽으면 나머지가 오버킬로 낭비됐다. 총피해는 그대로고
        // 분배만 달라진다 — 적이 하나면 자동으로 기존 동작으로 수렴한다.
        // 지연 발마다 시점이 다르므로 반드시 이 클로저 **안에서** 다시 고른다.
        const shotIndex = Math.round(
          request.delaySeconds / ENGRAVE_CONFIG.secondShotDelaySeconds,
        );
        const spread = request.evolved ? this.nthNearestEnemy(shotIndex) : null;
        // 자동 시전은 연출을 한 단계 깎아 화면을 덜 어지럽힌다. 진화 각인만 예외로
        // 깎지 않는다 — "진화하면 확연히 다르다"를 매 발동마다 보여주는 자리다.
        this.applySpellEffect(
          request.spell,
          undefined,
          true,
          request.evolved ? 0 : 1,
          spread ? { sequenceTarget: { lockedEnemy: spread, lastTargetPoint: null } } : undefined,
        );
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
        this.applySpellEffect(request.spell, origin, true, 1);
        continue;
      }
      if (request.kind === 'heal') {
        const amount = this.playerState.heal(request.amount);
        if (amount > 0) this.announceSystemMessage(`치유 정령 · HP +${Math.round(amount)}`, '#72f1a8');
        continue;
      }
      const amount = this.playerState.addShield(request.amount);
      if (amount > 0) this.announceSystemMessage(`수호 정령 · 보호막 +${Math.round(amount)}`, UI_SEMANTIC.shield);
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

  private createWall(
    from: Phaser.Math.Vector2,
    spec: SpellSpec,
    options?: SpellExecutionOptions,
  ): void {
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
    // 형상 DSL(L3 확장) — LLM이 모양을 설계하면 그대로, 없으면 기존 원호
    const points = shapedWallPoints(
      from,
      target ? { x: target.x, y: target.y } : null,
      spec.size,
      options?.rangeScale,
      spec.shape,
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
      remainingSeconds: wallDurationSeconds(spec.speed)
        * (options?.controlDurationScale ?? 1),
      contactedEnemies: new Set(),
      slowedBosses: new Set(),
      options,
    };
  }

  private createOrbit(spec: SpellSpec, options?: SpellExecutionOptions): void {
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
      durationSeconds: ORBIT_CONFIG.durationSeconds * (options?.controlDurationScale ?? 1),
      radiusScale: options?.radiusScale ?? 1,
      options,
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
    if (orbit.elapsedSeconds >= orbit.durationSeconds) {
      this.clearActiveOrbit();
      return;
    }
    orbit.angle += orbitAngularVelocity(orbit.spec.speed) * deltaSeconds;
    const center = { x: this.player.x, y: this.player.y - 8 };
    orbit.views.forEach((view, index) => {
      const point = orbitPoint(
        center,
        orbit.angle,
        index,
        orbit.views.length,
        orbit.radiusScale,
      );
      view.setPosition(point.x, point.y);
      for (const enemy of [...this.enemies]) {
        if (!enemy.alive) continue;
        if (Phaser.Math.Distance.Between(point.x, point.y, enemy.x, enemy.y)
          > ORBIT_CONFIG.contactRadius + enemy.collisionRadius) continue;
        if (!repeatHitReady(orbit.lastHitAt.get(enemy), orbit.elapsedSeconds)) continue;
        orbit.lastHitAt.set(enemy, orbit.elapsedSeconds);
        if (orbit.spec.effect === 'control') {
          this.applyPersistentControl(
            enemy,
            orbit.spec,
            orbit.options,
            this.player.x,
            this.player.y,
          );
        } else {
          const damage = spellImpactDamageFromPower(
            orbit.spec.power,
            ORBIT_CONFIG.damageMultiplier * (orbit.options?.damageScale ?? 1),
          );
          const damaged = this.damageEnemy(
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
          if (damaged) orbit.options?.onAffectEnemy?.(enemy);
          this.applyOnHitStatuses(enemy, orbit.spec);
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
        WALL_CONFIG.bossSlowDurationSeconds * (wall.options?.controlDurationScale ?? 1),
        Phaser.Math.Clamp(
          WALL_CONFIG.bossSlowMovementMultiplier
            / (wall.options?.controlStrengthScale ?? 1),
          0.2,
          0.9,
        ),
      );
    }
    if (wall.contactedEnemies.has(enemy)) return;
    wall.contactedEnemies.add(enemy);
    if (wall.spec.effect === 'control') {
      if (enemy.kind !== 'boss') {
        this.applyPersistentControl(
          enemy,
          wall.spec,
          wall.options,
          this.player.x,
          this.player.y,
        );
      }
      wall.options?.onAffectEnemy?.(enemy);
      return;
    }
    const damage = spellImpactDamageFromPower(
      wall.spec.power,
      WALL_CONFIG.damageMultiplier * (wall.options?.damageScale ?? 1),
    );
    const damaged = this.damageEnemy(
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
    if (damaged) wall.options?.onAffectEnemy?.(enemy);
    this.applyOnHitStatuses(enemy, wall.spec);
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
        this.playEvolutionBurst(data.elements[0] ?? evolved.spell.element_primary);
        this.announceBanner({ title: `각인 진화 — 『${name}』`, color: 0xffd166, holdMs: 2800 });
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
        this.playEvolutionBurst(data.elements[0]);
        this.announceBanner({ title: `정령 융합 — 『${name}』`, color: 0xffd166, holdMs: 2800 });
      }
    }
  }

  /**
   * 진화·융합 순간 연출 — 각인이 다시 새겨지는 한 컷.
   *
   * 이전엔 텍스트 한 줄이 전부라, Lv3 + 동일 원소 친화까지 모아 얻은 보상인데도
   * 아무 일도 안 일어난 것처럼 보였다. 룬 링이 조여들었다 터지며 플레이어에게
   * 각인된다 — 수렴은 참격 수렴선과 같은 어휘다(같은 게임의 같은 문법).
   */
  private playEvolutionBurst(element: SpellElement): void {
    // applyEvolution은 LLM 작명을 **await** 한다(최대 수 초). 그 사이 사망·재시작으로
    // 씬이 내려가면 여기 도달할 때 player가 이미 없다 — 실제로 그렇게 터뜨려 봤다.
    if (!this.scene?.isActive?.() || !this.player) return;
    const pal = ELEMENT_PALETTES[element];
    const { x, y } = this.player;
    const ring = this.add.graphics().setDepth(9)
      .setBlendMode(Phaser.BlendModes.ADD);
    const state = { t: 0 };
    this.tweens.add({
      targets: state,
      t: 1,
      duration: 620,
      ease: 'Cubic.easeIn',
      onUpdate: () => {
        ring.clear();
        // 3중 룬 링이 서로 다른 속도로 조여든다 — 하나면 그냥 원이 줄어드는 것으로 보인다.
        for (let i = 0; i < 3; i += 1) {
          const phase = Phaser.Math.Clamp(state.t * (1 + i * 0.22), 0, 1);
          const radius = 150 * (1 - phase) + 26;
          ring.lineStyle(3 - i * 0.6, i === 0 ? pal.accent : pal.core, 0.9 * (1 - phase * 0.5));
          ring.strokeCircle(x, y - 20, radius);
        }
      },
      onComplete: () => {
        ring.destroy();
        // 조여든 힘이 터져 나온다 — 각인이 완성된 순간
        const burst = this.add.particles(x, y - 20, particleKey(this, PARTICLE_TEXTURES.glow), {
          speed: { min: 90, max: 300 },
          scale: { start: 0.85, end: 0 },
          lifespan: 620,
          quantity: 46,
          tint: [pal.core, pal.accent, pal.glow],
          blendMode: Phaser.BlendModes.ADD,
          emitting: false,
        });
        burst.explode();
        this.time.delayedCall(900, () => burst.destroy());
        requestCameraShake(this, 'medium', 1.2);
      },
    });
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
    else if (this.casting && this.sequenceProgressDurationMs > 0) actionState = 'SEQUENCE';
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
    const heatwaveDamaging = this.activeRoomCurse?.kind === 'heatwave'
      && isHeatwaveDamaging({
        graceRemaining: this.heatwaveGraceRemaining,
        immunityRemaining: this.heatwaveImmunityRemaining,
      });
    // 라벨(HP/MANA/SHIELD)이 왼쪽에 따로 있으므로 수치만 적는다. 우측 정렬이라
    // 자리수가 늘어도 왼쪽으로 자라 바를 침범하지 않는다 — padStart 정렬이 필요 없다.
    this.hpText
      .setText(`${hp}/${this.playerState.maxHp}`)
      .setColor(heatwaveDamaging ? '#e0a860' : UI_SEMANTIC.hp);
    this.manaText.setText(`${mana}/${this.playerState.maxMana}`);
    this.shieldText.setText(`${shield}/${this.playerState.maxHp}`);
    this.drawBuildChips();
    // 활성 자기 강화 — 매 프레임 남은 시간 갱신, 없으면 빈 줄
    const buffs = this.playerState.activeBuffs();
    if (buffs.length === 0) {
      this.buffStatusText.setText('');
    } else {
      this.buffStatusText
        .setText(buffs.map((b) => formatSelfBuffStatus(b.kind, b.multiplier, b.remaining)).join('  '))
        .setColor(paletteColorToCss(selfBuffColor(buffs[0].kind)));
    }
    this.drawHudBars();
    // ROOM은 종전에 별도 DOM 칩(runHud)이었다. 우상단이 3단(칩·패널·미니맵)이 되어
    // 이 패널 첫 줄로 합쳤다 (총괄 지적) — 같은 정보군을 두 판에 나눌 이유가 없다.
    const roomLine = `ROOM ${runState.roomIndex}/${runState.maxRooms}`;
    // 위험지대 정화 — **지형이 깔린 방에서만** 한 줄 붙는다 (없으면 null).
    // HUD 박스가 아니라 여기인 이유: HUD는 높이가 고정이고 친화 바·쿨다운 바가
    // `HUD.y + HUD.height` 기준이라 행을 늘리면 전부 밀린다(총괄이 제보한 겹침과 같은
    // 부류). 우측 패널은 이미 방 단위 정보를 담고 내용에 맞춰 늘어난다.
    const cleanseLine = cleanseReadoutLine(
      this.floorHazardPlayer,
      this.presentFloorHazardKinds(),
    );
    const withCleanse = (lines: readonly string[]): string =>
      (cleanseLine ? [...lines, cleanseLine] : [...lines]).join('\n');
    if (runState.phase === 'run-over') {
      this.waveText.setText(withCleanse([roomLine, 'RUN COMPLETE']));
    } else if (runState.phase === 'reward-select') {
      this.waveText.setText(withCleanse([roomLine, 'ROOM CLEAR']));
    } else if (runState.phase === 'room-transition') {
      this.waveText.setText(withCleanse([roomLine, `NEXT ROOM ${runState.roomIndex + 1}`]));
    } else if (this.isBossEncounter()) {
      const boss = this.enemies.find((enemy) => enemy.kind === 'boss');
      // 저항을 상시 노출한다 — 보스 링 색만으로는 "무엇이 안 통하는지" 알 수 없다.
      // 단, **마스터리로 관통한 원소는 저항으로 적지 않는다**(#171) — 실제론 온전히
      // 들어가는데 화면이 "안 통한다"고 말하면 가장 키운 원소를 버리게 된다.
      const readout = bossResistanceReadout(
        this.sortedBossResistanceEntries().map(([element, multiplier]) => ({
          element,
          multiplier,
          affinity: this.combatRunController.state.elementalAffinity[element] ?? 0,
        })),
        RESISTANCE.masteryImmunityAffinity,
      );
      // 한 줄에 한 사실 — 적 수를 저항 목록 꼬리에 붙이면 저항 정보처럼 읽힌다
      const status = boss
        ? `BOSS ${Math.ceil(boss.hp)}/${boss.maxHp}  ·  ENEMIES ${this.enemies.length}`
        : 'BOSS';
      this.waveText.setText(withCleanse([roomLine, ...bossResistanceLines(status, readout)]));
    } else if (this.rewardlessNodeKind()) {
      // 무전투 방 — 웨이브가 없으니 "NEXT WAVE 0.0s"가 뜨면 안 된다
      this.waveText.setText(withCleanse([
        roomLine,
        this.rewardlessNodeKind() === 'altar' ? '제단' : '보물방',
      ]));
    } else if (this.waveManager.phase === 'waiting') {
      this.waveText.setText(withCleanse([
        roomLine,
        `NEXT WAVE ${this.waveManager.delayRemaining.toFixed(1)}s`,
      ]));
    } else {
      this.waveText.setText(withCleanse([
        roomLine,
        `WAVE ${this.waveManager.currentWaveNumber}/${this.waveManager.totalWaves}`
        + `  ·  ENEMIES ${this.enemies.length}`,
      ]));
    }
  }

  /**
   * 빌드 요약 — 각인·정령·주문서를 각 한 줄로.
   * 슬롯이 비어 있어도 `0/2`를 보여준다: "채울 수 있는 자리가 있다"는 정보 자체가
   * 보상 선택의 근거가 되기 때문이다.
   */
  /**
   * 보상 카드의 폼 글리프 해석 — runUiBinding이 주입받아 쓴다 (main.ts에서 배선).
   * 계약(RewardOption)에는 폼이 없고 spellKey/spiritId만 있으므로, 키→스펙을 아는
   * 씬이 여기서 풀어준다. 폼을 못 찾으면 null → 카드는 기존 원형 그대로.
   */
  rewardFormFor(option: RewardOption): SpellForm | null {
    if (option.engrave) {
      const slot = this.engraveManager.entries
        .find((e) => e.spellKey === option.engrave!.spellKey);
      return slot?.spell.form
        ?? this.engraveManager.candidateSpell(option.engrave.spellKey)?.form
        ?? null;
    }
    if (option.evolve?.target === 'engrave' && option.evolve.engraveKey) {
      const key = option.evolve.engraveKey;
      return this.engraveManager.entries.find((e) => e.spellKey === key)?.spell.form ?? null;
    }
    // 정령·융합은 폼이 아니라 역할이 정체성이라 글리프를 붙이지 않는다 (원형 유지)
    return null;
  }

  /**
   * 빌드 칩 생성 — 우하단 2×2. 앵커 (width-20, height-26)는 그대로 유지한다:
   * 보스 미러캐스트 예고가 화면 바깥 26px 링을 채우므로 이보다 모서리로 밀 수 없다.
   */
  private createBuildChips(width: number, height: number): void {
    const right = width - 20;
    const bottom = height - 26;
    const span = BUILD_CHIP.size * 2 + BUILD_CHIP.gap;
    this.buildChipRoot = this.add.container(right - span, bottom - span)
      .setScrollFactor(0)
      .setDepth(100);
    // 그래픽은 컨테이너 로컬 좌표로 그린다 — 리사이즈 시 컨테이너만 옮기면 된다
    this.buildChipGraphics = this.add.graphics();
    this.buildChipRoot.add(this.buildChipGraphics);

    this.buildChipIcons = [];
    this.buildChipZones = [];
    for (let i = 0; i < 4; i += 1) {
      const { x, y } = this.chipCenter(i);
      const icon = this.add.image(x, y, formGlyphTextureKey('bolt'))
        .setDisplaySize(BUILD_CHIP.glyph, BUILD_CHIP.glyph)
        .setVisible(false);
      this.buildChipRoot.add(icon);
      this.buildChipIcons.push(icon);
      // 호버 판정은 별도 Zone — Graphics는 히트영역이 없고, Zone이면 칩 모양과
      // 무관하게 안정적으로 잡힌다. 검사 모드에서만 활성화한다.
      const zone = this.add.zone(x, y, BUILD_CHIP.size, BUILD_CHIP.size)
        .setScrollFactor(0)
        .setDepth(100);
      this.buildChipRoot.add(zone);
      zone.on('pointerover', () => { this.hoveredChipIndex = i; this.renderBuildInspect(); });
      zone.on('pointerout', () => {
        if (this.hoveredChipIndex === i) this.hoveredChipIndex = -1;
        this.renderBuildInspect();
      });
      this.buildChipZones.push(zone);
    }

    this.createPauseMenu(width, height);

    // 검사 모드 오버레이 — 평소엔 완전히 숨는다(전투 시야 점유 0)
    this.buildInspectPlate = this.add.graphics().setScrollFactor(0).setDepth(103).setVisible(false);
    this.buildInspectText = this.add.text(0, 0, '', {
      fontFamily: '"Noto Serif KR", Consolas, monospace',
      fontSize: '12px',
      color: UI_COLOR.text,
      align: 'left',
      lineSpacing: 4,
      wordWrap: { width: BUILD_CHIP.tooltipWidth - 20, useAdvancedWrap: true },
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(104).setVisible(false);
  }

  /**
   * 일시정지 메뉴 — ESC 검사 모드의 전역 신호 (총괄 피드백: "멈춘 게 티가 나야 한다").
   *
   * 암막은 **깊이 97**이다: 미러캐스트 경고(96) 위, HUD(99+) 아래. 그래서 게임 월드만
   * 어두워지고 HUD·빌드 칩은 밝게 남는다 — "일시정지 메뉴 + 내 빌드 점검"이 한 화면에
   * 들어가고, 중앙 메뉴가 칩 검사를 가리지 않는다.
   */
  private createPauseMenu(width: number, height: number): void {
    // 밝기 막 — 깊이 98(월드·암막 위, HUD 아래)이라 어둡게 해도 HUD·칩은 읽힌다
    this.brightnessVeil = this.add.graphics().setScrollFactor(0).setDepth(98).setVisible(false);
    this.pauseDim = this.add.graphics().setScrollFactor(0).setDepth(97).setVisible(false);
    this.pauseDim.fillStyle(hex('#06050a'), 0.62);
    this.pauseDim.fillRect(0, 0, width, height);

    this.pauseMenuPlate = this.add.graphics().setScrollFactor(0).setDepth(105).setVisible(false);
    this.pauseMenuTitle = this.add.text(width / 2, height * 0.3, '일시정지', {
      fontFamily: '"Noto Serif KR", Georgia, serif',
      fontSize: '30px',
      fontStyle: 'bold',
      color: UI_COLOR.textBright,
      letterSpacing: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(106).setVisible(false);


    this.pauseMenuItems = PAUSE_MAIN.map((_, i) => this.add.text(
      width / 2,
      PAUSE_LAYOUT.firstY + i * PAUSE_LAYOUT.rowGap,
      '',
      {
        fontFamily: '"Noto Serif KR", Consolas, monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: UI_COLOR.textSoft,
      },
    ).setOrigin(0.5).setScrollFactor(0).setDepth(107).setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        if (!this.buildInspectOpen) return;
        if (this.pauseMenuIndex !== i) this.quitArmed = false;
        this.pauseMenuIndex = i;
        this.renderPauseMenu();
      })
      .on('pointerdown', () => {
        if (!this.buildInspectOpen) return;
        this.pauseMenuIndex = i;
        this.activatePauseMenuItem();
      }));
  }

  /**
   * 화면 밝기 적용 — 카메라 postFX 대신 전체 화면 막을 쓴다.
   * 깊이 98이라 게임 월드·암막(97) 위, HUD(99+) 아래다: **밝기를 낮춰도 HUD와 빌드 칩은
   * 그대로 읽힌다**. 밝기 조절이 정보 가독성을 깎으면 접근성 장치의 취지에 어긋난다.
   */
  private applyBrightness(): void {
    // 이펙트 밝기는 **막이 아니라 배율**이다 — 렌더러가 시전 객체 알파에 곱한다.
    // 같은 함수에서 함께 반영해 호출 지점(초기화·설정 변경·복귀)이 갈리지 않게 한다.
    setVfxBrightness(this.settings.vfxBrightness);

    const { width, height } = this.scale;
    const g = this.brightnessVeil.clear();
    const b = this.settings.brightness;
    if (Math.abs(b - 1) < 0.01) {
      this.brightnessVeil.setVisible(false);
      return;
    }
    // 1 미만은 검은 막, 초과는 흰 막. 최대 세기에서도 완전히 가리지 않는다.
    if (b < 1) g.fillStyle(0x000000, Math.min(0.6, (1 - b) * 1.0));
    else g.fillStyle(0xffffff, Math.min(0.22, (b - 1) * 0.7));
    g.fillRect(0, 0, width, height);
    this.brightnessVeil.setVisible(true);
  }

  /**
   * 설정 — **타이틀과 같은 DOM 오버레이**를 연다. 같은 기능이 화면마다 다르게 생기면
   * 안 된다(총괄 지적: "정돈이 안 됐다"). 깊이 배치로 빌드 칩을 밝게 남기는 논리는
   * 메인 일시정지 화면에만 필요하고, 설정에 들어가면 칩을 볼 일이 없다.
   */
  private async openSettingsOverlay(): Promise<void> {
    // ESC가 설정과 일시정지를 동시에 닫지 않게 하는 가드 (keydown-ESC 참조)
    this.settingsOverlayOpen = true;
    const next = await showSettingsOverlay({
      onChange: (settings) => {
        this.settings = settings;
        this.audio.applySettings(settings);
        this.applyBrightness();
      },
      mute: { get: () => this.audio.muted, toggle: () => this.audio.toggleMute() },
    });
    this.settingsOverlayOpen = false;
    this.settings = next;
    this.audio.applySettings(next);
    this.applyBrightness();
    this.renderPauseMenu();
  }

  /** 일시정지 메뉴 갱신 — 한 장짜리(재개·설정·나가기). */
  private renderPauseMenu(): void {
    const visible = this.buildInspectOpen;
    this.pauseDim.setVisible(visible);
    this.pauseMenuPlate.setVisible(visible);
    this.pauseMenuTitle.setVisible(visible);
    this.pauseMenuItems.forEach((t) => t.setVisible(false));
    if (!visible) return;

    const { width } = this.scale;
    this.pauseMenuTitle.setText('일시정지');
    PAUSE_MAIN.forEach((row, i) => {
      const selected = i === this.pauseMenuIndex;
      const label = row.id === 'quit' && this.quitArmed ? '정말 나갈까? 한 번 더' : row.label;
      this.pauseMenuItems[i]
        .setText(`${selected ? '▸ ' : '   '}${label}`)
        .setColor(row.id === 'quit' && this.quitArmed ? UI_COLOR.danger
          : selected ? UI_COLOR.textBright : UI_COLOR.textMuted)
        .setVisible(true);
    });

    const plateW = 340;
    const top = PAUSE_LAYOUT.titleY - 34;
    const bottom = PAUSE_LAYOUT.firstY + (PAUSE_MAIN.length - 1) * PAUSE_LAYOUT.rowGap + 24;
    const g = this.pauseMenuPlate.clear();
    g.fillStyle(UI_HEX.panel, 0.94);
    g.fillRoundedRect((width - plateW) / 2, top, plateW, bottom - top, 14);
    g.lineStyle(1, UI_HEX.border, 0.9);
    g.strokeRoundedRect((width - plateW) / 2, top, plateW, bottom - top, 14);
    this.pauseMenuTitle.setPosition(width / 2, PAUSE_LAYOUT.titleY);
  }

  private movePauseMenu(delta: number): void {
    const len = PAUSE_MAIN.length;
    this.pauseMenuIndex = (this.pauseMenuIndex + delta + len) % len;
    this.quitArmed = false; // 다른 항목으로 옮기면 나가기 확인은 풀린다
    this.renderPauseMenu();
  }

  private activatePauseMenuItem(): void {
    const row = PAUSE_MAIN[this.pauseMenuIndex];
    if (!row) return;
    switch (row.id) {
      case 'resume':
        this.closeBuildInspect();
        return;
      case 'settings':
        void this.openSettingsOverlay();
        return;
      case 'quit':
        // 런이 사라지는 되돌릴 수 없는 선택이라 두 번 눌러야 확정된다
        if (!this.quitArmed) {
          this.quitArmed = true;
          this.renderPauseMenu();
          return;
        }
        this.abandonRun();
        return;
      default:
    }
  }

  /**
   * 런 포기 — **패배로 기록**한다 (총괄 결정). 무기록으로 두면 "불리하면 포기하고
   * 재시작"이 최적 전략이 되어 런의 무게가 사라진다. 보스가 도망도 기억하는 게 맞다.
   * 보스 처치로 이미 은행에 들어간 유산은 그대로 남는다.
   *
   * 사망과 같은 요약 화면을 거쳐 타이틀로 간다 — 나가기가 "그냥 사라짐"이 아니라
   * 이번 런의 결산으로 마무리되도록 (총괄 요청).
   */
  private abandonRun(): void {
    if (this.deathHandled) return;
    this.deathHandled = true;
    this.closeBuildInspect();
    this.reportAutoShare('런 포기');
    this.persistRunMemory('lose');
    this.stopCastingForRunPause();
    this.deferTransientCombatCleanup();
    void showRunSummaryOverlay(this.buildRunSummary('defeat'))
      .then(() => { this.destroyRunMapUi(); this.scene.start('title'); });
  }

  /** 칩 i의 컨테이너 로컬 중심 (0·1=각인 윗줄, 2·3=정령 아랫줄) */
  private chipCenter(index: number): { x: number; y: number } {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const step = BUILD_CHIP.size + BUILD_CHIP.gap;
    return {
      x: col * step + BUILD_CHIP.size / 2,
      y: row * step + BUILD_CHIP.size / 2,
    };
  }

  /**
   * 빌드 칩 그리기 — 텍스트 0글자로 여섯 채널을 인코딩한다.
   * 사각=각인·원=정령 / 채움=원소색 / 글리프=폼 / 금테=진화 / 3핍=레벨 / 호=쿨다운.
   * 발광(ADD)·점멸을 쓰지 않는다 — HUD는 저진폭 알파만 쓰는 규율을 따른다(#220 맥락).
   */
  private drawBuildChips(): void {
    this.buildChips = buildChipModel(
      this.engraveManager.entries, this.spiritManager.entries, this.awakenings,
    );
    const g = this.buildChipGraphics.clear();
    const half = BUILD_CHIP.size / 2;

    this.buildChips.forEach((chip, i) => {
      const { x, y } = this.chipCenter(i);
      const icon = this.buildChipIcons[i];
      const round = chip.kind === 'spirit';
      const core = chip.element ? ELEMENT_PALETTES[chip.element].core : 0x8fa4ff;
      const glow = chip.elementSecondary
        ? ELEMENT_PALETTES[chip.elementSecondary].core
        : core;

      if (!chip.filled) {
        // 빈 슬롯 — 자리를 지켜 "채울 수 있다"를 알린다 (기존 0/2 표기의 의도 계승)
        g.lineStyle(1, 0x8fa4ff, 0.34);
        if (round) g.strokeCircle(x, y, half - 1);
        else g.strokeRoundedRect(x - half + 1, y - half + 1, BUILD_CHIP.size - 2, BUILD_CHIP.size - 2, 5);
        icon.setVisible(false);
        return;
      }

      // 채움 — 이중 원소는 위/아래 투톤으로 두 색을 다 보여준다
      g.fillStyle(core, 0.2);
      if (round) g.fillCircle(x, y, half);
      else g.fillRoundedRect(x - half, y - half, BUILD_CHIP.size, BUILD_CHIP.size, 5);
      if (chip.elementSecondary) {
        g.fillStyle(glow, 0.2);
        if (round) {
          g.slice(x, y, half, 0, Math.PI, false);
          g.fillPath();
        } else {
          g.fillRoundedRect(x - half, y, BUILD_CHIP.size, half, { tl: 0, tr: 0, bl: 5, br: 5 });
        }
      }

      // 테두리 — 진화·융합은 금테를 두껍게 (★ 글자를 대체)
      const borderColor = chip.evolved ? 0xffd166 : core;
      g.lineStyle(chip.evolved ? 2 : 1.2, borderColor, chip.evolved ? 0.95 : 0.62);
      if (round) g.strokeCircle(x, y, half - 1);
      else g.strokeRoundedRect(x - half + 1, y - half + 1, BUILD_CHIP.size - 2, BUILD_CHIP.size - 2, 5);

      // 쿨다운 호 — 남은 만큼 위에서 시계방향으로 남는다 (0=지금 나간다)
      if (chip.cooldownRatio > 0) {
        const start = -Math.PI / 2;
        g.lineStyle(2, 0xdfe6ff, 0.5);
        g.beginPath();
        g.arc(x, y, half + 1.5, start, start + Math.PI * 2 * chip.cooldownRatio, false);
        g.strokePath();
      }

      // 레벨 3핍 — 채워진 길이로 읽힌다 ("Lv2" 4글자를 대체)
      const pipW = (BUILD_CHIP.size - 10) / 3;
      for (let p = 0; p < 3; p += 1) {
        g.fillStyle(p < chip.level ? core : 0xffffff, p < chip.level ? 0.95 : 0.16);
        g.fillRect(x - half + 5 + p * pipW, y + half - 4, pipW - 1.5, 2);
      }

      // 각성 표식 — 진화(금테)와 **다른 축**이라 자리도 색도 다르게 둔다.
      // 좌상단 자주 점: 그 원소 전체가 각성했다는 표시(칩 하나의 격상이 아니다).
      if (chip.awakening) {
        g.fillStyle(0xd0a8ff, 0.95);
        g.fillCircle(x - half + 4.5, y - half + 4.5, 3);
        g.lineStyle(1, 0x0b1030, 0.9);
        g.strokeCircle(x - half + 4.5, y - half + 4.5, 3);
      }

      icon.setTexture(formGlyphTextureKey(chip.glyph ?? 'summon'))
        .setTint(core)
        .setVisible(true);
    });
  }

  /**
   * ESC 검사 모드 토글 — 전투를 멈추고 칩에 마우스를 올려 상세를 본다 (총괄 발안).
   *
   * 호버 툴팁은 원래 실시간 게임에서 주채널이 될 수 없다(조회하는 동안 적이 움직인다).
   * 정지가 그 전제를 없앤다. 다만 scene.pause()는 이 씬의 렌더·입력까지 멈춰 호버 자체가
   * 죽으므로 쓰지 않는다. 대신 (a) isCombatActive() 게이트 — 유산 선택과 같은 확립된
   * 패턴 — 로 전투 갱신을 끊고, (b) time.paused로 delayedCall(장판 틱·각인 발사)까지
   * 멈춘다. (b)가 없으면 "정지" 중에 장판이 계속 때린다.
   */
  private toggleBuildInspect(): void {
    if (!this.buildInspectOpen && (this.incanting || this.casting || this.legacySelecting)) return;
    this.buildInspectOpen = !this.buildInspectOpen;
    this.time.paused = this.buildInspectOpen;
    this.hoveredChipIndex = -1;
    // 열 때마다 메인 화면부터 — 지난번 설정 화면이 남아 있으면 "재개"를 못 찾는다
    if (this.buildInspectOpen) {
        this.pauseMenuIndex = 0;
    }
    this.quitArmed = false;
    this.renderPauseMenu();
    this.syncMinimapVisibility();
    this.buildChipZones.forEach((zone) => {
      if (this.buildInspectOpen) zone.setInteractive({ useHandCursor: true });
      else zone.disableInteractive();
    });
    this.renderBuildInspect();
  }

  private closeBuildInspect(): void {
    if (this.buildInspectOpen) this.toggleBuildInspect();
  }

  /** 검사 오버레이 렌더 — 판 + 호버한 칩의 상세. 아무것도 안 가리켰으면 안내만. */
  private renderBuildInspect(): void {
    const g = this.buildInspectPlate.clear();
    if (!this.buildInspectOpen) {
      this.buildInspectPlate.setVisible(false);
      this.buildInspectText.setVisible(false);
      return;
    }
    const { width, height } = this.scale;
    const chip = this.buildChips[this.hoveredChipIndex];
    const lines = chip
      ? [chip.filled ? `『${chip.name}』` : chip.name, ...chip.detail]
      : ['빌드 검사 — 시간이 멈췄다', '칩에 커서를 올리면 상세가 나온다', 'ESC 로 돌아간다'];
    this.buildInspectText.setText(lines.join('\n'));

    const boxW = BUILD_CHIP.tooltipWidth;
    const boxH = this.buildInspectText.height + 18;
    const span = BUILD_CHIP.size * 2 + BUILD_CHIP.gap;
    // 칩 그리드 **바로 위**에 우측 정렬로 띄운다. 왼쪽으로 펼치면 x가 700 아래로
    // 내려가 하단 중앙 밴드(시퀀스 바 x266~694 · 필살기 라벨 ~x670)와 겹친다.
    const x = width - 20 - boxW;
    const y = height - 26 - span - 10;
    g.fillStyle(UI_HEX.panel, 0.92);
    g.fillRoundedRect(x, y - boxH, boxW, boxH, 8);
    g.lineStyle(1, chip?.element ? ELEMENT_PALETTES[chip.element].core : UI_HEX.border, 0.7);
    g.strokeRoundedRect(x, y - boxH, boxW, boxH, 8);
    this.buildInspectPlate.setVisible(true);
    this.buildInspectText.setPosition(x + 10, y - 9).setVisible(true);
  }

  /**
   * 방 클리어(보상 선택) 화면에 띄울 씬 쪽 맥락 — main.ts에서 runUiBinding에 주입한다.
   * 누적 강화는 컨트롤러가 알고 있어 결합 모듈이 직접 만들고, 여기선 컨트롤러가
   * 모르는 것(주문서 보유)만 낸다.
   */
  rewardContextLines(): string[] {
    return this.grimoireCount > 0 ? [`주문서 ${this.grimoireCount}`] : [];
  }

  private drawHudBars(): void {
    const hpRatio = Phaser.Math.Clamp(this.playerState.hp / this.playerState.maxHp, 0, 1);
    const manaRatio = Phaser.Math.Clamp(this.playerState.mana / this.playerState.maxMana, 0, 1);
    const shieldRatio = Phaser.Math.Clamp(this.playerState.shield / this.playerState.maxHp, 0, 1);
    const cooldownRatio = Phaser.Math.Clamp(
      // 분모를 실제 입력락 길이로 — 죽은 글로벌 쿨다운(3s) 분모는 게이지가 13%만 찼다
      this.playerState.cooldownRemaining / this.playerState.castInputLockSeconds,
      0,
      1,
    );
    const heatwaveDamaging = this.activeRoomCurse?.kind === 'heatwave'
      && isHeatwaveDamaging({
        graceRemaining: this.heatwaveGraceRemaining,
        immunityRemaining: this.heatwaveImmunityRemaining,
      });
    const heatPulse = 0.36 + Math.sin(this.time.now / 420) * 0.12;
    const g = this.hudGraphics.clear();

    // 마도서 판 — 불규칙한 변 + 이중 괘선 + 모서리 갈고리.
    // 종전엔 `fillRoundedRect` + 1px 테두리였다(총괄 지적: "상자에 색만 칠한 느낌").
    drawGrimoirePanel(g, HUD.x, HUD.y, HUD.width, HUD.height, 0.9);

    // 라벨과 같은 줄에 — 텍스트 세로 중앙에 맞춰 바를 놓는다 (원점이 좌상단이므로 −3)
    const barOffset = Math.round(HUD.barHeight / 2) + 1;
    const rowBarY = (index: number): number => hudRowY(index) + barOffset;
    g.fillStyle(UI_HEX.track, 1);
    for (let index = 0; index < 3; index += 1) {
      g.fillRoundedRect(HUD.barX, rowBarY(index), HUD.barWidth, HUD.barHeight, 3);
    }
    g.fillStyle(heatwaveDamaging ? 0xff734c : hex(UI_SEMANTIC.hp), 1);
    g.fillRoundedRect(HUD.barX, rowBarY(0), HUD.barWidth * hpRatio, HUD.barHeight, 3);
    if (heatwaveDamaging && hpRatio > 0) {
      const filledWidth = HUD.barWidth * hpRatio;
      const hpBarY = rowBarY(0);
      g.lineStyle(2, 0xffb15a, 0.52 + heatPulse * 0.38);
      g.strokeRoundedRect(HUD.barX - 2, hpBarY - 2, HUD.barWidth + 4, HUD.barHeight + 4, 4);
      // 막대 끝의 짧은 상승 입자: 전체 HUD가 아니라 열에 반응하는 HP라는 점만 알려 준다.
      for (let index = 0; index < 3; index += 1) {
        const progress = (this.time.now / 750 + index * 0.37) % 1;
        const x = HUD.barX + Math.max(8, filledWidth - 7 - index * 7);
        const y = hpBarY - 2 - progress * 10;
        g.fillStyle(0xffc06d, (1 - progress) * 0.7);
        g.fillCircle(x, y, 1.8 - progress * 0.55);
      }
    }
    g.fillStyle(hex(UI_SEMANTIC.mana), 1);
    g.fillRoundedRect(HUD.barX, rowBarY(1), HUD.barWidth * manaRatio, HUD.barHeight, 3);
    g.fillStyle(hex(UI_SEMANTIC.shield), 1);
    g.fillRoundedRect(HUD.barX, rowBarY(2), HUD.barWidth * shieldRatio, HUD.barHeight, 3);

    g.fillStyle(UI_HEX.track, 1);
    g.fillRoundedRect(HUD.x + 8, HUD.y + HUD.height - 5, HUD.width - 16, 3, 2);
    g.fillStyle(cooldownRatio > 0 ? 0xffb86b : 0x72f1b8, 1);
    g.fillRoundedRect(
      HUD.x + 8,
      HUD.y + HUD.height - 5,
      (HUD.width - 16) * (cooldownRatio > 0 ? 1 - cooldownRatio : 1),
      3,
      2,
    );

    this.drawAffinityBar(g);
    this.drawFusionGauge(g);

    // 우상단 상태 패널 — 종전엔 ROOM 칩(DOM) 아래에 따로 떠서 우상단이 3단이었다.
    // ROOM을 이 패널 안으로 넣어(updateStatusText) 2단으로 줄였다 (총괄 지적).
    const { width } = this.scale;
    // 패널은 **내용에 맞춰 늘어난다** — 보스전에서 저항·관통 줄이 붙으면 3~4줄이 되어
    // 고정 높이로는 텍스트가 패널을 넘고 미니맵과 겹쳤다. 평시(2줄)엔 그대로 조밀하다.
    const panelHeight = rightPanelHeight(this.waveText.height);
    drawGrimoirePanel(g, width - 306, RIGHT_PANEL.y, 288, panelHeight, 0.86);
    // 첫 줄(ROOM n/m)과 나머지를 가르는 구획 괘선 — 여백만으로 나누면 "칸"이 아니라
    // "간격"이다. 줄이 늘어난 방(보스전 등)에서만 그린다
    if (this.waveText.height > RIGHT_PANEL.baseTextHeight * 0.8) {
      drawSectionRule(g, width - 306, RIGHT_PANEL.y + RIGHT_PANEL.padTop + 18, 288);
    }
    // 미니맵을 패널 아래로 — 높이가 바뀔 때만 옮긴다 (setTop이 동일 y면 no-op)
    this.runMinimap?.setTop(RIGHT_PANEL.y + panelHeight + RIGHT_PANEL.gap);
  }

  /**
   * 친화 경험치 바 — **키운 원소마다 한 줄씩**, 각성 이정표(§5-b, 0.9)까지 채운다.
   *
   * 이전엔 최고치 하나만 그렸다. 그런데 친화는 원소별로 따로 오르므로(growAffinityFromUse),
   * 불로 시작한 뒤 얼음을 쏘면 얼음 친화가 실제로 오르는데 화면은 그대로였다
   * (총괄 제보). 성장이 화면에서 부정되면 플레이어는 그 선택지를 지운다.
   *
   * 다만 주력을 맨 위에 크고 밝게, 나머지는 작고 흐리게 둔다 — 이 게임의 친화는
   * 집중형 보상(useCap 0.45)이라 "고루 찍어라"로 읽히면 안 된다.
   */
  private drawAffinityBar(g: Phaser.GameObjects.Graphics): void {
    const rows = rankAffinities<SpellElement>(this.combatRunController.state.elementalAffinity);
    const barX = HUD.x + 6;
    const fullW = HUD.width - 12;

    for (let i = 0; i < this.affinityLabelTexts.length; i += 1) {
      const label = this.affinityLabelTexts[i];
      const row = rows[i];
      if (!row) {
        label.setText('');
        continue;
      }
      const pal = ELEMENT_PALETTES[row.element];
      const ratio = Phaser.Math.Clamp(row.value / AFFINITY_BAR_MILESTONE, 0, 1);
      // 주력(0행)만 폭·불투명도가 100%. 아래는 좁고 흐려 서열이 한눈에 보인다.
      const main = i === 0;
      const barW = main ? fullW : fullW * 0.62;
      const barH = main ? 6 : 4;
      const alpha = main ? 1 : 0.55;
      const barY = HUD.y + HUD.height + 22 + i * AFFINITY_ROW_HEIGHT;

      g.fillStyle(UI_HEX.track, alpha);
      g.fillRoundedRect(barX, barY, barW, barH, barH / 2);
      g.fillStyle(pal.core, alpha);
      g.fillRoundedRect(barX, barY, barW * ratio, barH, barH / 2);
      if (ratio >= 1) {
        // 이정표 도달 — 각성 예고 펄스 (§5-b 구현 시 여기서 각성 선택지)
        g.fillStyle(pal.accent, (0.4 + 0.4 * Math.abs(Math.sin(this.time.now / 200))) * alpha);
        g.fillRoundedRect(barX, barY, barW, barH, barH / 2);
      }
      label
        .setText(`「${ELEMENT_LABELS[row.element]}」 친화 ${Math.round(row.value * 100)}%`)
        .setColor(paletteColorToCss(pal.core))
        .setAlpha(alpha);
    }
  }

  /**
   * 필살기(융합) 미터 — 화면 하단 중앙의 궁극기 게이지. 이전엔 HUD 안 3px 실선이라
   * 존재를 몰랐다(총괄 피드백: "필살기 게이지 잘 안보임"). 격투게임 슈퍼미터처럼
   * 항상 크게 노출하고, 만충 시 바깥 후광이 크게 맥동해 "지금 쓸 수 있다"를 알린다.
   */
  private drawFusionGauge(g: Phaser.GameObjects.Graphics): void {
    const ratio = Phaser.Math.Clamp(this.fusionGauge.ratio, 0, 1);
    const ready = this.fusionGauge.ready;
    const { width, height } = this.scale;
    const barW = 300;
    const barH = 14;
    const x = (width - barW) / 2;
    const y = height - 54;
    const now = this.time.now;

    // 준비 완료 — 바깥 후광이 크게 맥동 (놓칠 수 없게)
    if (ready) {
      g.fillStyle(0x7a4dff, 0.22 + 0.2 * Math.abs(Math.sin(now / 220)));
      g.fillRoundedRect(x - 12, y - 12, barW + 24, barH + 24, 18);
    }

    // 트랙
    g.fillStyle(0x0c1030, 0.94);
    g.fillRoundedRect(x, y, barW, barH, 7);

    // 채움 — 최소 둥근끝이 보이도록 폭 하한을 둔다
    if (ratio > 0) {
      const fillW = Math.max(barH, barW * ratio);
      g.fillStyle(0x6b4dd6, 1);
      g.fillRoundedRect(x, y, fillW, barH, 7);
      g.fillStyle(0xb18cff, 0.85); // 위쪽 하이라이트로 입체감
      g.fillRoundedRect(x, y, fillW, barH * 0.42, 7);
      if (ready) {
        g.fillStyle(0xe2b7ff, 0.5 + 0.45 * Math.abs(Math.sin(now / 160)));
        g.fillRoundedRect(x, y, barW, barH, 7);
      }
    }

    // 테두리 — 준비 시 밝은 보라로 강조
    g.lineStyle(ready ? 2 : 1, ready ? 0xe6c8ff : 0x4a3a86, ready ? 0.95 : 0.7);
    g.strokeRoundedRect(x, y, barW, barH, 7);

    this.fusionLabelText
      .setText(ready
        ? '✦ 필살기 준비 — 이중 원소로 방출 · 마나 무소모 ✦'
        : `필살기 융합  ${Math.round(ratio * 100)}%`)
      .setColor(ready ? '#f0d9ff' : '#a99cff')
      .setPosition(width / 2, y - 6);
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
    // 비동기 경로(진화 작명 await 등)에서 씬이 내려간 뒤 도달할 수 있다 — this.add가 없다.
    if (!this.scene?.isActive?.()) return;
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height * 0.42, message, {
      fontSize: '24px',
      fontStyle: 'bold',
      color,
      stroke: '#05060f',
      strokeThickness: 4,
      // 왼쪽 정렬 — 블록은 origin 0.5로 화면 중앙에 놓이되 **글자는 한 축에서 시작**한다.
      // 중앙 정렬이면 여러 줄·목록에서 줄마다 시작점이 달라져 정돈돼 보이지 않는다
      // (총괄 지적). 한 줄 문구는 상자가 글자를 감싸므로 중앙 배치와 차이가 없다.
      align: 'left',
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
  /**
   * 주요 공지 — 판 있는 배너로 띄운다. 진화·각성·보스 등장처럼 **판을 바꾸는 사건**만
   * 이 채널을 쓴다. 방 클리어·웨이브 같은 보조 공지는 announceSystemMessage 그대로.
   * 한 번에 하나만 띄우고 나머지는 큐에서 기다린다.
   */
  private announceBanner(copy: SystemBannerCopy): void {
    if (!this.scene?.isActive?.()) return;
    this.bannerQueue.push(copy);
    this.drainBannerQueue();
  }

  private drainBannerQueue(): void {
    if (this.activeBanner?.active) return;
    const next = this.bannerQueue.shift();
    if (!next) return;
    const banner = showSystemBanner(this, next);
    this.activeBanner = banner;
    // 배너가 스스로 사라지면 다음 것을 꺼낸다 (등장 260 + 유지 + 퇴장 520)
    const total = 260 + (next.holdMs ?? 2200) + 520;
    this.time.delayedCall(total + 40, () => {
      if (this.activeBanner === banner) this.activeBanner = null;
      this.drainBannerQueue();
    });
  }

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
      hpDamage > 0 ? UI_COLOR.danger : UI_SEMANTIC.shield,
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

  /**
   * n번째로 가까운 적 (0 = 가장 가까움). 모자라면 가까운 쪽으로 되감는다.
   *
   * 진화 각인의 3발을 서로 다른 적에게 물리기 위한 것 — 적이 하나뿐이면
   * 자동으로 기존 동작(전부 그 적)으로 수렴한다.
   */
  private nthNearestEnemy(index: number): CombatEnemy | null {
    const alive = this.enemies.filter((enemy) => enemy.alive);
    if (alive.length === 0) return null;
    alive.sort((a, b) => (
      Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y)
      - Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y)
    ));
    return alive[Math.max(0, index) % alive.length];
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
    vfxTierReduction = 0,
    onAffectEnemy?: (enemy: CombatEnemy) => void,
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
      const damaged = this.damageEnemy(
        enemy,
        damageAgainst(enemy),
        spec.element_primary,
        sourceX,
        sourceY,
        bypassDirectionalShield,
        hitStopKind,
        knockbackDistance,
        auto ? 'auto' : 'manual',
      );
      onAffectEnemy?.(enemy);
      if (damaged && (spec.form === 'beam' || spec.form === 'wave')) {
        const tier = reducedAffinityVfxIntensity(
          this.combatRunController.state.elementalAffinity[spec.element_primary] ?? 0,
          vfxTierReduction,
        );
        if (tier > 0) {
          playAffinityImpactFlourish(this, enemy.x, enemy.y, spec, tier);
        }
      }
      this.applyOnHitStatuses(enemy, spec);
      this.applyAwakeningOnHit(enemy, spec, auto);
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

      const bypassDirectionalShield = spec.form === 'zone' || spec.form === 'rain';
      const impactSource = impact.kind === 'line'
        ? { x: impact.fromX, y: impact.fromY }
        : impact.kind === 'circle'
          ? { x: impact.x, y: impact.y }
          : castOrigin;

      // ⚠️ **구조물이 주문도 막는다** (총괄 지시: "플레이어의 마법이 통과할 수 있으면
      // 안 됨"). 종전엔 이동·적 투사체만 막고 주문은 통과해, 엄폐가 한쪽에만 작동하는
      // 비대칭이 있었다 — 벽 뒤에서 일방적으로 잡는 무적 지점이 생기는 원인이었다.
      //
      // 판정 지점은 **적중이 확정된 뒤**다: 여기서 걸러야 "형상은 닿았지만 구조물이
      // 가렸다"가 되고, 형상 자체를 줄이면 이펙트와 판정이 어긋난다.
      //
      // `zone`·`rain`은 예외다 — 위에서 떨어지거나 바닥에 깔리는 폼이라 옆의 구조물이
      // 가릴 이유가 없다. 그 둘은 방어형 실드도 무시하는(bypassDirectionalShield)
      // 같은 성격이라 예외 조건을 공유한다.
      if (!bypassDirectionalShield && segmentBlocked(
        impactSource,
        { x: enemy.x, y: enemy.y },
        this.terrainBarriers,
      )) continue;

      hitEnemies.add(enemy);
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
    // weaken(취약)은 받는 피해를 증폭한다 — 저주로 약해진 적이 더 아프게 맞는다.
    const amplified = baseDamage * this.enemyAilments.damageTakenMultiplierFor(enemy);
    return this.elementalDamageAgainst(
      enemy,
      spec.element_primary,
      amplified,
      showResistanceNotice,
      spec.form,
    );
  }

  private elementalDamageAgainst(
    enemy: CombatEnemy,
    element: SpellElement,
    baseDamage: number,
    showResistanceNotice = false,
    // 격상이 폼 기반이 되며(#171) 하한 겹침 계산에 폼이 필요해졌다.
    // null이면(정령 미사일 등 폼 정보가 없는 경로) 격상 겹침 없음으로 취급.
    form: SpellForm | null = null,
  ): number {
    if (enemy.kind !== 'boss') return baseDamage;
    const multiplier = this.activeBossResistances.get(element) ?? 1;
    // 마스터리 면역 (#171 R1 발안, 총괄 채택): 친화가 각성 이정표(0.9)에 도달한
    // 원소는 그 원소의 보스 내성을 **완전히 무시**한다 — "네가 불에 저항해?
    // 내가 곧 불이다." 단기·장기·이중 저항 전부에 걸린다(같은 관문이므로).
    const affinity = this.combatRunController.state.elementalAffinity[element] ?? 0;
    if (multiplier < 1 && affinity >= RESISTANCE.masteryImmunityAffinity) {
      if (!this.masteryPierceAnnounced) {
        this.masteryPierceAnnounced = true;
        this.announceSystemMessage(
          `마스터리 관통 — ${ELEMENT_LABELS[element]}은(는) 이미 나의 것이다`,
          '#ffd166',
          2800,
        );
      }
      return baseDamage;
    }
    if (showResistanceNotice
      && multiplier < 1
      && this.time.now - this.lastResistNoticeAt > 1500) {
      this.lastResistNoticeAt = this.time.now;
      const label = ELEMENT_LABELS[element];
      this.announceSystemMessage(`저항! ${label}이(가) 통하지 않는다 — 다른 원소를 창작하라`, '#ffa94d');
    }
    // 합산 감쇠 하한 (결정서 §3③): 격상×내성이 겹쳐도 ×0.5 밑으로 안 내려간다.
    // baseDamage엔 격상이 이미 반영돼 있고, 격상은 이제 폼 기반이다 — 약화된 폼으로
    // 내성 원소를 칠 때(예: 볼트 약화 + 화염 내성 + 화염 볼트)만 겹침 구제가 발동한다.
    const escalation = form !== null && this.runEscalation.weakenedForms.includes(form)
      ? this.runEscalation.weakenMultiplier
      : 1;
    return baseDamage * flooredResistMultiplier(escalation, multiplier);
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
    // 종류(분신·군체·포탑·오브)를 주문명·원소로 가른다(#97 ②).
    const plan = summonGroupPlan(spec.element_primary, spec.name);
    this.activeSummonKnockbackDistance = spec.status.includes('knockback')
      ? knockbackDistanceForForm('summon')
      : 0;
    for (let i = 0; i < plan.count; i += 1) {
      const offset = (Math.PI * 2 * i) / plan.count;
      // 포탑은 시전 위치 주변에 고정 배치, 나머지는 플레이어 궤도에 오프셋으로 분산.
      const spawnX = plan.stationary ? this.player.x + Math.cos(offset) * 34 : this.player.x;
      const spawnY = plan.stationary ? this.player.y + Math.sin(offset) * 34 : this.player.y;
      this.activeSummons.push(new SummonedOrb(
        this, spawnX, spawnY, spec.element_primary, spec.power,
        {
          orbitOffset: offset,
          stationary: plan.stationary,
          orbitRadius: plan.orbitRadius,
          damageScale: plan.damageScale,
          attackIntervalScale: plan.attackIntervalScale,
          behavior: spec.behavior, // L3(#101) — validateSpec을 통과한 것만 도달
        },
      ));
    }
    const label = plan.count > 1 ? `${plan.label} ×${plan.count}` : plan.label;
    const duration = this.activeSummons[0]?.state.durationSeconds ?? 0;
    this.announceSystemMessage(
      `${label} · ${duration.toFixed(1)}초`,
      paletteColorToCss(ELEMENT_PALETTES[spec.element_primary].core),
    );
  }

  private updateSummon(deltaSeconds: number): void {
    if (this.activeSummons.length === 0) return;
    if (!this.playerState.alive) {
      this.clearSummon();
      return;
    }

    const survivors: SummonedOrb[] = [];
    for (const summon of this.activeSummons) {
      // L3 행동(돌진·추적 등)은 표적 좌표가 필요하므로 이동 전에 찾는다
      const target = this.nearestEnemyFrom(summon.x, summon.y, SUMMON_CONFIG.attackRange);
      summon.updatePosition(
        this.player.x, this.player.y, deltaSeconds,
        target?.x, target?.y,
      );
      const tick = summon.state.update(deltaSeconds, target !== null);
      if (tick.expired) {
        summon.destroy();
        continue;
      }
      survivors.push(summon);
      if (!tick.shouldAttack || !target) continue;

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
        source: 'auto',
      });
    }
    this.activeSummons = survivors;
  }

  /**
   * 융합 방출 대연출 — 게이지 만충의 카타르시스. 두 원소의 팔레트가 교차하는
   * 이중 링 + 스파크 폭발 + 강한 셰이크. 판정 영역과 무관한 순수 오버레이.
   */
  private playFusionRelease(spec: SpellSpec): void {
    const primary = ELEMENT_PALETTES[spec.element_primary];
    const secondary = ELEMENT_PALETTES[spec.element_secondary ?? spec.element_primary];
    const x = this.player.x;
    const y = this.player.y;
    requestCameraShake(this, 'strong', 1.6);
    this.announceSystemMessage(
      `융합 방출 — 『${spec.name}』`,
      '#e2b7ff',
      3000,
    );
    [primary, secondary].forEach((pal, index) => {
      const ring = this.add.circle(x, y, 14, pal.glow, 0)
        .setStrokeStyle(5, pal.core, 0.95)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(9);
      this.tweens.add({
        targets: ring,
        radius: 210 + index * 60,
        alpha: 0,
        delay: index * 110,
        duration: 620,
        ease: 'Cubic.Out',
        onComplete: () => ring.destroy(),
      });
    });
    const burst = this.add.particles(x, y, particleKey(this, PARTICLE_TEXTURES.glow), {
      speed: { min: 240, max: 520 },
      scale: { start: 1.1, end: 0 },
      lifespan: 640,
      quantity: 46,
      tint: [primary.core, primary.glow, secondary.core, secondary.glow],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    }).setDepth(9);
    burst.explode(46, x, y);
    this.time.delayedCall(900, () => burst.destroy());
  }

  /**
   * 사용 친화 성장 표시 — 시전 원소색으로 "화염 친화 45%"가 플레이어 위로 떠오른다.
   * 성장이 화면에 보여야 "내 영창이 힘을 빚는다"는 체감이 산다 (게임성 진행 밀도).
   */
  private showAffinityGrowthFloat(element: SpellElement, total: number): void {
    const pal = ELEMENT_PALETTES[element];
    const label = this.add.text(
      this.player.x, this.player.y - 34,
      `${ELEMENT_LABELS[element]} 친화 ${Math.round(total * 100)}%`,
      {
        fontFamily: '"Noto Serif KR", "Malgun Gothic", sans-serif',
        fontSize: '12px', fontStyle: 'bold',
        color: paletteColorToCss(pal.core),
        stroke: '#05060f', strokeThickness: 3,
      },
    ).setOrigin(0.5).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: label,
      y: this.player.y - 58,
      alpha: { from: 0.95, to: 0 },
      duration: 780,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  /** 환류 부상 텍스트 — 킬 지점에서 마나색 "+N"이 떠오른다 */
  /**
   * 피해 숫자 — 맞은 적 위에 뜬다. 크기는 **적 최대 체력 대비 비율**로 정한다
   * (총괄 지적: 친화·루프로 절대 피해가 무한히 커지므로 절대값 기준은 금방 상한에
   * 붙어 정보가 죽는다). 같은 적 재타격은 짧은 창 안에서 누적해 틱 스팸을 막는다.
   */
  /**
   * 이 타격이 저항에 깎였나 — 피해 숫자 색·표식용.
   * elementalDamageAgainst와 **같은 조건**을 쓴다: 보스이고, 내성이 걸려 있고,
   * 마스터리 면역(친화 0.9) 미만일 때만 실제로 깎인다.
   */
  private isResistedHit(enemy: CombatEnemy, element?: SpellElement): boolean {
    if (!element || enemy.kind !== 'boss') return false;
    const multiplier = this.activeBossResistances.get(element) ?? 1;
    if (multiplier >= 1) return false;
    const affinity = this.combatRunController.state.elementalAffinity[element] ?? 0;
    return affinity < RESISTANCE.masteryImmunityAffinity;
  }

  private showDamageNumber(
    enemy: CombatEnemy, damage: number, resisted: boolean, x: number, y: number,
  ): void {
    // 생존을 보지 않는다 — takeDamage가 먼저 돌아서, 처치 일격은 이미 alive=false다.
    // 가장 통쾌한 숫자라 반드시 띄운다. 좌표는 호출측이 넘긴다(파괴 후엔 못 읽는다).
    if (damage <= 0) return;
    const now = this.time.now;
    const existing = this.damageNumbers.get(enemy);

    if (existing && existing.text.active && now < existing.expireAt) {
      // 누적 — 새 숫자를 띄우지 않고 기존 것을 키운다 ("이 장판이 총 얼마를 넣었나")
      existing.total += damage;
      existing.resisted = existing.resisted || resisted;
      existing.expireAt = now + DAMAGE_NUMBER.mergeWindowMs;
      const e = damageEmphasis(existing.total, enemy.maxHp);
      existing.text
        .setText(damageLabel(existing.total, existing.resisted))
        .setFontSize(e.fontPx)
        .setColor(damageColor(e.tier, existing.resisted));
      return;
    }

    const e = damageEmphasis(damage, enemy.maxHp);
    // 좌우로 살짝 흩어 놓는다 — 여러 적이 동시에 맞아도 숫자가 포개지지 않게
    const jitter = (Math.random() - 0.5) * 18;
    const label = this.add.text(x + jitter, y - 24, damageLabel(damage, resisted), {
      fontFamily: '"Consolas", "D2Coding", monospace',
      fontSize: `${e.fontPx}px`,
      fontStyle: 'bold',
      color: damageColor(e.tier, resisted),
      stroke: '#05060f',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(11);

    const entry = { text: label, total: damage, expireAt: now + DAMAGE_NUMBER.mergeWindowMs, resisted };
    this.damageNumbers.set(enemy, entry);

    // 묵직한 타격은 살짝 튀어오른다 — 등급이 움직임으로도 읽힌다
    if (e.tier > 0) {
      this.tweens.add({
        targets: label, scale: { from: 0.7, to: 1 }, duration: 150, ease: 'Back.easeOut',
      });
    }
    this.tweens.add({
      targets: label,
      y: label.y - DAMAGE_NUMBER.riseDistance,
      alpha: 0,
      delay: DAMAGE_NUMBER.mergeWindowMs,
      duration: DAMAGE_NUMBER.durationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        label.destroy();
        if (this.damageNumbers.get(enemy) === entry) this.damageNumbers.delete(enemy);
      },
    });
  }

  private showManaRefundFloat(x: number, y: number, amount: number): void {
    const label = this.add.text(x, y - 18, `+${Math.round(amount)}`, {
      fontSize: '13px',
      fontStyle: 'bold',
      color: UI_SEMANTIC.mana,
      stroke: '#05060f',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(8).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: label,
      y: y - 44,
      alpha: 0,
      duration: 620,
      ease: 'Cubic.Out',
      onComplete: () => label.destroy(),
    });
  }

  private clearSummon(): void {
    for (const summon of this.activeSummons) summon.destroy();
    this.activeSummons = [];
    this.activeSummonKnockbackDistance = 0;
  }

  private castControlSpell(
    from: Phaser.Math.Vector2,
    spec: SpellSpec,
    auto = false,
    vfxTierReduction = 0,
    options?: SpellExecutionOptions,
  ): void {
    const preferredTarget = options?.sequenceTarget?.lockedEnemy?.alive
      ? options.sequenceTarget.lockedEnemy
      : null;
    const chainCandidates = this.enemies.filter((enemy) => enemy.alive);
    const chainTargets = spec.form === 'chain'
      ? preferredTarget
        ? selectChainTargetsFromFirst(preferredTarget, chainCandidates)
        : selectChainTargets(from.x, from.y, chainCandidates)
      : [];
    const target = spec.form === 'chain'
      ? chainTargets[0] ?? null
      : preferredTarget ?? this.nearestEnemy();
    const to = preferredTarget
      ? new Phaser.Math.Vector2(preferredTarget.x, preferredTarget.y)
      : this.spellTargetPoint(from, spec, target);
    let lockedTarget = lockedPointTargetForForm(spec.form, target);
    const affectedEnemies = new Set<CombatEnemy>();
    const castRoomIndex = this.combatRunController.state.roomIndex;
    castSpell({
      scene: this,
      from,
      to,
      chainPath: chainTargets,
      // 자동 시전은 셰이크를 막는다(4초마다 흔들리면 피로하다). 단 **진화 각인만**
      // 예외다 — auto인데 연출 격하가 0인 조합은 진화뿐이라 그걸로 판별한다.
      // 진화는 huge라 spellRenderer가 셰이크 등급을 이미 한 단계 올려놨는데,
      // auto 전체를 막는 바람에 그 격상이 사장돼 있었다.
      allowCameraShake: !auto || vfxTierReduction === 0,
      // 플레이어 장식 VFX 중첩 예산 참여 (#216 P0-1) — 자동 시전은 추가 감쇠.
      // 보스 시전은 이 필드를 안 넘겨 면제된다(위험구역은 정보, 항상 최대 밝기).
      decorVfxScale: auto ? VFX_BUDGET_CONFIG.autoCastScale : 1,
      damageScale: options?.damageScale,
      rangeScale: options?.rangeScale,
      radiusScale: options?.radiusScale,
      // 친화 격상 연출(영창가 빌드 동기) — 위력·판정 불변, 순수 오버레이
      vfxIntensity: reducedAffinityVfxIntensity(
        this.combatRunController.state.elementalAffinity[spec.element_primary] ?? 0,
        vfxTierReduction,
      ),
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
      shouldResolveImpact: () => {
        const state = this.combatRunController.state;
        return state.phase === 'combat' && state.roomIndex === castRoomIndex;
      },
      onHit: (impact) => {
        const currentRunState = this.combatRunController.state;
        if (currentRunState.phase !== 'combat'
          || currentRunState.roomIndex !== castRoomIndex) return;
        this.onControlHit(
          impact,
          spec,
          lockedTarget,
          affectedEnemies,
          chainTargets,
          options,
        );
      },
    }, spec);
  }

  private onControlHit(
    impact: SpellImpact,
    spec: SpellSpec,
    lockedTarget: CombatEnemy | null,
    affectedEnemies: Set<CombatEnemy>,
    chainTargets: readonly CombatEnemy[] = [],
    options?: SpellExecutionOptions,
  ): void {
    if (impact.hitGroup !== undefined && spec.form !== 'rain') affectedEnemies.clear();
    const source = impact.kind === 'line'
      ? { x: impact.fromX, y: impact.fromY }
      : impact.kind === 'circle'
        ? { x: impact.x, y: impact.y }
        : { x: this.player.x, y: this.player.y };
    const applyControlImpact = (enemy: CombatEnemy): void => {
      const durationScale = options?.controlDurationScale ?? 1;
      const strengthScale = options?.controlStrengthScale ?? 1;
      if (impact.controlMode === 'root') {
        this.applyRoot(
          enemy,
          (impact.controlDurationSeconds ?? CAGE_CONFIG.rootDurationSeconds) * durationScale,
        );
      } else {
        const duration = (impact.controlDurationSeconds ?? slowSecondsFromPower(spec.power))
          * durationScale;
        const movementMultiplier = Phaser.Math.Clamp(
          CONTROL_CONFIG.slowMovementMultiplier / strengthScale,
          0.2,
          0.9,
        );
        this.applySlow(enemy, spec.power, duration, movementMultiplier);
      }
      this.applyStatusKnockback(enemy, spec, source.x, source.y);
      options?.onAffectEnemy?.(enemy);
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

  private applyPersistentControl(
    enemy: CombatEnemy,
    spec: SpellSpec,
    options: SpellExecutionOptions | undefined,
    sourceX: number,
    sourceY: number,
  ): void {
    const duration = slowSecondsFromPower(spec.power)
      * (options?.controlDurationScale ?? 1);
    const movementMultiplier = Phaser.Math.Clamp(
      CONTROL_CONFIG.slowMovementMultiplier / (options?.controlStrengthScale ?? 1),
      0.2,
      0.9,
    );
    this.applySlow(enemy, spec.power, duration, movementMultiplier);
    options?.onAffectEnemy?.(enemy);
    this.applyStatusKnockback(enemy, spec, sourceX, sourceY);
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
    // 핫패스(컨트롤 적중마다) — 호출부째 가드해야 인자 객체 생성까지 제거된다
    if (import.meta.env.DEV) {
      console.info('[Control] slow-applied', {
        enemy: enemy.kind,
        durationSeconds: remaining,
        movementMultiplier: this.enemyControlState.movementMultiplierFor(enemy),
      });
    }
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
    if (import.meta.env.DEV) {
      console.info('[Control] root-applied', {
        enemy: enemy.kind,
        durationSeconds: remaining,
        movementMultiplier: 0,
      });
    }
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

  /**
   * 피격 시 주문의 상태이상을 적에게 적용한다(#97 상태이상 완성).
   * burn=지속피해, freeze=경직(root), slow=둔화, weaken=취약, shock=인접 연쇄.
   * knockback은 기존 applyStatusKnockback이 별도 처리. 지속 폼이 매 틱 불러도
   * 각 효과는 갱신(비중첩)이라 안전하고, shock만 쿨다운으로 남발을 막는다.
   */
  private applyOnHitStatuses(enemy: CombatEnemy, spec: SpellSpec): void {
    if (!enemy.alive) return;
    for (const status of spec.status) {
      if (status === 'burn') {
        this.enemyAilments.applyBurn(enemy, burnDpsFromPower(spec.power), AILMENT_CONFIG.burn.seconds);
      } else if (status === 'freeze') {
        this.enemyControlState.applyRoot(enemy, freezeSecondsFromPower(spec.power));
      } else if (status === 'slow') {
        this.enemyControlState.applySlow(
          enemy, spec.power, slowSecondsFromPower(spec.power), AILMENT_CONFIG.slow.movementMultiplier,
        );
      } else if (status === 'weaken') {
        this.enemyAilments.applyWeaken(enemy, weakenMultiplierFromPower(spec.power), AILMENT_CONFIG.weaken.seconds);
      } else if (status === 'shock') {
        this.applyShockChain(enemy, spec);
      }
    }
  }

  /**
   * 원소 각성 적중 효과 (AWAKENING_PROPOSAL) — **수동 영창의 주속성만**.
   *
   * awakeningFor()가 auto를 걸러내므로 각인·정령은 절대 여기 안 걸린다. 자동 쪽에
   * 효과를 주면 오토 비중 40% 상한(#67)이 깨지기 때문이다 — 회귀로 고정된 불변식.
   *
   * 작열은 시전 스펙 단계에서 상태이상으로 새겨지므로(effectiveSpec) 여기선 다루지
   * 않는다. 여기는 "맞은 뒤"에만 의미가 있는 두 갈래다.
   */
  private applyAwakeningOnHit(enemy: CombatEnemy, spec: SpellSpec, auto: boolean): void {
    if (!enemy.alive) return;
    const kind = awakeningFor(this.awakenings, spec, auto);
    if (kind === 'chaining') {
      // 연환 — 곁의 적에게 번진다. 이미 있는 연쇄 감전 문법을 그대로 쓴다
      // (새 전투 규칙을 만들지 않는다). 파급은 본체보다 약하다.
      this.spreadAwakenedChain(enemy, spec);
    } else if (kind === 'brand') {
      // 낙인 — 맞은 적이 무너지기 쉬워진다. 위력이 아니라 **다음 한 방**을 키운다.
      this.enemyAilments.applyWeaken(
        enemy,
        AWAKENING_CONFIG.brandWeakenMultiplier,
        AWAKENING_CONFIG.brandWeakenSeconds,
      );
    }
  }

  /** 연환 파급 — shock 연쇄와 같은 형태·쿨다운을 쓰되 원소색으로 그린다. */
  private spreadAwakenedChain(source: CombatEnemy, spec: SpellSpec): void {
    const now = this.time.now;
    if (now - (this.shockCooldowns.get(source) ?? -Infinity)
      < AILMENT_CONFIG.shock.cooldownSeconds * 1000) return;
    this.shockCooldowns.set(source, now);
    const spill = spellImpactDamageFromPower(spec.power, AWAKENING_CONFIG.chainingDamageScale);
    const pal = ELEMENT_PALETTES[spec.element_primary];
    const targets = this.enemies
      .filter((e) => e.alive && e !== source
        && Phaser.Math.Distance.Between(e.x, e.y, source.x, source.y) <= AILMENT_CONFIG.shock.radius)
      .slice(0, AWAKENING_CONFIG.chainingExtraTargets);
    for (const target of targets) {
      const arc = this.add.line(0, 0, source.x, source.y, target.x, target.y, pal.core, 0.9)
        .setOrigin(0, 0).setLineWidth(2).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: arc, alpha: 0, duration: 200, onComplete: () => arc.destroy() });
      this.damageEnemy(
        target, this.spellDamageAgainst(target, spec, spill), spec.element_primary,
        source.x, source.y, false, 'standard', 0, 'manual',
      );
    }
  }

  /** 연쇄 감전 — 맞은 적 주변으로 피해 일부를 튀긴다(상태이상 전이는 없음, 쿨다운 제한). */
  private applyShockChain(source: CombatEnemy, spec: SpellSpec): void {
    const now = this.time.now;
    if (now - (this.shockCooldowns.get(source) ?? -Infinity) < AILMENT_CONFIG.shock.cooldownSeconds * 1000) return;
    this.shockCooldowns.set(source, now);
    const zap = spellImpactDamageFromPower(spec.power, AILMENT_CONFIG.shock.damageMultiplier);
    const targets = this.enemies
      .filter((e) => e.alive && e !== source
        && Phaser.Math.Distance.Between(e.x, e.y, source.x, source.y) <= AILMENT_CONFIG.shock.radius)
      .slice(0, AILMENT_CONFIG.shock.maxTargets);
    for (const target of targets) {
      const arc = this.add.line(0, 0, source.x, source.y, target.x, target.y, 0xfff07a, 0.9)
        .setOrigin(0, 0).setLineWidth(2).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: arc, alpha: 0, duration: 180, onComplete: () => arc.destroy() });
      this.damageEnemy(
        target, this.spellDamageAgainst(target, spec, zap), spec.element_primary,
        source.x, source.y, false, 'standard', 0, 'status',
      );
    }
  }

  private damageEnemy(
    enemy: CombatEnemy,
    damage: number,
    element?: SpellElement,
    sourceX = this.player.x,
    sourceY = this.player.y,
    bypassDirectionalShield = false,
    hitStopKind: HitStopKind = 'standard',
    knockbackDistance = 0,
    source: DamageSource = 'manual',
    /**
     * 피격 연출 수위 (#216 항목5) — 'status-tick'은 화상 틱처럼 "공격이 아닌
     * 지속 피해"라 hit SFX·squash·hitstop을 모두 생략한다 (피해·사망 처리는 동일).
     * 원인 표시는 호출측의 지속 VFX(잔불·틱 펄스) 몫이다.
     */
    feedback: 'full' | 'status-tick' = 'full',
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
    this.damageLedger[source] += damage;
    // 피해 숫자 — **수동 영창만**. 이 게임에서 숫자는 타격감이 아니라 "내 문장이 얼마나
    // 셌나"에 대한 답이므로, 자동 시전(각인·정령)·기본탄·상태이상 틱에는 붙이지 않는다.
    // 전부 띄우면 화면이 숫자로 덮이고 오토 비중을 시각적으로 과대평가하게 된다.
    if (source === 'manual' && feedback !== 'status-tick') {
      this.showDamageNumber(
        enemy, damage, this.isResistedHit(enemy, element), enemy.x, enemy.y,
      );
    }
    if (feedback !== 'status-tick') this.audio.playSfx('hit');
    if (!defeated && feedback !== 'status-tick') {
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

    // 영창 환류 — 수동 주문 킬만 즉시 환급 (오토 게이트 무관, activeManaConfig 주석 참조)
    if (source === 'manual') {
      const refunded = this.playerState.restoreMana(ACTIVE_MANA_CONFIG.spellKillRefundMana);
      if (refunded > 0) this.showManaRefundFloat(enemy.x, enemy.y, refunded);
    }

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
    this.dropBurnEmber(enemy);
    this.damageNumbers.delete(enemy);
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
        const applied = this.damagePlayer(30);
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
      + ` · ${spec.effect}/${spec.target} · ${spec.form} · power ${spec.power}`
      + ` · cost ${spec.cost}${debugTail}`,
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
