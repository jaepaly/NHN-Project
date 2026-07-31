import { AWAKENING_CONFIG } from '../run/awakening';

/**
 * 장벽 내구도 — **"길을 막는다"는 약속을 지키되 보스전을 봉쇄하지 않는 저울** (#296).
 *
 * 제보: *"장벽이 얇고 허약하게 보여, 친화가 높아져도 강화된 설치물처럼 느껴지지
 * 않습니다. 보스가 돌진할 때 장벽을 그대로 통과합니다."*
 *
 * ## 왜 내구도인가
 *
 * 종전 규칙은 **보스만 예외**였다. 일반 적은 위치를 되돌려 실제로 막는데, 보스는
 * 1.5초 둔화(×0.6)만 받고 지나간다. 봉쇄를 피하려던 타협인데, 하필 **가장 막고 싶은
 * 순간**에 벽이 없는 것처럼 동작한다. 영창의 핵심 약속이 거기서 깨진다.
 *
 * 그렇다고 보스를 그냥 막으면 벽 하나로 보스전이 정지한다. 그래서 **막되 닳는다**:
 * 돌진은 확실히 멈추고, 그 대가로 벽이 부서진다. 플레이어는 "한 번 막았다"를 얻고
 * 보스는 다시 움직인다.
 *
 * ## 수치가 이 모양인 이유
 *
 * `chargeImpactCost`(120)가 `base`(100)보다 **크다.** 즉 맨몸 장벽은 돌진 한 번에
 * 반드시 부서진다. 이게 봉쇄 방지의 하드 게이트다 — 친화가 0이면 저울이 어느 쪽으로도
 * 기울지 않는다.
 *
 * 친화가 붙으면 달라진다:
 *
 * | 친화 | 내구 | 돌진 1회 후 | 읽히는 것 |
 * |---|---|---|---|
 * | 0 (맨몸) | 100 | **파괴** | 막았다, 그리고 부서졌다 |
 * | 0.45 (사용 누적 상한) | 140 | 20 남음 · 붕괴직전 | 아슬아슬하게 버텼다 |
 * | 1.2 (각성) | 208 | 88 남음 · 균열 | **버텼다** |
 *
 * 각성 장벽만 돌진을 견디고 서 있다. 완료 조건의 *"120% 이상 친화 장벽이 기본
 * 장벽보다 육안으로 강하게 구분됨"*을 색이 아니라 **결과**로 만든 것이다 — 두께만
 * 키우면 결국 "굵은 선"이고, 총괄이 UI에서 지적한 그 문제와 같아진다.
 *
 * ⚠️ 벽 수명은 2~4초라 대부분 돌진을 한 번 마주친다. 두 번째 돌진까지 버티는 값을
 * 주면 사실상 무한 장벽이 되므로 `perAffinity`를 더 올리면 안 된다.
 */

export const WALL_INTEGRITY = {
  /** 친화 0일 때의 내구도. `chargeImpactCost`보다 **작아야** 한다 (봉쇄 방지) */
  base: 100,
  /** 친화 1당 더해지는 내구도 */
  perAffinity: 90,
  /** 보스 돌진 1회가 깎는 양 */
  chargeImpactCost: 120,
  /** 돌진이 막힌 뒤 보스가 휘청이는 시간 */
  staggerSeconds: 0.9,
  /** 휘청임 중 이동 배수 — 0으로 두면 "얼었다"로 읽혀 봉쇄처럼 보인다 */
  staggerMovementMultiplier: 0.15,
  /** 선 두께: 친화 0에서 14 (종전 고정값), 각성에서 27 */
  thicknessBase: 14,
  thicknessPerAffinity: 11,
  /** 결정 마디 — 굵기만으로는 "굵은 선"이라 마디로 구조를 만든다 */
  nodesBase: 3,
  nodesPerAffinity: 5,
  /** 마모 단계 경계 (남은 비율) */
  crackedBelow: 0.66,
  failingBelow: 0.34,
} as const;

/** 장벽 마모 단계 — 렌더가 이걸로 갈린다 */
export type WallWear = 'intact' | 'cracked' | 'failing';

function safeAffinity(affinity: number): number {
  if (!Number.isFinite(affinity)) return 0;
  return Math.max(0, affinity);
}

/** 이 원소 친화도로 세운 장벽의 최대 내구도 */
export function wallMaxIntegrity(affinity: number): number {
  const a = safeAffinity(affinity);
  return WALL_INTEGRITY.base + WALL_INTEGRITY.perAffinity * a;
}

/**
 * 선 두께. 각성 장벽이 기본의 약 2배가 되도록 잡았다 — 육안 구분의 하한이다.
 * 1.5배 이하면 나란히 두지 않는 한 구별이 안 된다.
 */
export function wallThickness(affinity: number): number {
  const a = safeAffinity(affinity);
  return WALL_INTEGRITY.thicknessBase + WALL_INTEGRITY.thicknessPerAffinity * a;
}

/**
 * 결정 마디 수 — 벽을 따라 박히는 마디.
 *
 * 두께만 키우면 "굵은 선"이지 구조물이 아니다. 마디가 있어야 얼음 기둥으로 읽힌다.
 * 총괄이 UI에서 지적한 것과 같은 종류의 문제다: 표면만 키우면 형태가 안 생긴다.
 */
export function wallCrystalNodes(affinity: number): number {
  const a = safeAffinity(affinity);
  return Math.round(WALL_INTEGRITY.nodesBase + WALL_INTEGRITY.nodesPerAffinity * a);
}

/** 각성 친화로 세운 장벽인가 — 렌더가 한 단계 더 얹는 기준 */
export function isAwakenedWall(affinity: number): boolean {
  return safeAffinity(affinity) >= AWAKENING_CONFIG.threshold;
}

/**
 * 보스 돌진 충돌 — 내구도를 깎는다.
 *
 * @returns `broke`가 참이면 벽은 이 충돌로 사라진다. **어느 쪽이든 돌진은 멈춘다** —
 *   부서지면서 막는 것과 못 막는 것은 다르다.
 */
export function absorbChargeImpact(
  current: number,
): { remaining: number; broke: boolean } {
  const left = (Number.isFinite(current) ? current : 0) - WALL_INTEGRITY.chargeImpactCost;
  if (left <= 0) return { remaining: 0, broke: true };
  return { remaining: left, broke: false };
}

/** 남은 내구도 → 마모 단계 */
export function wallWear(current: number, max: number): WallWear {
  if (!Number.isFinite(max) || max <= 0) return 'failing';
  const ratio = Math.max(0, Number.isFinite(current) ? current : 0) / max;
  if (ratio >= WALL_INTEGRITY.crackedBelow) return 'intact';
  if (ratio >= WALL_INTEGRITY.failingBelow) return 'cracked';
  return 'failing';
}

/**
 * 마모 단계별 그리기 배수 — 알파와 마디 크기를 낮춘다.
 *
 * ⚠️ 깜빡임이나 애니메이션을 넣지 않는다. 벽은 화면에 2~4초 떠 있는 큰 밝은 물체라
 * 여기에 진동을 얹으면 광과민성 예산(#220)을 바로 넘긴다. **정지한 채로 약해 보이게**
 * 하는 방법만 쓴다.
 */
export function wallWearRender(wear: WallWear): { alpha: number; nodeScale: number } {
  if (wear === 'intact') return { alpha: 1, nodeScale: 1 };
  if (wear === 'cracked') return { alpha: 0.72, nodeScale: 0.78 };
  return { alpha: 0.48, nodeScale: 0.55 };
}
