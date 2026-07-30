import type { MapNodeKind } from './mapGraphContract';
import type { TerrainBarrier } from '../combat-core/combat/terrainBarrier';
import { TERRAIN_BARRIER_CONFIG } from '../combat-core/combat/terrainBarrier';
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
 * 그래서 `MapTerrainPlacement`에 `halfLength`/`angleDeg`를 **추가**해 계약이 장벽도
 * 표현하게 하고(기존 소비자는 그대로), 배치 자체는 여기서 방 종류별로 정한다.
 * R1이 노드에 데이터를 채우면 **그것이 이긴다** — 여기 값은 기본값이다.
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
  /** 중앙 설치물(보물상자·제단) — 장벽을 두는 종류엔 없지만 회귀가 함께 검사한다 */
  fixture: { x: 960, y: 640, radius: 140 },
} as const;

/** 플레이어 충돌 반경 (씬이 `pushOutOfBarriers(..., 16, ...)`로 쓰는 값) */
export const TERRAIN_PLAYER_RADIUS = 16;

/**
 * 장벽 하나가 차지하는 실효 반경 — 두께 절반 + 플레이어 반경.
 * 통행 판정과 keep-out 판정이 같은 값을 써야 "비었다"가 한 뜻이 된다.
 */
export const TERRAIN_CLEARANCE = TERRAIN_BARRIER_CONFIG.thickness / 2 + TERRAIN_PLAYER_RADIUS;

/**
 * 전투방 — 세로 기둥 둘을 **대각으로** 벌린다.
 *
 * 같은 x에 나란히 두면 왼→오른쪽 직선 경로를 통째로 막는다. 대각이면 위로 돌든
 * 아래로 돌든 항상 열려 있고, 슈터의 사선을 끊는 엄폐가 두 곳 생긴다.
 */
const COMBAT_STAGE1: readonly TerrainBarrier[] = [
  { x: 700, y: 430, halfLength: 140, angleDeg: 90 },
  { x: 1220, y: 850, halfLength: 140, angleDeg: 90 },
];

/**
 * 2스테이지 전투방 — 기둥 둘에 가장자리 짧은 벽 하나를 더한다.
 * 진행감이 공간으로도 드러나야 하지만, 늘어난 건 하나뿐이다(원칙 1: 소수).
 */
const COMBAT_STAGE2: readonly TerrainBarrier[] = [
  { x: 700, y: 850, halfLength: 140, angleDeg: 90 },
  { x: 1220, y: 430, halfLength: 140, angleDeg: 90 },
  { x: 960, y: 200, halfLength: 120, angleDeg: 0 },
];

/**
 * 정예방 — 짧은 벽 셋을 흩어 놓는다. **긴 분리벽을 두지 않는다.**
 *
 * 정예는 실드 파수꾼이 붙어 생존시간이 길다(#258 기준 60초). 그 시간 동안 사선을
 * 끊을 곳이 필요하다.
 *
 * ⚠️ 처음엔 중앙을 가로지르는 420px 가로벽을 뒀다가 물렸다. 장벽의 차단이
 * **비대칭**이기 때문이다:
 *
 *   플레이어 이동 · 적 이동 · 적 투사체 → 막힘
 *   **플레이어 주문 → 통과** (`CastContext`에 장벽 정보가 없다)
 *
 * 이 비대칭 자체는 플레이어에게 유리한 방향이라 나쁘지 않다(엄폐 뒤에서 쏠 수 있고,
 * 벽에 걸린 적이 죽지 않아 방이 벽돌이 되는 일도 없다). 그런데 **긴 벽**이 있으면
 * 얘기가 달라진다: 적 추격이 직선이고 우회를 못 하므로(`pushEnemiesOutOfTerrain`),
 * 접근 축과 수직인 긴 벽 뒤에 서면 추격 적이 벽에 붙어 멈추고 플레이어는 그걸
 * 일방적으로 잡는다. 엄폐가 아니라 무적 지점이 된다.
 *
 * 그래서 벽을 **짧게** 유지한다. 짧은 기둥은 원거리 슈터의 사선은 끊지만 추격 적을
 * 세우지는 못한다 — 정확히 원하는 모양이다.
 */
const ELITE_LAYOUT: readonly TerrainBarrier[] = [
  { x: 820, y: 480, halfLength: 110, angleDeg: 90 },
  { x: 1180, y: 800, halfLength: 110, angleDeg: 90 },
  { x: 1480, y: 380, halfLength: 90, angleDeg: 60 },
];

