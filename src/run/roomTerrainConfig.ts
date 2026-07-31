import type { MapNodeKind } from './mapGraphContract';
import type { TerrainBlock } from '../combat-core/combat/terrainBlock';
import { blocksTooClose, pointInBlock, segmentBlocked } from '../combat-core/combat/terrainBlock';
import { ROOM_FIXTURE_CONFIG } from './roomFixtureConfig';
import { PORTAL_CONFIG } from './portalConfig';

/**
 * 방 종류별 지형 장벽 배치 (#214 지형 Tier 2 배선).
 *
 * ## 왜 지금까지 안 붙어 있었나
 *
 * 기전은 **전부 완성돼 있었다** — `pushOutOfBarriers`로 플레이어와 보행 적을 밀어내고,
 * `sweepIntersectsPolyline`으로 적 투사체까지 막는다. 회귀(`terrain-barrier-regression`)도
 * 있다. 그런데 실제 런에서는 장벽이 **한 번도 나오지 않았다**: `setTerrainBarriers`
 * 호출이 DEV 프리뷰 한 곳뿐이었고 `MapNode.terrain`은 씬이 읽지도 않았다.
 *
 * 누가 한 줄을 잊은 게 아니다. **계약이 장벽을 표현할 수 없었다**:
 *
 *   MapTerrainPlacement = { kind, x, y, radius? }     ← 원형
 *   TerrainBarrier      = { x, y, halfLength, angleDeg } ← 선분
 *
 * `MapTerrainPlacement`의 모양은 `FloorHazardZone`(바닥 장판)과 일치한다. 즉 그 필드는
 * 바닥형 지형을 위해 설계됐고, 바닥형은 결국 `trapProfile` 경로로 배치됐다
 * (`spawnHazards`). 장벽에는 각도와 길이가 필요한데 담을 자리가 없었다.
 *
 * 그래서 `MapTerrainPlacement`에 `halfLength`를 **추가**해 계약이 구조물도 표현하게 하고
 * (기존 소비자는 그대로), 배치 자체는 여기서 방 종류별로 정한다.
 * R1이 노드에 데이터를 채우면 **그것이 이긴다** — 여기 값은 기본값이다.
 *
 * ## 선분에서 정사각 블록으로 (총괄 지시)
 *
 * 처음엔 두께 14px 선분이었다. 두 가지가 문제였다:
 *  - **구조물로 안 읽힌다.** 얇은 막대는 엄폐물이 아니라 울타리다
 *  - **플레이어 주문이 통과했다.** 엄폐가 한쪽에만 작동해 벽 뒤에서 일방적으로 잡는
 *    무적 지점이 생겼고, 그것 때문에 길이 상한을 걸어야 했다
 *
 * 이제 부피 있는 정사각 블록이고 주문도 막는다. 비대칭이 사라져 길이 상한 대신
 * **개수·크기·간격**만 관리하면 된다.
 *
 * ## 배치 원칙 (#214에서 총괄이 못박은 것 — 어기면 게임이 망가진다)
 *
 * 1. **소수·개방형만.** 적 추격이 직선이고 밀어내기만 할 뿐 우회를 못 한다
 *    (`pushEnemiesOutOfTerrain` 주석). 미로면 적이 벽에 비빈다. 우회로가 항상
 *    열려 있어야 한다.
 * 2. **돌진·도약은 통과한다.** "돌진 영창으로 장벽을 뛰어넘는다"가 카운터플레이다.
 *
 * ## 여덟 종류 중 둘에만 둔다
 *
 * 장벽을 두는 곳은 `combat`과 `elite` **둘뿐**이다. 나머지는 의도적으로 비운다:
 *
 *  - `trap` — 기믹이 이미 공간을 제약한다(십자 안전 통로 halfWidth 64). 거기에
 *    장벽까지 얹는 건 공간을 이중으로 좁히는 것이고, 그게 방을 벽돌로 만드는 방식이다
 *  - `treasure`·`altar` — 중앙 설치물이 유일한 목적이다. 접근을 막을 위험만 있고
 *    무전투 방이라 엄폐가 의미가 없다
 *  - `stage-boss`·`memory-boss` — 보스가 방 중앙에서 스폰하고 패턴이 넓은 공간을
 *    전제한다
 *  - `start` — 조작을 배우는 방이다. 첫 방에서 벽에 걸리면 조작 문제로 읽힌다
 *
 * 전투방이 전체 노드의 약 35%, 정예가 8%다. 싸우는 방의 절반 가까이에 엄폐가 생기고,
 * 그게 슈터 적을 상대할 때 "발로 도는 것" 외의 선택지를 만든다.
 */

