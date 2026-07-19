import assert from 'node:assert/strict';
import { spellPowerWithAffinity } from '../src/combat-core/combat/combatConfig';
import {
  PLAYER_COMBAT_CONFIG,
  PlayerCombatState,
} from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import {
  createRewardOptions,
  drawRewardOptions,
  RUN_REWARD_CONFIG,
} from '../src/combat-core/run/rewardConfig';
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
    // 고정 3택 주입 — 시드 랜덤 풀은 7)에서 별도 검증 (Phase 3.5)
    rewardDraw: createRewardOptions,
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

// 7) Phase 3.5 보상 풀 — 시드 랜덤 추첨·신규 패시브 (PROGRESSION_DESIGN §1)
{
  // 7-a. 같은 시드 = 같은 추첨 (재현성), 종류 중복 없음
  const seqA: string[] = [];
  const seqB: string[] = [];
  const mkRand = (seed: number) => {
    let a = seed >>> 0;
    return () => {
      a += 0x6d2b79f5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const randA = mkRand(42);
  const randB = mkRand(42);
  for (let room = 1; room <= 2; room++) {
    const a = drawRewardOptions(room, randA);
    const b = drawRewardOptions(room, randB);
    assert.equal(a.length, 3);
    assert.equal(new Set(a.map((o) => o.kind)).size, 3, '종류 중복 없음');
    assert.deepEqual(a.map((o) => o.id), b.map((o) => o.id), '같은 시드 = 같은 추첨');
    seqA.push(...a.map((o) => o.kind));
    seqB.push(...b.map((o) => o.kind));
  }
  // 7-b. 다른 시드는 (충분한 표본에서) 다른 순열을 낸다
  const randC = mkRand(7);
  const kindsC: string[] = [];
  for (let room = 1; room <= 4; room++) {
    kindsC.push(...drawRewardOptions(room, randC).map((o) => o.kind));
  }
  assert.notDeepEqual(kindsC.slice(0, seqA.length), seqA, '다른 시드 = 다른 순열');

  // 7-c. 신속 영창: 쿨다운 감소 + 하한
  const swift = new PlayerCombatState();
  swift.addCooldownReduction(RUN_REWARD_CONFIG.swiftIncantReduction);
  assert.equal(
    swift.globalCooldownSeconds,
    PLAYER_COMBAT_CONFIG.globalCooldownSeconds - RUN_REWARD_CONFIG.swiftIncantReduction,
  );
  swift.addCooldownReduction(999);
  assert.equal(
    swift.globalCooldownSeconds,
    PLAYER_COMBAT_CONFIG.globalCooldownFloorSeconds,
    '쿨다운 하한',
  );
  swift.startGlobalCooldown();
  assert.equal(swift.cooldownRemaining, PLAYER_COMBAT_CONFIG.globalCooldownFloorSeconds);

  // 7-d. 마나 격류: 재생 배율
  const surge = new PlayerCombatState();
  surge.trySpendMana(100);
  surge.addManaRegenMultiplier(RUN_REWARD_CONFIG.manaSurgeBonus);
  surge.update(1);
  assert.equal(
    Math.round(surge.mana),
    Math.round(PLAYER_COMBAT_CONFIG.manaRegenPerSecond * (1 + RUN_REWARD_CONFIG.manaSurgeBonus)),
  );

  // 7-e. 수호 기점: 다음 방 시작마다 보호막 부여 (+ reset으로 소멸)
  const wardPlayer = new PlayerCombatState();
  let wardTransition: (() => void) | null = null;
  const wardRun = new CombatRunController({
    playerState: wardPlayer,
    maxRooms: 3,
    rewardDraw: (roomIndex) => [{
      id: `room-${roomIndex}-ward-start`,
      kind: 'ward-start',
      title: '수호 기점',
      description: 'test',
    }],
    scheduleTransition: (_delay, callback) => { wardTransition = callback; },
  });
  wardRun.notifyRoomCleared();
  wardRun.chooseReward('room-1-ward-start');
  assert.equal(wardPlayer.shield, 0, '획득 직후가 아니라 방 시작에 부여');
  wardTransition!();
  assert.equal(wardPlayer.shield, RUN_REWARD_CONFIG.wardStartShield, '방 2 개막 보호막');
  wardRun.reset();
  assert.equal(wardRun.state.rewards.length, 0);

  // 7-f. 플레이어 reset이 신규 패시브도 초기화
  swift.reset();
  assert.equal(swift.globalCooldownSeconds, PLAYER_COMBAT_CONFIG.globalCooldownSeconds);
  surge.reset();
  assert.equal(surge.manaRegenMultiplier, 1);
}

// 8) Phase 4 §2-2: 6전투·5보상, 스테이지/조우 계약과 런 단위 선택 고정
const phase4Player = new PlayerCombatState();
let phase4Transition: (() => void) | null = null;
const phase4Run = new CombatRunController({
  playerState: phase4Player,
  seed: 42,
  rewardDraw: (roomIndex) => [{
    id: `room-${roomIndex}-hp`, kind: 'max-hp', title: 'HP', description: 'test',
  }],
  scheduleTransition: (_delay, callback) => { phase4Transition = callback; },
});
assert.equal(phase4Run.state.maxRooms, 6);
assert.equal(phase4Run.state.stage, 1);
assert.equal(phase4Run.state.encounterId, 'stage-1-room-a');
let phase4RewardCount = 0;
for (let room = 1; room <= 6; room++) {
  const before = phase4Run.state;
  if (room === 3) assert.equal(before.encounterKind, 'stage-boss');
  if (room === 4) {
    assert.equal(before.stage, 2);
    assert.ok(['shield-sentinel', 'hazard-mixed'].includes(before.encounterVariantId ?? ''));
  }
  if (room === 5) assert.equal(before.encounterKind, 'elite');
  if (room === 6) assert.equal(before.encounterKind, 'memory-boss');
  phase4Run.notifyRoomCleared();
  if (room === 6) break;
  phase4RewardCount += 1;
  phase4Run.chooseReward(`room-${room}-hp`);
  phase4Transition!();
  phase4Transition = null;
}
assert.equal(phase4RewardCount, 5);
assert.equal(phase4Run.state.phase, 'run-over');

console.log('CombatRunController regression: 능력치·3택 보상·2개 방·이벤트·친화·보상풀 7군 통과');
