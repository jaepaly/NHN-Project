import assert from 'node:assert/strict';
import { WAVE_CONFIG } from '../src/combat-core/waves/waveManager';
import { waveSpawnPositions, waveSpawnSeed } from '../src/combat-core/waves/waveSpawn';

const bounds = { left: 80, right: 1840, top: 80, bottom: 1200 };
const distance = (px: number, py: number, x: number, y: number): number => (
  Math.hypot(x - px, y - py)
);

// 1) 정상 월드의 중앙·가장자리 어디서든 모든 적이 설정된 띠와 경계 안에 생성된다.
for (const [playerX, playerY] of [[960, 640], [100, 100], [1820, 1180], [100, 640]]) {
  for (let seed = 0; seed < 200; seed += 1) {
    const points = waveSpawnPositions({
      playerX,
      playerY,
      count: 7,
      minDistance: WAVE_CONFIG.spawnMinDistance,
      maxDistance: WAVE_CONFIG.spawnMaxDistance,
      minimumSeparation: WAVE_CONFIG.spawnMinimumSeparation,
      bounds,
      seed,
    });
    assert.equal(points.length, 7);
    for (const point of points) {
      const radius = distance(playerX, playerY, point.x, point.y);
      assert.ok(radius >= WAVE_CONFIG.spawnMinDistance - 1e-6, `최소 반경 위반: ${radius}`);
      assert.ok(radius <= WAVE_CONFIG.spawnMaxDistance + 1e-6, `최대 반경 위반: ${radius}`);
      assert.ok(point.x >= bounds.left && point.x <= bounds.right);
      assert.ok(point.y >= bounds.top && point.y <= bounds.bottom);
    }
  }
}

// 2) 같은 맵·방·웨이브 입력은 동일하고, 방이나 웨이브가 바뀌면 배치가 달라진다.
const request = {
  playerX: 960,
  playerY: 640,
  count: 6,
  minDistance: WAVE_CONFIG.spawnMinDistance,
  maxDistance: WAVE_CONFIG.spawnMaxDistance,
  minimumSeparation: WAVE_CONFIG.spawnMinimumSeparation,
  bounds,
};
const seedA = waveSpawnSeed(12345, 's1n2', 1);
assert.deepEqual(
  waveSpawnPositions({ ...request, seed: seedA }),
  waveSpawnPositions({ ...request, seed: seedA }),
);
assert.notDeepEqual(
  waveSpawnPositions({ ...request, seed: seedA }),
  waveSpawnPositions({ ...request, seed: waveSpawnSeed(12345, 's1n2', 2) }),
);
assert.notDeepEqual(
  waveSpawnPositions({ ...request, seed: seedA }),
  waveSpawnPositions({ ...request, seed: waveSpawnSeed(12345, 's1n3', 1) }),
);

// 3) 적끼리 뭉치지 않고, 고정 350px 원형 배열도 재발하지 않는다.
const varied = waveSpawnPositions({ ...request, seed: 777 });
for (let a = 0; a < varied.length; a += 1) {
  for (let b = a + 1; b < varied.length; b += 1) {
    assert.ok(
      Math.hypot(varied[a].x - varied[b].x, varied[a].y - varied[b].y)
        >= WAVE_CONFIG.spawnMinimumSeparation - 1e-6,
      '적 최소 간격 위반',
    );
  }
}
const radii = varied.map((point) => distance(request.playerX, request.playerY, point.x, point.y));
assert.ok(Math.max(...radii) - Math.min(...radii) > 30, '반경이 다시 단일 원형에 고정됐다');

// 4) 빈 웨이브와 뒤집힌 거리 입력도 안전하게 처리한다.
assert.deepEqual(waveSpawnPositions({ ...request, count: 0, seed: 1 }), []);
const reversed = waveSpawnPositions({
  ...request,
  count: 3,
  minDistance: 450,
  maxDistance: 300,
  seed: 2,
});
for (const point of reversed) {
  const radius = distance(request.playerX, request.playerY, point.x, point.y);
  assert.ok(radius >= 300 - 1e-6 && radius <= 450 + 1e-6);
}

console.log('wave spawn regression: 띠반경·경계·시드재현·웨이브변화·최소간격·원형해소·입력방어 7군 통과');