/** 방 크기 — 배치·검증이 같은 값을 본다 (씬의 worldBounds와 일치해야 한다) */
export const ROOM_TERRAIN_BOUNDS = {
  width: 1920,
  height: 1280,
  centerX: 960,
  centerY: 640,
} as const;

/**
 * 장벽이 침범하면 안 되는 지점들.
 *
 * 도착 지점이 왼쪽 중앙 한 점으로 고정된 이유가 이것이다(#246): 함정·지형·적 스폰이
 * **그 한 점만** 비우면 된다. #264가 요구한 것도 같다.
 */
export const TERRAIN_KEEPOUTS = {
  /** 도착 지점 (#245 계약: 항상 왼쪽 중앙) */
  arrival: { x: 176, y: 640, radius: 120 },
  /** 출구 포탈 두 슬롯 (오른쪽 가장자리) */
  exits: [
    { x: 1840, y: 538, radius: 90 },
    { x: 1840, y: 742, radius: 90 },
  ],
  /** 중앙 오른쪽 설치물(보물상자·제단) — 장벽을 두는 종류엔 없지만 회귀가 함께 검사한다 */
  fixture: {
    x: ROOM_TERRAIN_BOUNDS.centerX + ROOM_FIXTURE_CONFIG.offsetX,
    y: ROOM_TERRAIN_BOUNDS.centerY,
    radius: 140,
  },
} as const;

/** 플레이어 충돌 반경 (씬이 `pushOutOfBlocks(..., 16, ...)`로 쓰는 값) */
export const TERRAIN_PLAYER_RADIUS = 16;

/**
 * 블록 주변으로 비워야 하는 여유 — 플레이어 반경. 블록은 부피가 있으므로 두께
 * 개념이 없고, 반경만큼만 더 보면 "지나갈 수 있는가"가 정확히 나온다.
 * 통행 판정과 keep-out 판정이 같은 값을 써야 "비었다"가 한 뜻이 된다.
 */
export const TERRAIN_CLEARANCE = TERRAIN_PLAYER_RADIUS;

/**
 * 전투방 — 블록 둘을 **대각으로** 벌린다.
 *
 * 같은 x에 나란히 두면 왼→오른쪽 직선 경로를 통째로 막는다. 대각이면 위로 돌든
 * 아래로 돌든 항상 열려 있고, 슈터의 사선을 끊는 엄폐가 두 곳 생긴다.
 */
const COMBAT_STAGE1: readonly TerrainBlock[] = [
  { x: 700, y: 420, half: 68 },
  { x: 1220, y: 860, half: 68 },
];

/**
 * 2스테이지 전투방 — 블록 셋. 진행감이 공간으로도 드러나야 하지만 늘어난 건 하나다
 * (원칙 1: 소수).
 */
const COMBAT_STAGE2: readonly TerrainBlock[] = [
  { x: 700, y: 860, half: 68 },
  { x: 1220, y: 420, half: 68 },
  { x: 960, y: 210, half: 56 },
];

/**
 * 정예방 — 블록 셋을 흩어 놓는다.
 *
 * 정예는 실드 파수꾼이 붙어 생존시간이 길다(#258 기준 60초). 그 시간 동안 사선을
 * 끊을 곳이 필요하다. 선분 시절엔 "긴 벽 = 무적 지점" 때문에 길이를 제한해야 했지만,
 * 이제 주문도 막히므로 **엄폐가 양쪽에 똑같이** 작동한다. 대신 적이 블록 뒤에 붙어
 * 멈추면 주문도 안 닿으니 **크게 만들지 않는다**.
 */
