import type { PlayerCombatState } from '../player/playerCombatState';
import type {
  EncounterDefinition,
  RewardOption,
  RunController,
  RunEvents,
  RunPhase,
  RunStateSnapshot,
} from '../../run/runContract';
import type { SpellElement } from '../../spell/types';
import { accrueUseAffinity } from './useAffinity';
import { chorusEntryAffinity, ELEMENTAL_CHORUS, shouldEnterElementalChorus } from './elementalChorus';
import { RUN_ENCOUNTERS } from './encounterConfig';
import {
  drawRewardOptions,
  RUN_REWARD_CONFIG,
} from './rewardConfig';

type RunEventHandler = RunEvents[keyof RunEvents];

export type RunTransitionScheduler = (
  delayMs: number,
  callback: () => void,
) => void;

/** 보상 추첨기 — 프로덕션은 시드 랜덤, 회귀 하네스는 고정 3택 주입 가능 */
export type RewardDraw = (roomIndex: number) => readonly RewardOption[];
export type EncounterProvider = (roomIndex: number) => EncounterDefinition;

export interface CombatRunControllerOptions {
  playerState: PlayerCombatState;
  encounters?: readonly EncounterDefinition[];
  /**
   * 그래프 통합용 현재 조우 공급자. 방 번호별로 선택된 노드를 고정해 반환해야 한다.
   * 지정하면 maxRooms는 그래프의 최대 경로 길이로 사용한다.
   */
  encounterProvider?: EncounterProvider;
  /** 로컬 조우 검증용. 제품 기본값은 첫 번째 조우다. */
  initialRoomIndex?: number;
  maxRooms?: number;
  transitionDurationMs?: number;
  scheduleTransition?: RunTransitionScheduler;
  /** 런 시드 (미지정 시 Date.now() — 런마다 다른 보상) */
  seed?: number;
  /** 보상 추첨 주입 (미지정 시 시드 랜덤 풀 추첨) */
  rewardDraw?: RewardDraw;
}

/** mulberry32 — 의존성 없는 결정론적 PRNG (같은 시드 = 같은 보상 순열) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** PR #12의 R1↔R3 계약을 구현하는 런·방·보상 상태 관리자. */
export class CombatRunController implements RunController {
  private readonly playerState: PlayerCombatState;
  private maxRooms: number;
  private readonly encounterDefinitions: readonly EncounterDefinition[];
  private readonly encounterProvider?: EncounterProvider;
  private encounters: ResolvedEncounter[];
  private readonly initialRoomIndex: number;
  private readonly transitionDurationMs: number;
  private readonly scheduleTransition: RunTransitionScheduler;
  private readonly handlers = new Map<keyof RunEvents, Set<RunEventHandler>>();

  private roomIndex = 1;
  private phase: RunPhase = 'combat';
  private rewards: RewardOption[] = [];
  private elementalAffinity: RunStateSnapshot['elementalAffinity'] = {};
  private chorusAffinity: number | null = null;
  private chorusAvailable = false;
  /** 사용으로 더해온 친화 누적 (원소별, 소프트캡 판정용 — 카드분은 제외) */
  private useAffinityAdded: Record<string, number> = {};
  private rewardOptions: RewardOption[] = [];
  private readonly rewardDraw: RewardDraw;
  private rand: () => number;
  /** 수호 기점 누적치 — 방 시작마다 부여 (PROGRESSION_DESIGN §1) */
  private wardOnRoomStart = 0;
  /** 보스 후 이어가기 루프 인덱스 (0=첫 런). 이어갈수록 난이도↑ (loopDifficulty) */
  private loopIndex = 0;

  constructor(options: CombatRunControllerOptions) {
    this.playerState = options.playerState;
    this.encounterProvider = options.encounterProvider;
    this.encounterDefinitions = options.encounters
      ?? (options.maxRooms === undefined
        ? RUN_ENCOUNTERS
        : createLegacyEncounters(positiveInteger(options.maxRooms)));
    this.maxRooms = this.encounterProvider
      ? positiveInteger(options.maxRooms ?? this.encounterDefinitions.length)
      : this.encounterDefinitions.length;
    this.initialRoomIndex = clampRoomIndex(options.initialRoomIndex ?? 1, this.maxRooms);
    this.roomIndex = this.initialRoomIndex;
    this.transitionDurationMs = Math.max(
      0,
      options.transitionDurationMs ?? RUN_REWARD_CONFIG.transitionDurationMs,
    );
    this.scheduleTransition = options.scheduleTransition ?? defaultScheduleTransition;
    const seed = options.seed ?? Date.now();
    this.rand = mulberry32(seed);
    this.encounters = resolveEncounters(this.encounterDefinitions, mulberry32(seed ^ 0x9e3779b9));
    this.rewardDraw = options.rewardDraw
      ?? ((roomIndex) => drawRewardOptions(roomIndex, this.rand));
  }

