import { ACTIVE_MANA_CONFIG } from './activeManaConfig';

/**
 * 감쇠 시전 계획 — 마나가 비용에 못 미쳐도 거부하지 않고, 남은 마나만큼
 * 약해진 주문으로 나가게 한다 (총괄 결정, 비용 불확실성 UX).
 *
 * 비용은 저지가 판정한 뒤에야 밝혀지므로 플레이어는 정확한 예산을 세울 수 없다.
 * 거부는 그 불확실성을 "헛손질 + 저지 호출 낭비"라는 벌로 만든다. 감쇠는 최악의
 * 경우를 "약한 버전이라도 나감"으로 바꿔, 모르는 비용이 리스크가 아니라 테마가
 * 되게 한다 — "마나가 달리면 대주문도 불씨가 된다."
 *
 * @returns spend=실제 지불 마나, ratio=위력 배율(1=온전). 마나가 바닥(minMana 미만)이면
 *          null — 그때만 기존 거부 경로("마나 부족")를 탄다.
 */
export function degradedCastPlan(
  cost: number,
  heldMana: number,
): { spend: number; ratio: number } | null {
  const safeCost = Number.isFinite(cost) ? Math.max(0, cost) : 0;
  const held = Number.isFinite(heldMana) ? Math.max(0, heldMana) : 0;
  if (safeCost === 0) return { spend: 0, ratio: 1 };
  if (held >= safeCost) return { spend: safeCost, ratio: 1 };
  if (held < ACTIVE_MANA_CONFIG.degradedCastMinMana) return null;
  return { spend: held, ratio: held / safeCost };
}
