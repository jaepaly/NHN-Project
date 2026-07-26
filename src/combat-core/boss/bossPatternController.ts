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
  | 'hazard'
  // 비전 마법 (bossArcana, 총괄 발안 07-26) — 씬이 예고·시전을 실행한다.
  // 최종 보스가 물리 패턴만 쓰던 문제의 해법: 보스도 영창한다.
  | 'arcane-cast'   // 스펠북 원소 마법 (rain/nova/bolt/wave 순환)
  | 'shroud'        // 어둠 장막 — 시야 축소 (피해 0, 짧게)
  | 'pull'          // 중력 인력 — 보스 쪽으로 흡인 (걸어서 저항 가능)
  | 'mirror';       // 미러 캐스트 재발동 (페이즈3 순환 전용)

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
      // 첫 페이즈부터 '이 보스는 마법사다'가 보이게 원소 마법을 순환에 넣는다.
      const phase1Pattern: readonly BossPatternAction[] = [
        'volley-telegraph',
        'arcane-cast',
        'hazard',
        'charge-telegraph',
      ];
      return phase1Pattern[this.sequenceIndex++ % phase1Pattern.length];
    }
    if (this.phase === 2) return this.nextCounterAction(livingMinions);

    const sequenceSlot = this.sequenceIndex++;
    if (sequenceSlot % 4 === 2 && livingMinions < TIMING.minionCap) return 'summon-elite';
    // 페이즈3 절정 — 주기적으로 미러 캐스트를 다시 꺼낸다 (씬이 재료 유무를 재검사)
    if (sequenceSlot % 8 === 5) return 'mirror';
    return this.memoryCombatAction(sequenceSlot);
  }

  private nextCounterAction(livingMinions: number): BossPatternAction {
    const sequenceSlot = this.sequenceIndex++ % 5;
    if (this.counterStrategy === 'rush') {
      // rush = 거리를 좁히려는 보스 — 끌어당김(pull)이 주제와 정확히 맞는다.
      const rushPattern: readonly BossPatternAction[] = [
        'charge-telegraph',
        'pull',
        'arcane-cast',
        'charge-telegraph',
        livingMinions < TIMING.minionCap ? 'surround' : 'hazard',
      ];
      return rushPattern[sequenceSlot];
    }
    if (this.counterStrategy === 'ranged') {
      // ranged 억제 = 원거리 조준을 방해 — 시야를 빼앗는 장막이 주제와 맞는다.
      const rangedPattern: readonly BossPatternAction[] = [
        'volley-telegraph',
        'shroud',
        'arcane-cast',
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
      'arcane-cast',
      'hazard',
      'charge-telegraph',
    ];
    return neutralPattern[sequenceSlot % neutralPattern.length];
  }
}

export const BOSS_PATTERN_TIMING = TIMING;
