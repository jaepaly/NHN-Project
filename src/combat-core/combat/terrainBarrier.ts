import type { FormPoint } from './persistentFormConfig';

/**
 * 정적 지형 장벽 (#214 지형 Tier 2) — 방에 고정 배치되는 마력 장벽.
 *
 * 주문으로 세우는 전장 장벽(wall 폼)과 다른 것: 이건 **지형**이다. 영구·무피해이고
 * 이동을 막는다. 시각·투사체 차단 문법은 전장 장벽에서 물려받아 플레이어가
 * "저건 통과 못 하는 것"을 이미 아는 상태로 만난다.
 *
 * ⚠️ 배치 원칙 두 개 (#214에서 총괄이 못박은 것 — 어기면 게임이 망가진다):
 *
 * 1. **소수·개방형 배치만.** 미로처럼 깔면 안 된다. 적 추격이 직선이라 벽 뒤
 *    플레이어에게 못 가고 벽에 비빈다. 고치려면 경로찾기(A*)가 필요한데 일정상
 *    불가다. 중앙 기둥·가장자리 짧은 벽 정도로 — 우회로가 항상 열려 있어야 한다.
 *    (배치 데이터는 R1 소유. 이 모듈은 기전만 제공한다)
 *
 * 2. **돌진·도약·시퀀스 이동은 통과한다.** 트윈 이동에 충돌을 넣는 건 비싸고,
 *    오히려 "돌진 영창으로 장벽을 뛰어넘는다"가 카운터플레이가 된다 —
 *    마법 세계관에서 말이 되고, 이동 영창에 존재 이유를 하나 더 준다.
 */
export const TERRAIN_BARRIER_CONFIG = {
  /** 장벽 두께(px) — 전장 장벽(wall)과 같은 굵기라 같은 것으로 읽힌다 */
  thickness: 14,
  /**
   * 밀어내기 여유(px) — 딱 맞게 밀면 매 프레임 경계에서 떨림이 생긴다.
   * 살짝 더 밀어 안정시킨다.
   */
  pushEpsilon: 0.5,
} as const;

/** 선분 하나로 표현되는 장벽 (중심·길이·각도) */
export interface TerrainBarrier {
  /** 중심 x */
  x: number;
  /** 중심 y */
  y: number;
  /** 길이의 절반(px) */
  halfLength: number;
  /** 화면 기준 각도(도). 0 = 가로 */
  angleDeg: number;
}

/** 장벽의 양 끝점 — 렌더·투사체 차단(sweepIntersectsPolyline)이 쓴다 */
export function barrierEndpoints(barrier: TerrainBarrier): [FormPoint, FormPoint] {
  const rad = (safe(barrier.angleDeg) * Math.PI) / 180;
  const dx = Math.cos(rad) * Math.max(0, safe(barrier.halfLength));
  const dy = Math.sin(rad) * Math.max(0, safe(barrier.halfLength));
  return [
    { x: safe(barrier.x) - dx, y: safe(barrier.y) - dy },
    { x: safe(barrier.x) + dx, y: safe(barrier.y) + dy },
  ];
}

/**
 * 장벽에 파고든 개체를 밖으로 밀어낸다 (순수).
 *
 * 캡슐 판정: 선분까지 거리가 (두께/2 + 개체 반경)보다 가까우면 법선 방향으로 밀어낸다.
 * 겹치지 않으면 null — 호출측이 "안 겹쳤다"를 싸게 알 수 있다.
 *
 * @returns 밀어낸 새 위치, 겹치지 않으면 null
 */
export function pushOutOfBarrier(
  x: number,
  y: number,
  radius: number,
  barrier: TerrainBarrier,
): { x: number; y: number } | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const [a, b] = barrierEndpoints(barrier);
  const clearance = TERRAIN_BARRIER_CONFIG.thickness / 2 + Math.max(0, safe(radius));

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSquared = abx * abx + aby * aby;
  // 길이 0인 장벽은 점 — 중심에서 밀어낸다
  const t = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((x - a.x) * abx + (y - a.y) * aby) / lengthSquared));
  const nearestX = a.x + abx * t;
  const nearestY = a.y + aby * t;

  let dx = x - nearestX;
  let dy = y - nearestY;
  /** 파고든 깊이 판정용 거리 — push 계산은 **항상 이 값**을 쓴다 */
  const distance = Math.hypot(dx, dy);
  if (distance >= clearance) return null;

  // 방향 정규화용 길이는 distance와 **분리**한다. 예전엔 선 위(거리 0)일 때
  // distance에 법선 벡터 길이를 덮어썼는데, 그러면 push가 (clearance - 300)처럼
  // 음수가 돼 반대 방향으로 수백 px 튕겼다(브라우저 실측으로 잡음).
  let directionLength = distance;
  if (distance === 0) {
    // 정확히 선분 위 — 법선 방향(수직)으로 밀어낸다. 방향이 없으면 위로.
    if (lengthSquared === 0) { dx = 0; dy = -1; } else { dx = -aby; dy = abx; }
    directionLength = Math.hypot(dx, dy) || 1;
  }
  const push = (clearance - distance) + TERRAIN_BARRIER_CONFIG.pushEpsilon;
  return {
    x: x + (dx / directionLength) * push,
    y: y + (dy / directionLength) * push,
  };
}

/** 여러 장벽을 순서대로 적용 — 모서리에서 두 장벽에 동시에 걸려도 빠져나온다 */
export function pushOutOfBarriers(
  x: number,
  y: number,
  radius: number,
  barriers: readonly TerrainBarrier[],
): { x: number; y: number } {
  let px = x;
  let py = y;
  for (const barrier of barriers) {
    const pushed = pushOutOfBarrier(px, py, radius, barrier);
    if (pushed) { px = pushed.x; py = pushed.y; }
  }
  return { x: px, y: py };
}

function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
