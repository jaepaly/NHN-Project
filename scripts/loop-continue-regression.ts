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

// ⚠️ **이어가기는 이제 빌드를 비운다** (총괄 결정 2026-07-31).
//
// 종전엔 친화·보상을 전부 유지해 2회차부터 성장이 아니라 **누적**이었다. 맵이
// 2스테이지 구조가 되며 한 런 안에서도 성장이 체감되므로 그럴 이유가 약해졌다.
// 계승은 **고른 친화 하나**뿐이다(runInheritance).
controller.continueRun();
assert.equal(controller.state.loopIndex, 1, '이어가면 loop +1');
assert.equal(controller.state.roomIndex, 1, '방은 다시 1부터');
assert.equal(controller.state.phase, 'combat', '전투 상태로 진입');
assert.equal(
  controller.state.elementalAffinity.fire ?? 0, 0,
  '계승을 지정하지 않으면 친화는 비워진다',
);
assert.equal(controller.state.rewards.length, 0, '보상 누적도 비워진다');

// 계승을 넘기면 그 원소만 남는다
const c1 = new CombatRunController({ playerState: new PlayerCombatState() });
c1.notifyRoomCleared();
c1.chooseReward('room-1-affinity-fire');
c1.growAffinityFromUse('ice');
c1.continueRun(Date.now(), { element: 'fire', value: 0.45 });
assert.equal(c1.state.elementalAffinity.fire, 0.45, '고른 원소만 계승된다');
assert.equal(c1.state.elementalAffinity.ice ?? 0, 0, '고르지 않은 원소는 흩어진다');

controller.continueRun();
assert.equal(controller.state.loopIndex, 2, '거듭 이어가면 계속 오른다');

// 3) reset은 루프·빌드 모두 초기화 (마치기/새 런)
controller.reset();
assert.equal(controller.state.loopIndex, 0, 'reset은 loop 0으로');
assert.equal(controller.state.elementalAffinity.fire ?? 0, 0, 'reset은 친화도 비운다');
assert.equal(controller.state.rewards.length, 0, 'reset은 보상도 비운다');

// 4) 사용 친화 소프트캡이 continue를 넘어도 유지되는지 (이어가기가 상한을 리셋하면 안 됨)
// ⚠️ 이 검사도 뒤집혔다. 빌드를 비우므로 **사용 친화 상한 판정도 초기화된다** —
// 그게 의도다. 안 그러면 계승으로 받은 0.45 위에 다시 0.45를 쌓지 못해, 계승이
// 오히려 손해가 된다("들고 갔더니 더 못 큰다").
const c2 = new CombatRunController({ playerState: new PlayerCombatState() });
for (let i = 0; i < 100; i += 1) c2.growAffinityFromUse('ice');
const capped = c2.state.elementalAffinity.ice ?? 0;
assert.ok(capped > 0, '상한까지 쌓였다');
c2.continueRun();
assert.equal(c2.state.elementalAffinity.ice ?? 0, 0, '이어가면 비워진다');
c2.growAffinityFromUse('ice');
assert.ok(
  (c2.state.elementalAffinity.ice ?? 0) > 0,
  '새 런에서는 사용 친화를 다시 쌓을 수 있어야 한다',
);


// ── 적 체력 스케일링 — **이어가기 루프 단계만** (#267) ────────────────
assert.equal(enemyHpScale(0), 1, '첫 런은 배율 1');
assert.equal(enemyHpScale(1), 1 + LOOP_CONFIG.enemyHpPerLoop, 'loop 1');
assert.equal(enemyHpScale(2), 1 + LOOP_CONFIG.enemyHpPerLoop * 2, 'loop 2');
assert.equal(enemyHpScale(999), LOOP_CONFIG.maxHpScale, '체력 배율 상한');
assert.equal(enemyHpScale(Number.NaN), 1, 'NaN 방어');
assert.equal(enemyHpScale(-5), 1, '음수 방어');

// ══ **핵심 불변식**: 적 체력은 플레이어 성장을 참조하지 않는다 (#267) ══
// 성장에 연동하면 분기 맵에서 위험한 경로를 고른 이점이 상쇄되고(실측 +24%→+7%),
// 같은 프리셋이 빌드마다 다른 클리어 시간을 내 목표시간(#258)을 검증할 수 없다.
// 시그니처가 (loopIndex, isBoss=false)라 Function.length는 1이다 — 성장 인자가
// 끼어들면 2가 되어 여기서 깨진다. 시그니처 자체를 잠그는 트립와이어.
assert.equal(enemyHpScale.length, 1, '성장 인자를 받지 않는다 (loopIndex만 필수)');
for (const loop of [0, 1, 3, 10, 30]) {
  const base = enemyHpScale(loop);
  assert.equal(enemyHpScale(loop, false), base, `loop ${loop}: 같은 루프면 항상 같은 값`);
}

// 체력은 피해보다 완만하게 오른다 — 두 축이 동시에 상한을 치면 즉사 판이 된다
assert.ok(LOOP_CONFIG.enemyHpPerLoop < LOOP_CONFIG.enemyDamagePerLoop, '체력 < 피해 증가율');
for (const loop of [1, 3, 5, 10]) {
  assert.ok(enemyHpScale(loop) <= loopDamageScale(loop), `loop ${loop}: 체력 ≤ 피해 배율`);
}
// 루프에 단조 비감소
let prevHp = 0;
for (let l = 0; l <= 30; l += 1) {
  const v = enemyHpScale(l);
  assert.ok(v >= prevHp, `루프 단조 비감소 위반 at ${l}`);
  prevHp = v;
}

// 보스는 초과분의 절반만 — 내성 누적(#77)과 이중 강화가 되지 않게
assert.equal(enemyHpScale(0, true), 1, '보스도 첫 런은 1');
assert.ok(enemyHpScale(4, true) < enemyHpScale(4), '보스 배율 < 일반 배율');
assert.equal(
  enemyHpScale(2, true),
  1 + LOOP_CONFIG.enemyHpPerLoop * 2 * LOOP_CONFIG.bossHpScaleFactor,
  '보스는 초과분에 계수만큼만',
);
assert.equal(
  enemyHpScale(999, true),
  1 + (LOOP_CONFIG.maxHpScale - 1) * LOOP_CONFIG.bossHpScaleFactor,
  '보스 상한도 계수 반영',
);

// ── 파워 지표 (playerPower) — **측정 전용** (#267 7번) ─────────────────
// 적 스탯에는 쓰지 않는다. #258 프리셋 목표시간 검증에서 "이 판은 파워 2.4였다"를
// 기록하는 용도라, 같은 빌드 = 같은 값이라는 순수성이 여전히 중요하다.
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

console.log('loop continue regression: 난이도배율·이어가기빌드비움·계승·reset초기화·재성장·루프체력·성장비연동·파워지표 8군 통과');
