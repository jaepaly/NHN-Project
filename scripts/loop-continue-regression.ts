import assert from 'node:assert/strict';
import { LOOP_CONFIG, enemyHpScale, loopDamageScale } from '../src/combat-core/run/loopDifficulty';
import {
  POWER_INDEX, autoBuildFill, mainAffinity, playerPowerIndex,
} from '../src/combat-core/run/playerPower';
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


// ── 적 체력 스케일링 — **플레이어 성장 대비 상대값** (총괄 지적) ────────────
// 성장이 없으면(파워 1) 바닥값만 걸린다
assert.equal(enemyHpScale(0, 1), 1, '첫 런 · 성장 없음 = 배율 1');
assert.equal(enemyHpScale(2, 1), 1 + LOOP_CONFIG.hpFloorPerLoop * 2, '성장 0이면 바닥값');
// 성장하면 흡수율만큼 따라온다
assert.equal(enemyHpScale(0, 2), 1 + LOOP_CONFIG.hpGainFromPower, '파워 ×2 → 성장분의 55%');
assert.equal(enemyHpScale(0, 3), 1 + LOOP_CONFIG.hpGainFromPower * 2, '파워 ×3');
// 바닥값과 상대값 중 큰 쪽
assert.equal(enemyHpScale(20, 1.1), Math.max(1 + 0.05 * 20, 1 + 0.55 * 0.1), '큰 쪽을 쓴다');
assert.equal(enemyHpScale(999, 99), LOOP_CONFIG.maxHpScale, '체력 배율 상한');
assert.equal(enemyHpScale(Number.NaN, Number.NaN), 1, 'NaN 방어');
assert.equal(enemyHpScale(-5, 0.2), 1, '음수·1 미만 파워 방어 (성장은 음수일 수 없다)');

// ══ **핵심 불변식**: 성장하면 반드시 순이득이다 ══
// 흡수율이 1 이상이면 고무줄이 되어 "보상을 먹어도 그대로"가 된다.
assert.ok(LOOP_CONFIG.hpGainFromPower < 1, '흡수율 < 1 — 고무줄 금지');
// 실효 비율(파워 ÷ 체력배율)이 파워에 대해 **단조 증가**. 성장이 손해가 되는 구간이 없다.
// 이게 고무줄 함정을 막는 유일한 보증이다: 비율 = P/(1+g(P−1)), d/dP = (1−g)/(…)² > 0.
for (const loop of [0, 3, 10, 30]) {
  let prevRatio = 0;
  for (let p = 1; p <= 6; p += 0.05) {
    const ratio = p / enemyHpScale(loop, p);
    assert.ok(ratio >= prevRatio - 1e-9, `loop ${loop} 파워 ${p.toFixed(2)}: 성장이 손해가 됐다`);
    prevRatio = ratio;
  }
}
// 성장을 안 하면 바닥값이 걸려 비율이 1 아래로 내려간다 — **의도된 동작**이다.
// 적 피해는 루프당 +30%씩 오르므로, 안 크는 플레이어에게 체력까지 그대로 두면
// "보상 스킵이 공략"이 되어버린다.
assert.ok(3 / enemyHpScale(3, 1) < 3, '성장 없이 루프만 돌면 적이 상대적으로 세진다');
assert.ok(1 / enemyHpScale(10, 1) < 1, '바닥값은 무성장 플레이어를 봐주지 않는다');
// 반대로 상대값이 걸리는 구간(성장한 플레이어)에서는 비율이 반드시 1 이상이다
for (const loop of [0, 3, 10]) {
  for (const p of [1.5, 2, 3, 4]) {
    const relative = 1 + LOOP_CONFIG.hpGainFromPower * (p - 1);
    if (relative < 1 + LOOP_CONFIG.hpFloorPerLoop * loop) continue; // 바닥값 구간은 위에서 다룸
    assert.ok(p / enemyHpScale(loop, p) >= 1, `loop ${loop} 파워 ${p}: 성장했는데 순이득이 없다`);
  }
}
// 체력은 피해보다 완만하게 오른다 — 두 축이 동시에 상한을 치면 즉사 판이 된다
assert.ok(LOOP_CONFIG.hpFloorPerLoop < LOOP_CONFIG.enemyDamagePerLoop, '바닥값 < 피해 증가율');
for (const loop of [1, 3, 5, 10]) {
  assert.ok(enemyHpScale(loop, 1) <= loopDamageScale(loop), `loop ${loop}: 바닥값 ≤ 피해 배율`);
}
// 파워·루프 각각에 단조 비감소
let prevHp = 0;
for (let l = 0; l <= 30; l += 1) {
  const v = enemyHpScale(l, 1);
  assert.ok(v >= prevHp, `루프 단조 비감소 위반 at ${l}`);
  prevHp = v;
}
prevHp = 0;
for (let p = 1; p <= 8; p += 0.1) {
  const v = enemyHpScale(0, p);
  assert.ok(v >= prevHp, `파워 단조 비감소 위반 at ${p.toFixed(1)}`);
  prevHp = v;
}

