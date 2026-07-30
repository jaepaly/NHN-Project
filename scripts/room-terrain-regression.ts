import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOM_TERRAIN_BOUNDS,
  TERRAIN_CLEARANCE,
  TERRAIN_KEEPOUTS,
  TERRAIN_KINDS,
  TERRAIN_MAX_BARRIERS,
  TERRAIN_MAX_HALF_LENGTH,
  TERRAIN_PLAYER_RADIUS,
  barriersFromPlacements,
  exitEnterableCount,
  exitsReachable,
  fixtureReachable,
  pointBlocked,
  terrainForRoom,
} from '../src/run/roomTerrainConfig';
import { TERRAIN_BARRIER_CONFIG, pushOutOfBarriers } from '../src/combat-core/combat/terrainBarrier';
import { ROOM_FIXTURE_CONFIG } from '../src/run/roomFixtureConfig';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import { generateRunMap } from '../src/run/mapGenerator';
import type { MapNodeKind } from '../src/run/mapGraphContract';

/**
 * 방 지형 장벽 배치 회귀 (#214 지형 Tier 2 배선).
 *
 * ## 이 회귀가 막는 사고
 *
 * 장벽은 **조용하게** 런을 벽돌로 만들 수 있다. #283에서 잘못된 `waveSetId`가 방을
 * 벽돌로 만든 건 최소한 예외를 던졌다(로그가 남았다). 장벽은 예외도 로그도 없이
 * 그냥 못 지나간다 — 플레이어는 자기 조작이 문제인 줄 안다.
 *
 * 그래서 keep-out만 검사하지 않고 **실제로 걸어본다**(격자 BFS).
 */

const ALL_KINDS: readonly MapNodeKind[] = [
  'start', 'combat', 'elite', 'trap', 'treasure', 'altar', 'stage-boss', 'memory-boss',
];
const STAGES: readonly (1 | 2)[] = [1, 2];

// ── 1) 방 크기·반경이 씬과 같은 값인가 ──────────────────────────────────────
//
// 배치가 1920×1280을 전제하는데 씬이 다른 크기면 keep-out 좌표가 전부 어긋난다.
// 플레이어 반경도 씬이 `pushOutOfBarriers(..., 16, ...)`로 넘기는 값과 같아야
// "비었다"가 한 뜻이 된다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(
    scene.includes(`pushOutOfBarriers(this.player.x, this.player.y, ${TERRAIN_PLAYER_RADIUS}`),
    `씬의 플레이어 반경이 TERRAIN_PLAYER_RADIUS(${TERRAIN_PLAYER_RADIUS})와 달라졌다`,
  );
  assert.equal(
    TERRAIN_CLEARANCE,
    TERRAIN_BARRIER_CONFIG.thickness / 2 + TERRAIN_PLAYER_RADIUS,
    '통행 여유 = 두께 절반 + 플레이어 반경',
  );
  // 도착·출구가 방 안에 있어야 한다 (#245 계약 좌표)
  for (const point of [TERRAIN_KEEPOUTS.arrival, ...TERRAIN_KEEPOUTS.exits]) {
    assert.ok(point.x > 0 && point.x < ROOM_TERRAIN_BOUNDS.width, 'keep-out x가 방 안');
    assert.ok(point.y > 0 && point.y < ROOM_TERRAIN_BOUNDS.height, 'keep-out y가 방 안');
  }
}

// ── 2) 배선됐는가 — 이게 이 PR의 본론이다 ───────────────────────────────────
//
// 기전은 진작 완성돼 있었다(플레이어·보행 적·적 투사체 전부 막힌다). 그런데
// `setTerrainBarriers` 호출이 **DEV 프리뷰 한 곳뿐**이어서 실제 런에는 장벽이
// 한 번도 나오지 않았다. 다시 그렇게 되면 이 단언이 잡는다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(
    /private applyRoomTerrain\(\)/.test(scene),
    'applyRoomTerrain이 있어야 한다',
  );
  assert.ok(
    /this\.applyRoomTerrain\(\);/.test(scene),
    'startRoom이 applyRoomTerrain을 불러야 한다 — 안 부르면 방이 텅 빈 아레나로 돌아간다',
  );
  // 노드 데이터가 있으면 그것이 이긴다
  assert.ok(
    /barriersFromPlacements\(node\.terrain\)/.test(scene),
    'R1이 노드에 채운 장벽이 기본값을 이겨야 한다',
  );
}

