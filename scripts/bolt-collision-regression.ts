import assert from 'node:assert/strict';
import { firstBoltCollision } from '../src/combat-core/combat/boltCollision';

interface Target {
  id: string;
  x: number;
  y: number;
  collisionRadius: number;
}

const target = (id: string, x: number, y: number, collisionRadius = 10): Target => ({
  id,
  x,
  y,
  collisionRadius,
});

const farther = target('farther', 80, 0);
const nearer = target('nearer', 40, 0);
const first = firstBoltCollision(0, 0, 100, 0, 5, [farther, nearer]);
assert.equal(first?.target.id, 'nearer', '배열 순서가 아니라 경로상 첫 적을 선택해야 한다');
assert.equal(first?.x, 25, '적 반경과 투사체 반경이 합산된 진입점에서 충돌해야 한다');

const miss = firstBoltCollision(0, 0, 100, 0, 5, [target('miss', 50, 20)]);
assert.equal(miss, null, '합산 반경 밖을 지나는 적은 맞지 않아야 한다');

const projectileEdgeHit = firstBoltCollision(0, 0, 100, 0, 6, [target('edge', 50, 15)]);
assert.equal(projectileEdgeHit?.target.id, 'edge', '투사체 자체 반경도 충돌 판정에 포함해야 한다');

const currentPositionMiss = firstBoltCollision(40, 0, 60, 0, 5, [target('moved', 50, 30)]);
assert.equal(currentPositionMiss, null, '적이 기존 조준점에서 벗어나면 현재 위치 기준으로 빗나가야 한다');

const startsInside = firstBoltCollision(50, 0, 60, 0, 5, [target('inside', 50, 0)]);
assert.equal(startsInside?.progress, 0, '이전 프레임 사이에 적이 투사체를 덮으면 즉시 충돌해야 한다');

const stationaryMiss = firstBoltCollision(0, 0, 0, 0, 5, [target('still-miss', 20, 0)]);
assert.equal(stationaryMiss, null, '길이가 0인 구간은 겹치지 않는 적과 충돌하지 않아야 한다');

console.info('bolt collision regression: 6 groups passed');
