import type { RewardOption } from '../../run/runContract';
import { drawRewardOptions } from './rewardConfig';

/**
 * 제단방 보상 — HP를 대가로 "상급" 강화 3택 (#214 R2 몫, 2026-07-27).
 *
 * 설계 의도(팀 합의): 제단방은 **페널티(HP)를 치르는 대신 그만큼 강해지는** 방이다.
 * 하나만 주면 재미가 없으므로 **여러 강화 중 고르게** 한다 — 보물방(무전투 표준 3택)과
 * 같은 "3택" 구조를 쓰되, 각 선택지에 **프리미엄 배율(powerScale)**을 실어 효과를 키운다.
 *
 * 재사용: 표준 `drawRewardOptions`를 그대로 굴려 **다양성**(생명·마나·친화·신속·격류·수호·정령
 * 중 3종)을 확보하고, 그 위에 프리미엄 배율·제목·id만 덧입힌다. → 보상 종류 로직 중복 없음.
 *
 * ⚠️ **placeholder 수치** — HP 대가·강화 배율은 총괄·이도원 밸런스 튜닝 대상.
 * ⚠️ **Step 2(R3 조율)**: 배율이 실제로 적용되려면 `RunController.applyReward`가
 *    `option.powerScale`을 수치 효과에 곱해야 한다(현재는 kind별 전역 config만 읽음).
 *    이 모듈은 그 배선 전까지 "상급 3택을 생성"하는 순수 로직만 담당한다.
 */
export const ALTAR_CONFIG = {
  /** 대가: 현재 최대 HP의 이 비율을 지불 (placeholder — 튜닝 대상) */
  hpCostRatio: 0.25,
  /** 상급 강화 배율 — 표준 보상 수치의 이 배 (placeholder — 튜닝 대상) */
  premiumScale: 2,
} as const;

/**
 * 제단방 3택 — 표준 풀에서 3종을 뽑아 각각 프리미엄 배율을 실어 반환한다.
 * 같은 시드면 같은 결과(재현 가능). LLM 호출 없음.
 */
export function drawAltarRewardOptions(
  roomIndex: number,
  rand: () => number,
): readonly RewardOption[] {
  // scale을 draw에 넘기면 buildOption이 설명·powerScale을 함께 배율 반영한다(카드=실제 일치).
  // spirit-haste는 씬 적용이라 buildOption이 배율을 안 실으므로 그 카드만 표준 — "상급" 접두사도 붙이지 않는다.
  return drawRewardOptions(roomIndex, rand, ALTAR_CONFIG.premiumScale).map((option) => ({
    ...option,
    id: `altar-${option.id}`,
    title: option.powerScale ? `상급 ${option.title}` : option.title,
  }));
}

/** 제단 대가로 지불할 HP — 현재 최대 HP 기준. 최소 1(공짜 방지). */
export function altarHpCost(maxHp: number): number {
  return Math.max(1, Math.round(maxHp * ALTAR_CONFIG.hpCostRatio));
}
