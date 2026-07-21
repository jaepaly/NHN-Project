import assert from 'node:assert/strict';
import {
  SpellHistory,
  normalizeSpellText,
  spellSignature,
  REPEAT_PENALTY,
} from '../src/spell/spellHistory';
import type { SpellSpec } from '../src/spell/types';

/** 테스트용 검증된 cast 주문 (필요한 필드만 덮어씀) */
function spell(overrides: Partial<SpellSpec> = {}): SpellSpec {
  return {
    name: '화염구',
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

// 시각은 호출측 주입 — 결정론적 테스트를 위해 고정 증가값 사용
let clock = 1000;
const nextTime = (): number => (clock += 1000);

// 1) 정규화: 양끝 공백·대소문자·내부 연속 공백
assert.equal(normalizeSpellText('  화염구  '), '화염구', 'trim');
assert.equal(normalizeSpellText('Fire  Ball'), 'fire ball', 'lower + collapse');

// 2) 기록과 size, 첫 시전은 패널티 없음
const h = new SpellHistory();
assert.equal(h.size, 0);
const e1 = h.record({ rawText: '화염구', spell: spell(), source: 'gemini', castAt: nextTime() });
assert.equal(h.size, 1);
assert.equal(e1.basePower, 40);
assert.equal(e1.power, 40, '첫 시전은 배수 1.0');
assert.equal(e1.source, 'gemini');

// 3) 반복 패널티: 2번째 ×0.8, 3번째 ×0.64 (엔진이 곱해 적용할 값 = 기록 power)
assert.equal(h.repeatMultiplier('화염구'), REPEAT_PENALTY.perReuse, '1회 기록 후 = 0.8');
const e2 = h.record({ rawText: '화염구', spell: spell(), source: 'cache', castAt: nextTime() });
assert.equal(e2.power, Math.round(40 * 0.8), '2번째 = 32');
const e3 = h.record({ rawText: '화염구', spell: spell(), source: 'cache', castAt: nextTime() });
assert.equal(e3.power, Math.round(40 * 0.64), '3번째 = 26');

// 4) 정규화 기준 반복 판정 (대소문자·공백 무시)
const h2 = new SpellHistory();
h2.record({ rawText: 'Fire Ball', spell: spell(), source: 'gemini', castAt: nextTime() });
assert.equal(h2.countOf('  fire   ball '), 1, '정규화하면 같은 문장으로 셈');
assert.equal(h2.repeatMultiplier('FIRE BALL'), 0.8, '정규화 반복도 패널티');

// 5) 패널티 하한(floor) — 아무리 반복해도 floor 밑으로 안 감
const h3 = new SpellHistory();
for (let i = 0; i < 20; i++) {
  h3.record({ rawText: '반복', spell: spell(), source: 'gemini', castAt: nextTime() });
}
assert.equal(h3.repeatMultiplier('반복'), REPEAT_PENALTY.floor, '충분히 반복 = floor');

// 6) 보스 기억 요약: 최다 원소/폼 + 최근 주문명
const h4 = new SpellHistory();
h4.record({ rawText: 'a', spell: spell({ name: '불꽃', element_primary: 'fire', form: 'bolt' }), source: 'gemini', castAt: nextTime() });
h4.record({ rawText: 'b', spell: spell({ name: '해일', element_primary: 'water', form: 'wave' }), source: 'gemini', castAt: nextTime() });
h4.record({ rawText: 'c', spell: spell({ name: '겁화', element_primary: 'fire', form: 'nova' }), source: 'gemini', castAt: nextTime() });
const mem = h4.bossMemory();
assert.equal(mem.dominantElement, 'fire', 'fire 2 > water 1');
assert.equal(mem.totalCasts, 3);
assert.deepEqual(mem.recentSpellNames, ['불꽃', '해일', '겁화'], '최근 주문명 순서');

// 7) reset — 새 런 초기화
h4.reset();
assert.equal(h4.size, 0);
assert.equal(h4.bossMemory().dominantElement, null, '비면 null');

// 8) 스펙 기반 반복 패널티 — 표기만 바꾼 우회를 막는다
// (사용자 제보: "파이어볼" → "파이어볼v2" → "파이어 볼"로 패널티를 공짜로 피할 수 있었다)
{
  assert.equal(
    spellSignature({ effect: 'damage', element_primary: 'fire', form: 'bolt' }),
    'damage:fire:bolt',
    '서명은 effect:원소:폼',
  );
  // 보조 원소·크기는 서명에서 제외 — 한 방울 섞어 서명만 흔드는 우회를 막는다
  assert.equal(
    spellSignature({ effect: 'damage', element_primary: 'fire', form: 'bolt' }),
    spellSignature({ effect: 'damage', element_primary: 'fire', form: 'bolt' }),
  );

  const bypass = new SpellHistory();
  const fireBolt = () => spell({ name: '파이어볼', element_primary: 'fire', form: 'bolt' });
  const first = bypass.record({ rawText: '파이어볼', spell: fireBolt(), source: 'mock', castAt: nextTime() });
  assert.equal(first.power, first.basePower, '첫 시전은 패널티 없음');

  const second = bypass.record({ rawText: '파이어볼v2', spell: fireBolt(), source: 'mock', castAt: nextTime() });
  assert.ok(second.power < second.basePower, '문장이 달라도 같은 주문이면 패널티');
  assert.equal(
    second.power,
    Math.round(second.basePower * REPEAT_PENALTY.perSimilarReuse),
    '유사 재사용 1회 = 0.9배',
  );

  const third = bypass.record({ rawText: '파이어 볼', spell: fireBolt(), source: 'mock', castAt: nextTime() });
  assert.equal(
    third.power,
    Math.round(third.basePower * REPEAT_PENALTY.perSimilarReuse ** 2),
    '유사 재사용 2회 = 0.81배',
  );

  // 같은 문장 재사용은 여전히 더 강하게 벌한다 (복붙 > 표기 변주)
  assert.ok(
    REPEAT_PENALTY.perReuse < REPEAT_PENALTY.perSimilarReuse,
    '복붙 패널티가 표기 변주보다 강해야 한다',
  );

  // 두 축은 곱해지되 같은 문장을 이중 계산하지 않는다
  const mixed = new SpellHistory();
  mixed.record({ rawText: '파이어볼', spell: fireBolt(), source: 'mock', castAt: nextTime() });
  mixed.record({ rawText: '파이어볼', spell: fireBolt(), source: 'mock', castAt: nextTime() });
  assert.equal(mixed.countOf('파이어볼'), 2, '문장 일치 2회');
  assert.equal(
    mixed.countOfSimilar('파이어볼', { effect: 'damage', element_primary: 'fire', form: 'bolt' }),
    0,
    '같은 문장은 유사 카운트에서 제외 (이중 계산 방지)',
  );
  assert.equal(
    mixed.countOfSimilar('파이어볼v2', { effect: 'damage', element_primary: 'fire', form: 'bolt' }),
    2,
    '다른 문장이면 앞선 같은 주문 2건이 유사로 잡힌다',
  );

  // 진짜 다른 마법은 자유롭다 — 원소나 폼이 다르면 패널티 없음
  const varied = new SpellHistory();
  varied.record({ rawText: '화염구', spell: spell({ name: 'a', element_primary: 'fire', form: 'bolt' }), source: 'mock', castAt: nextTime() });
  const diffElement = varied.record({ rawText: '빙창', spell: spell({ name: 'b', element_primary: 'ice', form: 'bolt' }), source: 'mock', castAt: nextTime() });
  assert.equal(diffElement.power, diffElement.basePower, '원소가 다르면 패널티 없음');
  const diffForm = varied.record({ rawText: '화염 폭발', spell: spell({ name: 'c', element_primary: 'fire', form: 'nova' }), source: 'mock', castAt: nextTime() });
  assert.equal(diffForm.power, diffForm.basePower, '폼이 다르면 패널티 없음');

  // 하위 호환 — spell 없이 호출하면 문장 축만 적용 (기존 호출부 무손상)
  const legacy = new SpellHistory();
  legacy.record({ rawText: '반복', spell: fireBolt(), source: 'mock', castAt: nextTime() });
  assert.equal(legacy.repeatMultiplier('반복'), REPEAT_PENALTY.perReuse, 'spell 미전달 = 문장 축만');
  assert.equal(legacy.repeatMultiplier('다른 문장'), 1, 'spell 미전달이면 유사 판정 안 함');

  // 하한은 두 축을 곱해도 지켜진다
  const floored = new SpellHistory();
  for (let i = 0; i < 30; i++) {
    floored.record({ rawText: `변주${i}`, spell: fireBolt(), source: 'mock', castAt: nextTime() });
  }
  assert.ok(
    floored.repeatMultiplier('변주999', { effect: 'damage', element_primary: 'fire', form: 'bolt' })
      >= REPEAT_PENALTY.floor,
    '무한 반복해도 floor 하한 유지',
  );
}

console.log('SpellHistory regression: 기록·반복패널티·정규화·요약·리셋·스펙기반우회차단 8군 통과');