// ── 3) keep-out — 도착·출구·설치물을 침범하지 않는다 ────────────────────────
//
// 도착 지점이 왼쪽 중앙 한 점으로 고정된 이유가 이것이다(#246): 지형이 그 한 점만
// 비우면 된다. #264가 요구한 것도 같다.
for (const kind of ALL_KINDS) {
  for (const stage of STAGES) {
    const barriers = terrainForRoom(kind, stage);
    const arrival = TERRAIN_KEEPOUTS.arrival;
    assert.ok(
      !pointBlocked(arrival.x, arrival.y, barriers, arrival.radius),
      `${kind}/${stage}: 도착 지점(${arrival.x},${arrival.y}) 반경 ${arrival.radius}를 비워야 한다`,
    );
    for (const exit of TERRAIN_KEEPOUTS.exits) {
      assert.ok(
        !pointBlocked(exit.x, exit.y, barriers, exit.radius),
        `${kind}/${stage}: 출구(${exit.x},${exit.y}) 반경 ${exit.radius}를 비워야 한다`,
      );
    }
  }
}

// 중앙 설치물이 있는 종류만 설치물 접근을 요구한다 — 정예방엔 설치물이 없다
for (const kind of ['treasure', 'altar'] as const) {
  for (const stage of STAGES) {
    assert.ok(
      fixtureReachable(terrainForRoom(kind, stage)),
      `${kind}: 중앙 설치물 접근 반경(${ROOM_FIXTURE_CONFIG.reachRadius})이 열려 있어야 한다`,
    );
  }
}

// ── 4) **실제로 걸어서 출구까지 간다** ──────────────────────────────────────
for (const kind of ALL_KINDS) {
  for (const stage of STAGES) {
    const barriers = terrainForRoom(kind, stage);
    const walk = exitsReachable(barriers);
    assert.ok(
      walk.reachable,
      `${kind}/${stage}: 도착에서 두 출구까지 걸어갈 수 있어야 한다 (막힌 출구 ${walk.unreachedExits})`,
    );
    // BFS로 닿는 것과 **포탈 진입 반경 안에 들어가는 것**은 다르다.
    // 포탈은 enterRadius(26) 안에서 발화하므로 그 원이 살아 있어야 한다.
    assert.equal(
      exitEnterableCount(barriers), 2,
      `${kind}/${stage}: 두 포탈 모두 진입 반경이 열려 있어야 한다`,
    );
  }
}

// ── 5) 소수·개방형 원칙 (#214에서 총괄이 못박은 것) ─────────────────────────
//
// 적 추격이 직선이고 밀어내기만 할 뿐 우회를 못 한다(`pushEnemiesOutOfTerrain`).
// 미로면 적이 벽에 비빈다.
for (const kind of ALL_KINDS) {
  for (const stage of STAGES) {
    const barriers = terrainForRoom(kind, stage);
    assert.ok(
      barriers.length <= TERRAIN_MAX_BARRIERS,
      `${kind}/${stage}: 장벽 ${barriers.length}개는 상한 ${TERRAIN_MAX_BARRIERS}을 넘는다 (미로 금지)`,
    );
    for (const barrier of barriers) {
      // ⚠️ 길이 상한이 규칙인 이유: 장벽은 **플레이어 주문을 막지 않는다**
      // (CastContext에 장벽 정보가 없다). 접근 축과 수직인 긴 벽 뒤에 서면 추격 적이
      // 벽에 붙어 멈추고 플레이어는 벽을 통과하는 주문으로 일방적으로 잡는다 —
      // 엄폐가 아니라 무적 지점이 된다.
      assert.ok(
        barrier.halfLength <= TERRAIN_MAX_HALF_LENGTH,
        `${kind}/${stage}: halfLength ${barrier.halfLength} > 상한 ${TERRAIN_MAX_HALF_LENGTH} (무적 지점이 된다)`,
      );
      assert.ok(barrier.halfLength > 0, '길이 0인 장벽은 두지 않는다');
      // 방 밖으로 삐져나가면 렌더가 잘리고 밀어내기가 벽 밖으로 밀어낸다
      const rad = (barrier.angleDeg * Math.PI) / 180;
      const ex = Math.abs(Math.cos(rad) * barrier.halfLength);
      const ey = Math.abs(Math.sin(rad) * barrier.halfLength);
      assert.ok(
        barrier.x - ex > 0 && barrier.x + ex < ROOM_TERRAIN_BOUNDS.width
        && barrier.y - ey > 0 && barrier.y + ey < ROOM_TERRAIN_BOUNDS.height,
        `${kind}/${stage}: 장벽이 방 밖으로 나간다`,
      );
    }
  }
}

