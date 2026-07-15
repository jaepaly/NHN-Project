import assert from 'node:assert/strict';
import {
  SpellHistory,
  normalizeSpellText,
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

console.log('SpellHistory regression: 기록·반복패널티·정규화·요약·리셋 7군 통과');