// 보스는 초과분의 절반만 — 내성 누적(#77)과 이중 강화가 되지 않게
assert.equal(enemyHpScale(0, 1, true), 1, '보스도 성장 없으면 1');
assert.ok(enemyHpScale(4, 2, true) < enemyHpScale(4, 2), '보스 배율 < 일반 배율');
assert.equal(
  enemyHpScale(0, 2, true),
  1 + LOOP_CONFIG.hpGainFromPower * LOOP_CONFIG.bossHpScaleFactor,
  '보스는 초과분에 계수만큼만',
);
assert.equal(
  enemyHpScale(999, 99, true),
  1 + (LOOP_CONFIG.maxHpScale - 1) * LOOP_CONFIG.bossHpScaleFactor,
  '보스 상한도 계수 반영',
);

// ── 파워 지표 (playerPower) ────────────────────────────────────────────
const NO_BUILD = { engraves: [], spirits: [], awakenings: {} };
assert.equal(playerPowerIndex({ affinity: {}, ...NO_BUILD }), 1, '빈 빌드 = 1');
assert.equal(playerPowerIndex({ affinity: { fire: 0.45 }, ...NO_BUILD }), 1.45, '사용 상한만');
// **합이 아니라 최대**: 수동 피해는 한 번에 한 원소만 걸린다
assert.equal(
  playerPowerIndex({ affinity: { fire: 0.6, ice: 0.6, wind: 0.6 }, ...NO_BUILD }),
  playerPowerIndex({ affinity: { fire: 0.6 }, ...NO_BUILD }),
  '여러 원소에 뿌려도 주력 하나로 잰다 (합산은 과대평가)',
);
assert.equal(mainAffinity({ fire: 0.3, ice: 1.2 }), 1.2, '주력 = 최댓값');
assert.equal(mainAffinity({}), 0);
// 오토 기여는 #67 게이트(40%)가 천장 — 빌드를 아무리 채워도 그 위로 못 간다
const FULL_ENGRAVE = [{ level: 3, evolved: true }, { level: 3, evolved: true }];
const FULL_SPIRIT = [{ level: 3, fused: true }, { level: 3, fused: true }];
assert.equal(autoBuildFill([], []), 0, '빈 빌드 = 충전도 0');
assert.equal(autoBuildFill(FULL_ENGRAVE, FULL_SPIRIT), 1, '만렙+진화/융합 = 충전도 1');
assert.ok(autoBuildFill([{ level: 3, evolved: false }], []) < 0.5, '한 슬롯 진화 전은 절반 이하');
assert.equal(
  playerPowerIndex({ affinity: {}, engraves: FULL_ENGRAVE, spirits: FULL_SPIRIT, awakenings: {} }),
  1 + POWER_INDEX.autoShare,
  '오토 최대 기여 = #67 게이트와 같은 40%',
);
// 융합 정령은 슬롯 하나를 비우지만 예산은 그대로 → 2슬롯 몫으로 센다
assert.equal(autoBuildFill([], [{ level: 3, fused: true }]), 0.5, '융합 1개 = 정령 줄 만충');
// 각성은 곱해진다
assert.ok(
  playerPowerIndex({ affinity: { fire: 1.2 }, engraves: [], spirits: [], awakenings: { fire: 'searing' } })
  > playerPowerIndex({ affinity: { fire: 1.2 }, ...NO_BUILD }),
  '각성이 파워를 올린다',
);
// 방어 — 쓰레기 입력이 들어와도 1 아래로 안 내려간다
assert.equal(
  playerPowerIndex({
    affinity: { fire: Number.NaN as number }, engraves: [{ level: -3, evolved: false }],
    spirits: [{ level: Number.NaN as number, fused: false }], awakenings: {},
  }),
  1,
  'NaN·음수 입력 방어',
);

console.log('loop continue regression: 난이도배율·이어가기빌드유지·reset초기화·상한지속·상대체력·파워지표 6군 통과');
