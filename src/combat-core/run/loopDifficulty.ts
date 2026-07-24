/**
 * 보스 후 이어가기 — 루프 난이도 (게임성: 절정 구조 + 성장하는 맛).
 *
 * 총괄 설계: 보스를 잡으면 "이대로 마치고 시작 화면으로 vs 지금 상태 그대로 이어가기"를
 * 고른다. 이어가면 빌드(친화·각인·정령·HP)가 유지된 채 난이도가 오른다. 불 마스터가
 * 여러 루프를 밀고 들어가 진짜 화염의 화신이 되는 그림 — 뱀서가 아니라 하데스/RoR 계열.
 *
 * 리스크(총괄 승인): 보스마다 유산이 은행 저장(persistRunMemory) → 이어가다 죽어도
 * 은행분은 남는다. 잃는 건 "더 크게 벌 수 있었던 것"뿐. 그래서 매 보스가 진짜 결정이 된다.
 */
export const LOOP_CONFIG = {
  /** 루프당 적 피해 증가율 — 이어갈수록 더 아프게 (튜닝 노브, R1 콜) */
  enemyDamagePerLoop: 0.3,
  /** 피해 배율 상한 — 무한 루프에서도 즉사 도배가 되지 않게 */
  maxDamageScale: 3,
} as const;

/** 루프 인덱스(0=첫 런) → 적 피해 배율. loop 1 = ×1.3, loop 2 = ×1.6 … 상한 ×3 */
export function loopDamageScale(loopIndex: number): number {
  const safe = Number.isFinite(loopIndex) ? Math.max(0, Math.floor(loopIndex)) : 0;
  return Math.min(
    LOOP_CONFIG.maxDamageScale,
    1 + LOOP_CONFIG.enemyDamagePerLoop * safe,
  );
}
