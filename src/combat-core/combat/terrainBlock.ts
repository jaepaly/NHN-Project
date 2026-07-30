import type { FormPoint } from './persistentFormConfig';

/**
 * 정사각형 지형 구조물 (#214 지형 Tier 2 — 총괄 지시로 선분 장벽에서 전환).
 *
 * ## 왜 선분에서 바꿨나
 *
 * 종전 `TerrainBarrier`는 **선분**(중심·길이·각도)이었다. 두께 14px 선이라 "구조물"로
 * 읽히지 않았고, 무엇보다 선분은 **뒤에 숨는다**는 개념이 약하다 — 얇은 막대는 엄폐물이
 * 아니라 울타리다. 정사각 블록은 부피가 있어 "저건 통과 못 하는 것"이 한눈에 읽힌다.
 *
 * ## 두 번째 변경 — 플레이어 주문도 막는다
 *
 * 종전엔 플레이어 이동·적 이동·적 투사체만 막고 **플레이어 주문은 통과**했다
 * (`CastContext`에 지형 정보가 없었다). 그래서 장벽이 순수하게 플레이어 이득이었고,
 * 긴 벽 뒤에서 일방적으로 잡는 무적 지점이 생겼다. 그것 때문에 벽 길이에 상한
 * (`TERRAIN_MAX_HALF_LENGTH`)을 걸어야 했다.
 *
 * 이제 주문도 막으므로 그 비대칭이 사라진다 — 엄폐는 양쪽에 똑같이 작동하고,
 * 블록을 크게 만들어도 무적 지점이 되지 않는다.
 *
 * ⚠️ 대신 **새 위험**이 생긴다: 적이 블록 뒤에 붙어 멈추면 주문도 안 닿는다. 적 추격은
 * 직선이라 우회를 못 하므로(`pushEnemiesOutOfTerrain`), 플레이어가 위치를 바꾸면 적도
 * 따라 나온다 — 영구히 갇히지는 않는다. 그래도 블록은 **작고 드물게** 두어야 한다.
 *
 * ## 축 정렬만 쓴다
 *
 * 회전 사각형은 판정이 비싸고(SAT) 얻는 게 없다. 축 정렬이면 원-AABB 밀어내기와
 * 선분-AABB 교차가 둘 다 짧고 정확하다.
 */

export const TERRAIN_BLOCK_CONFIG = {
  /**
   * 밀어내기 여유(px) — 딱 맞게 밀면 매 프레임 경계에서 떨림이 생긴다.
   * 선분 장벽(`TERRAIN_BARRIER_CONFIG.pushEpsilon`)과 같은 근거·같은 값.
   */
  pushEpsilon: 0.5,
} as const;

/** 축 정렬 정사각형 — 중심과 반변(half extent) */
export interface TerrainBlock {
  x: number;
  y: number;
  /** 한 변의 절반 */
  half: number;
}

function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/** 네 꼭짓점 (좌상 → 우상 → 우하 → 좌하) — 렌더가 쓴다 */
export function blockCorners(block: TerrainBlock): FormPoint[] {
  const h = Math.max(0, safe(block.half));
  const x = safe(block.x);
  const y = safe(block.y);
  return [
    { x: x - h, y: y - h },
    { x: x + h, y: y - h },
    { x: x + h, y: y + h },
    { x: x - h, y: y + h },
  ];
}

/**
 * 원(개체)이 블록에 파고들었으면 밖으로 밀어낸다 (순수).
 *
 * 원-AABB는 두 경우로 갈린다:
 *  - **밖에서 겹침** — 가장 가까운 표면점에서 바깥 방향으로 민다
 *  - **완전히 안쪽** — 표면점이 자기 자신이라 방향이 없다. 가장 가까운 **변**을 골라
 *    그쪽으로 밀어낸다. 이걸 빼먹으면 블록 안에 스폰된 적이 영영 못 나온다
 *    (선분 장벽에서 겪은 "선 위(거리 0)에서 push가 음수" 사고와 같은 종류다).
 *
 * @returns 밀어낸 새 위치, 겹치지 않으면 null
 */
export function pushOutOfBlock(
  x: number,
  y: number,
  radius: number,
  block: TerrainBlock,
): { x: number; y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const h = Math.max(0, safe(block.half));
  const bx = safe(block.x);
  const by = safe(block.y);
  const r = Math.max(0, safe(radius));

  const left = bx - h;
  const right = bx + h;
  const top = by - h;
  const bottom = by + h;

  const inside = x > left && x < right && y > top && y < bottom;

  if (!inside) {
    const nearestX = Math.min(right, Math.max(left, x));
    const nearestY = Math.min(bottom, Math.max(top, y));
    const dx = x - nearestX;
    const dy = y - nearestY;
    const distance = Math.hypot(dx, dy);
    if (distance >= r) return null;
    // 표면 위(거리 0)면 방향이 없다 — 안쪽 처리로 넘긴다
    if (distance > 0) {
      const push = (r - distance) + TERRAIN_BLOCK_CONFIG.pushEpsilon;
      return { x: x + (dx / distance) * push, y: y + (dy / distance) * push };
    }
  }

  // 안쪽(또는 표면 위) — 가장 가까운 변으로 밀어낸다
  const toLeft = x - left;
  const toRight = right - x;
  const toTop = y - top;
  const toBottom = bottom - y;
  const min = Math.min(toLeft, toRight, toTop, toBottom);
  const out = r + TERRAIN_BLOCK_CONFIG.pushEpsilon;
  if (min === toLeft) return { x: left - out, y };
  if (min === toRight) return { x: right + out, y };
  if (min === toTop) return { x, y: top - out };
  return { x, y: bottom + out };
}

