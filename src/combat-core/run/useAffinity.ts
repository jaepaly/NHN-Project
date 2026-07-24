/**
 * 사용 기반 친화 성장 (진행 밀도 · 집중형 보상).
 *
 * 문제: 친화가 카드로만 올라, 한 런 보상 5회로는 "불 마스터"(≈+60~90%)에 닿기 전에
 * 런이 끝난다 — 영창가 빌드가 굶는다. 또 "불을 극한까지 연구하는" 스타일이 운(카드
 * 뽑기)에 좌우된다.
 *
 * 해법: 수동 시전이 그 원소의 친화를 조금씩 올린다. 카드=큰 도약, 시전=연속적 성장.
 * "내 영창이 런 내내 내 힘을 빚는다" — 말이 곧 마법. VFX 격상과 같은 맵을 쓰므로
 * 이펙트도 플레이로 화려해진다.
 *
 * ⚠️ 소프트캡 필수: 사용 성장이 무한이면 불→친화→더 강한 불→더 많은 불로 눈덩이가
 * 굴러 밸런스가 터진다. 그래서 **사용 기여분에만 상한**을 두고(카드는 그 위로 무한),
 * 카드를 여전히 주력 레버로 남긴다.
 */
export const USE_AFFINITY = {
  /** 수동 시전 1회당 그 원소 친화 증가분 */
  perCast: 0.02,
  /** 사용만으로 오를 수 있는 상한 (≈친화 카드 3장). 카드는 이 위로 무제한 */
  useCap: 0.45,
} as const;

/**
 * 사용 친화 누적 갱신 (순수) — 상한 안에서 이번 시전이 실제로 더한 양을 돌려준다.
 * @param addedSoFar 이 원소에 사용으로 더해온 누적치 (카드분 제외)
 * @returns { added: 이번에 실제 더해진 양(0=상한 도달), nextAddedSoFar }
 */
export function accrueUseAffinity(
  addedSoFar: number,
  perCast = USE_AFFINITY.perCast,
  useCap = USE_AFFINITY.useCap,
): { added: number; nextAddedSoFar: number } {
  const safe = Number.isFinite(addedSoFar) ? Math.max(0, addedSoFar) : 0;
  const room = Math.max(0, useCap - safe);
  const added = Math.min(perCast, room);
  return { added, nextAddedSoFar: safe + added };
}
