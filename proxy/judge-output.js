/**
 * Gemini 판정 원문의 아주 좁은 구조 복구.
 *
 * mechanic delivery와 실행 form은 서로 다른 enum이다. 모델이 올바르게 해석한
 * delivery를 form 칸에도 그대로 복사한 경우에만 현행 엔진의 가장 가까운 form으로
 * 바꾼다. 그 밖의 알 수 없는 form은 추측 복구하지 않고 클라이언트 검증기가 거부한다.
 */
const FORMS = new Set([
  'bolt', 'beam', 'slash', 'wave', 'nova', 'rain', 'wall',
  'cage', 'orbit', 'summon', 'buff', 'zone', 'chain',
]);

const DELIVERY_FORM = {
  projectile: 'bolt',
  line: 'beam',
  sweep: 'wave',
};

// Gemini가 반복적으로 만드는 시각 동의어 중 엔진 enum과 의미가 일대일인 것만 접는다.
// pulse는 중심에서 퍼지는 맥동이므로 nova로 보존한다. 임의의 미지원 form은 여전히 거부한다.
const FORM_ALIAS = { pulse: 'nova' };

export function repairExtraMoveBraceJson(raw) {
  if (typeof raw !== 'string') return raw;
  return raw.replace(/(\{"type":"move"[^{}]*?)\}\}(\s*\])/g, '$1}$2');
}

export function repairMalformedDistanceKeyJson(raw) {
  if (typeof raw !== 'string') return raw;
  return raw.replace(/([,{]\s*)-distance\s*:/g, '$1"distance":');
}

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
  const alias = FORM_ALIAS[value.form];
  if (alias) {
    value.form = alias;
    return true;
  }
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

/** Enforce the ordinary-incantation budget after model generation. */
export function capSpellPlanPower(value, maximumPower = 80) {
  const plan = value?.disposition === 'cast' ? value.spell_plan : null;
  if (!plan || typeof plan.power !== 'number' || !Number.isFinite(plan.power)) return 0;
  const cappedPower = Math.min(plan.power, maximumPower);
  let repairs = 0;
  if (cappedPower !== plan.power) {
    plan.power = cappedPower;
    repairs += 1;
  }
  const maximumDurationMs = Math.min(3000, 500 + cappedPower * 25);
  if (typeof plan.durationMs === 'number' && plan.durationMs > maximumDurationMs) {
    plan.durationMs = maximumDurationMs;
    repairs += 1;
  }
  return repairs;
}

/**
 * A plan made only of waits has no executable effect. Keep this check deliberately
 * structural: it does not guess the incantation's meaning.
 */
export function isWaitOnlySpellPlan(value) {
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences) || sequences.length === 0) return false;

  let behaviorCount = 0;
  for (const sequence of sequences) {
    if (!Array.isArray(sequence?.behaviors)) continue;
    for (const behavior of sequence.behaviors) {
      behaviorCount += 1;
      if (behavior?.type === 'form' || behavior?.type === 'move') return false;
    }
  }
  return behaviorCount > 0;
}

/**
 * Player movement is choreography and needs at least one executable form
 * somewhere in the same plan. The form effect is intentionally unrestricted.
 */
export function hasMoveWithoutFormSpellPlan(value) {
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences) || sequences.length === 0) return false;

  let hasMove = false;
  let hasForm = false;
  for (const sequence of sequences) {
    if (!Array.isArray(sequence?.behaviors)) continue;
    for (const behavior of sequence.behaviors) {
      if (behavior?.type === 'move') hasMove = true;
      if (behavior?.type === 'form') hasForm = true;
    }
  }
  return hasMove && !hasForm;
}

export function hasMoveSpellPlan(value) {
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return false;
  return sequences.some((sequence) => (
    Array.isArray(sequence?.behaviors)
    && sequence.behaviors.some((behavior) => behavior?.type === 'move')
  ));
}

const STRONG_CHANGE_SIGNAL = /(갈라|분열|개화|변신|융합|붕괴|부활|각성)/u;

/**
 * Strong state-change wording must expose at least two executable events.
 * This is only a retry predicate; it does not guess or synthesize the missing
 * transition locally.
 */
