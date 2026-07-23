/**
 * 보스 코어 회귀 — 3방 런 흐름·런 리셋·장기 내성 수치 게이트 (Phase 3 총괄 트랙)
 * 실행: npm run test:boss-core
 * ※ 내성 프로필·피해 배율 계산은 R2 계약(test:boss)이 검증 — 여기서는 적용 수치와 런 흐름만.
 */
import assert from 'node:assert/strict';
import { BOSS_CONFIG } from '../src/combat-core/boss/bossConfig';
import { RESISTANCE } from '../src/spell/bossMemory';
import { PlayerCombatState, PLAYER_COMBAT_CONFIG } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';
import { BossPatternController } from '../src/combat-core/boss/bossPatternController';

// ① 장기(부분) 내성 수치 게이트 — 단기 내성(R2)보다 약하고, 무효(1)보다는 강해야 한다
{
  assert.ok(
    BOSS_CONFIG.longTermResistMultiplier > RESISTANCE.multiplier,
    '장기 부분 내성은 단기 내성보다 약해야 함 (배수가 더 커야 함)',
  );
  assert.ok(BOSS_CONFIG.longTermResistMultiplier < 1, '장기 내성은 유효해야 함');
  assert.ok(BOSS_CONFIG.rushSpeedMultiplier > 1);
  assert.ok(BOSS_CONFIG.rangedVolleyIntervalMultiplier < 1);
}

// ② 3방 런 흐름 — 방1·방2 클리어는 보상, 마지막(보스)방 클리어는 run-completed
{
  assert.equal(RUN_REWARD_CONFIG.maxRooms, 3, '보스방 포함 3방이어야 한다');
  const player = new PlayerCombatState();
  const controller = new CombatRunController({
    playerState: player,
    maxRooms: 3,
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

  // ③ 런 리셋 — 상태 초기화 + room-started(1) 발화
  controller.reset();
  assert.equal(controller.state.roomIndex, 1);
  assert.equal(controller.state.phase, 'combat');
  assert.equal(controller.state.rewards.length, 0);
  assert.deepEqual(controller.state.elementalAffinity, {});
  assert.equal(events[events.length - 1], 'room-started:1');
}

// ④ 플레이어 리셋 — 보상으로 늘어난 최대치·피해·실드 전부 기본값 복귀
{
  const player = new PlayerCombatState();
  player.increaseMaxHp(40);
  player.increaseMaxMana(20);
  player.takeDamage(50);
  player.addShield(15);
  player.trySpendMana(30);
  player.startCastLock();

  player.reset();
  assert.equal(player.maxHp, PLAYER_COMBAT_CONFIG.maxHp);
  assert.equal(player.maxMana, PLAYER_COMBAT_CONFIG.maxMana);
  assert.equal(player.hp, PLAYER_COMBAT_CONFIG.maxHp);
  assert.equal(player.mana, PLAYER_COMBAT_CONFIG.maxMana);
  assert.equal(player.shield, 0);
  assert.equal(player.cooldownRemaining, 0);
}

console.log('boss core regression: 내성수치게이트·3방 런·리셋 4군 통과');

// ⑤ Phase 4 보스 패턴 상태 머신
{
  const stage = new BossPatternController('stage');
  assert.deepEqual(stage.update(2, 1, 0).actions, ['volley-telegraph']);
  assert.deepEqual(stage.update(0.7, 1, 0).actions, ['volley-start']);
  assert.deepEqual(stage.update(0.35, 2, 0).actions, ['charge-telegraph']);
  assert.deepEqual(stage.update(0.7, 2, 0).actions, ['charge-start']);
  assert.deepEqual(stage.update(0.8, 2, 0).actions, ['charge-telegraph']);
  assert.deepEqual(stage.update(0.7, 2, 0).actions, ['charge-start']);
  assert.deepEqual(stage.update(0.8, 2, 0).actions, ['summon']);

  const rush = new BossPatternController('memory');
  rush.setCounterStrategy('rush');
  assert.deepEqual(rush.update(0.35, 2, 0).actions, ['charge-telegraph']);
  assert.deepEqual(rush.update(0.7, 2, 0).actions, ['charge-start']);
  assert.deepEqual(rush.update(0.8, 2, 0).actions, ['charge-telegraph']);
  assert.deepEqual(rush.update(0.7, 2, 0).actions, ['charge-start']);

  const intro = new BossPatternController('memory');
  assert.deepEqual(intro.update(2, 1, 0).actions, ['volley-telegraph']);
  assert.deepEqual(intro.update(0.7, 1, 0).actions, ['volley-start']);
  assert.deepEqual(intro.update(2.5, 1, 0).actions, ['hazard']);
  assert.deepEqual(intro.update(3.2, 1, 0).actions, ['charge-telegraph']);
  assert.deepEqual(intro.update(0.7, 1, 0).actions, ['charge-start']);

  const ranged = new BossPatternController('memory');
  ranged.setCounterStrategy('ranged');
  assert.deepEqual(ranged.update(0.35, 2, 0).actions, ['volley-telegraph']);
  assert.deepEqual(ranged.update(0.7, 2, 0).actions, ['volley-start']);
  assert.deepEqual(ranged.update(3.2, 2, 0).actions, ['hazard']);
  assert.deepEqual(ranged.update(0.35, 3, 0).actions, ['volley-telegraph']);
  assert.deepEqual(ranged.update(0.7, 3, 0).actions, ['volley-start']);
  assert.deepEqual(ranged.update(2.6, 3, 0).actions, ['hazard']);
  assert.deepEqual(ranged.update(2.6, 3, 0).actions, ['summon-elite']);
  assert.deepEqual(ranged.update(2.6, 3, 4).actions, ['charge-telegraph']);
  assert.deepEqual(ranged.update(0.7, 3, 4).actions, ['charge-start']);

  const capped = new BossPatternController('memory');
  capped.setCounterStrategy('ranged');
  assert.deepEqual(capped.update(0.35, 3, 4).actions, ['volley-telegraph']);
  assert.deepEqual(capped.update(0.7, 3, 4).actions, ['volley-start']);
  assert.deepEqual(capped.update(2.6, 3, 4).actions, ['hazard']);
  assert.deepEqual(capped.update(2.6, 3, 4).actions, ['volley-telegraph']);
}
