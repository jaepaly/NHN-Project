import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { encounterFromMapNode } from '../src/run/mapEncounter';
import { RunMapGraph, maximumMapPathRooms, toMinimapModel } from '../src/run/mapGraph';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import type { EncounterDefinition } from '../src/run/runContract';

/**
 * 맵 **씬 배선** 회귀 (#214).
 *
 * R1 소유의 `map-graph-regression.ts`는 그래프 순수 모듈을 고립해서 검증한다.
 * 이 파일은 그 그래프가 **씬에 실제로 연결돼 있는지**를 지킨다 — 감사에서
 * 회귀 67종 중 맵 배선을 지키는 게 0종이라, `refreshMinimap()` 호출을 지워도
 * 단일 갈래에서 `enterMapNode()`를 지워도 CI가 전부 초록으로 통과했다.
 *
 * 배선 검사는 `terrain-barrier-regression.ts` 끝 블록과 같은 문법이다
 * (저장소에 배선 유실 전례가 여러 번 있어 정착한 방식).
 */

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

/** 메서드 본문만 잘라낸다 — 파일 전체 검색은 다른 곳의 우연한 일치를 잡아준다. */
function bodyOf(startMarker: string, endMarker: string): string {
  const start = scene.indexOf(startMarker);
  assert.ok(start >= 0, `전제 실패: '${startMarker}'를 못 찾음 — 이름이 바뀌었나?`);
  const end = scene.indexOf(endMarker, start);
  assert.ok(end > start, `전제 실패: '${startMarker}' 이후 '${endMarker}'를 못 찾음`);
  return scene.slice(start, end);
}

// ── 미니맵이 그래프 **실데이터**를 먹는가 ────────────────────────────
{
  const body = bodyOf('private refreshMinimap()', 'private destroyRunMapUi()');
  assert.ok(
    body.includes('toMinimapModel(this.mapGraph.snapshot())'),
    '미니맵이 그래프 스냅샷이 아닌 것을 그린다 — 목데이터로 되돌아갔을 수 있다',
  );
}

// ── 방 이동이 그래프를 전진시키고 미니맵을 갱신하는가 ────────────────
{
  const body = bodyOf('private enterMapNode(', 'private setFloorHazards(');

  assert.ok(
    body.includes('this.mapGraph.canEnter(nodeId)'),
    '도달 불가 노드로 뛸 수 있다 — 그래프가 끊긴 채 런이 계속된다',
  );
  assert.ok(
    body.includes('this.mapGraph.enter(nodeId)'),
    '그래프가 전진하지 않는다 — RunController만 방을 세어 두 축이 어긋난다',
  );
  assert.ok(
    body.includes('this.refreshMinimap()'),
    '이동해도 미니맵이 그대로다 — 현재 위치가 영영 첫 칸에 머문다',
  );
  assert.ok(
    body.includes('layoutRoomArrival('),
    '도착 지점 계약(#245·#246)이 빠졌다 — 진입 좌표가 방마다 달라진다',
  );
  assert.ok(
    body.includes('this.mapEncounterByRoom.set(')
      && body.includes('encounterFromMapNode(node)'),
    '선택한 MapNode가 다음 실제 조우로 고정되지 않는다 — 두 진행축이 다시 갈라진다',
  );
}

