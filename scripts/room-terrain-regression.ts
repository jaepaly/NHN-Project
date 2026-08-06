import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOM_TERRAIN_BOUNDS,
  TERRAIN_CLEARANCE,
  TERRAIN_KEEPOUTS,
  TERRAIN_KINDS,
  TERRAIN_MAX_BARRIERS,
  TERRAIN_MAX_HALF,
  TERRAIN_MIN_HALF,
  TERRAIN_PLAYER_RADIUS,
  blocksFromPlacements,
  layoutHasTrap,
  sightBlocked,
  exitEnterableCount,
  exitsReachable,
  fixtureReachable,
  pointBlocked,
  terrainForRoom,
} from '../src/run/roomTerrainConfig';
import { pushOutOfBlocks } from '../src/combat-core/combat/terrainBlock';
import { ROOM_FIXTURE_CONFIG } from '../src/run/roomFixtureConfig';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import { generateRunMap } from '../src/run/mapGenerator';
import type { MapNodeKind } from '../src/run/mapGraphContract';
import { TERRAIN_BARRIER_VFX } from '../src/render/terrainBarrierVfxConfig';

/**
 * 방 지형 구조물 배치 회귀 (#214 지형 Tier 2 배선).
 *
 * ## 이 회귀가 막는 사고
 *
 * 구조물은 **조용하게** 런을 벽돌로 만들 수 있다. #283에서 잘못된 `waveSetId`가 방을
 * 벽돌로 만든 건 최소한 예외를 던졌다(로그가 남았다). 구조물은 예외도 로그도 없이
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
// 플레이어 반경도 씬이 `pushOutOfBlocks(..., 16, ...)`로 넘기는 값과 같아야
// "비었다"가 한 뜻이 된다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(
    scene.includes(`pushOutOfBlocks(this.player.x, this.player.y, ${TERRAIN_PLAYER_RADIUS}`),
    `씬의 플레이어 반경이 TERRAIN_PLAYER_RADIUS(${TERRAIN_PLAYER_RADIUS})와 달라졌다`,
  );
  assert.equal(
    TERRAIN_CLEARANCE, TERRAIN_PLAYER_RADIUS,
    '블록은 두께 개념이 없다 — 여유는 플레이어 반경 그대로',
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
// `setTerrainBarriers` 호출이 **DEV 프리뷰 한 곳뿐**이어서 실제 런에는 구조물이
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
    /blocksFromPlacements\(node\.terrain\)/.test(scene),
    'R1이 노드에 채운 구조물이 기본값을 이겨야 한다',
  );
  const renderBody = scene.slice(
    scene.indexOf('private setTerrainBarriers'),
    scene.indexOf('private applyRoomTerrain'),
  );
  assert.ok(renderBody.length > 1_000, 'setTerrainBarriers 렌더 본문을 찾을 수 있어야 한다');
  assert.ok(
      renderBody.includes('this.textures.exists(TERRAIN_BARRIER_VFX.textureKey)')
        && renderBody.includes('.setDisplaySize(displaySize, displaySize)')
        && renderBody.includes('.setTint(TERRAIN_BARRIER_VFX.spriteTint)')
        && renderBody.includes('TERRAIN_BARRIER_VFX.occlusionScale')
        && renderBody.includes('TERRAIN_BARRIER_VFX.occlusionTint')
        && renderBody.includes('TERRAIN_BARRIER_VFX.silhouetteScale')
        && renderBody.includes('TERRAIN_BARRIER_VFX.silhouetteTint')
        && renderBody.includes('TERRAIN_BARRIER_VFX.contactShadowAlpha')
        && renderBody.includes('TERRAIN_BARRIER_VFX.debrisTint')
        && renderBody.includes('.setAngle((index % 4) * 90)'),
      '장벽은 접지·이중 외곽·톤 보정을 거친 탑다운 석재 스프라이트를 우선해야 한다',
  );
  assert.ok(
    renderBody.includes('fillStyle(pal.base, 0.92)')
      && renderBody.includes('fillStyle(pal.stoneMid, 1)')
      && renderBody.includes('fillStyle(pal.wallFront, 1)')
      && renderBody.includes('fillStyle(pal.wallSide, 1)'),
    '고정 지형은 기단·상판·전면·측면이 분리된 봉인 석벽이어야 한다',
  );
  assert.ok(
    renderBody.includes('const height = Math.max(pal.minHeight, half * pal.heightRatio)')
      && renderBody.includes('new Phaser.Geom.Point(right - cut, bottom)'),
    '상판과 기단 사이에 실제 수직 높이를 만들고 충돌 범위를 기단으로 표시해야 한다',
  );
  assert.ok(
    renderBody.includes('lineBetween(cap[0].x')
      && !renderBody.includes('pal.footprint'),
    '상판은 파손 석재 윤곽을 유지하고 선택 영역처럼 보이던 브래킷은 제거해야 한다',
  );
  assert.ok(
    renderBody.includes('const runePoints = Array.from({ length: 6 }')
      && renderBody.includes('const runeY = y - height'),
    '파손 육각 봉인은 수직면이 아니라 솟은 상판에 새겨져야 한다',
  );
  assert.ok(
    TERRAIN_BARRIER_VFX.stoneDark < TERRAIN_BARRIER_VFX.stoneLight
      && TERRAIN_BARRIER_VFX.rune !== 0xb89bc4,
    '석재 명도차와 배경 계열 청록 룬으로 유적 재질을 구분해야 한다',
  );
  assert.ok(
    !renderBody.includes('0x6d7fc4') && !renderBody.includes('0x8fa4ff'),
    '고정 지형 블록에 기존의 밝은 청색 팔레트가 남아서는 안 된다',
  );
  assert.ok(
    !renderBody.includes('setBlendMode'),
    '고정 지형 블록은 발광체가 아니므로 ADD 블렌드를 쓰면 안 된다',
  );
}

// ── 3) keep-out — 도착·출구·설치물을 침범하지 않는다 ────────────────────────
//
// 도착 지점이 왼쪽 중앙 한 점으로 고정된 이유가 이것이다(#246): 지형이 그 한 점만
// 비우면 된다. #264가 요구한 것도 같다.
for (const kind of ALL_KINDS) {
  for (const stage of STAGES) {
    const blocks = terrainForRoom(kind, stage);
    const arrival = TERRAIN_KEEPOUTS.arrival;
    assert.ok(
      !pointBlocked(arrival.x, arrival.y, blocks, arrival.radius),
      `${kind}/${stage}: 도착 지점(${arrival.x},${arrival.y}) 반경 ${arrival.radius}를 비워야 한다`,
    );
    for (const exit of TERRAIN_KEEPOUTS.exits) {
      assert.ok(
        !pointBlocked(exit.x, exit.y, blocks, exit.radius),
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
    const blocks = terrainForRoom(kind, stage);
    const walk = exitsReachable(blocks);
    assert.ok(
      walk.reachable,
      `${kind}/${stage}: 도착에서 두 출구까지 걸어갈 수 있어야 한다 (막힌 출구 ${walk.unreachedExits})`,
    );
    // BFS로 닿는 것과 **포탈 진입 반경 안에 들어가는 것**은 다르다.
    // 포탈은 enterRadius(26) 안에서 발화하므로 그 원이 살아 있어야 한다.
    assert.equal(
      exitEnterableCount(blocks), 2,
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
    const blocks = terrainForRoom(kind, stage);
    assert.ok(
      blocks.length <= TERRAIN_MAX_BARRIERS,
      `${kind}/${stage}: 구조물 ${blocks.length}개는 상한 ${TERRAIN_MAX_BARRIERS}을 넘는다 (미로 금지)`,
    );
    for (const block of blocks) {
      // ⚠️ 크기 상한의 근거가 선분 시절과 다르다. 그때는 "긴 벽 = 무적 지점"(주문이
      // 통과하므로)이었는데, 이제 주문도 막히므로 비대칭이 없다. 지금 근거는:
      // **적이 블록 뒤에 붙어 멈추면 주문도 안 닿는다.** 적 추격은 직선이고 우회를
      // 못 하므로, 블록이 크면 잡으러 도는 왕복이 길어진다.
      assert.ok(
        block.half <= TERRAIN_MAX_HALF,
        `${kind}/${stage}: half ${block.half} > 상한 ${TERRAIN_MAX_HALF} (뒤에 숨은 적을 잡기 어려워진다)`,
      );
      // 하한도 있다 — 작으면 다시 울타리로 보인다(총괄 지시: "구조물답게")
      assert.ok(
        block.half >= TERRAIN_MIN_HALF,
        `${kind}/${stage}: half ${block.half} < 하한 ${TERRAIN_MIN_HALF} (구조물로 안 읽힌다)`,
      );
      // 방 밖으로 삐져나가면 렌더가 잘리고 밀어내기가 벽 밖으로 밀어낸다
      assert.ok(
        block.x - block.half > 0 && block.x + block.half < ROOM_TERRAIN_BOUNDS.width
        && block.y - block.half > 0 && block.y + block.half < ROOM_TERRAIN_BOUNDS.height,
        `${kind}/${stage}: 구조물이 방 밖으로 나간다`,
      );
    }

    // ⚠️ **블록을 붙여 놓으면 그 사이에 낀다.** 맞닿은 두 블록 사이에서는 밀어내기가
    // 핑퐁해 수렴하지 못한다(실측: x=480/560 half=40 사이에 두면 결과가 여전히 블록 안).
    // `pushOutOfBlocks`가 반복으로 완화하지만 기하학적으로 탈출구가 없는 배치는
    // 못 구한다 — 애초에 만들지 않는 것이 해법이다.
    assert.ok(
      !layoutHasTrap(blocks),
      `${kind}/${stage}: 두 구조물이 너무 가깝다 — 사이에 끼면 못 빠져나온다`,
    );
  }
}

// ── 6) 어떤 종류가 비어 있는지는 **의도**다 ─────────────────────────────────
//
// "빠뜨렸다"와 "의도적으로 비웠다"를 구분해 둔다. 특히 함정방은 기믹이 이미 공간을
// 제약하므로(십자 안전 통로) 구조물까지 얹으면 공간이 이중으로 좁아진다.
for (const kind of ALL_KINDS) {
  const has = STAGES.some((stage) => terrainForRoom(kind, stage).length > 0);
  const shouldHave = TERRAIN_KINDS.includes(kind);
  assert.equal(has, shouldHave, `${kind}: 구조물 보유 여부가 TERRAIN_KINDS와 일치해야 한다`);
}
assert.deepEqual([...TERRAIN_KINDS], ['combat', 'elite'], '구조물은 전투·정예 둘에만');
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
// 적이 구조물 위에 스폰되면 그 버그가 바로 드러난다.
for (const kind of TERRAIN_KINDS) {
  for (const stage of STAGES) {
    const blocks = terrainForRoom(kind, stage);
    for (const block of blocks) {
      // 구조물 **정중앙**(완전히 안쪽)에서 밀어낸다 — 표면점이 자기 자신이라 방향이
      // 없는 경우다. 못 다루면 안에 스폰된 적이 영영 못 나온다
      const pushed = pushOutOfBlocks(block.x, block.y, TERRAIN_PLAYER_RADIUS, blocks);
      const moved = Math.hypot(pushed.x - block.x, pushed.y - block.y);
      assert.ok(moved > 0, `${kind}/${stage}: 안쪽에서 밀려나야 한다`);
      assert.ok(
        moved < 200,
        `${kind}/${stage}: ${moved.toFixed(0)}px 튕겼다 — push 음수 버그 재발`,
      );
      assert.ok(
        !pointBlocked(pushed.x, pushed.y, blocks),
        `${kind}/${stage}: 밀어낸 위치가 여전히 구조물 안이다`,
      );
    }
  }
}

// ── 9) 적 스폰이 구조물에 걸려도 조용히 해결된다 ──────────────────────────────
//
// 적은 **플레이어 현재 위치** 중심 원형으로 스폰되고 좌표 클램프만 한다
// (`waveSpawnPosition`). 구조물을 피하지 않으므로 후속 웨이브는 구조물 안에 스폰될 수
// 있다. 1웨이브만 보면 0건이라 안심하게 되는데(도착 지점이 왼쪽 끝이고 가장 왼쪽
// 구조물이 x=700이라 사거리 350이 닿지 않는다) **플레이어가 움직이면 달라진다.**
//
// 실측(방 전역 54곳 × 스폰 각도 88건): 겹침 1.3~1.8% · 최대 밀림 25px ·
// 밀어낸 뒤 잔류 0건. 즉 스폰 다음 프레임에 조용히 밖으로 나간다.
{
  const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));
  const spawnDistance = 350;
  const enemyRadius = 18;
  for (const kind of TERRAIN_KINDS) {
    for (const stage of STAGES) {
      const blocks = terrainForRoom(kind, stage);
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
                const clearance = enemyRadius;
                if (!pointBlocked(x, y, blocks, clearance)) continue;
                overlap += 1;
                const pushed = pushOutOfBlocks(x, y, enemyRadius, blocks);
                const moved = Math.hypot(pushed.x - x, pushed.y - y);
                // 튕김이 크면 적이 순간이동한 것처럼 보인다 (push 음수 버그의 증상)
                assert.ok(moved < 80, `${kind}/${stage}: 스폰 밀림 ${moved.toFixed(0)}px가 과하다`);
                assert.ok(
                  !pointBlocked(pushed.x, pushed.y, blocks, clearance),
                  `${kind}/${stage}: 밀어낸 뒤에도 구조물 안이다 — 적이 벽에 갇힌다`,
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
        `${kind}/${stage}: 스폰 겹침 ${(ratio * 100).toFixed(1)}%가 과하다 (구조물이 스폰 링을 막는다)`,
      );
    }
  }
}

// ── 10) 계약 변환 — 원형 지형이 섞여도 구조물만 골라낸다 ───────────────────────
{
  const mixed = [
    { kind: 'lava', x: 100, y: 100, radius: 72 },
    { kind: 'barrier', x: 500, y: 400, halfLength: 100 },
    { kind: 'poison', x: 300, y: 300, radius: 84 },
    // halfLength가 없는 'barrier'는 구조물이 될 수 없다 — 조용히 { halfLength: undefined }
    // 구조물을 만들면 렌더가 길이 0으로 그려지고 밀어내기가 점으로 작동한다
    { kind: 'barrier', x: 700, y: 200 },
  ];
  const blocks = blocksFromPlacements(mixed);
  assert.equal(blocks.length, 1, '구조물 항목만 골라낸다');
  assert.deepEqual(blocks[0], { x: 500, y: 400, half: 100 });
  assert.deepEqual(blocksFromPlacements([]), []);
}

// ── 11) 프리셋·생성 맵의 모든 방이 통행 가능하다 ────────────────────────────
//
// 배치는 종류별이므로 어떤 맵이든 같은 값이 나오지만, **맵이 노드에 구조물을 채우기
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
      const fromNode = blocksFromPlacements(node.terrain);
      const blocks = fromNode.length > 0 ? fromNode : terrainForRoom(node.kind, stage);
      const walk = exitsReachable(blocks);
      assert.ok(walk.reachable, `${node.id}(${node.kind}): 출구까지 걸어갈 수 있어야 한다`);
      assert.equal(exitEnterableCount(blocks), 2, `${node.id}: 두 포탈 진입 가능`);
    }
  }
}

// ── 12) **플레이어 주문도 막힌다** ─────────────────────────────────────────
//
// 총괄 지시: *"플레이어의 마법이 통과할 수 있으면 안 됨."*
//
// 종전엔 이동·적 투사체만 막고 주문은 통과했다. 그래서 엄폐가 한쪽에만 작동해
// "긴 벽 뒤에서 일방적으로 잡는" 무적 지점이 생겼고, 그것 때문에 벽 길이에 상한을
// 걸어야 했다. 이제 대칭이 되어 그 제약이 사라졌다.
{
  for (const kind of TERRAIN_KINDS) {
    const blocks = terrainForRoom(kind, 1);
    assert.ok(blocks.length > 0, `${kind}에 구조물이 있어야 이 검사가 의미 있다`);
    const block = blocks[0];
    // 구조물을 관통하는 사선은 막힌다
    assert.ok(
      sightBlocked(block.x - 300, block.y, block.x + 300, block.y, blocks),
      `${kind}: 구조물을 관통하는 주문은 막혀야 한다`,
    );
    // 비껴가는 사선은 통과한다 — 전부 막으면 방에서 아무것도 못 맞힌다
    assert.ok(
      !sightBlocked(block.x - 300, block.y - block.half - 80, block.x + 300, block.y - block.half - 80, blocks),
      `${kind}: 구조물을 비껴가는 주문은 통과해야 한다`,
    );
  }

  // 씬이 실제로 그 판정을 거치는가
  //
  // ⚠️ 처음엔 일반 적중 루프 안에 `segmentBlocked(impactSource, …)`를 직접 박았다.
  // 그랬더니 총괄 제보 *"아직 유저의 공격이 벽을 뚫더라"* — 연쇄 도약과 시퀀스 고정
  // 대상은 그 앞에서 조기 반환해 판정을 아예 안 거쳤다. 판정을 `terrainBlocksCast`로
  // 모아 **빠뜨릴 자리를 없앴다.** 호출부별 세부 검사는 `slowmo-scope-regression.ts`.
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(
    /private terrainBlocksCast\(/.test(scene),
    '주문 적중 판정이 구조물 차단을 거쳐야 한다 (공통 함수 terrainBlocksCast)',
  );
  assert.ok(
    /if \(this\.terrainBlocksCast\(spec, impactSource, enemy\)\) continue;/.test(scene),
    '일반 적중 경로가 공통 차단 판정을 거쳐야 한다 (시전점 → 적)',
  );
  // zone·rain은 예외 — 위에서 떨어지거나 바닥에 깔리는 폼이라 옆 구조물이 가릴 이유가 없다.
  // 예외를 호출부마다 쓰면 또 빠뜨리므로 공통 함수 안에 한 번만 둔다.
  const fnAt = scene.indexOf('private terrainBlocksCast(');
  assert.ok(
    /spec\.form === 'zone' \|\| spec\.form === 'rain'/.test(scene.slice(fnAt, fnAt + 700)),
    'zone·rain은 구조물 차단에서 제외되어야 한다 (낙하·장판 폼)',
  );
  // 적 투사체도 같은 기하를 쓴다 — 두 경로가 갈리면 "적 탄은 통과하는데 내 건 막힌다"가 된다
  const shared = (scene.match(/segmentBlocked\(/g) ?? []).length
    + (scene.match(/this\.terrainBlocksCast\(/g) ?? []).length;
  assert.ok(
    shared >= 2,
    `적 투사체와 플레이어 주문이 같은 차단 판정을 써야 한다 (현재 ${shared}건)`,
  );

  // 기본 평타는 SpellRenderer가 아니라 friendlyMissiles 유도탄 루프를 탄다. 주문 경로만
  // 잠그면 평타가 여전히 벽을 뚫으므로, 이동 전 위치→다음 위치 스윕이 적중보다 먼저다.
  const friendlyAt = scene.indexOf('private updateFriendlyMissiles(');
  const friendlyEnd = scene.indexOf('private destroyFriendlyMissile(', friendlyAt);
  const friendly = scene.slice(friendlyAt, friendlyEnd);
  assert.ok(
    /segmentBlocked\(previous, next, this\.terrainBarriers, 5\)/.test(friendly),
    '기본 평타·아군 유도탄이 지형 구조물 스윕 판정을 거쳐야 한다',
  );
  assert.ok(
    friendly.indexOf('segmentBlocked(previous, next')
      < friendly.indexOf('distance <= missile.hitDistance + travelDistance'),
    '구조물 차단이 목표 적중보다 먼저여야 마지막 프레임 관통 피해가 없다',
  );
}

console.log(
  'room terrain regression: 좌표일치·배선·keep-out·통행·구조물규약·의도적공백'
  + '·스테이지분기·밀어내기·스폰겹침·계약변환·전맵통행·주문·평타차단 12군 통과',
);
