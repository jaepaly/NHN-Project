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

/** HUD 친화 바에 동시에 세울 원소 수 — 주력 1 + 곁가지 2 (그 이상은 잡음) */
export const AFFINITY_ROWS = 3;

/**
 * 친화 순위 — 값이 큰 순으로 정렬해 상위 몇 개만 돌려준다.
 *
 * 왜 필요한가 (총괄 제보): 친화는 **원소별로 따로** 오르는데 HUD는 최고치 하나만
 * 그렸다. 그래서 불로 시작한 뒤 얼음을 쏘면 얼음 친화가 실제로는 올라가는데도
 * 화면엔 아무 변화가 없어, "다른 속성은 안 오른다"로 읽혔다. 성장이 일어나는데
 * 화면이 부정하면 플레이어는 그 선택지를 지워버린다.
 *
 * 그래도 상위 몇 개만 세우는 이유: 이 게임의 친화 설계는 **집중형 보상**이다
 * (useCap 0.45 · 카드로만 그 위). 8개를 다 늘어놓으면 "고루 찍어라"로 잘못 읽힌다.
 * 주력을 맨 위 큰 바로 두고 나머지는 작게 — 둘 다 사실대로 보인다.
 */
export function rankAffinities<T extends string>(
  affinity: Partial<Record<T, number>>,
  limit = AFFINITY_ROWS,
): Array<{ element: T; value: number }> {
  const rows: Array<{ element: T; value: number }> = [];
  for (const [element, raw] of Object.entries(affinity) as Array<[T, number | undefined]>) {
    const value = Number.isFinite(raw) ? (raw as number) : 0;
    if (value > 0) rows.push({ element, value });
  }
  // 동점은 원소 이름으로 갈라 프레임마다 순서가 흔들리지 않게 한다(깜빡임 방지).
  rows.sort((a, b) => (b.value - a.value) || a.element.localeCompare(b.element));
  return rows.slice(0, Math.max(0, limit));
}
