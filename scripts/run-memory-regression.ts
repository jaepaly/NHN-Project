import assert from 'node:assert/strict';
import { SpellHistory } from '../src/spell/spellHistory';
import {
  EMPTY_RUN_MEMORY,
  summarizeRun,
  updateRunMemory,
  longTermResistedElement,
  loadRunMemory,
  saveRunMemory,
} from '../src/spell/runMemory';
import type { RunMemory, StorageLike } from '../src/spell/runMemory';
import type { SpellSpec } from '../src/spell/types';

function spell(overrides: Partial<SpellSpec> = {}): SpellSpec {
  return {
    name: '주문', effect: 'damage', target: 'enemy',
    element_primary: 'fire', element_secondary: null, form: 'bolt',
    size: 'medium', speed: 'normal', status: [], power: 40, cost: 20,
    ...overrides,
  };
}

let clock = 0;
const now = (): number => (clock += 1000);

function fakeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}

// 1) summarizeRun — 최다 원소 + 최고 power 주문 추출
const h = new SpellHistory();
h.record({ rawText: 'a', spell: spell({ name: '약불', element_primary: 'fire', power: 30 }), source: 'gemini', castAt: now() });
h.record({ rawText: 'b', spell: spell({ name: '강불', element_primary: 'fire', power: 90 }), source: 'gemini', castAt: now() });
h.record({ rawText: 'c', spell: spell({ name: '물', element_primary: 'water', power: 50 }), source: 'gemini', castAt: now() });
const o1 = summarizeRun(h, 'win', 4321);
assert.equal(o1.dominantElement, 'fire', 'fire 2 > water 1');
assert.equal(o1.topSpellName, '강불');
assert.equal(o1.topSpellPower, 90);
assert.deepEqual(o1.curseBehavior, {
  movementDistance: 4321,
  manualCastCount: 3,
  lightFireCastCount: 2,
  wordLimitTopQuartileCost: 3,
});

const sequenceAwareHistory = new SpellHistory();
sequenceAwareHistory.recordSequence({
  rawText: '빛과 번개로 돌진한다',
  name: '빛과 번개로 돌진한다',
  elements: ['light', 'lightning'],
  power: 70,
  cost: 42,
  source: 'local',
  castAt: 2000,
});
sequenceAwareHistory.recordSequence({
  rawText: '허공답보',
  name: '허공답보',
  elements: [],
  power: 20,
  cost: 12,
  source: 'local',
  castAt: 3000,
});
assert.deepEqual(summarizeRun(sequenceAwareHistory, 'win').curseBehavior, {
  movementDistance: 0,
  manualCastCount: 2,
  lightFireCastCount: 1,
  wordLimitTopQuartileCost: 45,
}, 'sequence plans count once while any matching behavior element qualifies the cast');

// 2) updateRunMemory — 승패 카운트·favorite·top 유지·recent 누적
let m: RunMemory = { ...EMPTY_RUN_MEMORY };
m = updateRunMemory(m, { result: 'lose', dominantElement: 'fire', topSpellName: '강불', topSpellPower: 90 });
assert.equal(m.deaths, 1);
assert.equal(m.lastResult, 'lose');
assert.equal(m.favoriteElement, 'fire');
m = updateRunMemory(m, { result: 'win', dominantElement: 'lightning', topSpellName: '약감전', topSpellPower: 40 });
assert.equal(m.clears, 1);
assert.equal(m.topSpellName, '강불', 'top은 더 높은 것(90) 유지');
assert.deepEqual(m.recentDominantElements, ['fire', 'lightning']);

// 3) 누적 밸런스 완화 — 최근 5런만, 오래된 취향은 잊음
let m2: RunMemory = { ...EMPTY_RUN_MEMORY };
for (const e of ['fire', 'fire', 'fire', 'ice', 'ice', 'ice', 'ice'] as const) {
  m2 = updateRunMemory(m2, { result: 'win', dominantElement: e, topSpellName: null, topSpellPower: 0 });
}
assert.equal(m2.recentDominantElements.length, 5, '최근 5런만 유지');
assert.deepEqual(m2.recentDominantElements, ['fire', 'ice', 'ice', 'ice', 'ice'], '오래된 fire 밀려남');
assert.equal(longTermResistedElement(m2), 'ice', '장기 저항은 최근 최다 1개(ice)');

// 4) load/save — 버전 키·라운드트립·방어
const s = fakeStorage();
saveRunMemory(m2, s);
assert.ok([...s.map.keys()][0].startsWith('incant:runmemory:v1:'), '스키마 버전 접두사 키');
assert.deepEqual(loadRunMemory(s), m2, '저장→로드 라운드트립');
assert.deepEqual(loadRunMemory(fakeStorage()), EMPTY_RUN_MEMORY, '비어있으면 기본값');
const bad = fakeStorage();
bad.map.set('incant:runmemory:v1:profile', '{깨진');
assert.deepEqual(loadRunMemory(bad), EMPTY_RUN_MEMORY, '깨진 JSON → 기본값');

// 5) 폼 이력 (#171 격상 원소→폼 전환의 데이터 축)
{
  let m: RunMemory = { ...EMPTY_RUN_MEMORY };
  for (const f of ['bolt', 'bolt', 'nova', 'zone', 'zone', 'zone'] as const) {
    m = updateRunMemory(m, {
      result: 'win', dominantElement: 'fire', dominantForm: f,
      topSpellName: null, topSpellPower: 0,
    });
  }
  assert.equal(m.recentDominantForms.length, 5, '폼도 최근 5런만');
  assert.deepEqual(m.recentDominantForms, ['bolt', 'nova', 'zone', 'zone', 'zone'], '오래된 폼 밀려남');
  // dominantForm이 null이면(시전 기록 부족) 이력을 오염시키지 않는다
  const before = m.recentDominantForms.slice();
  m = updateRunMemory(m, {
    result: 'lose', dominantElement: null, dominantForm: null,
    topSpellName: null, topSpellPower: 0,
  });
  assert.deepEqual(m.recentDominantForms, before, 'null 폼은 무시');
  // 라운드트립에 폼 이력 보존
  const st = fakeStorage();
  saveRunMemory(m, st);
  assert.deepEqual(loadRunMemory(st).recentDominantForms, m.recentDominantForms, '폼 이력 라운드트립');
}

// 6) 구버전 프로필(폼 필드 없음) — 빈 배열로 정규화 (크래시·오염 없음)
{
  const st = fakeStorage();
  st.map.set('incant:runmemory:v1:profile', JSON.stringify({
    deaths: 2, clears: 3, favoriteElement: 'fire',
    recentDominantElements: ['fire', 'ice'],
  }));
  const loaded = loadRunMemory(st);
  assert.deepEqual(loaded.recentDominantForms, [], '구프로필 → 폼 이력 빈 배열');
  assert.deepEqual(loaded.recentDominantElements, ['fire', 'ice'], '기존 필드는 보존');
}

console.log('RunMemory regression: 요약·갱신·누적완화·저장로드·폼이력·구프로필 6군 통과');