  get state(): Readonly<RunStateSnapshot> {
    return this.snapshot();
  }

  /** Update the safety bound when a new generated MapGraph is installed. */
  configureMapRoute(maxRooms: number): void {
    if (!this.encounterProvider) return;
    this.maxRooms = positiveInteger(maxRooms);
    this.roomIndex = clampRoomIndex(this.roomIndex, this.maxRooms);
  }

  /**
   * 사용 기반 친화 성장 (useAffinity.ts) — 수동 시전이 그 원소 친화를 소프트캡 안에서
   * 조금 올린다. 카드 친화와 같은 맵에 더하므로 데미지·VFX 격상이 함께 따라온다.
   * @returns { added: 이번에 실제 오른 양, total: 갱신된 총 친화 } (씬이 화면 표시에 사용)
   */
  growAffinityFromUse(element: SpellElement): { added: number; total: number; chorusAvailable: boolean } {
    if (this.chorusAffinity !== null) {
      const added = Math.min(
        ELEMENTAL_CHORUS.useAffinityPerCast,
        Math.max(0, ELEMENTAL_CHORUS.affinityCap - this.chorusAffinity),
      );
      if (added > 0) {
        this.chorusAffinity = roundedChorusAffinity(this.chorusAffinity + added);
      }
      return { added, total: this.chorusAffinity, chorusAvailable: false };
    }
    const { added, nextAddedSoFar } = accrueUseAffinity(this.useAffinityAdded[element] ?? 0);
    if (added > 0) {
      this.useAffinityAdded[element] = nextAddedSoFar;
      this.elementalAffinity[element] = (this.elementalAffinity[element] ?? 0) + added;
    }
    const chorusAvailable = this.refreshChorusAvailability();
    return {
      added,
      total: this.elementalAffinity[element] ?? 0,
      chorusAvailable,
    };
  }

  /**
   * 친화를 직접 세팅한다 — **시연 로드아웃 전용**("각성한 영창가로 시작").
   * 본 게임은 보상 카드와 growAffinityFromUse로만 친화가 오른다. state는 snapshot
   * 사본이라 바깥에서 못 고치므로, 시연 주입에는 이 명시적 입구가 필요하다.
   */
  seedAffinity(affinity: Readonly<Partial<Record<SpellElement, number>>>): void {
    if (this.chorusAffinity !== null) {
      const increase = Math.max(0, ...Object.values(affinity).map((value) => Number.isFinite(value) ? value ?? 0 : 0));
      this.chorusAffinity = roundedChorusAffinity(this.chorusAffinity + increase);
      return;
    }
    for (const [element, raw] of Object.entries(affinity)) {
      const value = Number.isFinite(raw) ? Math.max(0, raw as number) : 0;
      if (value > 0) this.elementalAffinity[element as SpellElement] = value;
    }
    this.refreshChorusAvailability();
  }

  /** 메타 연구 등 런 시작 선택이 주는 소량의 친화를 현재 값에 더한다. */
  grantStartingAffinity(element: SpellElement, amount: number): { added: number; total: number } {
    const added = Number.isFinite(amount) ? Math.max(0, amount) : 0;
    if (this.chorusAffinity !== null) {
      this.chorusAffinity = roundedChorusAffinity(this.chorusAffinity + added);
      return { added, total: this.chorusAffinity };
    }
    const total = (this.elementalAffinity[element] ?? 0) + added;
    if (added > 0) this.elementalAffinity[element] = total;
    this.refreshChorusAvailability();
    return { added, total };
  }

