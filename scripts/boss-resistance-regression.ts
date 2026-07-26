import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEBUFF_FLOOR, flooredResistMultiplier } from '../src/combat-core/combat/debuffFloor';
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

// 2) fire 다수 + bolt(원거리) → fire 저항 + 돌진(rush)
const r1 = computeResistance(historyOf(4, 'fire', 'bolt').bossMemory());
assert.equal(r1.resistedElement, 'fire', '최다 원소 저항');
assert.equal(r1.resistMultiplier, RESISTANCE.multiplier, '저항 시 config 배수');
assert.equal(r1.counterStrategy, 'rush', '원거리 폼 위주 → 돌진');

// 3) ice + nova(근거리) → ice 저항 + 원거리(ranged)
const r2 = computeResistance(historyOf(4, 'ice', 'nova').bossMemory());
assert.equal(r2.resistedElement, 'ice');
assert.equal(r2.counterStrategy, 'ranged', '근거리 폼 위주 → 원거리 유지');

// 4) 순수 함수 검증 — 같은 입력이면 항상 같은 출력
const mem = historyOf(5, 'lightning', 'beam').bossMemory();
assert.deepEqual(computeResistance(mem), computeResistance(mem), '순수 함수(결정론)');

// 5) 강도 재조정 (#171 R1 검토 · 총괄 07-25 재판단) — 명목=실효 회복
// ×0.3 시절엔 합산 하한(0.5)이 항상 먼저 걸려 명목 수치가 화면 약속과 달리
// 한 번도 실제 적용된 적이 없었다. 0.75는 하한 위라 그대로 적용된다.
{
  assert.ok(RESISTANCE.multiplier >= DEBUFF_FLOOR,
    '내성 배수가 하한 아래다 — 명목과 실효가 다시 갈라진다 (0.3 시절 회귀)');
  assert.equal(flooredResistMultiplier(1, RESISTANCE.multiplier), RESISTANCE.multiplier,
    '격상 없음 + 내성 = 명목 그대로 적용 (하한 미개입)');
  assert.ok(RESISTANCE.multiplier <= 0.8,
    '0.8 초과면 저항이 사실상 무의미 — R1 제안 범위(0.7~0.8) 상한');
}

// 6) 마스터리 면역 (#171 R1 발안) — 상수·배선
{
  assert.equal(RESISTANCE.masteryImmunityAffinity, 0.9,
    '면역 임계는 친화 바 각성 이정표(0.9)와 같아야 한다 — 바가 가득 = 면역');
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(scene.includes('AFFINITY_BAR_MILESTONE = 0.9'),
    '전제 붕괴: 씬의 각성 이정표가 0.9가 아니다 — 임계 정합 재검토 필요');
  // 면역 검사가 내성 관문(elementalDamageAgainst) 안에 있어야 단기·장기·이중
  // 저항 전부에 걸린다. 밖에 있으면 일부 경로만 관통되는 반쪽 면역이 된다.
  const gate = scene.slice(
    scene.indexOf('private elementalDamageAgainst'),
    scene.indexOf('private addBossResistance'),
  );
  assert.ok(gate.includes('RESISTANCE.masteryImmunityAffinity'),
    '마스터리 면역이 내성 관문 밖에 있다');
  assert.ok(/if \(multiplier < 1 && affinity >= RESISTANCE\.masteryImmunityAffinity\)/.test(gate),
    '면역 조건식이 바뀌었다 — 저항 없을 때도 안내가 뜨거나, 임계 비교가 어긋남');
}

console.log('BossResistance regression: 데이터부족·원소저항·카운터전략·순수성·강도재조정·마스터리면역 6군 통과');
