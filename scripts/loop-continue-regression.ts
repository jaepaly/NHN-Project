import assert from 'node:assert/strict';
import { LOOP_CONFIG, loopDamageScale, loopHpScale } from '../src/combat-core/run/loopDifficulty';
import { CombatRunController } from '../src/combat-core/run/runController';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import type { RewardOption } from '../src/run/runContract';

// 1) 난이도 배율 — 루프당 증가, 상한, 방어
assert.equal(loopDamageScale(0), 1, '첫 런은 배율 1');
assert.equal(loopDamageScale(1), 1 + LOOP_CONFIG.enemyDamagePerLoop, 'loop 1');
assert.equal(loopDamageScale(2), 1 + LOOP_CONFIG.enemyDamagePerLoop * 2, 'loop 2');
assert.equal(loopDamageScale(999), LOOP_CONFIG.maxDamageScale, '상한');
assert.equal(loopDamageScale(-3), 1, '음수 방어');
assert.equal(loopDamageScale(Number.NaN), 1, 'NaN 방어');

// 2) continueRun — 루프 증가, 방은 1로, 빌드(친화·보상)는 유지
const controller = new CombatRunController({
  playerState: new PlayerCombatState(),
  rewardDraw: (roomIndex): RewardOption[] => [
    { id: `room-${roomIndex}-affinity-fire`, kind: 'affinity', title: '', description: '', element: 'fire' },
  ],
});
assert.equal(controller.state.loopIndex, 0, '첫 런 loop 0');

// 친화·보상을 쌓는다
controller.notifyRoomCleared();
controller.chooseReward('room-1-affinity-fire');
controller.growAffinityFromUse('fire');
const beforeAffinity = controller.state.elementalAffinity.fire ?? 0;
const beforeRewards = controller.state.rewards.length;
assert.ok(beforeAffinity > 0 && beforeRewards > 0, '빌드가 쌓였다');

controller.continueRun();
assert.equal(controller.state.loopIndex, 1, '이어가면 loop +1');
assert.equal(controller.state.roomIndex, 1, '방은 다시 1부터');
assert.equal(controller.state.phase, 'combat', '전투 상태로 진입');
assert.equal(
  controller.state.elementalAffinity.fire ?? 0, beforeAffinity,
  '친화(빌드)는 유지된다',
);
assert.equal(controller.state.rewards.length, beforeRewards, '보상 누적도 유지');

controller.continueRun();
assert.equal(controller.state.loopIndex, 2, '거듭 이어가면 계속 오른다');

// 3) reset은 루프·빌드 모두 초기화 (마치기/새 런)
controller.reset();
assert.equal(controller.state.loopIndex, 0, 'reset은 loop 0으로');
assert.equal(controller.state.elementalAffinity.fire ?? 0, 0, 'reset은 친화도 비운다');
assert.equal(controller.state.rewards.length, 0, 'reset은 보상도 비운다');

// 4) 사용 친화 소프트캡이 continue를 넘어도 유지되는지 (이어가기가 상한을 리셋하면 안 됨)
const c2 = new CombatRunController({ playerState: new PlayerCombatState() });
for (let i = 0; i < 100; i += 1) c2.growAffinityFromUse('ice');
const capped = c2.state.elementalAffinity.ice ?? 0;
c2.continueRun();
c2.growAffinityFromUse('ice');
assert.ok(
  Math.abs((c2.state.elementalAffinity.ice ?? 0) - capped) < 1e-9,
  '이어가기가 사용 친화 상한 판정을 리셋하지 않는다 (빌드 지속)',
);


// ── 적 체력 스케일링 (총괄 지적: 딜만 성장해 한 방에 쓸린다) ────────────
assert.equal(loopHpScale(0), 1, '첫 런은 체력 배율 1');
assert.equal(loopHpScale(1), 1 + LOOP_CONFIG.enemyHpPerLoop, 'loop 1');
assert.equal(loopHpScale(2), 1 + LOOP_CONFIG.enemyHpPerLoop * 2, 'loop 2');
assert.equal(loopHpScale(999), LOOP_CONFIG.maxHpScale, '체력 배율 상한');
assert.equal(loopHpScale(Number.NaN), 1, 'NaN 방어');
assert.equal(loopHpScale(-5), 1, '음수 방어');

// **핵심 불변식**: 체력이 피해보다 완만하게 오른다.
// 같은 속도면 제자리걸음이고, 더 빠르면 성장이 체감되지 않는다.
assert.ok(
  LOOP_CONFIG.enemyHpPerLoop < LOOP_CONFIG.enemyDamagePerLoop,
  '체력 증가율이 피해 증가율보다 낮다',
);
for (const loop of [1, 3, 5, 10]) {
  assert.ok(loopHpScale(loop) <= loopDamageScale(loop), `loop ${loop}: 체력 ≤ 피해 배율`);
}
// 단조 비감소
let prevHp = 0;
for (let l = 0; l <= 30; l += 1) {
  const v = loopHpScale(l);
  assert.ok(v >= prevHp, `체력 배율 단조 비감소 위반 at ${l}`);
  prevHp = v;
}

// 보스는 절반만 — 내성 누적(#77)과 이중 강화가 되지 않게
assert.equal(loopHpScale(0, true), 1, '보스도 첫 런은 1');
assert.ok(loopHpScale(4, true) < loopHpScale(4), '보스 배율 < 일반 배율');
assert.equal(
  loopHpScale(2, true),
  1 + LOOP_CONFIG.enemyHpPerLoop * LOOP_CONFIG.bossHpScaleFactor * 2,
  '보스는 계수만큼만 오른다',
);
// 보스 상한도 계수만큼 낮다
assert.ok(loopHpScale(999, true) < LOOP_CONFIG.maxHpScale, '보스 상한도 절반 반영');
assert.equal(
  loopHpScale(999, true),
  1 + (LOOP_CONFIG.maxHpScale - 1) * LOOP_CONFIG.bossHpScaleFactor,
);

console.log('loop continue regression: 난이도배율·이어가기빌드유지·reset초기화·상한지속 4군 통과');
