/**
 * 온보딩 예시 문장 (Phase 5).
 *
 * 문제: "당신의 문장이 주문이 된다"는 추상적이라, 처음 켠 사람은 **무엇을 입력해야 할지**
 * 모른 채 영창 바 앞에서 멈춘다. 첫 영창에서 막히면 판정·성장·기억 보스를 하나도 못 본다.
 *
 * 해법: 영창 바를 열 때마다 구체적 예시를 placeholder로 순환시킨다.
 * 예시는 게임의 **표현 폭**을 한눈에 보여주도록 원소·효과·형태를 골고루 섞었다 —
 * "아무 문장이나 되고, 원소도 효과도 다양하다"를 예시만 보고 알게 한다.
 * (실제 판정은 이 문장에 얽매이지 않는다. 어디까지나 시동을 거는 마중물이다.)
 */
export const ONBOARDING_EXAMPLES: readonly string[] = [
  '거대한 화염구를 적에게 던진다',
  '얼음 가시가 땅에서 솟아오른다',
  '번개가 사방으로 퍼져나간다',
  '적들을 얼려 그 자리에 묶는다',
  '나를 감싸는 빛의 방패를 세운다',
  '치유의 빛으로 상처를 아문다',
  '휘몰아치는 폭풍이 적을 휩쓴다',
  '대지가 갈라지며 적을 삼킨다',
];

/**
 * 순환 예시 — 영창을 열 때마다 다음 문장. 상태는 호출측이 인덱스로 관리한다(순수 함수).
 * 음수·비정수·초과 인덱스도 안전하게 배열 범위로 감싼다.
 */
export function onboardingExampleAt(index: number): string {
  const n = ONBOARDING_EXAMPLES.length;
  const safe = Number.isFinite(index) ? Math.floor(index) : 0;
  return ONBOARDING_EXAMPLES[((safe % n) + n) % n];
}

/** placeholder용 — "예: {문장}" 형태로 감싼다 (입력값과 헷갈리지 않게) */
export function onboardingPlaceholderAt(index: number): string {
  return `예: ${onboardingExampleAt(index)}`;
}
