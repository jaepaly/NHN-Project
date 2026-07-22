import assert from 'node:assert/strict';
import {
  ONBOARDING_EXAMPLES,
  onboardingExampleAt,
  onboardingPlaceholderAt,
} from '../src/spell/onboardingExamples';

// 예시가 비면 온보딩이 무의미하다 — 최소 한 묶음은 있어야 한다.
assert.ok(ONBOARDING_EXAMPLES.length >= 4, '예시 문장이 너무 적다');

// 순환: 인덱스가 배열을 넘어가도 처음으로 되돌아온다 (영창을 계속 열어도 안전).
const n = ONBOARDING_EXAMPLES.length;
assert.equal(onboardingExampleAt(0), ONBOARDING_EXAMPLES[0]);
assert.equal(onboardingExampleAt(n), ONBOARDING_EXAMPLES[0], '한 바퀴 돌면 처음으로');
assert.equal(onboardingExampleAt(n + 1), ONBOARDING_EXAMPLES[1]);

// 방어: 음수·비정수·비유한값도 배열 범위 안으로 안전하게 감싼다.
assert.equal(onboardingExampleAt(-1), ONBOARDING_EXAMPLES[n - 1], '음수는 뒤에서부터');
assert.equal(onboardingExampleAt(1.9), ONBOARDING_EXAMPLES[1], '소수는 내림');
assert.equal(onboardingExampleAt(Number.NaN), ONBOARDING_EXAMPLES[0], 'NaN은 0으로');
assert.equal(onboardingExampleAt(Infinity), ONBOARDING_EXAMPLES[0], 'Infinity는 0으로');

// placeholder는 입력값과 헷갈리지 않게 "예:" 접두가 붙는다.
for (let i = 0; i < n; i += 1) {
  const ph = onboardingPlaceholderAt(i);
  assert.ok(ph.startsWith('예: '), `placeholder 접두 누락: ${ph}`);
  assert.ok(ph.includes(onboardingExampleAt(i)), 'placeholder에 예시 문장 포함');
}

// 표현 폭을 보여주려면 예시가 서로 달라야 한다 (원소·효과 다양성 대리 지표).
assert.equal(new Set(ONBOARDING_EXAMPLES).size, n, '중복 예시가 있으면 다양성 인상이 약해진다');

// 예시는 실제로 판정을 통과해 마법이 되어야 한다 — 안내가 거짓이 되면 안 된다.
const { MockJudge } = await import('../src/spell/mockJudge');
const judge = new MockJudge();
for (const example of ONBOARDING_EXAMPLES) {
  const result = await judge.judge(example);
  assert.equal(result.disposition, 'cast', `예시가 불발됨: "${example}"`);
}

console.log(`Onboarding regression: ${n}개 예시 · 순환/방어/판정 통과`);
