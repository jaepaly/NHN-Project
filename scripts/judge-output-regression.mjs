import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  capSpellPlanPower,
  ensureExplicitCircularMoveChoreography,
  ensureRepeatedFootstepChoreography,
  expandRapidFireSingleSpell,
  fillExplicitLongMoveDistances,
  hasDamageFormSpellPlan,
  hasNonDamageFormSpellPlan,
  hasMoveWithoutFormSpellPlan,
  hasMoveSpellPlan,
  hasTooManySpellPlanElements,
  hasUnsupportedForm,
  isWaitOnlySpellPlan,
  isUnexpectedAtomicChangeCast,
  limitSpellPlanElements,
  normalizeJudgeOutput,
  promoteCastSpellToAtomicPlan,
  removeDamageFormBehaviors,
  removeNonDamageFormBehaviors,
  repairExtraMoveBraceJson,
  repairMalformedDistanceKeyJson,
} from '../proxy/judge-output.js';

const pulsePlan = {
  spell_plan: {
    sequences: [{ behaviors: [{ type: 'form', spec: { form: 'pulse' } }] }],
  },
};
assert.equal(normalizeJudgeOutput(pulsePlan).repairs, 1, '반복되는 pulse 별칭을 로컬 복구한다');
assert.equal(pulsePlan.spell_plan.sequences[0].behaviors[0].spec.form, 'nova');

const workerSource = readFileSync('proxy/worker.js', 'utf8');
const promptStart = workerSource.indexOf('const JUDGE_PROMPT = `');
const promptEnd = workerSource.indexOf('플레이어의 주문:`;', promptStart);
assert.ok(promptStart >= 0 && promptEnd > promptStart, '활성 JUDGE_PROMPT 범위를 찾는다');
const activePrompt = workerSource.slice(promptStart, promptEnd);
const rule7 = activePrompt.slice(activePrompt.indexOf('7. 모든 cast는'));
const rule3 = activePrompt.slice(activePrompt.indexOf('3. cast라면'), activePrompt.indexOf('4. power와 cost'));
const rule4 = activePrompt.slice(activePrompt.indexOf('4. power와 cost'), activePrompt.indexOf('5. effect가 summon'));
assert.ok(rule3.includes('전체 이미지에서 강하게 함축되면'), '추상적인 지원 목적을 보존한다');
assert.ok(rule3.includes('전투 주문의 기본값으로 damage'), '목적이 애매한 영창은 damage를 기본값으로 둔다');
assert.ok(rule3.includes('순수 공격 입력은 모든 공격 사건을 damage로 유지'), '순수 공격 effect 경계를 보존한다');
assert.ok(rule3.includes('원소마다 서로 다른 effect를 배정하지 않는다'), '다원소 집합에 effect 역할을 임의 배정하지 않는다');
assert.ok(rule3.includes('때만 control을 선택'), '근거 없는 control 혼합을 금지한다');
assert.ok(rule3.includes('분위기, 넓은 범위, 화려한 연출만으로 damage를 control로 바꾸지 않는다'), '분위기만으로 control을 창작하지 않는다');
assert.ok(rule4.includes('일반 영창의 power는 30~80'), '일반 영창 power 상한을 80으로 제한한다');
assert.ok(rule4.includes('원소 수, behavior·sequence 수, 단순 키워드 나열은 power 가점 근거가 아니다'), '키워드와 구조 수를 power 가점에서 제외한다');
assert.ok(rule4.includes('짧아도 사건과 관계가 선명하면 창의적'), '짧은 창의적 영창을 보상한다');
assert.ok(rule4.includes('관계 없는 두 원소 "불과 얼음"은 50~60'), '단순 집합과 창의적 관계의 power 기준점을 둔다');
assert.ok(rule7.includes('behavior type은 form|wait뿐이다'), '7번은 form|wait 계약이다');
assert.ok(rule7.includes('복합 plan·복수 원소·병렬 behavior라는 이유만으로 effect 종류를 늘리지 않는다'), '복합 구성과 effect 다양성을 분리한다');
assert.ok(rule7.includes('사건·관계·변화·공간·시간·결말의 밀도에 비례'), '창의성을 의미 구조의 밀도로 판정한다');
assert.ok(rule7.includes('단일 원소라도 입력에 충분한 관계와 변화가 있으면'), '단일 원소 창의성도 풍부한 안무로 보상한다');
assert.ok(rule7.includes('"팔원소"와 "팔원소 대합창"'), '다원소 집합의 damage-only 대조를 명시한다');
assert.ok(rule3.includes('plan 전체에서 사용하는 고유 원소는 최대 2개'), '일반 영창 고유 원소를 2개로 제한한다');
assert.ok(rule7.includes('같은 sequence의 behaviors로 병렬 배치'), '같은 sequence 병렬 계약을 보존한다');
assert.ok(rule7.includes('어떤 sequence도 5개를 넘기지 않는다'), '대규모 명시 사건도 behavior 상한을 지킨다');
assert.ok(rule7.includes('wait-only sequence'), 'wait-only 시간 간격 계약을 보존한다');
assert.ok(rule7.includes('fire|water|lightning|ice|earth|wind|light|dark'), '8원소 enum을 명시한다');
assert.equal(/"type"\s*:\s*"move"/u.test(rule7), false, '7번 예시가 move를 출력하지 않는다');
assert.equal(/"name":"명암의 교차"[\s\S]*?"effect":"control"/u.test(rule7), false, '순수 공격 예시에 control을 섞지 않는다');
for (const removedHook of [
  'fillExplicitLongMoveDistances(parsed, text)',
  'ensureExplicitCircularMoveChoreography(parsed, text)',
  'ensureRepeatedFootstepChoreography(parsed, text)',
]) {
  assert.equal(workerSource.includes(removedHook), false, `${removedHook} 실행 경로 제거`);
}

