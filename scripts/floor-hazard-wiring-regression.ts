import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLOOR_HAZARD_KINDS_WITH_DEFAULT,
  FLOOR_HAZARD_MARGIN,
  FLOOR_HAZARD_MAX_RADIUS,
  TERRAIN_KEEPOUTS,
  floorHazardBlocksEntry,
  floorHazardsForRoom,
  floorHazardsFromPlacements,
  terrainForRoom,
} from '../src/run/roomTerrainConfig';
import type { MapNodeKind } from '../src/run/mapGraphContract';

assert.equal(
  floorHazardBlocksEntry({ ...TERRAIN_KEEPOUTS.arenaCenter, radius: 1 }),
  true,
  '전투 중심에는 용암·독지대를 배치하지 않는다',
);

/**
 * 용암·독지대 실런 배선 회귀 (#304).
 *
 * ## 무엇이 없었나
 *
 * `setFloorHazards`를 부르는 곳이 **DEV 프리뷰 하나뿐**이었다. `MapNode.terrain`에
 * 원형 바닥지형을 넣어도 `blocksFromPlacements`가 `kind === 'barrier'`만 통과시켜
 * 전부 버려졌다. 실런에서 용암·독지대는 **한 번도 생기지 않았다.**
 *
 * ## 왜 이 회귀가 필요한가
 *
 * 그 상태에서 나온 *"1스테이지에 독 장판이 없다"*를 #298이 **위험지대 함정방** 빈도
 * 문제로 잘못 진단했다. 두 체계는 데이터도 기전도 다르다:
 *
 * | | 위험지대 함정방 | 용암·독지대 |
 * |---|---|---|
 * | 출처 | `trapProfile: 'hazard'` | `MapNode.terrain` |
 * | 산출 | 붉은 원 `HazardZone` | `FloorHazardZone` |
 * | 원소·정화 | **없음** | 있음 (#293) |
 *
 * 함정방을 아무리 늘려도 정화 노출은 0%였다. 이 회귀는 **배선이 살아 있다**는 것과
 * **두 체계가 안 겹친다**는 것을 함께 고정한다.
 */

// ── 1) 원형 바닥지형이 실제로 통과한다 ──────────────────────────────────────
//
// 종전 실패의 핵심이 여기다. 계약에 넣어도 변환기가 안 읽으면 화면에 안 나온다.
{
  const zones = floorHazardsFromPlacements([
    { kind: 'lava', x: 700, y: 400, radius: 80 },
    { kind: 'poison', x: 1200, y: 900, radius: 100 },
    { kind: 'barrier', x: 900, y: 640, radius: 60 },   // 장벽은 여기로 오면 안 된다
    { kind: 'lava', x: 800, y: 500 },                   // radius 없음 → 버린다
  ]);
  assert.equal(zones.length, 2, '용암·독지대만 통과해야 한다');
  assert.deepEqual(zones.map((z) => z.kind).sort(), ['lava', 'poison']);
  assert.ok(
    !zones.some((z) => z.kind === ('barrier' as never)),
    '장벽이 바닥지형으로 새면 안 된다 — 두 변환기는 서로 배타적이다',
  );
}

// ── 2) 도착·출구를 덮는 배치는 배선이 버린다 ────────────────────────────────
//
// ⚠️ 이건 설계가 아니라 **안전**이다. 도착을 덮으면 방에 들어서자마자 피가 깎이고
// (회피 불가), 출구를 덮으면 나가려면 반드시 밟아야 한다. 둘 다 플레이어가 대응할 수
// 없는 형태라 기믹이 아니라 사고다. 노드 데이터는 손으로 쓰는 것이라 오타 하나로
// 이렇게 된다.
{
  const arrival = TERRAIN_KEEPOUTS.arrival;
  assert.equal(
    floorHazardBlocksEntry({ x: arrival.x, y: arrival.y, radius: 60 }), true,
    '도착 지점 위의 바닥지형은 막아야 한다',
  );
  for (const exit of TERRAIN_KEEPOUTS.exits) {
    assert.equal(
      floorHazardBlocksEntry({ x: exit.x, y: exit.y, radius: 50 }), true,
      '출구 위의 바닥지형은 막아야 한다',
    );
  }
  // 방 한가운데는 정상 — 전부 막으면 기믹 자체가 안 나온다
  assert.equal(
    floorHazardBlocksEntry({ x: 960, y: 640, radius: 90 }), false,
    '방 중앙은 정상 배치다 — 다 막으면 기믹이 사라진다',
  );
  // 경계 근처: 여유(FLOOR_HAZARD_MARGIN)만큼 떨어지면 통과한다
  const justOutside = arrival.x + arrival.radius + 60 + FLOOR_HAZARD_MARGIN + 1;
  assert.equal(
    floorHazardBlocksEntry({ x: justOutside, y: arrival.y, radius: 60 }), false,
    '여유 밖은 통과해야 한다',
  );
  // 변환기가 실제로 걸러내는가
  const filtered = floorHazardsFromPlacements([
    { kind: 'poison', x: arrival.x, y: arrival.y, radius: 70 },
    { kind: 'lava', x: 960, y: 640, radius: 70 },
  ]);
  assert.equal(filtered.length, 1, '도착을 덮는 항목만 버려야 한다');
  assert.equal(filtered[0].kind, 'lava');
}

