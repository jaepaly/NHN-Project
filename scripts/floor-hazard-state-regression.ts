import assert from 'node:assert/strict';
import { FLOOR_HAZARD_CONFIG } from '../src/combat-core/combat/floorHazardConfig';
import {
  FLOOR_HAZARD_KINDS,
  advanceFloorHazardTimers,
  createFloorHazardPlayerState,
  floorHazardCleansesRemaining,
  floorHazardTickKinds,
  isFloorHazardImmune,
  tryCleanseFloorHazards,
} from '../src/combat-core/combat/floorHazardState';

const fresh = createFloorHazardPlayerState();

// 1) 초기 상태 — 아무것도 안 걸려 있다
assert.deepEqual(fresh.linger, { lava: 0, poison: 0 });
assert.deepEqual(fresh.immunity, { lava: 0, poison: 0 });
assert.equal(fresh.cleansesUsed, 0);
assert.equal(floorHazardCleansesRemaining(fresh), FLOOR_HAZARD_CONFIG.cleansesPerRoom);
for (const kind of FLOOR_HAZARD_KINDS) assert.equal(isFloorHazardImmune(fresh, kind), false);

// 2) 밟는 동안은 아프다
const onLava = floorHazardTickKinds(fresh, ['lava']);
assert.deepEqual(onLava.kinds, ['lava']);
assert.deepEqual(floorHazardTickKinds(fresh, []).kinds, [], '안 밟으면 안 아프다');
assert.deepEqual(
  floorHazardTickKinds(fresh, ['lava', 'poison']).kinds, ['lava', 'poison'], '겹치면 둘 다',
);

// 3) **핵심**: 독지대만 이탈 후 잔류한다 — 이게 용암과의 정체성 차이다
//    (종전에는 lingerSeconds가 배선되지 않아 독지대가 "약한 용암"일 뿐이었다)
assert.equal(FLOOR_HAZARD_CONFIG.lava.lingerSeconds, 0, '용암은 즉시 멈춘다');
assert.ok(FLOOR_HAZARD_CONFIG.poison.lingerSeconds > 0, '독은 잔류한다');

let s = floorHazardTickKinds(fresh, ['poison']).state;
assert.equal(s.linger.poison, FLOOR_HAZARD_CONFIG.poison.lingerSeconds, '밟으면 잔류가 가득 찬다');
s = advanceFloorHazardTimers(s, 0.5);
const afterLeave = floorHazardTickKinds(s, []); // 존을 나왔는데도
assert.deepEqual(afterLeave.kinds, ['poison'], '나와도 잔류 동안은 계속 아프다');
// 잔류가 다 되면 멈춘다
s = advanceFloorHazardTimers(afterLeave.state, FLOOR_HAZARD_CONFIG.poison.lingerSeconds);
assert.deepEqual(floorHazardTickKinds(s, []).kinds, [], '잔류가 끝나면 멈춘다');

// 용암은 나오는 즉시 멈춘다
let lavaState = floorHazardTickKinds(fresh, ['lava']).state;
assert.equal(lavaState.linger.lava, 0);
lavaState = advanceFloorHazardTimers(lavaState, 0.01);
assert.deepEqual(floorHazardTickKinds(lavaState, []).kinds, [], '용암은 잔류 없음');

// 4) 정화 — 원소 **또는** 효과 카테고리로 매칭 (정해진 단어가 아니라 의미로)
const iceArmor = tryCleanseFloorHazards(fresh, 'ice', 'damage', ['lava']);
assert.deepEqual(iceArmor.cleansed, ['lava'], '얼음 → 용암 정화');
assert.equal(iceArmor.state.immunity.lava, FLOOR_HAZARD_CONFIG.immunitySeconds);
assert.equal(iceArmor.state.cleansesUsed, 1);
assert.deepEqual(
  tryCleanseFloorHazards(fresh, 'fire', 'shield', ['lava']).cleansed, ['lava'],
  '보호막 효과만으로도 용암 정화 (원소가 아니어도)',
);
assert.deepEqual(
  tryCleanseFloorHazards(fresh, 'light', 'damage', ['poison']).cleansed, ['poison'], '빛 → 독',
);
assert.deepEqual(
  tryCleanseFloorHazards(fresh, 'water', 'heal', ['lava', 'poison']).cleansed,
  ['lava', 'poison'],
  '물+회복은 둘 다 (한 번의 횟수로)',
);
// 상성이 아니면 안 걸린다
assert.deepEqual(tryCleanseFloorHazards(fresh, 'fire', 'damage', ['lava']).cleansed, []);