// ── 6) 어떤 종류가 비어 있는지는 **의도**다 ─────────────────────────────────
//
// "빠뜨렸다"와 "의도적으로 비웠다"를 구분해 둔다. 특히 함정방은 기믹이 이미 공간을
// 제약하므로(십자 안전 통로) 장벽까지 얹으면 공간이 이중으로 좁아진다.
for (const kind of ALL_KINDS) {
  const has = STAGES.some((stage) => terrainForRoom(kind, stage).length > 0);
  const shouldHave = TERRAIN_KINDS.includes(kind);
  assert.equal(has, shouldHave, `${kind}: 장벽 보유 여부가 TERRAIN_KINDS와 일치해야 한다`);
}
assert.deepEqual([...TERRAIN_KINDS], ['combat', 'elite'], '장벽은 전투·정예 둘에만');
for (const kind of ['trap', 'treasure', 'altar', 'stage-boss', 'memory-boss', 'start'] as const) {
  assert.equal(
    terrainForRoom(kind, 1).length + terrainForRoom(kind, 2).length, 0,
    `${kind}는 의도적으로 비어 있다`,
  );
}

// ── 7) 스테이지가 공간으로도 갈린다 ─────────────────────────────────────────
{
  const s1 = terrainForRoom('combat', 1);
  const s2 = terrainForRoom('combat', 2);
  assert.notDeepEqual([...s1], [...s2], '전투방 배치가 스테이지별로 달라야 한다');
  assert.ok(s2.length >= s1.length, '2스테이지가 더 복잡하거나 같다');
}

// ── 8) 밀어내기가 실제로 밖으로 내보낸다 ────────────────────────────────────
//
// `pushOutOfBarrier`는 예전에 선 위(거리 0)에서 push가 음수가 돼 수백 px 튕긴 적이
// 있다(브라우저 실측으로 잡음). 배치가 붙은 지금은 **선 위에 스폰될 수 있다** —
// 적이 장벽 위에 스폰되면 그 버그가 바로 드러난다.
for (const kind of TERRAIN_KINDS) {
  for (const stage of STAGES) {
    const barriers = terrainForRoom(kind, stage);
    for (const barrier of barriers) {
      // 장벽 정중앙(선 위, 거리 0)에서 밀어낸다
      const pushed = pushOutOfBarriers(barrier.x, barrier.y, TERRAIN_PLAYER_RADIUS, barriers);
      const moved = Math.hypot(pushed.x - barrier.x, pushed.y - barrier.y);
      assert.ok(moved > 0, `${kind}/${stage}: 선 위에서 밀려나야 한다`);
      assert.ok(
        moved < 200,
        `${kind}/${stage}: ${moved.toFixed(0)}px 튕겼다 — push 음수 버그 재발`,
      );
      assert.ok(
        !pointBlocked(pushed.x, pushed.y, barriers),
        `${kind}/${stage}: 밀어낸 위치가 여전히 장벽 안이다`,
      );
    }
  }
}