// ── 3) 반경 상한 — 방을 통째로 덮으면 회피가 불가능하다 ─────────────────────
{
  const huge = floorHazardsFromPlacements([{ kind: 'lava', x: 960, y: 640, radius: 9999 }]);
  assert.equal(huge.length, 1, '상한을 넘으면 버리는 게 아니라 줄인다');
  assert.equal(huge[0].radius, FLOOR_HAZARD_MAX_RADIUS, '반경을 상한으로 자른다');
  // 방어적 입력 — 노드는 손으로 쓰는 데이터다
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(
      floorHazardsFromPlacements([{ kind: 'lava', x: 0, y: 0, radius: bad }]).length, 0,
      `radius ${bad}는 버려야 한다`,
    );
  }
  const tiny = floorHazardsFromPlacements([{ kind: 'poison', x: 960, y: 640, radius: -5 }]);
  assert.ok(tiny.length === 0 || tiny[0].radius > 0, '음수 반경이 그대로 통과하면 안 된다');
}

// ── 4) 씬이 실제로 배선을 탄다 ──────────────────────────────────────────────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

  assert.ok(
    /private applyRoomFloorHazards\(/.test(scene),
    '방 진입 시 바닥지형을 까는 경로가 있어야 한다',
  );
  assert.ok(
    /this\.applyRoomFloorHazards\(node\)/.test(scene),
    'applyRoomTerrain이 바닥지형도 함께 적용해야 한다',
  );
  assert.ok(
    /floorHazardsFromPlacements\(node\.terrain\)/.test(scene),
    '노드의 terrain에서 바닥지형을 읽어야 한다',
  );
  // 노드가 이기고, 비어 있으면 기본 배치 — 장벽과 같은 규칙이다
  assert.ok(
    /this\.setFloorHazards\(floorHazardsForRoom\(node\.kind, stage\)\)/.test(scene),
    '노드가 비어 있으면 방 종류별 기본 배치를 써야 한다 —'
    + ' 기본값이 없으면 배선만 붙이고 화면은 그대로다',
  );

  // ⚠️ 위험지대 함정방과 겹치지 않는다. 함정방은 십자 안전통로를 전제로 붉은 원을
  // 까는데, 그 위에 바닥지형이 겹치면 **안전통로가 안전하지 않게 된다.**
  // 안전통로는 "여기로 지나가라"는 약속이라 그게 깨지면 방을 읽을 수 없다.
  const fnAt = scene.indexOf('private applyRoomFloorHazards(');
  const body = scene.slice(fnAt, fnAt + 900);
  assert.ok(
    /this\.activeTrapProfile\?\.kind === 'hazard'/.test(body),
    '위험지대 함정방에서는 바닥지형을 깔지 않아야 한다 (중첩 금지)',
  );
  assert.ok(
    /this\.setFloorHazards\(\[\]\)/.test(body),
    '함정방에서는 바닥지형을 비워야 한다 — 이전 방 것이 남으면 안 된다',
  );

  // DEV 프리뷰 말고 **실런 경로**에서 부른다 — 종전 실패가 정확히 이것이었다
  const calls = scene.match(/this\.setFloorHazards\(/g) ?? [];
  assert.ok(
    calls.length >= 3,
    `setFloorHazards 호출이 ${calls.length}곳뿐이다 —`
    + ' DEV 프리뷰 1곳 + 실런 경로 2곳(적용·함정방 비우기)이 있어야 한다',
  );
}

// ── 5) 기본 배치가 실제로 안전한가 ──────────────────────────────────────────
//
// 배선만 붙이고 기본값을 안 두면 화면은 그대로다(생성기가 `terrain: []`을 준다).
// 그래서 장벽과 같은 방식으로 기본 배치를 두는데, **좌표를 손으로 골랐으므로**
// 눈이 아니라 계산으로 검사한다.
{
  const ALL: readonly MapNodeKind[] = [
    'start', 'combat', 'elite', 'trap', 'treasure', 'altar', 'stage-boss', 'memory-boss',
  ];
  for (const kind of ALL) {
    for (const stage of [1, 2] as const) {
      const zones = floorHazardsForRoom(kind, stage);
      const expected = FLOOR_HAZARD_KINDS_WITH_DEFAULT.includes(kind);
      assert.equal(
        zones.length > 0, expected,
        `${kind}(${stage}) 기본 바닥지형 유무가 의도와 달라졌다`,
      );
      if (!expected) continue;

      // 도착·출구를 덮지 않는다
      for (const zone of zones) {
        assert.equal(
          floorHazardBlocksEntry(zone), false,
          `${kind}(${stage}) 기본 배치가 도착/출구를 덮는다 — 대응 불가한 사고가 된다`,
        );
        assert.ok(
          zone.radius <= FLOOR_HAZARD_MAX_RADIUS,
          `${kind}(${stage}) 기본 반경이 상한을 넘는다`,
        );
      }

      // ⚠️ 기본 장벽과 겹치면 안 된다 — 블록 아래 깔린 장판은 보이지도 밟히지도 않는다
      for (const zone of zones) {
        for (const block of terrainForRoom(kind, stage)) {
          const dx = Math.abs(zone.x - block.x);
          const dy = Math.abs(zone.y - block.y);
          const overlaps = dx < zone.radius + block.half && dy < zone.radius + block.half;
          assert.ok(
            !overlaps,
            `${kind}(${stage}) 기본 바닥지형(${zone.x},${zone.y} r${zone.radius})이`
            + ` 장벽(${block.x},${block.y} half${block.half})과 겹친다`,
          );
        }
      }

      // 서로도 안 겹친다 — 겹치면 두 종류가 한 덩어리로 보인다
      for (let i = 0; i < zones.length; i += 1) {
        for (let j = i + 1; j < zones.length; j += 1) {
          const dx = zones[i].x - zones[j].x;
          const dy = zones[i].y - zones[j].y;
          const reach = zones[i].radius + zones[j].radius;
          assert.ok(
            dx * dx + dy * dy > reach * reach,
            `${kind}(${stage}) 기본 바닥지형끼리 겹친다 — 두 종류가 한 덩어리로 보인다`,
          );
        }
      }

      // 변환기를 통과한다 — 기본값이 자기 안전 검사에 걸리면 조용히 사라진다
      assert.equal(
        floorHazardsFromPlacements(zones).length, zones.length,
        `${kind}(${stage}) 기본 배치가 자기 안전 검사에 걸린다`,
      );
    }
  }

  // 1스테이지는 독지대, 2스테이지는 용암 — 총괄이 물은 "1스테이지 독 장판"이 여기다.
  // 용암이 더 아프고 잔류가 없으므로 깊이가 깊어질수록 즉발 위험이 커지는 쪽이 읽기 쉽다
  assert.ok(
    floorHazardsForRoom('combat', 1).some((z) => z.kind === 'poison'),
    '1스테이지 전투방에 독지대가 있어야 한다 (원래 제보의 대상)',
  );
  assert.ok(
    floorHazardsForRoom('combat', 2).some((z) => z.kind === 'lava'),
    '2스테이지 전투방은 용암',
  );
}

// ── 6) 두 체계가 섞이지 않았다는 표시 ───────────────────────────────────────
//
// #298의 오라벨을 되풀이하지 않기 위한 단언이다. 맵 생성기 회귀가 함정방 빈도를
// "독지대"라고 부르면 다음 사람이 또 같은 결론을 낸다.
{
  const mapgen = readFileSync('scripts/map-generator-regression.ts', 'utf8');
  const hazardBlock = mapgen.slice(mapgen.indexOf('위험지대 함정방이 충분히'));
  assert.ok(
    hazardBlock.length > 0,
    '맵 생성기 회귀의 함정방 단언은 "위험지대 함정방"으로 불려야 한다',
  );
  assert.ok(
    !/독지대가 있는 맵이/.test(mapgen),
    '함정방 빈도를 "독지대"라고 부르면 안 된다 (#304) — 다음 사람이 또 같은 결론을 낸다',
  );
}

console.log(
  'floor hazard wiring regression: 원형통과·도착출구보호·반경상한·씬배선·기본배치안전·오라벨금지 6군 통과',
);