export function isUnexpectedAtomicChangeCast(value, text) {
  if (
    typeof text !== 'string'
    || !STRONG_CHANGE_SIGNAL.test(text)
    || value?.disposition !== 'cast'
  ) return false;
  if (value?.spell && !value?.spell_plan) return true;

  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return false;
  const executableCount = sequences.reduce((count, sequence) => (
    count + (Array.isArray(sequence?.behaviors)
      ? sequence.behaviors.filter((behavior) => (
        behavior?.type === 'form' || behavior?.type === 'move'
      )).length
      : 0)
  ), 0);
  return executableCount < 2;
}

/**
 * Explicit long-distance wording must not silently collapse to the engine's
 * 180px default. Only fill omitted distances; preserve every distance selected
 * by the model and do not infer long movement from generic movement verbs.
 */
export function fillExplicitLongMoveDistances(value, text, distance = 320) {
  if (
    typeof text !== 'string'
    || !/(멀리|길게|전장을?\s*(?:가로질러|가로지르)|크게\s*(?:도약|뛰어|뛴))/u.test(text)
  ) return 0;
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return 0;

  let repairs = 0;
  for (const sequence of sequences) {
    if (!Array.isArray(sequence?.behaviors)) continue;
    for (const behavior of sequence.behaviors) {
      if (behavior?.type !== 'move' || behavior.distance !== undefined) continue;
      behavior.distance = distance;
      repairs += 1;
    }
  }
  return repairs;
}

/**
 * A player explicitly completing a lap needs at least two readable direction
 * segments. Existing multi-move choreography is preserved except that omitted
 * or sub-240px distances are raised to a readable minimum. If Gemini emitted
 * exactly one move, turn it into a right/left long traversal pair without
 * inventing another form or changing the chosen effect.
 */
export function ensureExplicitCircularMoveChoreography(value, text, distance = 300) {
  if (
    typeof text !== 'string'
    || !/(한 바퀴|원을\s*그리며|주위를\s*선회)/u.test(text)
  ) return 0;
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return 0;

  const moves = [];
  for (let sequenceIndex = 0; sequenceIndex < sequences.length; sequenceIndex += 1) {
    const behaviors = sequences[sequenceIndex]?.behaviors;
    if (!Array.isArray(behaviors)) continue;
    for (const behavior of behaviors) {
      if (behavior?.type === 'move') moves.push({ sequenceIndex, behavior });
    }
  }
  if (moves.length === 0) return 0;
  if (moves.length >= 2) {
    let repairs = 0;
    for (const { behavior } of moves) {
      if (typeof behavior.distance === 'number' && behavior.distance >= 240) continue;
      behavior.distance = typeof behavior.distance === 'number'
        ? Math.max(240, behavior.distance)
        : distance;
      repairs += 1;
    }
    return repairs;
  }

  const [{ sequenceIndex, behavior }] = moves;
  const segmentDistance = typeof behavior.distance === 'number'
    ? Math.max(240, behavior.distance)
    : distance;
  behavior.destination = 'custom-vector';
  behavior.angle = 90;
  behavior.distance = segmentDistance;
  const returnMove = {
    type: 'move',
    destination: 'custom-vector',
    element: behavior.element,
    angle: -90,
    distance: segmentDistance,
  };
  sequences.splice(sequenceIndex + 1, 0, {
    durationWeight: sequences[sequenceIndex]?.durationWeight ?? 1,
    behaviors: [returnMove],
  });
  return 1;
}

/**
 * "답보" denotes repeated magical footfalls. If Gemini compressed it to one
 * move+damage beat, expand that existing beat once with a different direction.
 * Do not synthesize a new effect: clone only the already selected move/form
 * choreography and let local power allocation divide the form budget.
 */