// ── 실제 방 내용이 MapNode 하나를 보는가 ─────────────────────────────
{
  assert.ok(
    scene.includes('encounterProvider: (roomIndex) => this.mapEncounterForRoom(roomIndex)'),
    'RunController가 MapNode 조우 공급자를 쓰지 않는다 — RUN_ENCOUNTERS가 다시 실제 방을 덮는다',
  );
  assert.ok(
    scene.includes('maxRooms: maximumMapPathRooms(MAP_GRAPH_PRESET_01)'),
    '컨트롤러 방 수가 그래프 최대 경로와 맞지 않는다 — 중간 노드에서 런이 끝날 수 있다',
  );

  const roomBody = bodyOf('private startRoom(', 'private isBossEncounter()');
  assert.ok(
    roomBody.includes("this.activeTrapProfile?.kind === 'hazard'"),
    '함정 프로필이 실제 방 시작에 연결되지 않았다',
  );
  assert.ok(
    !roomBody.includes("roomIndex === 1 && this.activeTrapProfile?.kind === 'hazard'"),
    '함정 프로필이 DEV 첫 방에서만 실행된다',
  );

  const curseBody = bodyOf('private activateRoomCurse(', 'private activateRoomCurseAssignment(');
  assert.ok(
    curseBody.includes('this.mapGraph.current().trapProfile'),
    '선택한 trap 노드의 프로필을 방 기믹이 소비하지 않는다',
  );

  const rewardlessBody = bodyOf('private rewardlessNodeKind()', 'private startRewardlessRoom(');
  assert.ok(
    !rewardlessBody.includes('if (this.isBossEncounter()) return null'),
    '선형 보스 가드가 보물·제단 MapNode를 다시 덮는다',
  );
}

// ── 갈림길: 모든 경로가 그래프를 전진시키는가 ────────────────────────
{
  const body = bodyOf('choosePortalDestination()', 'private roomBoundsForPortals()');

  assert.ok(
    body.includes('this.mapGraph.choices()'),
    '선택지를 그래프에서 받지 않는다',
  );
  assert.ok(
    body.includes('layoutRoomExits('),
    '포탈 배치 계약(#245)이 빠졌다',
  );

  // ⚠️ 여기가 핵심이다. 이 메서드에는 그래프를 전진시켜야 하는 경로가 **셋**이다:
  //   ① 갈래가 하나뿐이라 조용히 넘어갈 때
  //   ② 배치가 실패해 첫 갈래로 폴백할 때
  //   ③ 플레이어가 포탈을 골랐을 때
  // 하나라도 빠지면 그 경로에서만 두 축이 어긋나고, 증상이 간헐적이라 잡기 어렵다.
  const advanceCalls = body.split('this.enterMapNode(').length - 1;
  assert.ok(
    advanceCalls >= 3,
    `갈림길에서 그래프를 전진시키는 경로가 ${advanceCalls}개뿐이다 — `
    + '단일갈래·배치실패폴백·포탈선택 셋 다 enterMapNode를 불러야 한다',
  );

  assert.ok(
    body.includes('this.portalField = null'),
    '포탈 선택 후 참조가 남는다 — 파괴된 GameObject를 update해 죽는다',
  );
}

// ── 새 런에서 그래프·미니맵이 같이 초기화되는가 ──────────────────────
{
  const body = bodyOf('private resetMapGraph(', 'private refreshMinimap()');

  assert.ok(
    body.includes('this.destroyRunMapUi()'),
    'UI를 걷어내기 전에 그래프를 갈아끼운다 — 씬 재사용(타이틀→새 런) 시 죽는다',
  );
  assert.ok(
    body.indexOf('this.destroyRunMapUi()') < body.indexOf('new RunMapGraph('),
    '걷어내기가 재생성보다 뒤에 있다 — 순서가 뒤집히면 파괴된 객체를 그린다',
  );
  assert.ok(
    body.includes('this.refreshMinimap()'),
    '새 런에서 미니맵이 이전 런 상태를 그대로 들고 있다',
  );
}

// ── 포탈이 매 프레임 갱신되는가 (근접 판정) ──────────────────────────
{
  assert.ok(
    scene.includes('this.portalField?.update(this.player.x, this.player.y)'),
    '포탈이 플레이어 접근을 감지하지 못한다 — 갈림길에서 런이 영구히 멈춘다',
  );
}