  /** 마지막 활성 적 처치 후 전투 씬이 호출하는 R1 내부 진입점. */
  notifyRoomCleared(): void {
    if (this.phase !== 'combat') return;

    const encounter = this.currentEncounter();
    if (encounter.kind === 'memory-boss'
      || (!this.encounterProvider && this.roomIndex >= this.maxRooms)) {
      this.phase = 'run-over';
      this.rewardOptions = [];
      this.emit('run-completed', this.snapshot());
      return;
    }

    if (!encounter.rewardAfterClear) {
      this.phase = 'room-transition';
      this.emit('room-transition', this.snapshot(), this.transitionDurationMs);
      this.scheduleTransition(this.transitionDurationMs, () => this.startNextRoom());
      return;
    }

    this.rewardOptions = this.rewardDraw(this.roomIndex).map(cloneReward);
    this.phase = 'reward-select';
    this.emit(
      'room-cleared',
      this.rewardOptions.map(cloneReward),
      this.snapshot(),
    );
  }

  chooseReward(optionId: string): void {
    if (this.phase !== 'reward-select') return;

    const chosen = this.rewardOptions.find((option) => option.id === optionId);
    if (!chosen) return;

    this.applyReward(chosen);
    this.rewards.push(cloneReward(chosen));
    this.rewardOptions = [];
    this.phase = 'room-transition';

    this.emit('reward-applied', cloneReward(chosen), this.snapshot());
    this.emit('room-transition', this.snapshot(), this.transitionDurationMs);
    this.scheduleTransition(this.transitionDurationMs, () => this.startNextRoom());
  }

  /**
   * 새 런 시작 (R1 내부 API — RunController 계약 외).
   * 초기 상태로 되돌리고 'room-started'를 발화해 씬·UI가 방 1부터 다시 진행하게 한다.
   */
  /**
   * 새 런 초기화. `emit=false`면 room-started를 발화하지 않는다 — 씬 재진입(create)에서
   * 씬이 직접 startRoom을 부를 때, 이벤트로 방이 이중 시작되는 걸 막는다.
   */
  reset(seed = Date.now(), emit = true, startRoomIndex = this.initialRoomIndex): void {
    // startRoomIndex는 시연 로드아웃("각성한 영창가로 시작") 전용이다 — 후반 상태를
    // 1번 방에 떨어뜨리면 잡몹만 뭉개 오히려 얕아 보인다. 기본값은 기존 동작 그대로.
    this.roomIndex = clampRoomIndex(startRoomIndex, this.maxRooms);
    this.phase = 'combat';
    this.rewards = [];
    this.elementalAffinity = {};
    this.chorusAffinity = null;
    this.chorusAvailable = false;
    this.useAffinityAdded = {};
    this.rewardOptions = [];
    this.wardOnRoomStart = 0;
    this.loopIndex = 0;
    this.rand = mulberry32(seed);
    this.encounters = resolveEncounters(this.encounterDefinitions, mulberry32(seed ^ 0x9e3779b9));
    if (emit) this.emit('room-started', this.snapshot());
  }

  /**
   * 보스 후 이어가기 — 빌드(친화·보상·사용성장·수호기점)를 **유지**한 채 방만 새로
   * 뽑고 루프를 올린다. reset()과 달리 성장을 비우지 않는다. 씬은 여기 더해 플레이어
   * HP·각인·정령·융합 게이지를 유지하고 난이도(loopDamageScale)를 올린다.
   */
  /**
   * 이어가기 — 보스를 넘고 "더 갈까"를 고른 경우.
   *
   * ⚠️ **빌드를 통째로 들고 가지 않는다** (총괄 결정 2026-07-31). 종전엔 친화·각인·
   * 정령·보상을 전부 유지해 2회차부터 성장이 아니라 누적이었다. 맵이 2스테이지가 되며
   * 한 런 안에서도 성장이 체감되므로 그럴 이유가 약해졌다.
   *
   * 계승은 **친화도 하나**뿐이다(`runInheritance` 참조). 각인·정령은 슬롯을 차지해
   * 다음 런의 보상 선택을 막지만, 친화도는 방향만 주고 자리를 안 먹는다.
   *
   * @param inherit 계승할 원소와 값. 생략하면 아무것도 안 들고 간다.
   */
  continueRun(
    seed = Date.now(),
    inherit?: { element: SpellElement; value: number; echoes?: readonly { element: SpellElement; value: number }[] },
  ): void {
    this.loopIndex += 1;
    this.roomIndex = this.initialRoomIndex;
    this.phase = 'combat';
    this.rewardOptions = [];
    // 빌드를 비운다 — 각인·정령은 씬 소유라 씬이 따로 비운다
    this.rewards = [];
    this.elementalAffinity = {};
    this.chorusAffinity = null;
    this.chorusAvailable = false;
    this.useAffinityAdded = {};
    this.wardOnRoomStart = 0;
    if (inherit && inherit.value > 0) {
      this.elementalAffinity[inherit.element] = inherit.value;
      for (const echo of inherit.echoes ?? []) {
        if (echo.value > 0) this.elementalAffinity[echo.element] = echo.value;
      }
    }
    this.rand = mulberry32(seed);
    this.encounters = resolveEncounters(this.encounterDefinitions, mulberry32(seed ^ 0x9e3779b9));
    this.emit('room-started', this.snapshot());
  }