// 5) **방에 없는 지형은 정화하지 않는다** — 효과 없이 횟수만 태우면 억울하다
const noZone = tryCleanseFloorHazards(fresh, 'ice', 'damage', []);
assert.deepEqual(noZone.cleansed, []);
assert.equal(noZone.state.cleansesUsed, 0, '헛방은 횟수를 소모하지 않는다');
assert.equal(
  tryCleanseFloorHazards(fresh, 'ice', 'damage', ['poison']).state.cleansesUsed, 0,
  '다른 지형만 있는 방에서도 소모 없음',
);

// 6) 방당 횟수 상한 — 밟을 때마다 정화하면 위협이 무의미해진다
let budget = fresh;
for (let i = 0; i < FLOOR_HAZARD_CONFIG.cleansesPerRoom; i += 1) {
  budget = tryCleanseFloorHazards(budget, 'ice', 'damage', ['lava']).state;
}
assert.equal(floorHazardCleansesRemaining(budget), 0);
const overBudget = tryCleanseFloorHazards(budget, 'ice', 'damage', ['lava']);
assert.deepEqual(overBudget.cleansed, [], '상한을 넘으면 정화되지 않는다');

// 7) 면역 — 밟아도 안 아프고 잔류도 안 쌓인다
const immune = tryCleanseFloorHazards(fresh, 'ice', 'damage', ['lava']).state;
assert.ok(isFloorHazardImmune(immune, 'lava'));
assert.equal(isFloorHazardImmune(immune, 'poison'), false, '정화한 종류만 면역');
const steppedWhileImmune = floorHazardTickKinds(immune, ['lava']);
assert.deepEqual(steppedWhileImmune.kinds, [], '면역 중엔 밟아도 안 아프다');
assert.equal(steppedWhileImmune.state.linger.lava, 0, '면역 중엔 잔류도 안 쌓인다');
// 정화는 이미 붙은 잔류도 끊는다
const poisoned = floorHazardTickKinds(fresh, ['poison']).state;
assert.ok(poisoned.linger.poison > 0);
const washed = tryCleanseFloorHazards(poisoned, 'light', 'damage', ['poison']);
assert.equal(washed.state.linger.poison, 0, '정화가 잔류 도트를 끊는다');
// 면역이 끝나면 다시 아프다
const expired = advanceFloorHazardTimers(immune, FLOOR_HAZARD_CONFIG.immunitySeconds);
assert.equal(isFloorHazardImmune(expired, 'lava'), false);
assert.deepEqual(floorHazardTickKinds(expired, ['lava']).kinds, ['lava']);

// 8) 순수성·방어 — 입력 상태를 건드리지 않고, 쓰레기 값에도 안 죽는다
const before = createFloorHazardPlayerState();
const snapshot = JSON.stringify(before);
floorHazardTickKinds(before, ['lava', 'poison']);
advanceFloorHazardTimers(before, 5);
tryCleanseFloorHazards(before, 'ice', 'damage', ['lava']);
assert.equal(JSON.stringify(before), snapshot, '입력 상태를 변형하지 않는다');
assert.equal(advanceFloorHazardTimers(fresh, Number.NaN).linger.poison, 0, 'NaN 방어');
assert.equal(advanceFloorHazardTimers(fresh, -9).immunity.lava, 0, '음수 방어');
const corrupt = { linger: { lava: Number.NaN, poison: -3 }, immunity: { lava: Number.NaN, poison: 0 }, cleansesUsed: 0 };
assert.deepEqual(floorHazardTickKinds(corrupt as never, []).kinds, [], '손상된 타이머 방어');
// 타이머는 0 아래로 안 내려간다 (음수가 되면 isImmune 판정이 뒤집힌다)
let drained = tryCleanseFloorHazards(fresh, 'ice', 'damage', ['lava']).state;
drained = advanceFloorHazardTimers(drained, 999);
assert.equal(drained.immunity.lava, 0);

console.log('floor hazard state regression: 초기·틱·잔류·정화매칭·헛방·횟수상한·면역·순수성 8군 통과');