const ELITE_LAYOUT: readonly TerrainBlock[] = [
  { x: 780, y: 470, half: 62 },
  { x: 1180, y: 810, half: 62 },
  { x: 1480, y: 360, half: 52 },
];

/**
 * 방 종류·스테이지 → 장벽 배치. 비어 있는 종류는 **의도적으로** 비어 있다
 * (위 문서 주석의 "여덟 종류 중 둘에만 둔다" 참조).
 */
export function terrainForRoom(kind: MapNodeKind, stage: 1 | 2): readonly TerrainBlock[] {
  if (kind === 'combat') return stage === 2 ? COMBAT_STAGE2 : COMBAT_STAGE1;
  if (kind === 'elite') return ELITE_LAYOUT;
  return [];
}

/**
 * 블록 한 변의 절반 상한.
 *
 * 선분 시절의 상한은 "긴 벽 = 무적 지점"을 막기 위한 것이었는데, 주문도 막히는 지금은
 * 근거가 다르다: **적이 블록 뒤에 붙어 멈추면 주문도 안 닿는다.** 적 추격은 직선이고
 * 우회를 못 하므로, 블록이 크면 플레이어가 계속 위치를 바꿔야 잡을 수 있다.
 * 플레이어가 움직이면 적도 따라 나오니 갇히지는 않지만, 크면 그 왕복이 길어진다.
 */
export const TERRAIN_MAX_HALF = 80;

/** 구조물로 읽히려면 최소 크기가 있어야 한다 — 작으면 다시 울타리로 보인다 */
export const TERRAIN_MIN_HALF = 40;

/**
 * 방 한 종류의 블록 개수 상한 — 원칙 1(소수·개방형). 미로가 되면 적이 벽에 비빈다.
 */
export const TERRAIN_MAX_BARRIERS = 4;

/** 블록을 두는 종류 — 회귀가 "의도적으로 비었다"와 "빠뜨렸다"를 구분하는 데 쓴다 */
export const TERRAIN_KINDS: readonly MapNodeKind[] = ['combat', 'elite'];

/**
 * `MapTerrainPlacement`(계약) → `TerrainBlock`(기전).
 *
 * R1이 노드에 구조물을 채우면 그것이 이긴다. `kind`가 'barrier'이고 `halfLength`가
 * 있는 항목만 읽는다 — 바닥형 지형(원형, radius)이 섞여 있어도 무시된다.
 * (계약 키는 `'barrier'`로 유지한다 — 이미 쓰이는 이름을 바꿀 이유가 없다)
 */
export function blocksFromPlacements(
  placements: readonly { kind: string; x: number; y: number; halfLength?: number }[],
): readonly TerrainBlock[] {
  return placements
    .filter((placement) => placement.kind === 'barrier' && typeof placement.halfLength === 'number')
    .map((placement) => ({
      x: placement.x,
      y: placement.y,
      half: placement.halfLength!,
    }));
}

/** 바닥형 지형이 침범하면 안 되는 여유 — 밟고 시작하면 도착하자마자 피가 깎인다 */
export const FLOOR_HAZARD_MARGIN = TERRAIN_PLAYER_RADIUS;

