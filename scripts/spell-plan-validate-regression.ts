import assert from 'node:assert/strict';
import { resolveSpellPlan } from '../src/spell/sequencePlan';
import { validateSpellPlan } from '../src/spell/spellPlanValidate';

const ultimateSpec = (name: string, element: 'fire' | 'water' = 'fire', form: 'bolt' | 'nova' = 'bolt') => ({
  type: 'form' as const,
  powerWeight: 1,
  spec: {
    name, effect: 'damage' as const, target: 'area' as const,
    element_primary: element, element_secondary: null, form,
    size: 'large' as const, speed: 'fast' as const, status: [], power: 0, cost: 0,
  },
});

const ultimate = validateSpellPlan({
  name: '종말의 불꽃',
  castMode: 'ultimate', power: 12, durationMs: 5000,
  sequences: [
    { behaviors: [ultimateSpec('불씨')] },
    { behaviors: [ultimateSpec('화염 고리'), ultimateSpec('물의 파도', 'water')] },
    { behaviors: [ultimateSpec('수렴광'), ultimateSpec('압축파', 'water')] },
    { behaviors: [ultimateSpec('종말', 'fire', 'nova')] },
  ],
});
assert.ok(ultimate, '필살영창 계약은 검증을 통과해야 한다');
assert.equal(ultimate?.power, 100, '필살영창 power는 로컬에서도 100으로 고정한다');
assert.equal(ultimate?.castMode, 'ultimate');
assert.equal(resolveSpellPlan(ultimate!).manaCost, 0, '필살영창은 마나를 소모하지 않는다');
assert.equal(validateSpellPlan({ ...ultimate, sequences: ultimate?.sequences.slice(0, 3) }), null, '4 sequence 미만은 거부한다');

const damage = {
  name: '화염 파동', effect: 'damage', target: 'enemy',
  element_primary: 'fire', element_secondary: null, form: 'wave',
  size: 'medium', speed: 'normal', status: [], power: 0, cost: 0,
} as const;

// Worker의 이전 move 출력은 좌표 이동으로 해석하지 않고 제거한다.
{
  const plan = validateSpellPlan({
    name: '돌진 파동', power: 80, durationMs: 1200,
    sequences: [{ durationWeight: 2, behaviors: [
      { type: 'move', destination: 'target-direction', element: 'fire', distance: 190 },
      { type: 'form', powerWeight: 1, spec: damage },
    ] }],
  });
  assert.ok(plan);
  assert.deepEqual(plan.sequences[0].behaviors.map((behavior) => behavior.type), ['form']);
}

// form과 wait만이 유효 계약이며, move만 있던 legacy plan은 실행하지 않는다.
{
assert.equal(validateSpellPlan({
    name: '질주', power: 40, durationMs: 500,
    sequences: [{ behaviors: [{ type: 'move', destination: 'arena-center', element: 'wind' }] }],
}), null);

// 일반 영창은 plan 전체에서 최대 두 원소만 허용한다.
assert.equal(validateSpellPlan({
  name: '삼원소', power: 90, durationMs: 1000,
  sequences: [{ behaviors: [
    { type: 'form', spec: damage },
    { type: 'form', spec: { ...damage, element_primary: 'ice' } },
    { type: 'form', spec: { ...damage, element_primary: 'lightning' } },
  ] }],
}), null);
const cappedPowerPlan = validateSpellPlan({
  name: '과출력', power: 90, durationMs: 1000,
  sequences: [{ behaviors: [{ type: 'form', spec: damage }] }],
});
assert.equal(cappedPowerPlan?.power, 80);
}

// 이동에 떼어 두던 power는 이제 모든 form에 배분된다.
{
  const plan = validateSpellPlan({
    name: '화염 연계', power: 80, durationMs: 1200,
    sequences: [
      { durationWeight: 1, behaviors: [{ type: 'form', powerWeight: 1, spec: damage }] },
      { durationWeight: 1, behaviors: [{ type: 'wait' }] },
      { durationWeight: 1, behaviors: [{ type: 'form', powerWeight: 1, spec: { ...damage, name: '화염 종결', form: 'nova' } }] },
    ],
  });
  assert.ok(plan);
  const resolved = resolveSpellPlan(plan);
  const forms = resolved.sequences.flatMap((sequence) => sequence.behaviors)
    .filter((behavior) => behavior.type === 'form');
  assert.equal(forms.length, 2);
  assert.equal(forms[0].spec.power + forms[1].spec.power, 80);
  assert.ok(resolved.sequences.some((sequence) => sequence.behaviors[0].type === 'wait'));
}

// A plan that has no executable form must never reach the sequence runner:
// its trailing waits are normalized away, producing the misleading sequence 0 HUD.
{
  assert.equal(validateSpellPlan({
    name: '꽃의 왈츠', power: 40, durationMs: 500,
    sequences: [{ behaviors: [{ type: 'wait' }] }],
  }), null);
  assert.equal(validateSpellPlan({
    name: 'invalid form plus wait', power: 40, durationMs: 500,
    sequences: [{ behaviors: [
      { type: 'form', spec: { ...damage, element_primary: 'flower' } },
      { type: 'wait' },
    ] }],
  }), null);
}

console.log('spell plan validation regression: form/wait contract, legacy move rejection, executable-form guard, full form power allocation');
