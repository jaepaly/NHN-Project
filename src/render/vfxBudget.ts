/**
 * 지속형 장식 VFX 예산 (#216 P0-1) — 가산 발광 중첩의 광과민성 안전 조치.
 *
 * 진화 각인으로 큰 zone 3개가 겹치면 field·inner·파티클의 ADD 블렌드가 그대로
 * 합산돼 화면 대부분이 발광으로 덮였다(실플레이에서 눈 피로·잔상 보고). 판정과
 * 무관한 **장식 밝기**만 예산으로 묶는다:
 *
 * - 단일 시전은 감쇠 없음 — 한 발의 손맛은 그대로 둔다.
 * - 2개째부터 지수 감쇠(decayPerExtra), 하한(minScale)까지. 3개 중첩 시 총
 *   발광량이 단일의 ~1.15배로 수렴한다 (감쇠 없으면 3배).
 * - 자동(각인·정령) 시전은 추가 감쇠 — 내가 외친 마법이 항상 가장 밝다.
 * - **적 위험구역은 예산 면제** — 그건 장식이 아니라 정보다. 플레이어 장식이
 *   어두워질수록 위험구역의 상대 가독성은 오히려 올라간다.
 *
 * 판정·틱 타이밍·데미지는 이 모듈과 무관하다 — 알파·파티클 빈도만 만진다.
 */

export const VFX_BUDGET_CONFIG = {
  /** 이 개수까지는 감쇠 없음 — 단일 시전의 손맛 보존 */
  freeCount: 1,
  /** 초과 1개당 곱해지는 알파 감쇠 (2개=0.62, 3개=0.38…) */
  decayPerExtra: 0.62,
  /** 알파 배율 하한 — 존이 아예 안 보이면 "내 장판이 어디였지"가 된다 */
  minScale: 0.35,
  /** 자동(각인·정령) 시전 장식 추가 감쇠 — 수동 영창이 항상 가장 밝다 */
  autoCastScale: 0.7,
  /** zone 파티클 기본 방출 간격(ms) — 감쇠 시 이 값을 늘려 개수도 줄인다 */
  particleBaseFrequencyMs: 90,
} as const;

/**
 * 활성 지속형 필드 수 → 각 필드에 곱할 알파 배율 (1=감쇠 없음).
 * freeCount까지 1, 초과분마다 decayPerExtra를 거듭제곱, minScale 하한.
 */
export function persistentFieldAlphaScale(activeCount: number): number {
  const count = Number.isFinite(activeCount) ? Math.floor(activeCount) : 0;
  const extra = Math.max(0, count - VFX_BUDGET_CONFIG.freeCount);
  return Math.max(
    VFX_BUDGET_CONFIG.minScale,
    VFX_BUDGET_CONFIG.decayPerExtra ** extra,
  );
}

/**
 * 알파 배율에 맞춘 파티클 방출 간격 — 어두워진 만큼 개수도 줄여 빛의 총량을
 * 함께 낮춘다 (알파만 내리면 파티클 수는 그대로라 여전히 어른거린다).
 */
export function decorParticleFrequencyMs(baseMs: number, alphaScale: number): number {
  const base = Number.isFinite(baseMs) && baseMs > 0
    ? baseMs
    : VFX_BUDGET_CONFIG.particleBaseFrequencyMs;
  const scale = Number.isFinite(alphaScale)
    ? Math.min(1, Math.max(VFX_BUDGET_CONFIG.minScale, alphaScale))
    : 1;
  return base / scale;
}