/**
 * 방 종류·스테이지별 **기본** 바닥지형 — 장벽과 같은 방식이다.
 * R1이 노드 `terrain`에 채우면 그것이 이기고, 비어 있으면 이 값을 쓴다.
 *
 * ## 왜 기본값을 두는가
 *
 * 배선만 붙이고 기본값을 안 두면 **화면은 그대로다**. 생성기는 `terrain: []`을 주고
 * 노드 데이터를 채우는 건 R1 몫이라, 그 설계가 나올 때까지 용암·독지대는 계속 안
 * 나온다. 그게 정확히 #304 이전 상태다.
 *
 * ## 배치 근거
 *
 *  - **전투·정예방에만.** 장벽을 두는 종류와 같다. 무전투 방(보물·제단)은 설치물
 *    접근만 방해하고, 보스방은 패턴이 넓은 공간을 전제한다. 함정방은 자기 기믹이 이미
 *    바닥을 쓴다(씬이 중첩을 막는다)
 *  - **1스테이지는 독지대, 2스테이지는 용암.** 용암이 더 아프고 잔류가 없다
 *    (`floorHazardTickDamage`). 깊이가 깊어질수록 즉발 위험이 커지는 쪽이 읽기 쉽다
 *  - **방 하나에 하나씩**(정예만 둘). 원칙 1(소수·개방형)은 바닥지형에도 적용된다.
 *    바닥을 여러 개 깔면 "피할 곳"이 아니라 "밟을 수밖에 없는 곳"이 된다
 *  - **기본 장벽과 안 겹친다.** 블록 아래 깔린 장판은 보이지도 밟히지도 않는다.
 *    회귀가 좌표를 직접 검사한다
 */
const FLOOR_HAZARD_COMBAT_STAGE1: readonly MapTerrainCircle[] = [
  { kind: 'poison', x: 960, y: 640, radius: 110 },
];

const FLOOR_HAZARD_COMBAT_STAGE2: readonly MapTerrainCircle[] = [
  { kind: 'lava', x: 960, y: 640, radius: 110 },
];

const FLOOR_HAZARD_ELITE: readonly MapTerrainCircle[] = [
  { kind: 'poison', x: 960, y: 640, radius: 100 },
  { kind: 'lava', x: 620, y: 900, radius: 90 },
];

export interface MapTerrainCircle {
  kind: 'lava' | 'poison';
  x: number;
  y: number;
  radius: number;
}

/** 방 종류·스테이지 → 기본 바닥지형. 비어 있는 종류는 **의도적으로** 비어 있다. */
export function floorHazardsForRoom(
  kind: MapNodeKind,
  stage: 1 | 2,
): readonly MapTerrainCircle[] {
  if (kind === 'combat') {
    return stage === 2 ? FLOOR_HAZARD_COMBAT_STAGE2 : FLOOR_HAZARD_COMBAT_STAGE1;
  }
  if (kind === 'elite') return FLOOR_HAZARD_ELITE;
  return [];
}

/** 바닥지형을 두는 종류 — 회귀가 "의도적으로 비었다"와 "빠뜨렸다"를 구분한다 */
export const FLOOR_HAZARD_KINDS_WITH_DEFAULT: readonly MapNodeKind[] = ['combat', 'elite'];

/** 바닥형 지형 반경 상한 — 방 하나를 통째로 덮으면 회피가 불가능해진다 */
export const FLOOR_HAZARD_MAX_RADIUS = 220;

/**
 * `MapTerrainPlacement`(계약) → `FloorHazardZone`(기전) — **용암·독지대 실런 배선**.
 *
 * ## 왜 이게 없었나 (#304)
 *
 * `blocksFromPlacements`가 `kind === 'barrier'`만 통과시켜서, 노드에 원형 바닥지형을
 * 넣어도 **전부 버려졌다.** 실제로 `setFloorHazards`를 부르는 곳은 DEV 프리뷰 하나뿐이라
 * 실런에서는 용암·독지대가 한 번도 생기지 않았다.
 *
 * 그래서 "1스테이지에 독 장판이 없다"는 관측이 나왔고, 나는 그것을 **위험지대 함정방**
 * 빈도 문제로 잘못 진단했다(#298 → #304 시정). 둘은 다른 체계다:
 *
 * | | 위험지대 함정방 | 용암·독지대 |
 * |---|---|---|
 * | 출처 | `trapProfile: 'hazard'` | `MapNode.terrain` |
 * | 산출 | 붉은 원 `HazardZone` | `FloorHazardZone` |
 * | 원소·정화 | 없음 | 있음 (#293) |
 *
 * 함정방 빈도를 아무리 올려도 정화를 볼 기회는 **0%**였다. 배선이 없었으니까.
 *
 * ## 방어적으로 거르는 이유
 *
 * 배치 설계(출현 비율·중첩 금지 규칙)는 R1 몫이지만, **배선 층에서 방을 못 쓰게 만드는
 * 배치는 막는다.** 노드 데이터는 사람이 손으로 쓰는 것이라 오타 하나로 도착 지점이
 * 용암에 잠기면 도착하자마자 피가 깎이고 원인을 찾기 어렵다.
 *
 * ⚠️ 여기서 거르는 건 **안전**뿐이다. "몇 개가 적당한가"는 거르지 않는다 — 그건 설계고,
 * 배선이 설계를 대신 결정하면 R1이 노드를 고쳐도 화면이 안 바뀐다.
 */
