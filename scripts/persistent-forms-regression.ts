import assert from 'node:assert/strict';
import {
  ORBIT_CONFIG,
  WALL_CONFIG,
  orbitAngularVelocity,
  orbitCount,
  orbitPoint,
  repeatHitReady,
  sweepIntersectsPolyline,
  wallArcPoints,
  wallDurationSeconds,
} from '../src/combat-core/combat/persistentFormConfig';
import { EnemyControlState } from '../src/combat-core/control/enemyControlState';
import type { CombatEnemy } from '../src/combat-core/enemies/combatEnemy';

// 1) wall은 목표 방향 90px 지점에 size별 길이의 원호를 만든다.
for (const size of ['small', 'medium', 'large', 'huge'] as const) {
  const points = wallArcPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, size);
  const middle = points[Math.floor(points.length / 2)];
  assert.ok(Math.abs(middle.x - WALL_CONFIG.offset) < Number.EPSILON);
  assert.ok(Math.abs(middle.y) < Number.EPSILON);
  const renderedLength = points.slice(1).reduce((sum, point, index) => (
    sum + Math.hypot(point.x - points[index].x, point.y - points[index].y)
  ), 0);
  assert.ok(Math.abs(renderedLength - WALL_CONFIG.lengths[size]) < 0.5);
}
assert.equal(wallDurationSeconds('slow'), 4);
assert.equal(wallDurationSeconds('normal'), 3);
assert.equal(wallDurationSeconds('fast'), 2.2);

// 2) 이동 선분 sweep으로 빠른 적·투사체의 원호 관통을 검출한다.
const wall = wallArcPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 'medium');
const wideWall = wallArcPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 'medium', 1.35);
assert.ok(Math.hypot(wideWall[0].x, wideWall[0].y) > Math.hypot(wall[0].x, wall[0].y));
assert.equal(
  sweepIntersectsPolyline({ x: 30, y: 0 }, { x: 150, y: 0 }, 1, wall),
  true,
);
assert.equal(
  sweepIntersectsPolyline({ x: 30, y: 200 }, { x: 150, y: 200 }, 1, wall),
  false,
);

// 3) orbit은 size별 개수·speed별 각속도와 반경 90px을 유지한다.
assert.deepEqual(
  (['small', 'medium', 'large', 'huge'] as const).map(orbitCount),
  [2, 3, 4, 5],
);
assert.ok(Math.abs(orbitAngularVelocity('normal') - Math.PI * 2 * 1.2) < Number.EPSILON);
const orbit = orbitPoint({ x: 10, y: 20 }, 0, 0, 3);
const wideOrbit = orbitPoint({ x: 10, y: 20 }, 0, 0, 3, 1.35);
assert.ok(Math.hypot(wideOrbit.x - 10, wideOrbit.y - 20)
  > Math.hypot(orbit.x - 10, orbit.y - 20));
assert.equal(orbit.x, 10 + ORBIT_CONFIG.radius);
assert.equal(orbit.y, 20);

// 4) 동일 적 재타격은 0.8초마다만 허용되어 4초 동안 이론상 최대 5회다.
assert.equal(repeatHitReady(undefined, 0), true);
assert.equal(repeatHitReady(0, 0.79), false);
assert.equal(repeatHitReady(0, 0.8), true);
let hitCount = 0;
let lastHitAt: number | undefined;
for (let elapsed = 0; elapsed < ORBIT_CONFIG.durationSeconds; elapsed += 0.1) {
  if (!repeatHitReady(lastHitAt, elapsed)) continue;
  lastHitAt = elapsed;
  hitCount += 1;
}
assert.equal(hitCount, 5);

// 5) 보스 wall 통과 둔화는 1.5초 동안 이동 배율 0.6을 사용하고 정상 복구된다.
const controls = new EnemyControlState();
const boss = { alive: true } as CombatEnemy;
controls.applySlow(
  boss,
  100,
  WALL_CONFIG.bossSlowDurationSeconds,
  WALL_CONFIG.bossSlowMovementMultiplier,
);
assert.equal(controls.movementMultiplierFor(boss), 0.6);
controls.update(1.5);
assert.equal(controls.movementMultiplierFor(boss), 1);

console.log('Persistent forms regression: wall 원호·sweep·orbit 배치·재타격·보스 둔화 5군 통과');