  on<K extends keyof RunEvents>(event: K, handler: RunEvents[K]): void {
    let eventHandlers = this.handlers.get(event);
    if (!eventHandlers) {
      eventHandlers = new Set<RunEventHandler>();
      this.handlers.set(event, eventHandlers);
    }
    eventHandlers.add(handler);
  }

  off<K extends keyof RunEvents>(event: K, handler: RunEvents[K]): void {
    const eventHandlers = this.handlers.get(event);
    eventHandlers?.delete(handler);
    if (eventHandlers?.size === 0) this.handlers.delete(event);
  }

  private applyReward(reward: RewardOption): void {
    // 제단방(#214) "상급" 보상은 powerScale(>1)을 실어 수치 효과를 키운다. 미지정=1(표준).
    // 과도한 배율은 playerState 내부 클램프(입력락 하한 0.15초 등)가 흡수한다.
    const scale = reward.powerScale ?? 1;
    switch (reward.kind) {
      case 'max-hp':
        this.playerState.increaseMaxHp(Math.round(RUN_REWARD_CONFIG.maxHpIncrease * scale));
        this.playerState.heal(Math.round(RUN_REWARD_CONFIG.hpRecovery * scale));
        break;
      case 'max-mana':
        this.playerState.increaseMaxMana(Math.round(RUN_REWARD_CONFIG.maxManaIncrease * scale));
        this.playerState.restoreMana(Math.round(RUN_REWARD_CONFIG.manaRecovery * scale));
        break;
      case 'affinity': {
        if (!reward.element) return;
        if (this.chorusAffinity !== null) {
          this.chorusAffinity = roundedChorusAffinity(
            this.chorusAffinity + ELEMENTAL_CHORUS.rewardAffinityBonus * scale,
          );
          break;
        }
        const previous = this.elementalAffinity[reward.element] ?? 0;
        this.elementalAffinity[reward.element] = previous + RUN_REWARD_CONFIG.affinityBonus * scale;
        this.refreshChorusAvailability();
        break;
      }
      case 'chorus-awaken':
        this.activateElementalChorus();
        break;
      case 'swift-incant':
        this.playerState.addCastLockReduction(RUN_REWARD_CONFIG.swiftIncantLockReduction * scale);
        break;
      case 'mana-surge':
        this.playerState.addManaGainMultiplier(RUN_REWARD_CONFIG.manaSurgeGainBonus * scale);
        this.playerState.addManaPickupRadiusMultiplier(
          RUN_REWARD_CONFIG.manaSurgePickupRadiusBonus * scale,
        );
        break;
      case 'ward-start':
        this.wardOnRoomStart += Math.round(RUN_REWARD_CONFIG.wardStartShield * scale);
        break;
      case 'spirit-haste':
        // 정령 관리자는 씬 소유 — reward-applied 이벤트에서 적용한다.
        // powerScale은 cloneReward로 옵션에 실려 전달되므로, 씬이 프리미엄을 곱하려면
        // 그쪽에서 처리한다(현재 미적용 — 씬 배선은 별도 조율).
        break;
      case 'engrave':
        // 각인은 전투 스탯 보상이 아니다. 씬이 reward-applied 이벤트에서 적용한다.
        break;
      case 'spirit':
        // 정령도 씬의 전용 관리자가 reward-applied 이벤트에서 적용한다.
        break;
      case 'evolve':
        // 진화·융합(LLM 작명 포함)은 씬이 reward-applied 이벤트에서 비동기로 적용한다.
        break;
    }
  }