export function floorHazardsFromPlacements(
  placements: readonly { kind: string; x: number; y: number; radius?: number }[],
): readonly { kind: 'lava' | 'poison'; x: number; y: number; radius: number }[] {
  const out: { kind: 'lava' | 'poison'; x: number; y: number; radius: number }[] = [];
  for (const placement of placements) {
    const kind: 'lava' | 'poison' | null = placement.kind === 'lava' ? 'lava'
      : placement.kind === 'poison' ? 'poison' : null;
    if (!kind) continue;
    if (typeof placement.radius !== 'number' || !Number.isFinite(placement.radius)) continue;
    const radius = Math.min(FLOOR_HAZARD_MAX_RADIUS, Math.max(1, placement.radius));
    const zone = { kind, x: placement.x, y: placement.y, radius };
    if (floorHazardBlocksEntry(zone)) continue;
    out.push(zone);
  }
  return out;
}

/**
 * 이 바닥지형이 **도착 지점이나 출구를 덮는가** — 덮으면 배선이 버린다.
 *
 * 도착을 덮으면 방에 들어서자마자 피가 깎이고(회피 불가), 출구를 덮으면 방을 나가려면
 * 반드시 밟아야 한다. 둘 다 플레이어가 대응할 수 없는 형태라 기믹이 아니라 사고다.
 */
export function floorHazardBlocksEntry(
  zone: { x: number; y: number; radius: number },
): boolean {
  const hits = (spot: { x: number; y: number; radius: number }): boolean => {
    const dx = zone.x - spot.x;
    const dy = zone.y - spot.y;
    const reach = zone.radius + spot.radius + FLOOR_HAZARD_MARGIN;
    return dx * dx + dy * dy < reach * reach;
  };
  if (hits(TERRAIN_KEEPOUTS.arrival)) return true;
  return TERRAIN_KEEPOUTS.exits.some(hits);
}

/** 점이 블록에 닿는가 — keep-out·통행 판정이 공유한다 (순수) */
export function pointBlocked(
  x: number,
  y: number,
  blocks: readonly TerrainBlock[],
  clearance = TERRAIN_CLEARANCE,
): boolean {
  return blocks.some((block) => pointInBlock(x, y, block, clearance));
}

/**
 * 시전 지점에서 대상까지 **시야가 막히는가** — 플레이어 주문 차단에 쓴다.
 *
 * 총괄 지시: *"플레이어의 마법이 통과할 수 있으면 안 됨."* 종전엔 주문이 지형을
 * 무시해 엄폐가 한쪽에만 작동했다.
 */
export function sightBlocked(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  blocks: readonly TerrainBlock[],
  pad = 0,
): boolean {
  return segmentBlocked({ x: fromX, y: fromY }, { x: toX, y: toY }, blocks, pad);
}

/**
 * 두 블록이 너무 가까워 개체가 사이에 끼는가 — 배치 검증용.
 * 맞닿은 두 블록 사이에서는 밀어내기가 수렴하지 못한다(실측). 회귀가 이걸 금지한다.
 */
export function layoutHasTrap(blocks: readonly TerrainBlock[]): boolean {
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      if (blocksTooClose(blocks[i], blocks[j], TERRAIN_PLAYER_RADIUS)) return true;
    }
  }
  return false;
}

