/**
 * 합산 감쇠 하한 (MASTERY_REDESIGN_DECISION §3③).
 *
 * 문제: 두 **원소 기반** 감쇠 — 런 격상(#77)과 보스 내성 — 이 같은 원소에 곱으로
 * 쌓이면 최악 `0.4 × 0.3 = 0.12`(위력 12%). 집중 투자가 순손실이 되는 함정.
 *
 * 해법: 둘의 곱이 이 하한 밑으로 안 내려가게 한다. 내성이 **격상 위에 겹쳐 밀어붙일**
 * 때만 개입한다(보스가 실제로 저항할 때). 투자가 곡선을 눕힐 뿐 지우지 않게 하는 보험.
 *
 * ⚠️ 반복 페널티(같은 주문 남발)는 여기 **제외**한다 — 그건 주문 기반이고 표현을
 * 바꾸면 회피되는 정당한 벌이다(결정서 §3① "반복 억제는 표현에"). 원소 도메인 투자만
 * 보호하고 게으른 복붙은 보호하지 않는다.
 */
export const DEBUFF_FLOOR = 0.5;

/**
 * 이미 격상이 반영된 데미지에 곱할 **보정된 내성 배율**을 돌려준다.
 * 결과적으로 (격상 × 내성)이 floor 밑으로 안 내려간다.
 *
 * @param escalation 이 원소의 격상 배율 (1=정상, <1=약화). 데미지에 이미 반영돼 있다.
 * @param resist 보스 내성 배율 (1=저항 없음, <1=저항)
 * @returns 격상 반영 데미지에 곱할 배율. 내성이 없으면(≥1) 1 — 격상만은 건드리지 않는다.
 */
export function flooredResistMultiplier(
  escalation: number,
  resist: number,
  floor = DEBUFF_FLOOR,
): number {
  const e = Number.isFinite(escalation) && escalation > 0 ? escalation : 1;
  const r = Number.isFinite(resist) ? Math.max(0, resist) : 1;
  if (r >= 1) return 1; // 저항 없음 → 격상만 유지 (겹침이 없으니 하한 개입 안 함)
  const combined = Math.max(floor, e * r);
  return combined / e; // 격상 반영 데미지 × 이 값 = (pre-격상) × combined
}
