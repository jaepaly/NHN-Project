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
   * 적이 흡수하는 **플레이어 성장분의 비율** (총괄 지적: "몹 피통을 절대 수치로 올리지
   * 말고 유저가 성장한 정도에 따라 상대적으로 올려야 한다").
   *
   * ⚠️ **반드시 1보다 작아야 한다.** 1이면 고무줄이 되어 보상을 먹어도 체감이 그대로다 —
   * 각성 도입 때 지적된 "성장 체감이 없다"가 더 나쁜 형태로 돌아온다. 0.55면 적이 성장의
   * 절반 남짓만 흡수하므로 **키울수록 항상 순이득**이고, 그게 아래 증명으로 보장된다:
   *   비율 = P / (1 + g(P−1)),  d/dP = (1−g) / (…)² > 0  ⟺  g < 1
   * 회귀(loop-continue)가 이 부등식과 단조성을 함께 고정한다.
   */
  hpGainFromPower: 0.55,
  /**
   * 루프당 체력 **바닥값** 증가율 — 상대 스케일링만 두면 "보상을 안 먹으면 적도 안 세진다"가
   * 성립해 스킵이 공략이 된다. 게다가 적 **피해**는 성장과 무관하게 루프당 +30%씩 오르므로
   * (위 enemyDamagePerLoop), 체력이 전혀 안 오르면 후반이 유리대포 판으로 뒤집힌다.
   */
  hpFloorPerLoop: 0.05,
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
 * 적 체력 배율 — **플레이어가 실제로 성장한 만큼** 오른다 (playerPowerIndex).
 *
 * 루프 수는 성장의 나쁜 대리 지표다: 친화 카드는 확률(3/7)에 원소까지 랜덤(8종)이고,
 * 사용 친화는 원소당 0.45에서 멈추며, 시연 로드아웃·각인·정령·각성은 루프 수에 안 잡힌다.
 * 그래서 같은 loop 3에서도 실제 파워가 배 이상 갈린다 — 절대 곡선은 한쪽 끝에서
 * 스펀지를, 다른 끝에서 학살을 만든다.
 *
 * 바닥값(루프)과 상대값 중 **큰 쪽**을 쓴다. 상대값은 성장한 플레이어를 따라가고,
 * 바닥값은 성장을 안 한 플레이어에게도 최소한의 저항을 남긴다.
 *
 * 피해 배율과는 **별개 축**이다: 체력은 전투를 길게 만들고, 피해는 한 방을 아프게 만든다.
 * 둘은 상쇄가 아니라 누적이므로(길어지면 더 많이 맞는다) 피해 상한은 그대로 둔다.
 *
 * @param powerIndex playerPowerIndex()의 결과 (1 = 런 시작, 성장 없음)
 */
export function enemyHpScale(loopIndex: number, powerIndex: number, isBoss = false): number {
  const loop = Number.isFinite(loopIndex) ? Math.max(0, Math.floor(loopIndex)) : 0;
  const power = Number.isFinite(powerIndex) ? Math.max(1, powerIndex) : 1;
  const floor = 1 + LOOP_CONFIG.hpFloorPerLoop * loop;
  const relative = 1 + LOOP_CONFIG.hpGainFromPower * (power - 1);
  const scale = Math.min(LOOP_CONFIG.maxHpScale, Math.max(floor, relative));
  return isBoss ? 1 + (scale - 1) * LOOP_CONFIG.bossHpScaleFactor : scale;
}
