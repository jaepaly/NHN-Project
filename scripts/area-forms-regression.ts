import assert from 'node:assert/strict';
import {
  RAIN_CONFIG,
  ZONE_CONFIG,
  areaTargetPoint,
  densestAreaTarget,
  densestDirectionalTarget,
  rainFallDurationMs,
  rainLaunchDurationSeconds,
  rainOffset,
  zoneDurationSeconds,
} from '../src/combat-core/combat/areaSpellConfig';
import { spellImpactDamageFromPower } from '../src/combat-core/combat/combatConfig';

const inRange = areaTargetPoint(0, 0, 120, 40, ZONE_CONFIG.castRange);
assert.deepEqual(inRange, { x: 120, y: 40 }, '사거리 안의 목표 위치는 그대로 사용해야 한다');

const clamped = areaTargetPoint(0, 0, 640, 0, ZONE_CONFIG.castRange);
assert.deepEqual(clamped, { x: 320, y: 0 }, '먼 zone 목표는 320px 설치 사거리로 제한해야 한다');

const noTarget = areaTargetPoint(25, 35, undefined, undefined, ZONE_CONFIG.castRange);
assert.deepEqual(noTarget, { x: 25, y: 35 }, '대상이 없으면 시전자 위치에 생성해야 한다');

const clustered = densestAreaTarget(0, 0, 320, 40, [
  { x: 40, y: 0, collisionRadius: 10 },
  { x: 190, y: 0, collisionRadius: 10 },
  { x: 220, y: 0, collisionRadius: 10 },
  { x: 205, y: 25, collisionRadius: 10 },
]);
assert.equal(clustered?.hitCount, 3, '가장 가까운 단일 적보다 적이 많이 모인 위치를 선택해야 한다');

const midpointCluster = densestAreaTarget(0, 0, 320, 35, [
  { x: 100, y: -30 },
  { x: 100, y: 30 },
]);
assert.deepEqual(midpointCluster, { x: 100, y: 0, hitCount: 2 },
  '두 적 사이를 중심으로 잡을 때 더 많이 맞으면 중간 지점을 선택해야 한다');

const tieByDistance = densestAreaTarget(0, 0, 320, 5, [
  { x: 80, y: 0 },
  { x: 0, y: 100 },
]);
assert.deepEqual(tieByDistance, { x: 80, y: 0, hitCount: 1 },
  '적중 수가 같으면 플레이어와 가까운 중심을 선택해야 한다');

assert.equal(
  densestAreaTarget(0, 0, 320, 80, [{ x: 400, y: 0 }]),
  null,
  '설치 사거리 안에 후보 적이 없으면 밀집 타겟을 만들지 않아야 한다',
);

const beamCluster = densestDirectionalTarget(0, 0, 300, 12, [
  { x: 40, y: 80, collisionRadius: 3 },
  { x: 150, y: -8, collisionRadius: 3 },
  { x: 220, y: 8, collisionRadius: 3 },
  { x: 280, y: 0, collisionRadius: 3 },
]);
assert.equal(beamCluster?.hitCount, 3,
  '가까운 단일 적보다 직선상에 많이 모인 적 방향을 선택해야 한다');
assert.ok(Math.abs(beamCluster?.angle ?? 1) < 0.05,
  '직선 무리가 수평으로 모이면 수평에 가까운 각도를 선택해야 한다');

const corridorMidAngle = densestDirectionalTarget(0, 0, 300, 25, [
  { x: 200, y: -20 },
  { x: 200, y: 20 },
]);
assert.equal(corridorMidAngle?.hitCount, 2,
  '두 방향 사이 각도가 더 많은 적을 맞히면 중간 각도를 선택해야 한다');
assert.ok(Math.abs(corridorMidAngle?.angle ?? 1) < 0.01);

const directionalTie = densestDirectionalTarget(0, 0, 300, 5, [
  { x: 80, y: 0 },
  { x: 0, y: 100 },
]);
assert.deepEqual(directionalTie, { x: 300, y: 0, angle: 0, hitCount: 1 },
  '동일 적중 수면 더 가까운 적이 포함된 방향을 선택해야 한다');

assert.equal(
  densestDirectionalTarget(0, 0, 300, 20, [
    { x: -400, y: 0 },
    { x: 400, y: 0 },
  ]),
  null,
  '사거리 밖의 적만 있으면 발사 방향 후보를 만들지 않아야 한다',
);

assert.deepEqual(
  ['slow', 'normal', 'fast'].map(zoneDurationSeconds),
  [4, 3, 2.4],
  'zone 속도별 지속시간 계약을 유지해야 한다',
);
assert.ok(
  Math.abs(ZONE_CONFIG.tickCount * ZONE_CONFIG.damageMultiplierPerTick - 0.8)
    < Number.EPSILON,
  'zone에 계속 머문 적의 기본 총 피해 배율은 0.8이어야 한다',
);
assert.equal(
  ZONE_CONFIG.controlLingerSeconds,
  0.5,
  'zone control은 마지막 틱 뒤 0.5초만 유지되어야 한다',
);
assert.equal(
  spellImpactDamageFromPower(55, ZONE_CONFIG.damageMultiplierPerTick),
  4,
  '분할 타격은 power 기반 피해에 회차 배율을 적용해야 한다',
);

assert.deepEqual(
  ['slow', 'normal', 'fast'].map(rainLaunchDurationSeconds),
  [3, 2.4, 1.8],
  'rain 속도별 낙하 전개 시간을 유지해야 한다',
);
assert.deepEqual(
  ['slow', 'normal', 'fast'].map(rainFallDurationMs),
  [520, 400, 300],
  'rain 속도별 개별 낙하 시간을 유지해야 한다',
);
const offsets = Array.from(
  { length: RAIN_CONFIG.strikeCount },
  (_, index) => rainOffset(index, RAIN_CONFIG.baseAreaRadius),
);
assert.equal(new Set(offsets.map(({ x, y }) => `${x}:${y}`)).size, RAIN_CONFIG.strikeCount,
  'rain 6회 낙하지점은 서로 구분되어야 한다');
assert.ok(offsets.every(({ x, y }) => Math.hypot(x, y) <= RAIN_CONFIG.baseAreaRadius),
  '모든 rain 낙하지점은 표시된 목표 범위 안이어야 한다');

console.info('area forms regression: area/directional forms 18 groups passed');