export function ensureRepeatedFootstepChoreography(value, text) {
  if (typeof text !== 'string' || !/답보/u.test(text)) return 0;
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return 0;

  const moveEntries = [];
  for (let sequenceIndex = 0; sequenceIndex < sequences.length; sequenceIndex += 1) {
    const behaviors = sequences[sequenceIndex]?.behaviors;
    if (!Array.isArray(behaviors)) continue;
    const move = behaviors.find((behavior) => behavior?.type === 'move');
    if (move) moveEntries.push({ sequenceIndex, move, behaviors });
  }
  if (moveEntries.length !== 1) return 0;

  const [{ sequenceIndex, move, behaviors }] = moveEntries;
  const hasDamage = behaviors.some((behavior) => (
    behavior?.type === 'form' && behavior?.spec?.effect === 'damage'
  ));
  if (!hasDamage) return 0;

  const distance = typeof move.distance === 'number' ? Math.max(220, move.distance) : 240;
  move.destination = 'custom-vector';
  move.angle = -60;
  move.distance = distance;
  const repeatedBehaviors = structuredClone(behaviors);
  const repeatedMove = repeatedBehaviors.find((behavior) => behavior?.type === 'move');
  repeatedMove.angle = 60;
  sequences.splice(sequenceIndex + 1, 0, {
    durationWeight: sequences[sequenceIndex]?.durationWeight ?? 1,
    behaviors: repeatedBehaviors,
  });
  return 1;
}

function explicitRapidFireCount(text) {
  const digit = text.match(/([2-4])\s*(?:발|번|차례)/u);
  if (digit) return Number.parseInt(digit[1], 10);
  if (/(?:두|둘)\s*(?:발|번|차례)/u.test(text)) return 2;
  if (/(?:세|셋|삼)\s*(?:발|번|차례)/u.test(text)) return 3;
  if (/(?:네|넷|사)\s*(?:발|번|차례)/u.test(text)) return 4;
  return 3;
}

/**
 * Rapid-fire cadence is structural, not a new semantic effect. When Gemini
 * correctly chooses a single spell but loses the cadence, reuse that exact spec
 * as 2~4 form beats separated by wait-only sequences.
 */
export function expandRapidFireSingleSpell(value, text) {
  if (
    typeof text !== 'string'
    || !/(연사|속사|연발|잇달아)/u.test(text)
    || value?.disposition !== 'cast'
    || !value?.spell
    || value?.spell_plan
  ) return 0;

  const count = explicitRapidFireCount(text);
  const source = structuredClone(value.spell);
  const planPower = typeof source.power === 'number' ? source.power : 70;
  source.power = 0;
  source.cost = 0;
  const sequences = [];
  for (let index = 0; index < count; index += 1) {
    const spec = structuredClone(source);
    if (typeof spec.name === 'string') spec.name = `${index + 1}발 ${spec.name}`.slice(0, 12);
    sequences.push({
      durationWeight: 2,
      behaviors: [{ type: 'form', powerWeight: 1, spec }],
    });
    if (index < count - 1) {
      sequences.push({ durationWeight: 1, behaviors: [{ type: 'wait' }] });
    }
  }
  delete value.spell;
  value.spell_plan = {
    name: typeof source.name === 'string' ? `${source.name} 연사`.slice(0, 12) : '연속 발사',
    power: planPower,
    durationMs: count * 400,
    sequences,
  };
  return 1;
}

/**
 * Candidate 56 output contract: every successful cast travels through spell_plan.
 * Keep legacy `spell` as accepted Worker/model input, then wrap it without changing
 * its spec or power. A short single beat preserves the former immediate-cast feel;
 * this function must not invent movement, waits, extra effects, or extra forms.
 */
export function promoteCastSpellToAtomicPlan(value, durationMs = 80) {
  if (
    value?.disposition !== 'cast'
    || !value?.spell
    || value?.spell_plan
  ) return 0;

  const spec = structuredClone(value.spell);
  const power = typeof spec.power === 'number' ? spec.power : 0;
  const name = typeof spec.name === 'string' ? spec.name : '마법';
  spec.power = 0;
  spec.cost = 0;
  delete value.spell;
  value.spell_plan = {
    name,
    power,
    durationMs,
    sequences: [{
      durationWeight: 1,
      behaviors: [{ type: 'form', powerWeight: 1, spec }],
    }],
  };
  return 1;
}

export function hasDamageFormSpellPlan(value) {
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return false;
  return sequences.some((sequence) => (
    Array.isArray(sequence?.behaviors)
    && sequence.behaviors.some((behavior) => (
      behavior?.type === 'form' && behavior?.spec?.effect === 'damage'
    ))
  ));
}