/**
 * 방 종류·스테이지 → 장벽 배치. 비어 있는 종류는 **의도적으로** 비어 있다
 * (위 문서 주석의 "여덟 종류 중 둘에만 둔다" 참조).
 */
export function terrainForRoom(kind: MapNodeKind, stage: 1 | 2): readonly TerrainBarrier[] {
  if (kind === 'combat') return stage === 2 ? COMBAT_STAGE2 : COMBAT_STAGE1;
  if (kind === 'elite') return ELITE_LAYOUT;
  return [];
}

/**
 * 장벽 하나의 길이 상한(halfLength).
 *
 * 이 상한이 규칙인 이유는 위 `ELITE_LAYOUT` 주석에 있다: 장벽은 플레이어 주문을
 * 막지 않으므로, 접근 축과 수직인 **긴** 벽은 엄폐가 아니라 무적 지점이 된다
 * (추격 적이 벽에 붙어 멈추고 플레이어는 벽을 통과하는 주문으로 일방적으로 잡는다).
 * 짧게 유지하면 슈터의 사선만 끊고 추격 적은 못 세운다.
 */
export const TERRAIN_MAX_HALF_LENGTH = 150;

/**
 * 방 한 종류의 장벽 개수 상한 — 원칙 1(소수·개방형). 미로가 되면 적이 벽에 비빈다.
 */
export const TERRAIN_MAX_BARRIERS = 4;

/** 장벽을 두는 종류 — 회귀가 "의도적으로 비었다"와 "빠뜨렸다"를 구분하는 데 쓴다 */
export const TERRAIN_KINDS: readonly MapNodeKind[] = ['combat', 'elite'];

/**
 * `MapTerrainPlacement`(계약) → `TerrainBarrier`(기전).
 *
 * R1이 노드에 장벽을 채우면 그것이 이긴다. `kind`가 'barrier'이고 `halfLength`가
 * 있는 항목만 장벽으로 읽는다 — 바닥형 지형(원형, radius)이 섞여 있어도 무시된다.
 */
export function barriersFromPlacements(
  placements: readonly { kind: string; x: number; y: number; halfLength?: number; angleDeg?: number }[],
): readonly TerrainBarrier[] {
  return placements
    .filter((placement) => placement.kind === 'barrier' && typeof placement.halfLength === 'number')
    .map((placement) => ({
      x: placement.x,
      y: placement.y,
      halfLength: placement.halfLength!,
      angleDeg: placement.angleDeg ?? 0,
    }));
}

/** 점이 장벽에 닿는가 — keep-out·통행 판정이 공유한다 (순수) */
export function pointBlocked(
  x: number,
  y: number,
  barriers: readonly TerrainBarrier[],
  clearance = TERRAIN_CLEARANCE,
): boolean {
  for (const barrier of barriers) {
    const rad = (barrier.angleDeg * Math.PI) / 180;
    const dx = Math.cos(rad) * barrier.halfLength;
    const dy = Math.sin(rad) * barrier.halfLength;
    const ax = barrier.x - dx;
    const ay = barrier.y - dy;
    const abx = dx * 2;
    const aby = dy * 2;
    const lengthSquared = abx * abx + aby * aby;
    const t = lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / lengthSquared));
    const nearestX = ax + abx * t;
    const nearestY = ay + aby * t;
    if (Math.hypot(x - nearestX, y - nearestY) < clearance) return true;
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
  barriers: readonly TerrainBarrier[],
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
      if (pointBlocked(toX(nc), toY(nr), barriers)) continue;
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
export function exitEnterableCount(barriers: readonly TerrainBarrier[]): number {
  let count = 0;
  for (const exit of TERRAIN_KEEPOUTS.exits) {
    // 포탈 중심에서 enterRadius 안을 샘플링 — 한 점이라도 통행 가능하면 진입 가능
    let ok = false;
    for (let angle = 0; angle < 360 && !ok; angle += 30) {
      const rad = (angle * Math.PI) / 180;
      for (const ratio of [0, 0.5, 0.9]) {
        const r = PORTAL_CONFIG.enterRadius * ratio;
        if (!pointBlocked(exit.x + Math.cos(rad) * r, exit.y + Math.sin(rad) * r, barriers)) {
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
export function fixtureReachable(barriers: readonly TerrainBarrier[]): boolean {
  const { x, y } = TERRAIN_KEEPOUTS.fixture;
  return !pointBlocked(x, y, barriers)
    && !pointBlocked(x, y, barriers, ROOM_FIXTURE_CONFIG.reachRadius);
}
