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
const o1 = summarizeRun(h, 'win');
assert.equal(o1.dominantElement, 'fire', 'fire 2 > water 1');
assert.equal(o1.topSpellName, '강불');
assert.equal(o1.topSpellPower, 90);

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

console.log('RunMemory regression: 요약·갱신·누적완화·저장로드 4군 통과');