// ── 9) 적 스폰이 장벽에 걸려도 조용히 해결된다 ──────────────────────────────
//
// 적은 **플레이어 현재 위치** 중심 원형으로 스폰되고 좌표 클램프만 한다
// (`waveSpawnPosition`). 장벽을 피하지 않으므로 후속 웨이브는 장벽 안에 스폰될 수
// 있다. 1웨이브만 보면 0건이라 안심하게 되는데(도착 지점이 왼쪽 끝이고 가장 왼쪽
// 장벽이 x=700이라 사거리 350이 닿지 않는다) **플레이어가 움직이면 달라진다.**
//
// 실측(방 전역 54곳 × 스폰 각도 88건): 겹침 1.3~1.8% · 최대 밀림 25px ·
// 밀어낸 뒤 잔류 0건. 즉 스폰 다음 프레임에 조용히 밖으로 나간다.
{
  const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));
  const spawnDistance = 350;
  const enemyRadius = 18;
  for (const kind of TERRAIN_KINDS) {
    for (const stage of STAGES) {
      const barriers = terrainForRoom(kind, stage);
      let overlap = 0;
      let total = 0;
      for (let px = 200; px <= 1720; px += 190) {
        for (let py = 200; py <= 1080; py += 176) {
          for (let wave = 1; wave <= 4; wave += 1) {
            for (const count of [4, 5, 6, 7]) {
              for (let i = 0; i < count; i += 1) {
                const angle = wave * (Math.PI / 7) - Math.PI / 2 + (Math.PI * 2 * i) / count;
                const x = clamp(px + Math.cos(angle) * spawnDistance, 80, ROOM_TERRAIN_BOUNDS.width - 80);
                const y = clamp(py + Math.sin(angle) * spawnDistance, 80, ROOM_TERRAIN_BOUNDS.height - 80);
                total += 1;
                const clearance = TERRAIN_BARRIER_CONFIG.thickness / 2 + enemyRadius;
                if (!pointBlocked(x, y, barriers, clearance)) continue;
                overlap += 1;
                const pushed = pushOutOfBarriers(x, y, enemyRadius, barriers);
                const moved = Math.hypot(pushed.x - x, pushed.y - y);
                // 튕김이 크면 적이 순간이동한 것처럼 보인다 (push 음수 버그의 증상)
                assert.ok(moved < 80, `${kind}/${stage}: 스폰 밀림 ${moved.toFixed(0)}px가 과하다`);
                assert.ok(
                  !pointBlocked(pushed.x, pushed.y, barriers, clearance),
                  `${kind}/${stage}: 밀어낸 뒤에도 장벽 안이다 — 적이 벽에 갇힌다`,
                );
              }
            }
          }
        }
      }
      // 겹침이 과하면 배치가 스폰 링을 정면으로 막고 있다는 뜻이다
      const ratio = overlap / total;
      assert.ok(
        ratio < 0.06,
        `${kind}/${stage}: 스폰 겹침 ${(ratio * 100).toFixed(1)}%가 과하다 (장벽이 스폰 링을 막는다)`,
      );
    }
  }
}

// ── 10) 계약 변환 — 원형 지형이 섞여도 장벽만 골라낸다 ───────────────────────
{
  const mixed = [
    { kind: 'lava', x: 100, y: 100, radius: 72 },
    { kind: 'barrier', x: 500, y: 400, halfLength: 100, angleDeg: 90 },
    { kind: 'poison', x: 300, y: 300, radius: 84 },
    // halfLength가 없는 'barrier'는 장벽이 될 수 없다 — 조용히 { halfLength: undefined }
    // 장벽을 만들면 렌더가 길이 0으로 그려지고 밀어내기가 점으로 작동한다
    { kind: 'barrier', x: 700, y: 200 },
  ];
  const barriers = barriersFromPlacements(mixed);
  assert.equal(barriers.length, 1, '장벽 항목만 골라낸다');
  assert.deepEqual(barriers[0], { x: 500, y: 400, halfLength: 100, angleDeg: 90 });
  // angleDeg 생략은 가로(0)로 읽는다
  assert.deepEqual(
    barriersFromPlacements([{ kind: 'barrier', x: 10, y: 20, halfLength: 30 }]),
    [{ x: 10, y: 20, halfLength: 30, angleDeg: 0 }],
  );
  assert.deepEqual(barriersFromPlacements([]), []);
}

// ── 11) 프리셋·생성 맵의 모든 방이 통행 가능하다 ────────────────────────────
//
// 배치는 종류별이므로 어떤 맵이든 같은 값이 나오지만, **맵이 노드에 장벽을 채우기
// 시작하면** 이 검사가 유일한 방어선이 된다. 지금부터 걸어 둔다.
{
  const definitions = [MAP_GRAPH_PRESET_01];
  for (let seed = 1; seed <= 40; seed += 1) {
    const generated = generateRunMap(seed);
    if (generated) definitions.push(generated.definition);
  }
  for (const definition of definitions) {
    for (const node of definition.nodes) {
      const stage = node.stage === 2 ? 2 : 1;
      const fromNode = barriersFromPlacements(node.terrain);
      const barriers = fromNode.length > 0 ? fromNode : terrainForRoom(node.kind, stage);
      const walk = exitsReachable(barriers);
      assert.ok(walk.reachable, `${node.id}(${node.kind}): 출구까지 걸어갈 수 있어야 한다`);
      assert.equal(exitEnterableCount(barriers), 2, `${node.id}: 두 포탈 진입 가능`);
    }
  }
}

console.log(
  'room terrain regression: 좌표일치·배선·keep-out·통행·개방형원칙·의도적공백'
  + '·스테이지분기·밀어내기·스폰겹침·계약변환·전맵통행 11군 통과',
);
