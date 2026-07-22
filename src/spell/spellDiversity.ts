import type { SpellElement, SpellForm } from './types';

/**
 * 다양성 보너스 (당근) — #92 결정: 런 내 반복 억제는 "벌"이 아니라 "다양성 보상".
 *
 * 최근 시전과 **다른 원소·폼**을 쓰면 데미지 배율↑. `basePower`(주문 정체성)는 절대
 * 건드리지 않고 **피해 계산 시점에만** 곱한다. 반복은 보너스를 못 받을 뿐(=1.0)이고
 * **벌하지 않는다** — 기본 플레이는 지금과 동일한 위력을 유지한다(바닥 보존).
 *
 * ⚠️ 밸런스 원칙 (R1): 너무 세면 상한(`maxBonus`)을 **낮춘다**. 몹 HP는 **늘리지 않는다**.
 *    HP 인플레는 "안 받으면 벌"이 되어 당근을 채찍으로 바꾼다(#92 논의). 레버는 상한뿐.
 *
 * 도메인: 이 순수함수 = R2. 배율을 곱하는 위치·최종 수치 튜닝 = R1.
 */

/** 다양성 판정에 쓰는 시전 요약 (원소·폼만 본다) */
export interface DiversityCast {
  element: SpellElement;
  form: SpellForm;
}

export const DIVERSITY_CONFIG = {
  /** 비교할 최근 시전 수 (윈도우). 이 밖의 과거는 "다시 신선"해진다. */
  window: 3,
  /** 원소 다양성 가중치 (원소가 폼보다 중요 — #85 결정) */
  elementWeight: 0.6,
  /** 폼(공격 방식) 다양성 가중치 */
  formWeight: 0.4,
  /**
   * 완전 다양(원소+폼 둘 다 새로움) 시 최대 보너스.
   * **보수적 시작값 0.3 (= 최대 1.30×)** — 세면 R1이 낮춘다. HP로 상쇄하지 말 것.
   */
  maxBonus: 0.3,
} as const;

/**
 * 이번 시전의 다양성 배율 (**≥ 1.0**, 절대 페널티 없음).
 *
 * 최근 window개 시전에 이번 원소/폼이 **없을수록** 배율이 커진다.
 * 원소·폼 각각 독립으로 신선도를 재고 가중 합산한다:
 *   - 원소·폼 둘 다 새로움 → 1 + maxBonus            (기본 1.30×)
 *   - 원소만 새로움         → 1 + maxBonus·elementW   (기본 1.18×)
 *   - 폼만 새로움           → 1 + maxBonus·formW      (기본 1.12×)
 *   - 둘 다 반복(또는 첫 시전) → 1.0
 *
 * @param current 이번 시전의 원소·폼
 * @param recent  직전 시전들 (시간순, **최신이 뒤**). 마지막 window개만 본다.
 */
export function diversityBonus(
  current: DiversityCast,
  recent: readonly DiversityCast[],
): number {
  const window = recent.slice(-DIVERSITY_CONFIG.window);
  if (window.length === 0) return 1; // 비교 대상 없음(첫 시전 등) → 중립

  const elementFresh = !window.some((c) => c.element === current.element);
  const formFresh = !window.some((c) => c.form === current.form);

  const novelty =
    (elementFresh ? DIVERSITY_CONFIG.elementWeight : 0) +
    (formFresh ? DIVERSITY_CONFIG.formWeight : 0);

  return 1 + DIVERSITY_CONFIG.maxBonus * novelty;
}
