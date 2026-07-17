import assert from 'node:assert/strict';
import { spellPowerWithAffinity } from '../src/combat-core/combat/combatConfig';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';
import type { RewardOption, RunEvents } from '../src/run/runContract';

interface RunHarness {
  player: PlayerCombatState;
  controller: CombatRunController;
  events: Array<keyof RunEvents>;
  options: RewardOption[];
  runTransition(): void;
}

function createHarness(): RunHarness {
  const player = new PlayerCombatState();
  const events: Array<keyof RunEvents> = [];
  let options: RewardOption[] = [];
  let scheduledDelay = -1;
  let transitionCallback: (() => void) | null = null;
  const controller = new CombatRunController({
    playerState: player,
    // 이 하네스는 "2방 런 흐름" 시나리오를 고정 검증한다.
    // (프로덕션 maxRooms는 Phase 3부터 3 — 마지막 방은 보스방, test:boss-core에서 검증)
    maxRooms: 2,
    scheduleTransition: (delayMs, callback) => {
      scheduledDelay = delayMs;
      transitionCallback = callback;
    },
  });

  controller.on('room-cleared', (rewardOptions) => {
    events.push('room-cleared');
    options = rewardOptions;
  });
  controller.on('reward-applied', (_chosen, state) => {
    assert.equal(state.phase, 'room-transition');
    events.push('reward-applied');
  });
  controller.on('room-transition', (state, durationMs) => {
    assert.equal(state.phase, 'room-transition');
    events.push('room-transition');
    assert.equal(durationMs, RUN_REWARD_CONFIG.transitionDurationMs);
  });
  controller.on('room-started', (state) => {
    assert.equal(state.phase, 'combat');
    assert.equal(state.roomIndex, 2);
    events.push('room-started');
  });
  controller.on('run-completed', (state) => {
    assert.equal(state.phase, 'run-over');
    events.push('run-completed');
  });

  return {
    player,
    controller,
    events,
    get options() {
      return options;
    },
    runTransition() {
      assert.equal(scheduledDelay, RUN_REWARD_CONFIG.transitionDurationMs);
      assert.ok(transitionCallback, '다음 방 콜백 예약');
      const callback = transitionCallback;
      transitionCallback = null;
      callback();
    },
  };
}

// 1) 플레이어 최대 능력치 API: 음수·무한대 무시, 증가량 반환
const statPlayer = new PlayerCombatState();
assert.equal(statPlayer.increaseMaxHp(20), 20);
assert.equal(statPlayer.maxHp, 120);
assert.equal(statPlayer.increaseMaxHp(-10), 0);
assert.equal(statPlayer.increaseMaxMana(Number.POSITIVE_INFINITY), 0);
assert.equal(statPlayer.maxMana, 100);

// 2) 방 1 → HP 보상 → 전환 → 방 2 → 런 완료
const hpRun = createHarness();
hpRun.player.takeDamage(50);
hpRun.controller.chooseReward('invalid');
assert.equal(hpRun.controller.state.phase, 'combat', 'combat 중 보상 선택 no-op');
hpRun.controller.notifyRoomCleared();
assert.equal(hpRun.controller.state.phase, 'reward-select');
assert.equal(hpRun.options.length, 3, '결정론적 3택');
hpRun.controller.chooseReward('invalid');
assert.equal(hpRun.controller.state.phase, 'reward-select', '잘못된 보상 id no-op');
const hpReward = hpRun.options.find((option) => option.kind === 'max-hp');
assert.ok(hpReward);
hpRun.controller.chooseReward(hpReward.id);
assert.equal(hpRun.player.maxHp, 120);
assert.equal(hpRun.player.hp, 70, '최대 HP +20 뒤 현재 HP 20 회복');
assert.equal(hpRun.controller.state.phase, 'room-transition');
assert.deepEqual(hpRun.events, ['room-cleared', 'reward-applied', 'room-transition']);
hpRun.controller.chooseReward(hpReward.id);
assert.equal(hpRun.controller.state.rewards.length, 1, '전환 중 중복 선택 no-op');
hpRun.runTransition();
assert.equal(hpRun.controller.state.roomIndex, 2);
assert.equal(hpRun.controller.state.phase, 'combat');
hpRun.controller.notifyRoomCleared();
assert.equal(hpRun.controller.state.phase, 'run-over');
assert.deepEqual(hpRun.events, [
  'room-cleared',
  'reward-applied',
  'room-transition',
  'room-started',
  'run-completed',
]);

// 3) 최대 마나 보상과 즉시 회복
const manaRun = createHarness();
assert.equal(manaRun.player.trySpendMana(60), true);
manaRun.controller.notifyRoomCleared();
const manaReward = manaRun.options.find((option) => option.kind === 'max-mana');
assert.ok(manaReward);
manaRun.controller.chooseReward(manaReward.id);
assert.equal(manaRun.player.maxMana, 120);
assert.equal(manaRun.player.mana, 60);

// 4) 친화 보상과 스냅샷 방어 복사
const affinityRun = createHarness();
affinityRun.controller.notifyRoomCleared();
const affinityReward = affinityRun.options.find((option) => option.kind === 'affinity');
assert.ok(affinityReward?.element);
affinityRun.controller.chooseReward(affinityReward.id);
assert.equal(
  affinityRun.controller.state.elementalAffinity[affinityReward.element],
  RUN_REWARD_CONFIG.affinityBonus,
);
const exposedState = affinityRun.controller.state;
(exposedState.rewards as RewardOption[]).length = 0;
exposedState.elementalAffinity[affinityReward.element] = 99;
assert.equal(affinityRun.controller.state.rewards.length, 1, '보상 기록 방어 복사');
assert.equal(
  affinityRun.controller.state.elementalAffinity[affinityReward.element],
  RUN_REWARD_CONFIG.affinityBonus,
  '친화 상태 방어 복사',
);

// 5) off 계약: 제거한 handler는 호출되지 않음
const offRun = createHarness();
let detachedCalls = 0;
const detachedHandler: RunEvents['room-cleared'] = () => {
  detachedCalls += 1;
};
offRun.controller.on('room-cleared', detachedHandler);
offRun.controller.off('room-cleared', detachedHandler);
offRun.controller.notifyRoomCleared();
assert.equal(detachedCalls, 0);

// 6) R2 반복 패널티 반영 power 뒤 R1 친화 보너스 적용
assert.equal(spellPowerWithAffinity(32, 0.15), 37);
assert.equal(spellPowerWithAffinity(32, -1), 32, '음수 친화 보너스 무시');
assert.equal(spellPowerWithAffinity(Number.NaN, 0.15), 0, '비정상 power 방어');

console.log('CombatRunController regression: 능력치·3택 보상·2개 방·이벤트·친화 6군 통과');