// ── 어댑터가 실제로 미니맵 뷰모델을 만들어내는가 (순수) ──────────────
{
  const graph = new RunMapGraph(MAP_GRAPH_PRESET_01);
  const model = toMinimapModel(graph.snapshot());

  assert.ok(model.nodes.length > 0, '어댑터가 빈 모델을 반환한다 — 미니맵이 백지가 된다');
  assert.equal(
    model.nodes.length,
    MAP_GRAPH_PRESET_01.nodes.length,
    '어댑터가 노드를 누락한다',
  );
  assert.ok(model.edges.length > 0, '엣지가 없으면 분기 구조가 안 읽힌다');

  const current = model.nodes.filter((node) => node.status === 'current');
  assert.equal(current.length, 1, '현재 노드는 정확히 하나여야 한다');
  assert.equal(current[0].id, MAP_GRAPH_PRESET_01.startNodeId, '시작 노드가 현재여야 한다');

  // 이동하면 뷰모델도 따라와야 한다 — 어댑터가 스냅샷을 캐시하면 여기서 깨진다
  const next = graph.choices()[0];
  graph.enter(next.id);
  const moved = toMinimapModel(graph.snapshot());
  assert.equal(
    moved.nodes.find((node) => node.status === 'current')?.id,
    next.id,
    '이동 후에도 뷰모델이 이전 위치를 가리킨다 — 어댑터가 스냅샷을 캐시한다',
  );
  assert.equal(
    moved.nodes.find((node) => node.id === MAP_GRAPH_PRESET_01.startNodeId)?.status,
    'cleared',
    '지나온 노드가 클리어로 안 바뀐다',
  );
}

// ── 함정/제단 양 경로: 선택 노드와 실제 컨트롤러 조우가 끝까지 같은가 ──
function assertIntegratedPath(path: readonly string[]): void {
  const graph = new RunMapGraph(MAP_GRAPH_PRESET_01);
  const encounterByRoom = new Map<number, EncounterDefinition>([[
    1,
    encounterFromMapNode(graph.current()),
  ]]);
  let transition: (() => void) | null = null;
  const controller = new CombatRunController({
    playerState: new PlayerCombatState(),
    maxRooms: maximumMapPathRooms(MAP_GRAPH_PRESET_01),
    encounterProvider: (roomIndex) => {
      const encounter = encounterByRoom.get(roomIndex);
      if (!encounter) throw new Error(`missing encounter for room ${roomIndex}`);
      return encounter;
    },
    rewardDraw: (roomIndex) => [{
      id: `room-${roomIndex}-hp`,
      kind: 'max-hp',
      title: 'HP',
      description: 'test',
    }],
    scheduleTransition: (_delay, callback) => { transition = callback; },
  });

  for (let index = 0; index < path.length; index += 1) {
    const node = graph.current();
    assert.equal(node.id, path[index], '그래프가 예상 경로와 다르다');
    assert.equal(
      controller.state.encounterId,
      node.id,
      `${node.id}: 선택 MapNode와 실제 시작 조우가 다르다`,
    );

    controller.notifyRoomCleared();
    if (node.kind === 'memory-boss') {
      assert.equal(controller.state.phase, 'run-over');
      break;
    }

    const nextId = path[index + 1];
    assert.ok(nextId, `${node.id}: 종착 보스 전에 경로가 끝났다`);
    const nextNode = graph.enter(nextId);
    encounterByRoom.set(controller.state.roomIndex + 1, encounterFromMapNode(nextNode));
    // 그래프가 먼저 움직여도 현재 보상 이벤트는 방 번호에 고정된 이전 조우를 봐야 한다.
    assert.equal(controller.state.encounterId, node.id);
    controller.chooseReward(`room-${controller.state.roomIndex}-hp`);
    assert.ok(transition, `${node.id}: 다음 방 전환이 예약되지 않았다`);
    transition();
    transition = null;
  }
}

assertIntegratedPath([
  's1-start', 's1-combat', 's1-elite', 's1-boss',
  's2-combat', 's2-trap', 's2-elite', 's2-memory-boss',
]);
assertIntegratedPath([
  's1-start', 's1-treasure', 's1-elite', 's1-boss',
  's2-combat', 's2-altar', 's2-elite', 's2-memory-boss',
]);

console.log(
  'Map wiring regression: 미니맵·이동·단일조우·양경로주파·갈림길·런초기화·포탈·어댑터 8군 통과',
);
