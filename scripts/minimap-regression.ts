import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MINIMAP_CONFIG, minimapLayout } from '../src/ui/minimapLayout';
import { mockMinimapModel } from '../src/run/mapGraphMock';
import { PORTAL_CONFIG } from '../src/run/portalConfig';
import type { MinimapModel } from '../src/run/mapGraphContract';

// ── 레이아웃: 전 노드가 패널 안에, 겹침 없이 ─────────────────────────
// 겹침·범위 이탈은 화면을 봐야만 보이는 버그라 좌표 계산을 수치로 못박는다.
{
  const model = mockMinimapModel();
  const points = minimapLayout(model);
  assert.equal(points.length, model.nodes.length, '노드 수만큼 좌표');

  const { width, height, padding, nodeRadius } = MINIMAP_CONFIG;
  for (const point of points) {
    assert.ok(
      point.x >= padding - 1 && point.x <= width - padding + 1,
      `${point.id}: x=${point.x.toFixed(1)} 패널 밖`,
    );
    assert.ok(
      point.y >= padding - 1 && point.y <= height - padding + 1,
      `${point.id}: y=${point.y.toFixed(1)} 패널 밖`,
    );
  }

  // 같은 layer 안에서 노드끼리 겹치지 않는다 (반지름 2배 이상 간격)
  for (const a of points) {
    for (const b of points) {
      if (a.id >= b.id) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d >= nodeRadius * 2,
        `${a.id}·${b.id} 겹침 (거리 ${d.toFixed(1)})`);
    }
  }

  // 진행 축: 시작(layer 0)이 왼쪽 끝, 보스(최대 layer)가 오른쪽 끝 — 총괄 스케치 방향
  const byId = new Map(points.map((p) => [p.id, p] as const));
  assert.ok(byId.get('start')!.x < byId.get('boss')!.x, '시작이 보스보다 왼쪽');
  assert.equal(byId.get('boss')!.x, width - padding, '보스는 오른쪽 끝');
}

// ── #240 연속 lane: layer별 재정렬 없이 stage 전체 Y축 유지 ──────────
{
  const continuous: MinimapModel = {
    nodes: [
      { id: 'upper-a', kind: 'combat', status: 'current', stage: 1, layer: 0, lane: -0.5 },
      { id: 'lower-a', kind: 'combat', status: 'reachable', stage: 1, layer: 0, lane: 1.5 },
      // 이 layer에는 아래 갈래 하나뿐이어도 중앙으로 튀면 안 된다.
      { id: 'lower-only', kind: 'combat', status: 'unvisited', stage: 1, layer: 1, lane: 1.5 },
      { id: 'upper-b', kind: 'combat', status: 'unvisited', stage: 1, layer: 2, lane: -0.5 },
      { id: 'lower-b', kind: 'combat', status: 'unvisited', stage: 1, layer: 2, lane: 1.5 },
    ],
    edges: [],
  };
  const byId = new Map(minimapLayout(continuous).map(point => [point.id, point] as const));
  assert.equal(byId.get('lower-a')!.y, byId.get('lower-only')!.y, '같은 lane은 단독 layer에서도 Y 유지');
  assert.equal(byId.get('lower-only')!.y, byId.get('lower-b')!.y, '같은 lane은 전 구간 Y 유지');
  assert.equal(byId.get('upper-a')!.y, byId.get('upper-b')!.y, '위 갈래 Y 유지');
  assert.ok(byId.get('upper-a')!.y < byId.get('lower-a')!.y, '원본 lane 순서 보존');
}

// ── 방어: 단일 노드·NaN layer·빈 모델 ────────────────────────────────
// ESC 확대 배치: 동일 렌더러가 위치·크기·깊이를 함께 갱신한다.
{
  const hud = readFileSync('src/ui/minimapHud.ts', 'utf8');
  assert.ok(
    /export interface MinimapHudLayout/.test(hud)
      && /setLayout\(layout: MinimapHudLayout\)/.test(hud),
    '일반 HUD와 ESC 화면이 같은 미니맵 렌더러의 레이아웃만 바꿔 써야 한다',
  );
  assert.ok(
    /const width = MINIMAP_CONFIG\.width \* scale;/.test(hud)
      && /x: point\.x \* scale/.test(hud)
      && /g\.lineStyle\(\(walked \? 2 : 1\) \* scale/.test(hud),
    '확대 시 패널·노드·경로선이 함께 확대되어야 한다',
  );
  assert.ok(
    /roomIconTextureKey\(node\.kind\)/.test(hud)
      && /iconSize = \(isBoss \? 26 : 20\) \* scale/.test(hud)
      && /iconBackingRadius/.test(hud)
      && !/drawDiamond\(/.test(hud),
    'ESC 미니맵은 공통 방 아이콘과 보스 확대 위계를 사용해야 한다',
  );
  assert.ok(
    /projectMinimapStage\(fullModel, this\.selectedStage\)/.test(hud)
      && /private readonly stageTabs/.test(hud),
    'ESC 미니맵은 공통 스테이지 투영과 전환 탭을 사용해야 한다',
  );
}

{
  assert.deepEqual(minimapLayout({ nodes: [], edges: [] }), [], '빈 모델 안전');

  const single: MinimapModel = {
    nodes: [{ id: 'only', kind: 'combat', status: 'current', layer: 0, lane: 0 }],
    edges: [],
  };
  const [p] = minimapLayout(single);
  assert.equal(p.x, MINIMAP_CONFIG.width / 2, '단일 노드는 가로 중앙');
  assert.equal(p.y, MINIMAP_CONFIG.height / 2, '단일 노드는 세로 중앙');

  const nan: MinimapModel = {
    nodes: [
      { id: 'n', kind: 'combat', status: 'unvisited', layer: Number.NaN, lane: Number.NaN },
      { id: 'ok', kind: 'combat', status: 'current', layer: 1, lane: 0 },
    ],
    edges: [],
  };
  for (const point of minimapLayout(nan)) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y), 'NaN 좌표 방어');
  }
}

// ── 포탈 설정 가드 ───────────────────────────────────────────────────
{
  assert.ok(PORTAL_CONFIG.enterRadius < PORTAL_CONFIG.radius,
    '진입 반경이 시각 링보다 크다 — 스치기만 해도 빨려든다');
  assert.ok(PORTAL_CONFIG.armDelayMs >= 400,
    '무장 지연이 짧다 — 클리어 직후 서 있던 자리 포탈에 즉시 빨려든다');
}

// ── 계약 표면 존재 — R1이 여기에 맞춰 스냅샷을 낸다 ──────────────────
{
  const contract = readFileSync('src/run/mapGraphContract.ts', 'utf8');
  for (const needle of [
    'MinimapModel', 'MinimapNode', 'MinimapEdge', 'MapNodeKind', 'MapNodeStatus',
    "'treasure'", "'altar'", "'trap'",
  ]) {
    assert.ok(contract.includes(needle), `계약 표면 누락: ${needle}`);
  }
  // 씬 프리뷰 훅이 본 게임 경로에 새지 않았는가 — DEV 가드 안에만 존재해야 한다
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  const hookAt = scene.indexOf('__mapPreview');
  const devGuardAt = scene.lastIndexOf('if (import.meta.env.DEV)', hookAt);
  assert.ok(hookAt >= 0 && devGuardAt >= 0 && hookAt - devGuardAt < 400,
    '__mapPreview가 DEV 가드 밖에 있다');
}

console.log('Minimap regression: 레이아웃 범위·비겹침·진행축·방어·포탈가드·계약표면 6군 통과');