/**
 * 여러 블록에서 밀어낸다 — **수렴할 때까지 반복**한다.
 *
 * ⚠️ 한 번만 훑으면 인접한 두 블록 사이에서 핑퐁한다: 블록 A에서 오른쪽으로 밀려나
 * 블록 B 안으로 들어가고, B에서 왼쪽으로 밀려나 다시 A 안으로 들어간다. 실측으로
 * 잡았다 — 맞닿은 두 블록(x=480/560, half=40) 사이에 두면 결과가 여전히 A 안이었다.
 *
 * 진짜 해법은 **블록을 붙여 놓지 않는 것**이고(회귀가 최소 간격을 강제한다), 이 반복은
 * 안전망이다. 잘 떨어진 배치에서는 1회에 끝나므로 비용이 없다. 상한을 두는 이유는
 * 어떤 배치에서도 프레임이 멈추면 안 되기 때문이다 — 못 빠져나오면 마지막 값을
 * 그대로 쓴다(끼는 것이 게임이 멈추는 것보다 낫다).
 */
export function pushOutOfBlocks(
  x: number,
  y: number,
  radius: number,
  blocks: readonly TerrainBlock[],
  maxPasses = 4,
): { x: number; y: number } {
  let px = x;
  let py = y;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    let moved = false;
    for (const block of blocks) {
      const pushed = pushOutOfBlock(px, py, radius, block);
      if (!pushed) continue;
      px = pushed.x;
      py = pushed.y;
      moved = true;
    }
    if (!moved) break;
  }
  return { x: px, y: py };
}

/**
 * 두 블록이 **동시에 겹칠 수 있는 거리**인가 — 배치 검증이 쓴다.
 *
 * 반지름 r인 개체가 두 블록에 동시에 파고들면 밀어내기가 수렴하지 못할 수 있다.
 * 그런 배치는 애초에 만들지 않는 것이 맞다(#214 "소수·개방형" 원칙과도 같은 방향).
 */
export function blocksTooClose(
  a: TerrainBlock,
  b: TerrainBlock,
  radius: number,
): boolean {
  // 축별 표면 간격 — 둘 다 2r 미만이면 그 사이에 개체가 양쪽에 걸친 채로 낀다
  const gapX = Math.abs(safe(a.x) - safe(b.x)) - (safe(a.half) + safe(b.half));
  const gapY = Math.abs(safe(a.y) - safe(b.y)) - (safe(a.half) + safe(b.half));
  const need = radius * 2;
  return gapX < need && gapY < need;
}

/**
 * 반지름 `pad`인 원이 블록과 겹치는가 — keep-out·통행 판정이 공유한다.
 *
 * ⚠️ **사각형을 pad만큼 부풀리는 방식이면 안 된다.** 그건 모서리를 과대평가한다:
 * 모서리에서 대각으로 pad만큼 떨어진 점은 실제로는 안 닿는데(거리 pad) 사각 확장
 * 판정으로는 각 축이 half+pad/√2 < half+pad라 "겹침"으로 나온다.
 *
 * 그러면 `pushOutOfBlock`(원-AABB 거리로 민다)과 어긋나 **밀어냈는데 여전히 겹쳤다고
 * 나오는** 모순이 생긴다. 실제로 스폰 겹침 회귀가 이걸 잡았다. 두 함수가 같은 기하를
 * 봐야 "비었다"가 한 뜻이 된다.
 */
export function pointInBlock(
  x: number,
  y: number,
  block: TerrainBlock,
  pad = 0,
): boolean {
  const h = Math.max(0, safe(block.half));
  const r = Math.max(0, safe(pad));
  const nearestX = Math.min(safe(block.x) + h, Math.max(safe(block.x) - h, x));
  const nearestY = Math.min(safe(block.y) + h, Math.max(safe(block.y) - h, y));
  const dx = x - nearestX;
  const dy = y - nearestY;
  // 안쪽이면 거리 0 — pad가 0이어도 겹침으로 본다
  return dx * dx + dy * dy < r * r || (dx === 0 && dy === 0);
}

/**
 * 선분이 블록을 지나는가 — **시야 차단** 판정 (투사체·플레이어 주문 공통).
 *
 * 슬래브 방식(구간 교차): 축마다 진입·이탈 파라미터를 구해 겹치는 구간이 있으면
 * 지난다. 끝점이 안에 있는 경우도 자연히 걸린다.
 *
 * @param pad 투사체·주문의 반경. 블록을 그만큼 부풀려 판정한다
 */
export function segmentHitsBlock(
  a: FormPoint,
  b: FormPoint,
  block: TerrainBlock,
  pad = 0,
): boolean {
  const h = Math.max(0, safe(block.half)) + Math.max(0, safe(pad));
  const left = safe(block.x) - h;
  const right = safe(block.x) + h;
  const top = safe(block.y) - h;
  const bottom = safe(block.y) + h;

  let enter = 0;
  let exit = 1;
  const axes: [number, number, number, number][] = [
    [a.x, b.x - a.x, left, right],
    [a.y, b.y - a.y, top, bottom],
  ];
  for (const [origin, delta, lo, hi] of axes) {
    if (Math.abs(delta) < 1e-9) {
      // 축에 평행 — 그 축 범위 밖이면 절대 안 만난다
      if (origin < lo || origin > hi) return false;
      continue;
    }
    let t0 = (lo - origin) / delta;
    let t1 = (hi - origin) / delta;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    exit = Math.min(exit, t1);
    if (enter > exit) return false;
  }
  return true;
}

/** 어느 블록이든 시야를 끊는가 */
export function segmentBlocked(
  a: FormPoint,
  b: FormPoint,
  blocks: readonly TerrainBlock[],
  pad = 0,
): boolean {
  for (const block of blocks) {
    if (segmentHitsBlock(a, b, block, pad)) return true;
  }
  return false;
}