export function hasTooManySpellPlanElements(value, maximumElements = 2) {
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return false;
  const elements = new Set();
  for (const sequence of sequences) {
    if (!Array.isArray(sequence?.behaviors)) continue;
    for (const behavior of sequence.behaviors) {
      if (behavior?.type !== 'form' || !behavior.spec) continue;
      if (typeof behavior.spec.element_primary === 'string') elements.add(behavior.spec.element_primary);
      if (typeof behavior.spec.element_secondary === 'string') elements.add(behavior.spec.element_secondary);
      if (elements.size > maximumElements) return true;
    }
  }
  return false;
}

/** Final fail-safe after the model has already had a correction attempt. */
export function limitSpellPlanElements(value, maximumElements = 2) {
  if (!hasTooManySpellPlanElements(value, maximumElements)) return 0;
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return 0;

  const primaryCounts = new Map();
  const firstSeen = new Map();
  let order = 0;
  for (const sequence of sequences) {
    if (!Array.isArray(sequence?.behaviors)) continue;
    for (const behavior of sequence.behaviors) {
      const primary = behavior?.type === 'form' ? behavior?.spec?.element_primary : null;
      if (typeof primary !== 'string') continue;
      if (!firstSeen.has(primary)) firstSeen.set(primary, order++);
      primaryCounts.set(primary, (primaryCounts.get(primary) ?? 0) + 1);
    }
  }
  const allowed = new Set([...primaryCounts.keys()]
    .sort((left, right) => (
      (primaryCounts.get(right) - primaryCounts.get(left))
      || (firstSeen.get(left) - firstSeen.get(right))
    ))
    .slice(0, maximumElements));

  let repairs = 0;
  for (const sequence of sequences) {
    if (!Array.isArray(sequence?.behaviors)) continue;
    sequence.behaviors = sequence.behaviors.filter((behavior) => {
      if (behavior?.type !== 'form') return true;
      if (!allowed.has(behavior?.spec?.element_primary)) {
        repairs += 1;
        return false;
      }
      if (
        typeof behavior.spec.element_secondary === 'string'
        && !allowed.has(behavior.spec.element_secondary)
      ) {
        behavior.spec.element_secondary = null;
        repairs += 1;
      }
      return true;
    });
  }
  value.spell_plan.sequences = sequences.filter((sequence) => (
    Array.isArray(sequence?.behaviors) && sequence.behaviors.length > 0
  ));
  return repairs;
}

export function hasNonDamageFormSpellPlan(value) {
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return false;
  return sequences.some((sequence) => (
    Array.isArray(sequence?.behaviors)
    && sequence.behaviors.some((behavior) => (
      behavior?.type === 'form'
      && typeof behavior?.spec?.effect === 'string'
      && behavior.spec.effect !== 'damage'
    ))
  ));
}

export function removeNonDamageFormBehaviors(value) {
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return 0;

  let removals = 0;
  for (const sequence of sequences) {
    if (!Array.isArray(sequence?.behaviors)) continue;
    const kept = sequence.behaviors.filter((behavior) => {
      const remove = (
        behavior?.type === 'form'
        && typeof behavior?.spec?.effect === 'string'
        && behavior.spec.effect !== 'damage'
      );
      if (remove) removals += 1;
      return !remove;
    });
    sequence.behaviors = kept;
  }
  value.spell_plan.sequences = sequences.filter((sequence) => (
    Array.isArray(sequence?.behaviors) && sequence.behaviors.length > 0
  ));
  return removals;
}

export function removeDamageFormBehaviors(value) {
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return 0;

  let removals = 0;
  for (const sequence of sequences) {
    if (!Array.isArray(sequence?.behaviors)) continue;
    const kept = sequence.behaviors.filter((behavior) => {
      const remove = (
        behavior?.type === 'form' && behavior?.spec?.effect === 'damage'
      );
      if (remove) removals += 1;
      return !remove;
    });
    sequence.behaviors = kept;
  }
  value.spell_plan.sequences = sequences.filter((sequence) => (
    Array.isArray(sequence?.behaviors) && sequence.behaviors.length > 0
  ));
  return removals;
}

export function hasUnsupportedForm(value) {
  if (value?.spell && !FORMS.has(value.spell.form)) return true;
  const sequences = value?.spell_plan?.sequences;
  if (!Array.isArray(sequences)) return false;
  return sequences.some((sequence) => (
    Array.isArray(sequence?.behaviors)
    && sequence.behaviors.some((behavior) => (
      behavior?.type === 'form' && !FORMS.has(behavior?.spec?.form)
    ))
  ));
}