const atomicCast = {
  schema_version: 2,
  disposition: 'cast',
  spell: {
    name: '화염구',
    effect: 'damage',
    target: 'enemy',
    element_primary: 'fire',
    element_secondary: null,
    form: 'bolt',
    size: 'medium',
    speed: 'normal',
    status: ['burn'],
    power: 60,
    cost: 36,
  },
};
assert.equal(promoteCastSpellToAtomicPlan(atomicCast), 1);
assert.equal(atomicCast.spell, undefined);
assert.equal(atomicCast.spell_plan.name, '화염구');
assert.equal(atomicCast.spell_plan.power, 60);
assert.equal(atomicCast.spell_plan.durationMs, 80);
assert.equal(atomicCast.spell_plan.sequences.length, 1);
assert.equal(atomicCast.spell_plan.sequences[0].behaviors.length, 1);
assert.equal(atomicCast.spell_plan.sequences[0].behaviors[0].type, 'form');
assert.equal(atomicCast.spell_plan.sequences[0].behaviors[0].spec.power, 0);
assert.equal(atomicCast.spell_plan.sequences[0].behaviors[0].spec.cost, 0);
assert.equal(promoteCastSpellToAtomicPlan(atomicCast), 0);

const overBudgetPlan = {
  schema_version: 2,
  disposition: 'cast',
  spell_plan: { name: '팔원소', power: 90, durationMs: 2800, sequences: [] },
};
assert.equal(capSpellPlanPower(overBudgetPlan), 2);
assert.equal(overBudgetPlan.spell_plan.power, 80);
assert.equal(overBudgetPlan.spell_plan.durationMs, 2500);
assert.equal(capSpellPlanPower(overBudgetPlan), 0);

assert.equal(hasTooManySpellPlanElements({
  spell_plan: { sequences: [{ behaviors: [
    { type: 'form', spec: { element_primary: 'fire', element_secondary: 'ice' } },
    { type: 'form', spec: { element_primary: 'lightning', element_secondary: null } },
  ] }] },
}), true);
assert.equal(hasTooManySpellPlanElements({
  spell_plan: { sequences: [{ behaviors: [
    { type: 'form', spec: { element_primary: 'fire', element_secondary: 'ice' } },
    { type: 'form', spec: { element_primary: 'fire', element_secondary: null } },
  ] }] },
}), false);
const overElementPlan = {
  disposition: 'cast',
  spell_plan: { sequences: [
    { behaviors: [
      { type: 'form', spec: { element_primary: 'fire', element_secondary: 'light' } },
      { type: 'form', spec: { element_primary: 'fire', element_secondary: null } },
      { type: 'form', spec: { element_primary: 'ice', element_secondary: null } },
      { type: 'form', spec: { element_primary: 'wind', element_secondary: null } },
    ] },
  ] },
};
assert.equal(limitSpellPlanElements(overElementPlan), 2);
assert.deepEqual(
  overElementPlan.spell_plan.sequences[0].behaviors.map((behavior) => behavior.spec.element_primary),
  ['fire', 'fire', 'ice'],
);
assert.equal(overElementPlan.spell_plan.sequences[0].behaviors[0].spec.element_secondary, null);
assert.equal(hasTooManySpellPlanElements(overElementPlan), false);

