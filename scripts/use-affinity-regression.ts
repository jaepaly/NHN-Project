import assert from 'node:assert/strict';
import { USE_AFFINITY, accrueUseAffinity } from '../src/combat-core/run/useAffinity';
import { CombatRunController } from '../src/combat-core/run/runController';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';

// 1) 순수 accrual — 상한 안에서 perCast씩, 상한에서 멈춘다
const first = accrueUseAffinity(0);
assert.equal(first.added, USE_AFFINITY.perCast, '첫 시전은 perCast만큼');
assert.equal(first.nextAddedSoFar, USE_AFFINITY.perCast);

const nearCap = accrueUseAffinity(USE_AFFINITY.useCap - 0.005);
assert.ok(nearCap.added <= 0.005 + 1e-9, '상한 직전엔 남은 만큼만');
assert.equal(nearCap.nextAddedSoFar, USE_AFFINITY.useCap, '상한을 넘지 않는다');

const atCap = accrueUseAffinity(USE_AFFINITY.useCap);
assert.equal(atCap.added, 0, '상한 도달 후엔 0');
assert.equal(atCap.nextAddedSoFar, USE_AFFINITY.useCap);

assert.equal(accrueUseAffinity(Number.NaN).added, USE_AFFINITY.perCast, 'NaN 방어');
assert.equal(accrueUseAffinity(-5).added, USE_AFFINITY.perCast, '음수 방어');

// 2) 컨트롤러 — 시전이 친화를 올리고, 카드 친화와 같은 맵에 합산된다
const controller = new CombatRunController({ playerState: new PlayerCombatState() });
const r1 = controller.growAffinityFromUse('fire');
assert.equal(Math.round(r1.added * 1000), Math.round(USE_AFFINITY.perCast * 1000));
assert.equal(controller.state.elementalAffinity.fire, r1.total, 'state에 반영');

const r2 = controller.growAffinityFromUse('fire');
assert.ok(r2.total > r1.total, '반복 시전으로 누적 성장');

// 3) 소프트캡 — 사용만으로는 useCap을 못 넘는다
for (let i = 0; i < 100; i += 1) controller.growAffinityFromUse('fire');
const capped = controller.state.elementalAffinity.fire ?? 0;
assert.ok(
  Math.abs(capped - USE_AFFINITY.useCap) < 1e-9,
  `사용 친화 상한 ${capped} = ${USE_AFFINITY.useCap}`,
);
const overCap = controller.growAffinityFromUse('fire');
assert.equal(overCap.added, 0, '상한에서 더 안 오름');

// 4) 원소별 독립 — 불 상한이 얼음에 영향 없음
assert.equal(controller.state.elementalAffinity.ice ?? 0, 0, '안 쓴 원소는 0');
const ice = controller.growAffinityFromUse('ice');
assert.ok(ice.added > 0, '다른 원소는 자기 상한까지 따로 성장');

// 5) reset — 새 런에 사용 친화·상한 판정 모두 초기화
controller.reset();
assert.equal(controller.state.elementalAffinity.fire ?? 0, 0, 'reset이 친화 비움');
const afterReset = controller.growAffinityFromUse('fire');
assert.equal(
  Math.round(afterReset.total * 1000),
  Math.round(USE_AFFINITY.perCast * 1000),
  'reset 후 상한 판정도 초기화 — 다시 처음부터',
);

console.log('use affinity regression: accrual·컨트롤러합산·소프트캡·원소독립·reset 5군 통과');
