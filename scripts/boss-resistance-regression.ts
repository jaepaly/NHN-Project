import assert from 'node:assert/strict';
import { SpellHistory } from '../src/spell/spellHistory';
import { computeResistance, RESISTANCE } from '../src/spell/bossMemory';
import type { SpellSpec } from '../src/spell/types';

function spell(overrides: Partial<SpellSpec> = {}): SpellSpec {
  return {
    name: '주문',
    effect: 'damage',
    target: 'enemy',
    element_primary: 'fire',
    element_secondary: null,
    form: 'bolt',
    size: 'medium',
    speed: 'normal',
    status: [],
    power: 40,
    cost: 20,
    ...overrides,
  };
}

let clock = 0;
const now = (): number => (clock += 1000);

function historyOf(count: number, element: SpellSpec['element_primary'], form: SpellSpec['form']): SpellHistory {
  const h = new SpellHistory();
  for (let i = 0; i < count; i++) {
    h.record({ rawText: `${element}-${form}-${i}`, spell: spell({ element_primary: element, form }), source: 'gemini', castAt: now() });
  }
  return h;
}

// 1) 데이터 부족(minCasts 미만) → 내성 없음
const r0 = computeResistance(historyOf(RESISTANCE.minCasts - 1, 'fire', 'bolt').bossMemory());
assert.equal(r0.resistedElement, null, 'minCasts 미만이면 저항 원소 없음');
assert.equal(r0.resistMultiplier, 1, '무저항 = 배수 1');
assert.equal(r0.counterStrategy, null);

// 2) fire 다수 + bolt(원거리) → fire 저항 0.3 + 돌진(rush)
const r1 = computeResistance(historyOf(4, 'fire', 'bolt').bossMemory());
assert.equal(r1.resistedElement, 'fire', '최다 원소 저항');
assert.equal(r1.resistMultiplier, RESISTANCE.multiplier, '저항 시 0.3');
assert.equal(r1.counterStrategy, 'rush', '원거리 폼 위주 → 돌진');

// 3) ice + nova(근거리) → ice 저항 + 원거리(ranged)
const r2 = computeResistance(historyOf(4, 'ice', 'nova').bossMemory());
assert.equal(r2.resistedElement, 'ice');
assert.equal(r2.counterStrategy, 'ranged', '근거리 폼 위주 → 원거리 유지');

// 4) 순수 함수 검증 — 같은 입력이면 항상 같은 출력
const mem = historyOf(5, 'lightning', 'beam').bossMemory();
assert.deepEqual(computeResistance(mem), computeResistance(mem), '순수 함수(결정론)');

console.log('BossResistance regression: 데이터부족·원소저항·카운터전략·순수성 4군 통과');