  private startNextRoom(): void {
    if (this.phase !== 'room-transition') return;

    this.roomIndex += 1;
    this.phase = 'combat';
    if (this.wardOnRoomStart > 0) this.playerState.addShield(this.wardOnRoomStart);
    this.emit('room-started', this.snapshot());
  }

  private snapshot(): RunStateSnapshot {
    const encounter = this.currentEncounter();
    return {
      roomIndex: this.roomIndex,
      maxRooms: this.maxRooms,
      roomCountMode: this.encounterProvider ? 'dynamic' : 'fixed',
      stage: encounter.stage,
      encounterId: encounter.id,
      encounterKind: encounter.kind,
      encounterVariantId: encounter.variantId,
      waveSetId: encounter.waveSetId,
      phase: this.phase,
      loopIndex: this.loopIndex,
      rewards: this.rewards.map(cloneReward),
      elementalAffinity: { ...this.elementalAffinity },
      chorusAffinity: this.chorusAffinity,
      chorusAvailable: this.chorusAvailable,
    };
  }

  activateElementalChorus(): boolean {
    if (this.chorusAffinity !== null || !this.chorusAvailable) return false;
    this.enterElementalChorus();
    return true;
  }

  private enterElementalChorus(): void {
    const entryAffinity = chorusEntryAffinity(this.elementalAffinity);
    this.elementalAffinity = {};
    this.useAffinityAdded = {};
    this.chorusAffinity = entryAffinity;
    this.chorusAvailable = false;
  }

  private refreshChorusAvailability(): boolean {
    if (this.chorusAffinity !== null || this.chorusAvailable) return false;
    if (!shouldEnterElementalChorus(this.elementalAffinity)) return false;
    this.chorusAvailable = true;
    return true;
  }

  private currentEncounter(): ResolvedEncounter {
    if (this.encounterProvider) return { ...this.encounterProvider(this.roomIndex) };
    return this.encounters[Math.min(this.roomIndex - 1, this.encounters.length - 1)];
  }

  private emit<K extends keyof RunEvents>(
    event: K,
    ...args: Parameters<RunEvents[K]>
  ): void {
    const eventHandlers = this.handlers.get(event);
    if (!eventHandlers) return;

    for (const handler of [...eventHandlers]) {
      const typedHandler = handler as (...eventArgs: Parameters<RunEvents[K]>) => void;
      typedHandler(...args);
    }
  }
}

interface ResolvedEncounter extends EncounterDefinition {
  variantId?: string;
}

function resolveEncounters(
  definitions: readonly EncounterDefinition[],
  rand: () => number,
): ResolvedEncounter[] {
  return definitions.map((definition) => {
    const variant = pick(definition.variants, rand);
    return {
      ...definition,
      waveSetId: variant?.waveSetId ?? definition.waveSetId,
      variantId: variant?.id,
    };
  });
}

function pick<T>(values: readonly T[] | undefined, rand: () => number): T | undefined {
  if (!values?.length) return undefined;
  return values[Math.floor(rand() * values.length)];
}

function createLegacyEncounters(count: number): EncounterDefinition[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `legacy-room-${index + 1}`,
    stage: index + 1 === count ? 2 : 1,
    kind: index + 1 === count ? 'memory-boss' : 'combat',
    rewardAfterClear: index + 1 < count,
    waveSetId: 'legacy',
  }));
}

function cloneReward(reward: RewardOption): RewardOption {
  return {
    ...reward,
    engrave: reward.engrave ? { ...reward.engrave } : undefined,
    spirit: reward.spirit ? { ...reward.spirit } : undefined,
    evolve: reward.evolve
      ? {
        ...reward.evolve,
        spiritIds: reward.evolve.spiritIds ? [...reward.evolve.spiritIds] : undefined,
        elements: [...reward.evolve.elements],
      }
      : undefined,
  };
}

function roundedChorusAffinity(value: number): number {
  return Math.min(
    ELEMENTAL_CHORUS.affinityCap,
    Math.round(Math.max(0, value) * 100) / 100,
  );
}

function positiveInteger(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function clampRoomIndex(value: number, maxRooms: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(maxRooms, Math.max(1, Math.floor(value)));
}

function defaultScheduleTransition(delayMs: number, callback: () => void): void {
  globalThis.setTimeout(callback, delayMs);
}
