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
  /**
   * 루프당 적 체력 증가율 — **이어가기 단계에만** 걸린다 (#267 R1 제안, R3 동의).
   *
   * ⚠️ 한때 플레이어 실제 성장(playerPowerIndex)에 비례시켰다가 되돌렸다. 분기 맵에서
   * 그 구조는 **위험–보상을 상쇄한다**: 위험한 경로로 더 성장하면 적도 즉시 강해져,
   * 실측상 두 경로의 우위 격차가 +24% → +7%로 약 70% 깎였다. 위험을 감수한 값이
   * 사라지면 분기를 고를 이유가 없다.
   *
   * 또 하나: 같은 프리셋이 빌드에 따라 다른 클리어 시간을 내면 **방 종류별 목표시간
   * (#258)을 검증할 수 없다.** 난이도 담당을 나눈다 —
   *   첫 런 = 전투 프리셋 티어(R1) · 이어가기 = 여기(루프 단계).
   */
  enemyHpPerLoop: 0.15,
  /** 체력 배율 상한 — 후반에 적이 스펀지가 되면 전투가 지루해진다 */
  maxHpScale: 2.5,
  /**
   * 보스 체력 배율 계수 — 보스는 이어가기마다 **내성이 누적**되므로(#77 격상·이중 저항)
   * 체력까지 온전히 올리면 이중 강화가 된다. 배율의 **초과분에만** 절반을 적용한다.
   */
  bossHpScaleFactor: 0.5,
} as const;

/** 루프 인덱스(0=첫 런) → 적 피해 배율. loop 1 = ×1.3, loop 2 = ×1.6 … 상한 ×3 */
export function loopDamageScale(loopIndex: number): number {
  const safe = Number.isFinite(loopIndex) ? Math.max(0, Math.floor(loopIndex)) : 0;
  return Math.min(
    LOOP_CONFIG.maxDamageScale,
    1 + LOOP_CONFIG.enemyDamagePerLoop * safe,
  );
}

/**
 * 적 체력 배율 — **이어가기 루프 단계만** 본다 (#267).
 *
 * 플레이어의 실제 성장(친화·빌드·각성·선택한 경로)은 **일부러 참조하지 않는다.**
 * 위험한 경로로 앞서 나간 이점은 이후 전투에 그대로 남아야 하고, 프리셋별 목표시간이
 * 빌드와 무관하게 측정 가능해야 한다.
 *
 * 피해 배율과는 **별개 축**이다: 체력은 전투를 길게 만들고, 피해는 한 방을 아프게 만든다.
 * 둘은 상쇄가 아니라 누적이므로(길어지면 더 많이 맞는다) 피해 상한은 그대로 둔다.
 *
 * 후속(#267 3번): 이어가기 강화에 **이전 맵의 평균 기대 성장 기회** 보정을 더한다.
 * 그 값은 맵 생성기(#240)가 만드는 구조적 기대값이라 아직 계산할 수 없어, 지금은
 * 루프 단계 기본 강화만 적용한다.
 */
export function enemyHpScale(loopIndex: number, isBoss = false): number {
  const loop = Number.isFinite(loopIndex) ? Math.max(0, Math.floor(loopIndex)) : 0;
  const scale = Math.min(
    LOOP_CONFIG.maxHpScale,
    1 + LOOP_CONFIG.enemyHpPerLoop * loop,
  );
  return isBoss ? 1 + (scale - 1) * LOOP_CONFIG.bossHpScaleFactor : scale;
}
