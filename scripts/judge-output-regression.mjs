import assert from 'node:assert/strict';
import {
  ensureExplicitCircularMoveChoreography,
  ensureRepeatedFootstepChoreography,
  expandRapidFireSingleSpell,
  fillExplicitLongMoveDistances,
  hasDamageFormSpellPlan,
  hasNonDamageFormSpellPlan,
  hasMoveWithoutFormSpellPlan,
  hasMoveSpellPlan,
  hasUnsupportedForm,
  isWaitOnlySpellPlan,
  isUnexpectedAtomicChangeCast,
  promoteCastSpellToAtomicPlan,
  removeDamageFormBehaviors,
  removeNonDamageFormBehaviors,
  repairExtraMoveBraceJson,
  repairMalformedDistanceKeyJson,
} from '../proxy/judge-output.js';

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