const existingPlanCast = {
  disposition: 'cast',
  spell_plan: { name: '기존', power: 50, durationMs: 500, sequences: [] },
};
assert.equal(promoteCastSpellToAtomicPlan(existingPlanCast), 0);
assert.equal(isUnexpectedAtomicChangeCast({
  disposition: 'cast',
  spell: { form: 'nova' },
}, '황혼이 갈라진다'), true);
assert.equal(isUnexpectedAtomicChangeCast({
  disposition: 'cast',
  spell_plan: {
    sequences: [{ behaviors: [{ type: 'form', spec: { form: 'nova' } }] }],
  },
}, '심연의 개화'), true);
assert.equal(isUnexpectedAtomicChangeCast({
  disposition: 'cast',
  spell_plan: {
    sequences: [{
      behaviors: [
        { type: 'form', spec: { form: 'zone' } },
        { type: 'form', spec: { form: 'nova' } },
      ],
    }],
  },
}, '심연의 개화'), false);
assert.equal(isUnexpectedAtomicChangeCast(atomicCast, '파이어볼'), false);

assert.equal(isWaitOnlySpellPlan({ spell: { form: 'nova' } }), false);
assert.equal(isWaitOnlySpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'move', destination: 'cast-direction', element: 'wind' }] },
    ],
  },
}), false);
assert.equal(isWaitOnlySpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'form', spec: { form: 'nova' } }] },
      { behaviors: [{ type: 'wait' }] },
    ],
  },
}), false);
assert.equal(isWaitOnlySpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'wait' }] },
      { behaviors: [{ type: 'wait' }] },
    ],
  },
}), true);
assert.equal(isWaitOnlySpellPlan({ spell_plan: { sequences: [] } }), false);
assert.equal(hasUnsupportedForm({ spell: { form: 'wave' } }), false);
assert.equal(hasUnsupportedForm({ spell: { form: 'storm' } }), true);
assert.equal(hasUnsupportedForm({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'move', destination: 'cast-direction', element: 'wind' }] },
      { behaviors: [{ type: 'form', spec: { form: 'nova' } }] },
    ],
  },
}), false);
assert.equal(hasUnsupportedForm({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'form', spec: { form: 'storm' } }] },
    ],
  },
}), true);
assert.equal(hasMoveWithoutFormSpellPlan({ spell: { effect: 'buff', form: 'buff' } }), false);
assert.equal(hasMoveWithoutFormSpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'move', destination: 'cast-direction', element: 'wind' }] },
    ],
  },
}), true);
assert.equal(hasMoveWithoutFormSpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'move', destination: 'cast-direction', element: 'wind' }] },
      { behaviors: [{ type: 'form', spec: { effect: 'buff', form: 'buff' } }] },
    ],
  },
}), false);
assert.equal(hasMoveWithoutFormSpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [
        { type: 'move', destination: 'cast-direction', element: 'wind' },
        { type: 'form', spec: { effect: 'damage', form: 'nova' } },
      ] },
    ],
  },
}), false);
assert.equal(hasMoveSpellPlan({ spell: { effect: 'damage', form: 'bolt' } }), false);
assert.equal(hasMoveSpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'move', destination: 'cast-direction', element: 'wind' }] },
    ],
  },
}), true);
const explicitLongPlan = {
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'move', destination: 'cast-direction', element: 'wind' }] },
      { behaviors: [{ type: 'move', destination: 'away-from-target', element: 'wind', distance: 380 }] },
    ],
  },
};
assert.equal(fillExplicitLongMoveDistances(explicitLongPlan, '전장을 가로질러 되돌아온다'), 1);
assert.equal(explicitLongPlan.spell_plan.sequences[0].behaviors[0].distance, 320);
assert.equal(explicitLongPlan.spell_plan.sequences[1].behaviors[0].distance, 380);
assert.equal(fillExplicitLongMoveDistances(explicitLongPlan, '빠르게 움직인다'), 0);
const circularPlan = {
  spell_plan: {
    sequences: [
      {
        durationWeight: 2,
        behaviors: [
          { type: 'form', spec: { effect: 'summon', form: 'summon' } },
          { type: 'move', destination: 'random-direction', element: 'light' },
        ],
      },
      { durationWeight: 1, behaviors: [{ type: 'form', spec: { effect: 'control', form: 'nova' } }] },
    ],
  },
};
assert.equal(ensureExplicitCircularMoveChoreography(circularPlan, '전장을 한 바퀴 돈다'), 1);
assert.deepEqual(
  circularPlan.spell_plan.sequences.flatMap((sequence) => sequence.behaviors)
    .filter((behavior) => behavior.type === 'move'),
  [
    { type: 'move', destination: 'custom-vector', element: 'light', angle: 90, distance: 300 },
    { type: 'move', destination: 'custom-vector', element: 'light', angle: -90, distance: 300 },
  ],
);
assert.equal(ensureExplicitCircularMoveChoreography(circularPlan, '전장을 한 바퀴 돈다'), 0);
const shortCircularPlan = {
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'move', destination: 'custom-vector', element: 'wind', angle: 0, distance: 180 }] },
      { behaviors: [{ type: 'move', destination: 'custom-vector', element: 'wind', angle: 180 }] },
      { behaviors: [{ type: 'form', spec: { effect: 'control', form: 'nova' } }] },
    ],
  },
};
assert.equal(ensureExplicitCircularMoveChoreography(shortCircularPlan, '원을 그리며 돈다'), 2);
assert.deepEqual(
  shortCircularPlan.spell_plan.sequences.slice(0, 2)
    .map((sequence) => sequence.behaviors[0].distance),
  [240, 300],
);
const footstepPlan = {
  spell_plan: {
    sequences: [
      {
        durationWeight: 1,
        behaviors: [
          { type: 'move', destination: 'target-direction', element: 'wind', distance: 200 },
          { type: 'form', powerWeight: 1, spec: { effect: 'damage', form: 'nova' } },
        ],
      },
    ],
  },
};
assert.equal(ensureRepeatedFootstepChoreography(footstepPlan, '허공답보'), 1);
assert.equal(footstepPlan.spell_plan.sequences.length, 2);
assert.deepEqual(
  footstepPlan.spell_plan.sequences.map((sequence) => sequence.behaviors[0]),
  [
    { type: 'move', destination: 'custom-vector', element: 'wind', distance: 220, angle: -60 },
    { type: 'move', destination: 'custom-vector', element: 'wind', distance: 220, angle: 60 },
  ],
);
assert.equal(ensureRepeatedFootstepChoreography(footstepPlan, '허공답보'), 0);
const rapidSingle = {
  schema_version: 2,
  disposition: 'cast',
  spell: {
    name: '마력탄',
    effect: 'damage',
    target: 'enemy',
    element_primary: 'light',
    element_secondary: null,
    form: 'bolt',
    size: 'medium',
    speed: 'fast',
    status: [],
    power: 72,
    cost: 43,
  },
};
assert.equal(expandRapidFireSingleSpell(rapidSingle, '마력탄 연사'), 1);
assert.equal(rapidSingle.spell, undefined);
assert.equal(rapidSingle.spell_plan.power, 72);
assert.equal(rapidSingle.spell_plan.durationMs, 1200);
assert.deepEqual(
  rapidSingle.spell_plan.sequences.map((sequence) => sequence.behaviors[0].type),
  ['form', 'wait', 'form', 'wait', 'form'],
);
for (const sequence of rapidSingle.spell_plan.sequences) {
  const spec = sequence.behaviors[0].spec;
  if (spec) {
    assert.equal(spec.power, 0);
    assert.equal(spec.cost, 0);
  }
}
assert.equal(expandRapidFireSingleSpell(rapidSingle, '마력탄 연사'), 0);

