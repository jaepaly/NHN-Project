import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TERRAIN_BARRIER_CONFIG,
  barrierEndpoints,
  pushOutOfBarrier,
  pushOutOfBarriers,
} from '../src/combat-core/combat/terrainBarrier';
import type { TerrainBarrier } from '../src/combat-core/combat/terrainBarrier';

const horizontal: TerrainBarrier = { x: 0, y: 0, halfLength: 100, angleDeg: 0 };
const clearance = (radius: number) => TERRAIN_BARRIER_CONFIG.thickness / 2 + radius;

// ── 끝점: 각도·길이대로 ──────────────────────────────────────────────
{
  const [a, b] = barrierEndpoints(horizontal);
  assert.deepEqual([a.x, a.y], [-100, 0], '가로 장벽 왼쪽 끝');
  assert.deepEqual([b.x, b.y], [100, 0], '가로 장벽 오른쪽 끝');

  const vertical = barrierEndpoints({ x: 0, y: 0, halfLength: 50, angleDeg: 90 });
  assert.ok(Math.abs(vertical[0].x) < 1e-9 && Math.abs(vertical[0].y + 50) < 1e-9, '세로 장벽');

  // NaN 방어 — 잘못된 배치 데이터가 좌표를 오염시키면 안 된다
  for (const p of barrierEndpoints({ x: Number.NaN, y: 0, halfLength: Number.NaN, angleDeg: 0 })) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'NaN 배치 방어');
  }
}

// ── 밀어내기: 겹칠 때만, 법선 방향으로, 여유만큼 ──────────────────────
{
  const radius = 16;
  const need = clearance(radius);

  // 멀리 있으면 null — 호출측이 "안 겹쳤다"를 싸게 안다
  assert.equal(pushOutOfBarrier(0, need + 5, radius, horizontal), null, '떨어져 있으면 밀지 않음');
  assert.equal(pushOutOfBarrier(300, 0, radius, horizontal), null, '선분 밖(연장선)은 안 겹침');

  // 파고들면 밖으로
  const pushed = pushOutOfBarrier(0, 5, radius, horizontal);
  assert.ok(pushed, '겹치면 밀어낸다');
  assert.ok(pushed.y > 5, '들어온 쪽(위)으로 밀린다');
  assert.ok(pushed.y >= need, `여유(${need}) 밖으로 나가야 한다 — 실제 ${pushed.y}`);
  assert.equal(pushed.x, 0, '법선 방향으로만 민다 — 벽을 따라 미끄러지게');

  // 반대편에서 들어오면 반대로
  const below = pushOutOfBarrier(0, -5, radius, horizontal);
  assert.ok(below && below.y < -5 && below.y <= -need, '아래쪽에서 오면 아래로');

  // 정확히 선 위 = 거리 0 — 방향이 없어도 안전하게 빠져나와야 한다(0 나눗셈 함정)
  const onLine = pushOutOfBarrier(0, 0, radius, horizontal);
  assert.ok(onLine, '선 위에서도 밀어낸다');
  assert.ok(Number.isFinite(onLine.x) && Number.isFinite(onLine.y), '0 나눗셈 방어');
  const onLineDist = Math.hypot(onLine.x, onLine.y);
  assert.ok(onLineDist >= need, '선 위에서도 여유 밖으로');
  // ⚠️ **얼마나** 밀리는지까지 본다. 예전 회귀는 ">= need"만 봐서, 거리 변수를
  // 법선 길이로 덮어써 반대 방향 276px 튕기던 버그를 통과시켰다(브라우저 실측이 잡음).
  assert.ok(onLineDist <= need + TERRAIN_BARRIER_CONFIG.pushEpsilon + 1e-6,
    `선 위에서 과도하게 밀린다 (${onLineDist.toFixed(1)}px, 기대 ~${(need + TERRAIN_BARRIER_CONFIG.pushEpsilon).toFixed(1)})`);

  // 모든 침투 깊이에서 "딱 여유 밖"으로만 밀려야 한다 — 방향·크기 동시 검증
  for (const depth of [0, 1, 5, 10, 20]) {
    const from = need - depth;
    if (from < 0) continue;
    const result = pushOutOfBarrier(0, from, radius, horizontal);
    if (!result) continue;
    const resultDist = Math.hypot(result.x, result.y);
    assert.ok(result.y > 0, `침투 ${depth}: 들어온 쪽으로 밀려야 한다 (실제 y=${result.y.toFixed(1)})`);
    assert.ok(
      Math.abs(resultDist - (need + TERRAIN_BARRIER_CONFIG.pushEpsilon)) < 1e-6,
      `침투 ${depth}: 밀린 거리 ${resultDist.toFixed(2)} ≠ 기대 ${(need + TERRAIN_BARRIER_CONFIG.pushEpsilon).toFixed(2)}`,
    );
  }

  // 밀어낸 결과는 다시 밀 필요가 없어야 한다 (떨림 방지)
  assert.equal(pushOutOfBarrier(pushed.x, pushed.y, radius, horizontal), null,
    '한 번 밀면 안정 — 매 프레임 재밀림(떨림)이 생기면 안 된다');
}

