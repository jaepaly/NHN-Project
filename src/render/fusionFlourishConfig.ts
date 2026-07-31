import type { SpellElement } from '../spell/types';

/**
 * 필살기 이중 원소 연출 — **두 원소를 순차로 터뜨린다** (총괄 지시 2026-07-31).
 *
 * 총괄: *"필살기는 두 가지 속성 같이 쓰는 거잖아. 예를 들어 얼음과 전기를 함께 쓰면
 * 깨지는 거랑 스파크 튀는 두가지 효과가 다 보이게."*
 *
 * ## 종전 동작
 *
 * `playAffinityImpactFlourish`가 `ELEMENT_FLOURISH_RENDERERS[spec.element_primary]`
 * **하나만** 불렀다. 보조 원소는 스파크 색(`sparkTints`)에만 섞여서, 얼음+전기 필살기가
 * 얼음 파쇄만 보여주고 전기는 "파란빛이 좀 섞인" 수준이었다. 두 원소를 쓴다는 필살기의
 * 정체성이 화면에 없었다.
 *
 * ## 왜 동시가 아니라 순차인가
 *
 * 둘을 그냥 겹쳐 뿌리면 **광량이 2배**가 된다. 필살기는 원래 화면에서 가장 밝은
 * 순간이라 거기서 2배는 광과민성 예산(#220)을 정면으로 넘긴다.
 *
 * 순차로 두면 두 가지를 동시에 얻는다:
 *
 *  1. **점화 시점이 갈린다.** 섬광의 피크는 시작 순간에 있다. 150ms 벌리면 피크가
 *     겹치지 않아 "한 번에 두 배 밝음"이 안 생긴다
 *  2. **연출이 길어진다.** 필살기는 한 번에 다 보여주는 것보다 끄는 쪽이 특별해 보인다.
 *     "두 마법이 겹쳐 터졌다"로 읽힌다
 *
 * ## 총광량을 실제로 지키는 방법
 *
 * 시점을 벌려도 **잔상은 겹친다** — 링이 560ms 살아 있으니 150ms 지연으로는 안 끝난다.
 * 그래서 시점만 미루는 걸로 끝내지 않고 **공용 확장 링을 줄인다.**
 *
 * 링은 이 연출에서 면적을 가장 많이 채우는 요소다(원소 고유 연출은 대부분 선이다).
 * `ringScale`을 두 단계 합이 단일 시전을 넘지 않도록 잡았다:
 *
 *     0.55 × (1 + 0.75) = 0.9625 ≤ 1
 *
 * 즉 **필살기의 링 총량이 평범한 주문 하나보다 적다.** 대신 원소 고유 연출이 둘 나오니
 * 화면은 더 풍부해진다 — 밝기를 늘리는 게 아니라 형태를 늘리는 교환이다. 마도서 UI에서
 * 배운 것과 같다(표면을 키우지 말고 형태를 만들 것).
 *
 * ⚠️ 회귀가 이 부등식을 직접 검사한다. 어느 값이든 올리려면 다른 쪽을 낮춰야 한다.
 */

export const FUSION_FLOURISH = {
  /** 보조 원소 연출이 늦게 시작하는 간격(ms) */
  secondaryDelayMs: 150,
  /** 보조 원소 연출 강도 배수 — 주 원소가 주인공이라는 위계를 남긴다 */
  secondaryIntensityScale: 0.75,
  /** 융합 시전일 때 공용 확장 링에 곱하는 배수 (총광량 상쇄) */
  ringScale: 0.55,
} as const;

export interface FusionFlourishStep {
  /** 이 단계가 그릴 원소 */
  element: SpellElement;
  /** 시전 시점 기준 지연(ms). 0이면 즉시 */
  delayMs: number;
  /** 이 단계의 연출 강도 */
  intensity: number;
}

/**
 * 필살기 연출 단계 목록.
 *
 * 보조 원소가 없거나 주 원소와 같으면 **단계가 하나**다 — 같은 연출을 두 번 겹쳐
 * 그리면 그냥 2배 밝기고, 그게 정확히 이 설계가 피하려던 것이다.
 */
export function fusionFlourishPlan(
  primary: SpellElement,
  secondary: SpellElement | null | undefined,
  intensity: number,
): readonly FusionFlourishStep[] {
  const base = Number.isFinite(intensity) ? Math.max(0, intensity) : 0;
  const first: FusionFlourishStep = { element: primary, delayMs: 0, intensity: base };
  if (!secondary || secondary === primary) return [first];
  return [
    first,
    {
      element: secondary,
      delayMs: FUSION_FLOURISH.secondaryDelayMs,
      intensity: base * FUSION_FLOURISH.secondaryIntensityScale,
    },
  ];
}

/**
 * 공용 확장 링에 곱할 배수.
 *
 * 단계가 둘일 때만 줄인다. 보조 원소가 없는 필살기(주·보조가 같은 경우 포함)까지 줄이면
 * 필살기가 평범한 주문보다 **약해 보이는** 역전이 생긴다.
 */
export function fusionRingScale(stepCount: number): number {
  return stepCount > 1 ? FUSION_FLOURISH.ringScale : 1;
}

/**
 * 이 계획의 링 총량이 단일 시전 대비 몇 배인가 — 예산 검사용.
 *
 * 1을 넘으면 필살기가 평범한 주문보다 면적을 더 채운다는 뜻이고, 그건 #220 위반이다.
 */
export function fusionRingBudgetRatio(steps: readonly FusionFlourishStep[]): number {
  if (steps.length === 0) return 0;
  const scale = fusionRingScale(steps.length);
  const base = steps[0].intensity;
  if (base <= 0) return 0;
  // 링 개수는 강도에 비례하므로 강도 비율의 합으로 근사한다
  return steps.reduce((sum, step) => sum + (step.intensity / base) * scale, 0);
}
