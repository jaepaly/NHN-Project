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
   * 루프당 적 **체력** 증가율 (총괄 지적: "런을 거듭해도 몹 체력이 안 늘어 한 방에 쓸린다").
   *
   * 플레이어 수동 딜은 친화가 덧셈(×(1+a), 카드당 +0.15)이라 루프당 대략 +15~21%씩,
   * 갈수록 완만하게 오른다. 체력을 그보다 **살짝 아래**인 15%로 두면 이길수록 조금씩
   * 앞서 나가되 전투가 무의미해지지 않는다 — 같은 비율로 올리면 제자리걸음이 된다.
   */
  enemyHpPerLoop: 0.15,
  /** 체력 배율 상한 — 후반에 적이 스펀지가 되면 전투가 지루해진다 */
  maxHpScale: 2.5,
  /**
   * 보스 체력 배율 계수 — 보스는 이어가기마다 **내성이 누적**되므로(#77 격상·이중 저항)
   * 체력까지 온전히 올리면 이중 강화가 된다. 절반만 적용한다.
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
 * 루프 인덱스 → 적 체력 배율. loop 1 = ×1.15, loop 2 = ×1.30 … 상한 ×2.5
 *
 * 피해 배율과 **별개 축**이다: 체력은 전투를 길게 만들고, 피해는 한 방을 아프게 만든다.
 * 둘은 상쇄가 아니라 누적이므로(길어지면 더 많이 맞는다) 피해 상한은 그대로 둔다.
 */
export function loopHpScale(loopIndex: number, isBoss = false): number {
  const safe = Number.isFinite(loopIndex) ? Math.max(0, Math.floor(loopIndex)) : 0;
  const factor = isBoss ? LOOP_CONFIG.bossHpScaleFactor : 1;
  const raw = 1 + LOOP_CONFIG.enemyHpPerLoop * factor * safe;
  const cap = 1 + (LOOP_CONFIG.maxHpScale - 1) * factor;
  return Math.min(cap, raw);
}