// ── 다중 장벽: 모서리에서 둘 다 걸려도 빠져나온다 ────────────────────
{
  const corner: TerrainBarrier[] = [
    { x: 0, y: 0, halfLength: 100, angleDeg: 0 },
    { x: 0, y: 0, halfLength: 100, angleDeg: 90 },
  ];
  const out = pushOutOfBarriers(1, 1, 16, corner);
  for (const barrier of corner) {
    const still = pushOutOfBarrier(out.x, out.y, 16, barrier);
    assert.equal(still, null, '모서리 탈출 후 어느 장벽에도 안 걸려야 한다');
  }
  // 장벽이 없으면 원위치 그대로 (무비용 경로)
  const none = pushOutOfBarriers(7, 9, 16, []);
  assert.deepEqual([none.x, none.y], [7, 9], '장벽 없으면 좌표 불변');
}

// ── 설정 가드 ────────────────────────────────────────────────────────
{
  assert.ok(TERRAIN_BARRIER_CONFIG.pushEpsilon > 0,
    '여유가 0이면 경계에서 매 프레임 떨린다');
  assert.ok(TERRAIN_BARRIER_CONFIG.thickness >= 8,
    '너무 얇으면 "통과 못 하는 것"으로 안 읽힌다');
}

// ── 씬 배선 (이 저장소에서 배선 유실 3회 전례) ────────────────────────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  for (const [needle, why] of [
    ['pushOutOfBarriers(this.player.x', '플레이어가 장벽을 통과한다'],
    ['this.pushEnemiesOutOfTerrain()', '적이 장벽에 파고든 채로 남는다'],
    ['barrierEndpoints(barrier)', '지형 장벽이 적 투사체를 안 막는다'],
    ['this.clearTerrainBarriers()', '방 전환 시 장벽이 남는다'],
  ] as const) {
    assert.ok(scene.includes(needle), `${why} (누락: ${needle})`);
  }

  // 돌진 중 보스는 통과 — 원칙 2(이동 영창·돌진은 장벽을 넘는다)
  const pushBody = scene.slice(
    scene.indexOf('private pushEnemiesOutOfTerrain'),
    scene.indexOf('private playPlayerHit'),
  );
  assert.ok(pushBody.length > 200, '전제: pushEnemiesOutOfTerrain 본문을 못 찾음');
  assert.ok(/charging\) continue/.test(pushBody),
    '돌진 중 보스가 장벽에 막힌다 — 돌진은 밀고 지나가는 행동이어야 한다');

  // 적 이동은 넉백과 같은 경로(view)를 써야 한다 — getter만 있는 x/y에 대입하면 조용히 무시된다
  assert.ok(pushBody.includes('enemy.view.x'),
    '적 위치를 view가 아닌 곳에 쓴다 — getter뿐이라 밀어내기가 조용히 실패한다');
}

console.log(
  'Terrain barrier regression: 끝점·밀어내기·안정성·모서리·설정가드·배선 6군 통과',
);