/**
 * 도착 지점에서 두 출구까지 **걸어서 갈 수 있는가** (격자 BFS, 순수).
 *
 * ⚠️ 이 검사가 이 파일의 존재 이유 절반이다. #283에서 데이터 한 줄이 방을 벽돌로
 * 만든 걸 겪었다(적도 포탈도 없는 방 = 진행 불가). 장벽은 같은 사고를 **더 조용하게**
 * 낼 수 있다 — 예외도 로그도 없이 그냥 못 지나간다. 배치를 손볼 때마다 회귀가
 * 실제로 걸어보게 한다.
 *
 * @param step 격자 간격(px). 작을수록 정확하고 느리다
 */
export function exitsReachable(
  blocks: readonly TerrainBlock[],
  step = 20,
): { reachable: boolean; unreachedExits: number } {
  const { width, height } = ROOM_TERRAIN_BOUNDS;
  const margin = TERRAIN_PLAYER_RADIUS + 4;
  const cols = Math.floor((width - margin * 2) / step) + 1;
  const rows = Math.floor((height - margin * 2) / step) + 1;
  const toX = (c: number): number => margin + c * step;
  const toY = (r: number): number => margin + r * step;
  const key = (c: number, r: number): number => r * cols + c;

  const start = TERRAIN_KEEPOUTS.arrival;
  const startCol = Math.round((start.x - margin) / step);
  const startRow = Math.round((start.y - margin) / step);

  const visited = new Set<number>();
  const queue: [number, number][] = [[startCol, startRow]];
  visited.add(key(startCol, startRow));
  while (queue.length > 0) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const id = key(nc, nr);
      if (visited.has(id)) continue;
      if (pointBlocked(toX(nc), toY(nr), blocks)) continue;
      visited.add(id);
      queue.push([nc, nr]);
    }
  }

  let unreachedExits = 0;
  for (const exit of TERRAIN_KEEPOUTS.exits) {
    const ec = Math.round((exit.x - margin) / step);
    const er = Math.round((exit.y - margin) / step);
    // 출구가 방 밖 격자로 반올림되면 가장 가까운 안쪽 칸으로 본다
    const cc = Math.max(0, Math.min(cols - 1, ec));
    const rr = Math.max(0, Math.min(rows - 1, er));
    if (!visited.has(key(cc, rr))) unreachedExits += 1;
  }
  return { reachable: unreachedExits === 0, unreachedExits };
}

/**
 * 포탈 진입 반경까지 실제로 닿는가 — `exitsReachable`보다 엄격하다.
 * 포탈은 `enterRadius`(26) 안에 들어가야 발화하므로 그 원 안의 칸이 살아 있어야 한다.
 */
export function exitEnterableCount(blocks: readonly TerrainBlock[]): number {
  let count = 0;
  for (const exit of TERRAIN_KEEPOUTS.exits) {
    // 포탈 중심에서 enterRadius 안을 샘플링 — 한 점이라도 통행 가능하면 진입 가능
    let ok = false;
    for (let angle = 0; angle < 360 && !ok; angle += 30) {
      const rad = (angle * Math.PI) / 180;
      for (const ratio of [0, 0.5, 0.9]) {
        const r = PORTAL_CONFIG.enterRadius * ratio;
        if (!pointBlocked(exit.x + Math.cos(rad) * r, exit.y + Math.sin(rad) * r, blocks)) {
          ok = true;
          break;
        }
      }
    }
    if (ok) count += 1;
  }
  return count;
}

/** 설치물 접근 반경이 열려 있는가 — 보물·제단에 장벽이 생기면 잡는다 */
export function fixtureReachable(blocks: readonly TerrainBlock[]): boolean {
  const { x, y } = TERRAIN_KEEPOUTS.fixture;
  return !pointBlocked(x, y, blocks)
    && !pointBlocked(x, y, blocks, ROOM_FIXTURE_CONFIG.reachRadius);
}
