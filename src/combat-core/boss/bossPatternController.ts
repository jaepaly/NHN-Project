import type { BossCounterStrategy } from '../../spell/bossMemoryContract';
import type { BossProfile } from './bossEnemy';

export type BossPatternAction =
  | 'volley-telegraph'
  | 'volley-start'
  | 'summon'
  | 'summon-elite'
  | 'charge-telegraph'
  | 'charge-start'
  | 'surround'
  | 'hazard';

export interface BossPatternUpdate {
  phase: 1 | 2 | 3;
  actions: readonly BossPatternAction[];
}

const TIMING = {
  initialDelay: 1.8,
  patternInterval: 3.2,
  chargeTelegraph: 0.7,
  chargeRecovery: 0.8,
  volleyTelegraph: 0.7,
  volleyRecovery: 2.5,
  phase3Interval: 2.6,
  minionCap: 4,
} as const;

/** Phaser 비의존 보스 패턴 상태 머신. 씬은 반환된 요청의 연출·판정만 실행한다. */
export class BossPatternController {
  private phase: 1 | 2 | 3 = 1;
  private cooldown: number = TIMING.initialDelay;
  private pendingCharge = false;
  private pendingVolley = false;
  private sequenceIndex = 0;
  private counterStrategy: BossCounterStrategy | null = null;

  constructor(private readonly profile: Exclude<BossProfile, 'legacy'>) {}

  setCounterStrategy(strategy: BossCounterStrategy | null): void {
    this.counterStrategy = strategy;
  }

  update(deltaSeconds: number, phase: 1 | 2 | 3, livingMinions: number): BossPatternUpdate {
    if (phase !== this.phase) {
      this.phase = phase;
      this.cooldown = 0.35;
      this.pendingCharge = false;
      this.pendingVolley = false;
      this.sequenceIndex = 0;
    }
    this.cooldown = Math.max(0, this.cooldown - Math.max(0, deltaSeconds));
    if (this.cooldown > 0) return { phase, actions: [] };

    if (this.pendingCharge) {
      this.pendingCharge = false;
      this.cooldown = TIMING.chargeRecovery;
      return { phase, actions: ['charge-start'] };
    }

    if (this.pendingVolley) {
      this.pendingVolley = false;
      this.cooldown = TIMING.volleyRecovery;
      return { phase, actions: ['volley-start'] };
    }

    const action = this.nextAction(livingMinions);
    if (action === 'charge-telegraph') {
      this.pendingCharge = true;
      this.cooldown = TIMING.chargeTelegraph;
    } else if (action === 'volley-telegraph') {
      this.pendingVolley = true;
      this.cooldown = TIMING.volleyTelegraph;
    } else {
      this.cooldown = phase === 3 ? TIMING.phase3Interval : TIMING.patternInterval;
    }
    return { phase, actions: [action] };
  }

  private nextAction(livingMinions: number): BossPatternAction {
    if (this.profile === 'stage') {
      if (this.phase === 1) return 'volley-telegraph';
      // Keep phase 2 focused on the charge pattern. Summoning is a periodic
      // disruption rather than every other action.
      const wantsSummon = this.sequenceIndex++ % 4 === 2;
      return wantsSummon && livingMinions < TIMING.minionCap ? 'summon' : 'charge-telegraph';
    }

    if (this.phase === 1) {
      const phase1Pattern: readonly BossPatternAction[] = [
        'volley-telegraph',
        'hazard',
        'charge-telegraph',
      ];
      return phase1Pattern[this.sequenceIndex++ % phase1Pattern.length];
    }
    if (this.phase === 2) return this.nextCounterAction(livingMinions);

    const sequenceSlot = this.sequenceIndex++;
    if (sequenceSlot % 4 === 2 && livingMinions < TIMING.minionCap) return 'summon-elite';
    return this.memoryCombatAction(sequenceSlot);
  }

  private nextCounterAction(livingMinions: number): BossPatternAction {
    const sequenceSlot = this.sequenceIndex++ % 5;
    if (this.counterStrategy === 'rush') {
      const rushPattern: readonly BossPatternAction[] = [
        'charge-telegraph',
        'charge-telegraph',
        'volley-telegraph',
        'hazard',
        livingMinions < TIMING.minionCap ? 'surround' : 'charge-telegraph',
      ];
      return rushPattern[sequenceSlot];
    }
    if (this.counterStrategy === 'ranged') {
      const rangedPattern: readonly BossPatternAction[] = [
        'volley-telegraph',
        'hazard',
        'volley-telegraph',
        'charge-telegraph',
        'hazard',
      ];
      return rangedPattern[sequenceSlot];
    }
    return this.memoryCombatAction(sequenceSlot);
  }

  private memoryCombatAction(sequenceSlot: number): BossPatternAction {
    if (this.counterStrategy === 'rush') {
      const rushPattern: readonly BossPatternAction[] = [
        'charge-telegraph',
        'charge-telegraph',
        'volley-telegraph',
        'hazard',
      ];
      return rushPattern[sequenceSlot % rushPattern.length];
    }
    if (this.counterStrategy === 'ranged') {
      const rangedPattern: readonly BossPatternAction[] = [
        'volley-telegraph',
        'hazard',
        'volley-telegraph',
        'charge-telegraph',
        'hazard',
      ];
      return rangedPattern[sequenceSlot % rangedPattern.length];
    }
    const neutralPattern: readonly BossPatternAction[] = [
      'volley-telegraph',
      'hazard',
      'charge-telegraph',
    ];
    return neutralPattern[sequenceSlot % neutralPattern.length];
  }
}

export const BOSS_PATTERN_TIMING = TIMING;
