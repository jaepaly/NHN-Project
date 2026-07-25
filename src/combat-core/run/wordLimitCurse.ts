export const WORD_LIMIT_CURSE_CONFIG = {
  budget: 30,
  broadLetterCost: 5,
  latinOrNumberCost: 3,
  symbolCost: 1,
  minimumManualCasts: 5,
  /** 상위 25% 평균이 이 값 이상이면 긴 영창 습관 점수를 1로 본다. */
  behaviorReferenceCost: 45,
} as const;

/**
 * 사용자가 보는 grapheme 단위의 언령 비용.
 * IME 조합 중 입력을 자르지 않고 UI·로컬 차단·런 기억이 같은 함수를 공유한다.
 */
export function wordLimitCost(text: string): number {
  return graphemes(text.trim()).reduce((total, grapheme) => (
    total + wordLimitGraphemeCost(grapheme)
  ), 0);
}

export function wordLimitGraphemeCost(grapheme: string): number {
  if (!grapheme || /^\s+$/u.test(grapheme)) return 0;
  if (/\p{Script=Latin}|\p{Number}/u.test(grapheme)) {
    return WORD_LIMIT_CURSE_CONFIG.latinOrNumberCost;
  }
  if (/\p{Letter}/u.test(grapheme)) {
    return WORD_LIMIT_CURSE_CONFIG.broadLetterCost;
  }
  return WORD_LIMIT_CURSE_CONFIG.symbolCost;
}

/** 성공한 수동 영창 중 비용이 가장 높은 상위 25%의 평균. */
export function topQuartileWordLimitCost(texts: readonly string[]): number {
  if (texts.length === 0) return 0;
  const costs = texts.map(wordLimitCost).sort((a, b) => b - a);
  const sampleCount = Math.max(1, Math.ceil(costs.length * 0.25));
  const top = costs.slice(0, sampleCount);
  return top.reduce((sum, cost) => sum + cost, 0) / top.length;
}

export function wordLimitBehaviorWeight(
  topQuartileAverage: number,
  manualCastCount: number,
  neutralWeight: number,
): number {
  if (manualCastCount < WORD_LIMIT_CURSE_CONFIG.minimumManualCasts) {
    return clamp01(neutralWeight);
  }
  return clamp01(topQuartileAverage / WORD_LIMIT_CURSE_CONFIG.behaviorReferenceCost);
}

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });
    return [...segmenter.segment(text)].map((part) => part.segment);
  }
  return Array.from(text);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
