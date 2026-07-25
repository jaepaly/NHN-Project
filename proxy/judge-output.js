/**
 * Gemini 판정 원문의 아주 좁은 구조 복구.
 *
 * mechanic delivery와 실행 form은 서로 다른 enum이다. 모델이 올바르게 해석한
 * delivery를 form 칸에도 그대로 복사한 경우에만 현행 엔진의 가장 가까운 form으로
 * 바꾼다. 그 밖의 알 수 없는 form은 추측 복구하지 않고 클라이언트 검증기가 거부한다.
 */
const FORMS = new Set([
  'bolt', 'beam', 'wave', 'nova', 'rain', 'wall',
  'cage', 'orbit', 'summon', 'buff', 'zone', 'chain',
]);

const DELIVERY_FORM = {
  projectile: 'bolt',
  line: 'beam',
  sweep: 'wave',
};

function fallbackFormForDelivery(delivery, effect) {
  if (delivery in DELIVERY_FORM) return DELIVERY_FORM[delivery];
  if (delivery === 'placed') {
    if (effect === 'shield') return 'wall';
    if (effect === 'control') return 'cage';
    return 'zone';
  }
  if (delivery === 'attached') {
    if (effect === 'summon') return 'summon';
    if (effect === 'heal' || effect === 'buff') return 'buff';
    return 'orbit';
  }
  return null;
}

function normalizeSpecForm(value) {
  if (typeof value !== 'object' || value === null) return false;
  if (FORMS.has(value.form)) return false;
  if (typeof value.mechanic !== 'object' || value.mechanic === null) return false;

  const rawDelivery = value.mechanic.delivery;
  const delivery = typeof rawDelivery === 'object' && rawDelivery !== null
    ? rawDelivery.value
    : rawDelivery;
  // 교차 enum 누출이 확실한 경우만 복구한다. `banana` 같은 임의 오류는 그대로 거부.
  if (value.form !== delivery) return false;
  const fallback = fallbackFormForDelivery(delivery, value.effect);
  if (!fallback) return false;
  value.form = fallback;
  return true;
}

/**
 * 파싱된 Worker 출력 객체를 제자리에서 정규화하고 복구 횟수를 돌려준다.
 * 단일 spell과 spell_plan 내부 form spec에 같은 규칙을 적용한다.
 */
export function normalizeJudgeOutput(value) {
  if (typeof value !== 'object' || value === null) {
    return { value, repairs: 0 };
  }

  let repairs = normalizeSpecForm(value.spell) ? 1 : 0;
  const sequences = value.spell_plan?.sequences;
  if (Array.isArray(sequences)) {
    for (const sequence of sequences) {
      if (!Array.isArray(sequence?.behaviors)) continue;
      for (const behavior of sequence.behaviors) {
        if (behavior?.type === 'form' && normalizeSpecForm(behavior.spec)) repairs += 1;
      }
    }
  }
  return { value, repairs };
}
