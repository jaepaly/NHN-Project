import type { PlayerCombatState } from '../player/playerCombatState';
import type {
  RewardOption,
  RunController,
  RunEvents,
  RunPhase,
  RunStateSnapshot,
} from '../../run/runContract';
import {
  createRewardOptions,
  RUN_REWARD_CONFIG,
} from './rewardConfig';

type RunEventHandler = RunEvents[keyof RunEvents];

export type RunTransitionScheduler = (
  delayMs: number,
  callback: () => void,
) => void;

export interface CombatRunControllerOptions {
  playerState: PlayerCombatState;
  maxRooms?: number;
  transitionDurationMs?: number;
  scheduleTransition?: RunTransitionScheduler;
}

/** PR #12의 R1↔R3 계약을 구현하는 런·방·보상 상태 관리자. */
export class CombatRunController implements RunController {
  private readonly playerState: PlayerCombatState;
  private readonly maxRooms: number;
  private readonly transitionDurationMs: number;
  private readonly scheduleTransition: RunTransitionScheduler;
  private readonly handlers = new Map<keyof RunEvents, Set<RunEventHandler>>();

  private roomIndex = 1;
  private phase: RunPhase = 'combat';
  private rewards: RewardOption[] = [];
  private elementalAffinity: RunStateSnapshot['elementalAffinity'] = {};
  private rewardOptions: RewardOption[] = [];

  constructor(options: CombatRunControllerOptions) {
    this.playerState = options.playerState;
    this.maxRooms = positiveInteger(options.maxRooms ?? RUN_REWARD_CONFIG.maxRooms);
    this.transitionDurationMs = Math.max(
      0,
      options.transitionDurationMs ?? RUN_REWARD_CONFIG.transitionDurationMs,
    );
    this.scheduleTransition = options.scheduleTransition ?? defaultScheduleTransition;
  }

  get state(): Readonly<RunStateSnapshot> {
    return this.snapshot();
  }

  /** 마지막 활성 적 처치 후 전투 씬이 호출하는 R1 내부 진입점. */
  notifyRoomCleared(): void {
    if (this.phase !== 'combat') return;

    if (this.roomIndex >= this.maxRooms) {
      this.phase = 'run-over';
      this.rewardOptions = [];
      this.emit('run-completed', this.snapshot());
      return;
    }

    this.rewardOptions = createRewardOptions(this.roomIndex).map(cloneReward);
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
  reset(): void {
    this.roomIndex = 1;
    this.phase = 'combat';
    this.rewards = [];
    this.elementalAffinity = {};
    this.rewardOptions = [];
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
    }
  }

  private startNextRoom(): void {
    if (this.phase !== 'room-transition') return;

    this.roomIndex += 1;
    this.phase = 'combat';
    this.emit('room-started', this.snapshot());
  }

  private snapshot(): RunStateSnapshot {
    return {
      roomIndex: this.roomIndex,
      maxRooms: this.maxRooms,
      phase: this.phase,
      rewards: this.rewards.map(cloneReward),
      elementalAffinity: { ...this.elementalAffinity },
    };
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

function cloneReward(reward: RewardOption): RewardOption {
  return { ...reward };
}

function positiveInteger(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function defaultScheduleTransition(delayMs: number, callback: () => void): void {
  globalThis.setTimeout(callback, delayMs);
}
