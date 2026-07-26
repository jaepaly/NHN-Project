import assert from 'node:assert/strict';
import { validateSpellPlan, planFromSpec, representativeSpecFromPlan } from '../src/spell/spellPlanValidate';
import { resolveSpellPlan } from '../src/spell/sequencePlan';
import { validateJudgement } from '../src/spell/validate';
import { judgeTimeoutMs } from '../src/spell/geminiJudge';
import { looksSequential } from '../src/spell/mockJudge';
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

// ── 캐시 왕복: 판정을 직렬화했다 되읽어도 plan이 살아남는다 (#180 회귀) ──
// writeCache는 판정 객체를 그대로 저장하므로 키가 `plan`이다. 이걸 못 읽으면
// 캐시 히트마다 복합 영창이 단일로 강등된다.
{
  const first = validateJudgement({
    schema_version: 2, disposition: 'cast',
    spell: dmg(),
    spell_plan: {
      name: '연격', power: 70, durationMs: 1200,
      sequences: [
        { behaviors: [{ type: 'move', destination: 'away-from-target', element: 'wind' }] },
        { behaviors: [{ type: 'form', spec: dmg({ form: 'nova' }) }] },
      ],
    },
  });
  assert.ok(first && first.disposition === 'cast');
  const firstPlan = (first as { plan?: { sequences: unknown[] } }).plan;
  assert.equal(firstPlan?.sequences.length, 2, '최초 판정에 2단계 plan');

  // localStorage 왕복을 그대로 흉내낸다 (writeCache → readCache)
  const replayed = validateJudgement(JSON.parse(JSON.stringify(first)));
  assert.ok(replayed && replayed.disposition === 'cast', '캐시 재생도 cast');
  const replayedPlan = (replayed as { plan?: { sequences: unknown[] } }).plan;
  assert.ok(replayedPlan, '캐시 히트에서 plan이 유실되지 않는다');
  assert.equal(replayedPlan?.sequences.length, 2, '단계 수까지 보존 — 단일 강등 없음');
}

// ── 판정 타임아웃: 복합만 상향, 단순은 2.5초 유지 (#180) ──
{
  assert.equal(judgeTimeoutMs('파이어볼'), 2500, '단일 영창은 2.5초 유지');
  assert.equal(judgeTimeoutMs('거대한 화염구를 적에게 던진다'), 2500, '긴 단일 문장도 2.5초');
  assert.equal(
    judgeTimeoutMs('왼쪽으로 피한 뒤 작은 화염구를 발사해'), 3200,
    '순차 마커가 있으면 복합 상한',
  );
  assert.equal(
    judgeTimeoutMs('얼음벽을 세우고 그다음 번개를 내리친다'), 3200,
    '다른 마커도 복합으로 인식',
  );
  assert.ok(looksSequential('불덩이를 던진 뒤 얼음창을 쏜다'));
  assert.equal(looksSequential('회오리바람을 일으킨다'), false);

  // 병렬(동시) 표현도 복합이다 (#200 조사에서 발견한 누락).
  // 스키마는 `A하면서 B`를 지원하고 이슈도 그걸 명시적 복합의 예로 드는데,
  // 마커 목록에 순차만 있어 병렬 문장이 전부 2.5초 예산에 걸려 있었다.
  // 복합 응답은 spell_plan을 실어 실측 1.86~2.55s라 그 경계에 그대로 부딪힌다.
  for (const text of [
    '후퇴하면서 얼음창을 쏜다',
    '달리며 불화살을 쏜다',
    '옆으로 구르면서 번개를 내리친다',
    '동시에 얼음과 불을 터뜨린다',
  ]) {
    assert.equal(judgeTimeoutMs(text), 3200, `병렬 표현이 짧은 예산에 걸린다: ${text}`);
  }

  // 오탐 방어 — 단일 주문이 복합으로 새면 안 된다 ('며칠'·'며느리' 같은 낱말)
  for (const text of [
    '화염구를 던진다',
    '며칠 전의 불꽃을 되살린다',
    '불사조의 낙화',
  ]) {
    assert.equal(judgeTimeoutMs(text), 2500, `단일 입력이 복합으로 샜다: ${text}`);
  }
}

console.log('SpellPlan validate regression: 검증·클램프·화이트리스트·대표유도·판정연결·캐시왕복·타임아웃·병렬마커 15군 통과');
