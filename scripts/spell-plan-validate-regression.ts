import assert from 'node:assert/strict';
import { validateSpellPlan, planFromSpec, representativeSpecFromPlan } from '../src/spell/spellPlanValidate';
import { resolveSpellPlan } from '../src/spell/sequencePlan';
import { validateJudgement } from '../src/spell/validate';
import type { SpellSpec } from '../src/spell/types';

const dmg = (over: Partial<SpellSpec> = {}): Record<string, unknown> => ({
  name: '불꽃', effect: 'damage', target: 'enemy',
  element_primary: 'fire', element_secondary: null, form: 'bolt',
  size: 'medium', speed: 'normal', status: [], power: 50, cost: 30, ...over,
});

// ── 정상 plan은 통과하고 name/power/duration이 보정된다 ─────────────
{
  const plan = validateSpellPlan({
    name: '  돌진 폭발  ', power: 999, durationMs: -5,
    sequences: [
      { durationWeight: 2, behaviors: [{ type: 'move', destination: 'target-direction', element: 'fire', distance: 190 }] },
      { durationWeight: 1, behaviors: [{ type: 'form', powerWeight: 1, tuning: { damage: 2, radius: 2 }, spec: dmg({ target: 'self', form: 'nova', status: ['burn'] }) }] },
    ],
  });
  assert.ok(plan, '정상 plan은 통과');
  assert.equal(plan!.name, '돌진 폭발', 'name trim');
  assert.equal(plan!.power, 100, 'power 상한 clamp');
  assert.equal(plan!.durationMs, 0, '음수 duration → 0');
  assert.equal(plan!.sequences.length, 2);
  assert.equal(plan!.sequences[0].behaviors[0].type, 'move');
}

// ── self + damage + nova 보존 (effect·target·form 독립 축) ──────────
{
  const plan = validateSpellPlan({
    name: 'x', power: 60, durationMs: 500,
    sequences: [{ behaviors: [{ type: 'form', spec: dmg({ target: 'self', form: 'nova' }) }] }],
  });
  const b = plan!.sequences[0].behaviors[0];
  assert.equal(b.type, 'form');
  if (b.type === 'form') {
    assert.equal(b.spec.target, 'self');
    assert.equal(b.spec.form, 'nova');
    assert.equal(b.spec.effect, 'damage');
  }
}

// ── 알 수 없는 enum/type은 제거, 비면 상위도 제거 ──────────────────
{
  // form spec의 element가 스키마 밖 → validateSpec가 null → behavior 제거 → sequence 제거 → plan null
  const bad = validateSpellPlan({
    name: 'x', power: 50, durationMs: 500,
    sequences: [{ behaviors: [{ type: 'form', spec: dmg({ element_primary: 'plasma' as never }) }] }],
  });
  assert.equal(bad, null, '유효 behavior 0 → plan null');

  // 알 수 없는 behavior type 제거, 유효한 것만 남김
  const mixed = validateSpellPlan({
    name: 'x', power: 50, durationMs: 500,
    sequences: [{ behaviors: [
      { type: 'teleport' },                                  // 알 수 없는 type → 제거
      { type: 'move', destination: 'nowhere', element: 'fire' }, // 잘못된 destination → 제거
      { type: 'move', destination: 'arena-center', element: 'water' }, // 유효
      { type: 'wait' },
    ] }],
  });
  assert.ok(mixed);
  assert.equal(mixed!.sequences[0].behaviors.length, 2, '유효 move + wait만');
}

// ── move는 element 필수 ─────────────────────────────────────────
{
  const noElement = validateSpellPlan({
    name: 'x', power: 30, durationMs: 500,
    sequences: [{ behaviors: [{ type: 'move', destination: 'arena-center' }] }],
  });
  assert.equal(noElement, null, 'element 없는 move 제거 → plan null');
}

// ── 상한 슬라이스: sequence 10, behavior 5 ─────────────────────────
{
  const many = validateSpellPlan({
    name: 'x', power: 50, durationMs: 500,
    sequences: Array.from({ length: 20 }, () => ({
      behaviors: Array.from({ length: 9 }, () => ({ type: 'form', spec: dmg() })),
    })),
  });
  assert.equal(many!.sequences.length, 10, 'sequence 최대 10');
  assert.equal(many!.sequences[0].behaviors.length, 5, 'behavior 최대 5');
}

// ── tuning 위생: 숫자 아닌/NaN/무한대 필드 제거 ─────────────────────
{
  const plan = validateSpellPlan({
    name: 'x', power: 50, durationMs: 500,
    sequences: [{ behaviors: [{ type: 'form', tuning: { damage: 2, radius: 'big', duration: NaN, strength: Infinity }, spec: dmg() }] }],
  });
  const b = plan!.sequences[0].behaviors[0];
  assert.equal(b.type, 'form');
  if (b.type === 'form') {
    assert.deepEqual(b.tuning, { damage: 2 }, '유효 숫자 필드만 남는다');
  }
}

// ── 구조적 거부 ────────────────────────────────────────────────
assert.equal(validateSpellPlan(null), null);
assert.equal(validateSpellPlan('nope'), null);
assert.equal(validateSpellPlan({ name: 'x', power: 50 }), null, 'sequences 없음 → null');
assert.equal(validateSpellPlan({ sequences: 'no' }), null, 'sequences 비배열 → null');
assert.equal(validateSpellPlan({ sequences: [] }), null, '빈 sequences → null');
assert.equal(validateSpellPlan({ sequences: [{ behaviors: [] }] }), null, '빈 behaviors → null');

