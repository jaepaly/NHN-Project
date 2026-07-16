/**
 * 보스 코어 회귀 — 내성 프로필·피해 배율·3방 런 흐름·런 리셋 (Phase 3 총괄 트랙)
 * 실행: npm run test:boss-core (Phaser 비의존 모듈만 검증)
 */
import assert from 'node:assert/strict';
import { BOSS_CONFIG } from '../src/combat-core/boss/bossConfig';
import {
  NO_RESISTANCE,
  bossDamageMultiplier,
  resistanceFromBossMemory,
} from '../src/combat-core/boss/bossResistance';
import type { BossMemoryProfile } from '../src/spell/spellHistory';
import { PlayerCombatState, PLAYER_COMBAT_CONFIG } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';

function memory(overrides: Partial<BossMemoryProfile>): BossMemoryProfile {
  return {
    dominantElement: null,
    dominantForm: null,
    recentSpellNames: [],
    totalCasts: 0,
    ...overrides,
  };
}

// ① 내성 프로필 — 표본 충분 + 최다 원소 → 내성 / 표본 부족·원소 없음 → 무내성
{
  const fireHeavy = resistanceFromBossMemory(
    memory({ dominantElement: 'fire', totalCasts: BOSS_CONFIG.resistanceMinCasts }),
  );
  assert.equal(fireHeavy.element, 'fire');
  assert.equal(fireHeavy.multiplier, BOSS_CONFIG.resistanceMultiplier);

  const tooFew = resistanceFromBossMemory(
    memory({ dominantElement: 'fire', totalCasts: BOSS_CONFIG.resistanceMinCasts - 1 }),
  );
  assert.deepEqual(tooFew, NO_RESISTANCE);

  const empty = resistanceFromBossMemory(memory({ totalCasts: 10 }));
  assert.deepEqual(empty, NO_RESISTANCE);
}

// ② 피해 배율 — 내성 원소만 감쇄, 그 외 1
{
  const profile = { element: 'fire', multiplier: 0.3 } as const;
  assert.equal(bossDamageMultiplier(profile, 'fire'), 0.3);
  assert.equal(bossDamageMultiplier(profile, 'water'), 1);
  assert.equal(bossDamageMultiplier(NO_RESISTANCE, 'fire'), 1);
}

// ③ 3방 런 흐름 — 방1·방2 클리어는 보상, 마지막(보스)방 클리어는 run-completed
{
  assert.equal(RUN_REWARD_CONFIG.maxRooms, 3, '보스방 포함 3방이어야 한다');
  const player = new PlayerCombatState();
  const controller = new CombatRunController({
    playerState: player,
    scheduleTransition: (_delay, callback) => callback(), // 동기 전환
  });
  const events: string[] = [];
  controller.on('room-cleared', () => events.push('room-cleared'));
  controller.on('room-started', (state) => events.push(`room-started:${state.roomIndex}`));
  controller.on('run-completed', () => events.push('run-completed'));

  for (let room = 1; room <= 2; room++) {
    controller.notifyRoomCleared();
    const options = (controller as unknown as { rewardOptions: { id: string }[] }).rewardOptions;
    controller.chooseReward(options[0]?.id ?? `room-${room}-max-hp`);
  }
  assert.equal(controller.state.roomIndex, 3);
  assert.equal(controller.state.phase, 'combat');

  controller.notifyRoomCleared(); // 보스 격파
  assert.equal(controller.state.phase, 'run-over');
  assert.deepEqual(events, [
    'room-cleared', 'room-started:2',
    'room-cleared', 'room-started:3',
    'run-completed',
  ]);

  // ④ 런 리셋 — 상태 초기화 + room-started(1) 발화
  controller.reset();
  assert.equal(controller.state.roomIndex, 1);
  assert.equal(controller.state.phase, 'combat');
  assert.equal(controller.state.rewards.length, 0);
  assert.deepEqual(controller.state.elementalAffinity, {});
  assert.equal(events[events.length - 1], 'room-started:1');
}

// ⑤ 플레이어 리셋 — 보상으로 늘어난 최대치·피해·실드 전부 기본값 복귀
{
  const player = new PlayerCombatState();
  player.increaseMaxHp(40);
  player.increaseMaxMana(20);
  player.takeDamage(50);
  player.addShield(15);
  player.trySpendMana(30);
  player.startGlobalCooldown();

  player.reset();
  assert.equal(player.maxHp, PLAYER_COMBAT_CONFIG.maxHp);
  assert.equal(player.maxMana, PLAYER_COMBAT_CONFIG.maxMana);
  assert.equal(player.hp, PLAYER_COMBAT_CONFIG.maxHp);
  assert.equal(player.mana, PLAYER_COMBAT_CONFIG.maxMana);
  assert.equal(player.shield, 0);
  assert.equal(player.cooldownRemaining, 0);
}

console.log('boss core regression: 내성·배율·3방 런·리셋 5군 통과');