for (const [text, expectedForms, expectedWaits] of [
  ['별빛 탄환 두 발 연발', 2, 1],
  ['얼음 송곳을 세 번 속사', 3, 2],
  ['바람 화살 4발 연사', 4, 3],
]) {
  const explicitRapid = {
    schema_version: 2,
    disposition: 'cast',
    spell: {
      name: '시험탄',
      effect: 'damage',
      target: 'enemy',
      element_primary: 'light',
      element_secondary: null,
      form: 'bolt',
      size: 'medium',
      speed: 'fast',
      status: [],
      power: 68,
      cost: 41,
    },
  };
  assert.equal(expandRapidFireSingleSpell(explicitRapid, text), 1, `${text}: 연사 확장`);
  const types = explicitRapid.spell_plan.sequences.map((sequence) => sequence.behaviors[0].type);
  assert.equal(types.filter((type) => type === 'form').length, expectedForms, `${text}: 명시 form 수`);
  assert.equal(types.filter((type) => type === 'wait').length, expectedWaits, `${text}: form 사이 wait 수`);
}

for (const text of [
  '서리 포대 일제사격',
  '태양 광선을 계속 유지한다',
  '단 한 발의 바람 화살',
]) {
  const controlSingle = {
    schema_version: 2,
    disposition: 'cast',
    spell: {
      name: '대조군',
      effect: 'damage',
      target: 'enemy',
      element_primary: 'wind',
      element_secondary: null,
      form: 'bolt',
      size: 'medium',
      speed: 'fast',
      status: [],
      power: 60,
      cost: 36,
    },
  };
  assert.equal(expandRapidFireSingleSpell(controlSingle, text), 0, `${text}: 연사 보정 비적용`);
  assert.ok(controlSingle.spell, `${text}: 단일 spell 보존`);
  assert.equal(controlSingle.spell_plan, undefined, `${text}: 불필요한 plan 금지`);
}
assert.equal(hasDamageFormSpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'form', spec: { effect: 'buff', form: 'buff' } }] },
    ],
  },
}), false);
assert.equal(hasDamageFormSpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'form', spec: { effect: 'damage', form: 'nova' } }] },
    ],
  },
}), true);
assert.equal(hasNonDamageFormSpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'form', spec: { effect: 'damage', form: 'slash' } }] },
    ],
  },
}), false);
assert.equal(hasNonDamageFormSpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'form', spec: { effect: 'shield', form: 'buff' } }] },
    ],
  },
}), true);
const attackExitPlan = {
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'form', spec: { effect: 'damage', form: 'slash' } }] },
      { behaviors: [
        { type: 'move', destination: 'away-from-target', element: 'dark' },
        { type: 'form', spec: { effect: 'shield', form: 'buff' } },
      ] },
      { behaviors: [{ type: 'form', spec: { effect: 'buff', form: 'buff' } }] },
    ],
  },
};
assert.equal(removeNonDamageFormBehaviors(attackExitPlan), 2);
assert.deepEqual(attackExitPlan.spell_plan.sequences, [
  { behaviors: [{ type: 'form', spec: { effect: 'damage', form: 'slash' } }] },
  { behaviors: [{ type: 'move', destination: 'away-from-target', element: 'dark' }] },
]);
const mountPlan = {
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'form', spec: { effect: 'summon', form: 'summon' } }] },
      { behaviors: [
        { type: 'move', destination: 'target-direction', element: 'earth' },
        { type: 'form', spec: { effect: 'damage', form: 'wave' } },
      ] },
    ],
  },
};
assert.equal(removeDamageFormBehaviors(mountPlan), 1);
assert.deepEqual(mountPlan.spell_plan.sequences, [
  { behaviors: [{ type: 'form', spec: { effect: 'summon', form: 'summon' } }] },
  { behaviors: [{ type: 'move', destination: 'target-direction', element: 'earth' }] },
]);
const malformedMoveJson = '{"behaviors":[{"type":"move","destination":"target-direction","element":"earth"}}]}';
const repairedMoveJson = '{"behaviors":[{"type":"move","destination":"target-direction","element":"earth"}]}';
assert.equal(repairExtraMoveBraceJson(malformedMoveJson), repairedMoveJson);
assert.equal(repairExtraMoveBraceJson(repairedMoveJson), repairedMoveJson);
const malformedDistanceJson = '{"type":"move",-distance: 280,"element":"wind"}';
const repairedDistanceJson = '{"type":"move","distance": 280,"element":"wind"}';
assert.equal(repairMalformedDistanceKeyJson(malformedDistanceJson), repairedDistanceJson);
assert.equal(repairMalformedDistanceKeyJson(repairedDistanceJson), repairedDistanceJson);
assert.equal(hasMoveWithoutFormSpellPlan({
  spell_plan: {
    sequences: [
      { behaviors: [{ type: 'form', spec: { effect: 'control', form: 'zone' } }] },
    ],
  },
}), false);

console.log('judge output structural regression: ok');
