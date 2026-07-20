import type { PlayerCombatState } from '../player/playerCombatState';
import type {
  EncounterDefinition,
  RewardOption,
  RunController,
  RunEvents,
  RunPhase,
  RunStateSnapshot,
} from '../../run/runContract';
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

export interface CombatRunControllerOptions {
  playerState: PlayerCombatState;
  encounters?: readonly EncounterDefinition[];
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
  private readonly maxRooms: number;
  private readonly encounterDefinitions: readonly EncounterDefinition[];
  private encounters: ResolvedEncounter[];
  private readonly initialRoomIndex: number;
  private readonly transitionDurationMs: number;
  private readonly scheduleTransition: RunTransitionScheduler;
  private readonly handlers = new Map<keyof RunEvents, Set<RunEventHandler>>();

  private roomIndex = 1;
  private phase: RunPhase = 'combat';
  private rewards: RewardOption[] = [];
  private elementalAffinity: RunStateSnapshot['elementalAffinity'] = {};
  private rewardOptions: RewardOption[] = [];
  private readonly rewardDraw: RewardDraw;
  private rand: () => number;
  /** 수호 기점 누적치 — 방 시작마다 부여 (PROGRESSION_DESIGN §1) */
  private wardOnRoomStart = 0;

  constructor(options: CombatRunControllerOptions) {
    this.playerState = options.playerState;
    this.encounterDefinitions = options.encounters
      ?? (options.maxRooms === undefined
        ? RUN_ENCOUNTERS
        : createLegacyEncounters(positiveInteger(options.maxRooms)));
    this.maxRooms = this.encounterDefinitions.length;
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

  /** 마지막 활성 적 처치 후 전투 씬이 호출하는 R1 내부 진입점. */
  notifyRoomCleared(): void {
    if (this.phase !== 'combat') return;

    const encounter = this.currentEncounter();
    if (encounter.kind === 'memory-boss' || this.roomIndex >= this.maxRooms) {
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
  reset(seed = Date.now()): void {
    this.roomIndex = this.initialRoomIndex;
    this.phase = 'combat';
    this.rewards = [];
    this.elementalAffinity = {};
    this.rewardOptions = [];
    this.wardOnRoomStart = 0;
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
    switch (reward.kind) {
      case 'max-hp':
        this.playerState.increaseMaxHp(RUN_REWARD_CONFIG.maxHpIncrease);
        this.playerState.heal(RUN_REWARD_CONFIG.hpRecovery);
        break;
      case 'max-mana':
        this.playerState.increaseMaxMana(RUN_REWARD_CONFIG.maxManaIncrease);
        this.playerState.restoreMana(RUN_REWARD_CONFIG.manaRecovery);
        break;
      case 'affinity': {
        if (!reward.element) return;
        const previous = this.elementalAffinity[reward.element] ?? 0;
        this.elementalAffinity[reward.element] = previous + RUN_REWARD_CONFIG.affinityBonus;
        break;
      }
      case 'swift-incant':
        this.playerState.addCooldownReduction(RUN_REWARD_CONFIG.swiftIncantReduction);
        break;
      case 'mana-surge':
        this.playerState.addManaRegenMultiplier(RUN_REWARD_CONFIG.manaSurgeBonus);
        break;
      case 'ward-start':
        this.wardOnRoomStart += RUN_REWARD_CONFIG.wardStartShield;
        break;
      case 'spell-power':
        this.playerState.addSpellPowerMultiplier(RUN_REWARD_CONFIG.spellPowerBonus);
        break;
      case 'momentum':
        this.playerState.addKillCooldownRefund(RUN_REWARD_CONFIG.momentumRefundSeconds);
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
      stage: encounter.stage,
      encounterId: encounter.id,
      encounterKind: encounter.kind,
      encounterVariantId: encounter.variantId,
      waveSetId: encounter.waveSetId,
      phase: this.phase,
      rewards: this.rewards.map(cloneReward),
      elementalAffinity: { ...this.elementalAffinity },
    };
  }

  private currentEncounter(): ResolvedEncounter {
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