// ── planFromSpec: v2 단일 주문 래핑 (§3) ──────────────────────────
{
  const spec = dmg({ power: 72 }) as unknown as SpellSpec;
  const plan = planFromSpec(spec);
  assert.equal(plan.name, '불꽃');
  assert.equal(plan.power, 72);
  assert.equal(plan.durationMs, 0);
  assert.equal(plan.sequences.length, 1);
  const b = plan.sequences[0].behaviors[0];
  assert.equal(b.type, 'form');
}

// ── 왕복: 검증 → resolveSpellPlan 예산 계산까지 안전하게 흐른다 ──────
{
  const plan = validateSpellPlan({
    name: '돌진 폭발', power: 80, durationMs: 4000,
    sequences: [
      { durationWeight: 2, behaviors: [{ type: 'move', destination: 'target-direction', element: 'fire' }] },
      { durationWeight: 1, behaviors: [{ type: 'form', spec: dmg({ target: 'self', form: 'nova' }) }] },
    ],
  });
  const resolved = resolveSpellPlan(plan!);
  assert.ok(resolved.manaCost >= 5);
  // move 1개 → effectPower = 80 - 80*0.1 = 72 → 유일 form이 전량
  const formSeq = resolved.sequences[1].behaviors[0];
  assert.equal(formSeq.type, 'form');
  if (formSeq.type === 'form') {
    assert.equal(formSeq.spec.power, 72, 'move 10% 비용 후 form power');
    assert.equal(formSeq.spec.cost, 0, 'cost는 로컬이 0으로');
  }
  // 4000ms 요청 → power 80 상한 min(3000, 500+2000)=2500 clamp
  const total = resolved.sequences.reduce((s, seq) => s + seq.durationMs, 0);
  assert.ok(total <= 2500 + 1, `duration clamp: ${total}`);
}

// ── representativeSpecFromPlan: 최고 위력 form 대표 ────────────────
{
  const plan = validateSpellPlan({
    name: 'x', power: 60, durationMs: 500,
    sequences: [
      { behaviors: [{ type: 'form', spec: dmg({ form: 'bolt', power: 30 }) }] },
      { behaviors: [{ type: 'form', spec: dmg({ form: 'nova', element_primary: 'ice', power: 90 }) }] },
    ],
  })!;
  const rep = representativeSpecFromPlan(plan);
  assert.equal(rep.form, 'nova', '최고 위력 form이 대표');
  assert.equal(rep.element_primary, 'ice');

  // 이동만 있는 plan → 무해한 자리표시(대표) 유도, move의 원소 반영
  const moveOnly = validateSpellPlan({
    name: '질주', power: 40, durationMs: 500,
    sequences: [{ behaviors: [{ type: 'move', destination: 'arena-center', element: 'wind' }] }],
  })!;
  const repMove = representativeSpecFromPlan(moveOnly);
  assert.equal(repMove.element_primary, 'wind', '이동 원소가 대표에 반영');
  assert.equal(repMove.name, '질주');
}

// ── validateJudgement: 원격 파싱이 spell_plan을 소비 (Worker 연결 경로) ──
{
  // spell + spell_plan → cast + plan
  const withPlan = validateJudgement({
    schema_version: 2, disposition: 'cast',
    spell: dmg(),
    spell_plan: {
      name: '돌진 폭발', power: 75, durationMs: 1500,
      sequences: [
        { durationWeight: 2, behaviors: [{ type: 'move', destination: 'target-direction', element: 'fire' }] },
        { durationWeight: 1, behaviors: [{ type: 'form', spec: dmg({ target: 'self', form: 'nova' }) }] },
      ],
    },
  });
  assert.ok(withPlan && withPlan.disposition === 'cast');
  assert.ok((withPlan as { plan?: unknown }).plan, 'plan이 판정에 실린다');

  // spell 없이 spell_plan만 → 대표 주문 유도해 cast 성립
  const planOnly = validateJudgement({
    schema_version: 2, disposition: 'cast',
    spell_plan: {
      name: '합창', power: 60, durationMs: 800,
      sequences: [{ behaviors: [{ type: 'form', spec: dmg({ form: 'nova' }) }] }],
    },
  });
  assert.ok(planOnly && planOnly.disposition === 'cast', 'plan-only도 cast');
  assert.ok((planOnly as { plan?: unknown }).plan);
  if (planOnly.disposition === 'cast') assert.ok(planOnly.spell, '대표 주문 유도됨');

  // spell만 (plan 없음) → 기존 v2 그대로, plan 없음
  const v2 = validateJudgement({ schema_version: 2, disposition: 'cast', spell: dmg() });
  assert.ok(v2 && v2.disposition === 'cast');
  assert.equal((v2 as { plan?: unknown }).plan, undefined, 'plan 없으면 v2 그대로');

  // 잘못된 plan + 유효 spell → plan 무시, v2 cast 유지 (하위호환)
  const badPlan = validateJudgement({
    schema_version: 2, disposition: 'cast', spell: dmg(),
    spell_plan: { sequences: [] },
  });
  assert.ok(badPlan && badPlan.disposition === 'cast');
  assert.equal((badPlan as { plan?: unknown }).plan, undefined, '무효 plan은 버리고 spell로');
}

console.log('SpellPlan validate regression: 검증·클램프·화이트리스트·대표유도·판정연결 12군 통과');
