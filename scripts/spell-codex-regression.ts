import assert from 'node:assert/strict';
import {
  CODEX_CONFIG,
  codexEntryFromSequence,
  codexEntryFromSpec,
  loadCodex,
  mergeCodexEntry,
  recordCodexEntry,
  saveCodex,
  sortCodex,
  sortCodexForDisplay,
} from '../src/spell/spellCodex';
import type { SpellSpec } from '../src/spell/types';

const spec: SpellSpec = {
  name: '빙결의 가시',
  effect: 'damage',
  target: 'enemy',
  element_primary: 'ice',
  element_secondary: 'earth',
  form: 'bolt',
  size: 'large',
  speed: 'fast',
  status: ['freeze'],
  power: 62,
  cost: 37,
  flavor: '서리가 대지를 꿰뚫는다',
};

// 1) 항목 생성 — 요약이 사람이 읽을 한국어를 담는다
const entry = codexEntryFromSpec(spec, 1000);
assert.equal(entry.name, '빙결의 가시');
assert.equal(entry.element, 'ice');
for (const token of ['빙결+대지', '투사체', '대형', '위력 62']) {
  assert.ok(entry.summary.includes(token), `요약에 "${token}" 포함: ${entry.summary}`);
}
assert.equal(entry.flavor, '서리가 대지를 꿰뚫는다');
assert.equal(entry.castCount, 1);

// 1-b) 형상·행동 설계는 요약에 표식이 남는다 (발견의 기록)
const shaped = codexEntryFromSpec({ ...spec, shape: { kind: 'ring' } }, 1000);
assert.ok(shaped.summary.includes('형상 설계'));
const behaved = codexEntryFromSpec(
  { ...spec, behavior: { steps: [{ kind: 'dash', seconds: 1 }], loop: false } },
  1000,
);
assert.ok(behaved.summary.includes('행동 설계'));

// 1-c) 시퀀스 항목
const seqEntry = codexEntryFromSequence(
  { name: '화염 돌진 폭발', power: 75, sequences: [{}, {}] }, 'fire', 2000,
);
assert.ok(seqEntry.summary.includes('2단계'), seqEntry.summary);
assert.equal(seqEntry.element, 'fire');

// 2) 병합 — 같은 이름은 횟수 합산 + 첫 발견 보존, 새 이름은 앞에
let list = mergeCodexEntry([], entry);
list = mergeCodexEntry(list, { ...codexEntryFromSpec(spec, 5000), power: 99 });
assert.equal(list.length, 1, '같은 이름은 한 항목');
assert.equal(list[0].castCount, 2);
assert.equal(list[0].firstCastAt, 1000, '첫 발견 시각 보존');
assert.equal(list[0].lastCastAt, 5000, '최근 사용 갱신');
assert.equal(list[0].power, 62, '첫 발견 스펙 보존 (나중 판정이 달라도)');
list = mergeCodexEntry(list, seqEntry);
assert.equal(list[0].name, '화염 돌진 폭발', '새 이름은 맨 앞');

// 3) 상한 — 가장 오래 안 쓴 항목부터 밀려난다
let capped = [entry];
for (let i = 0; i < 5; i += 1) {
  capped = mergeCodexEntry(
    capped,
    { ...entry, name: `주문${i}`, firstCastAt: 2000 + i, lastCastAt: 2000 + i },
    3,
  );
  assert.ok(capped.length <= 3, '상한 유지');
}
assert.ok(!capped.some((e) => e.name === '빙결의 가시'), '가장 오래된 항목(1000)이 먼저 밀림');

// 4) 저장·로드 — 손상 데이터는 빈 도감 (게임을 멈추지 않는다)
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
};
recordCodexEntry(storage, entry);
recordCodexEntry(storage, entry);
const loaded = loadCodex(storage);
assert.equal(loaded.length, 1);
assert.equal(loaded[0].castCount, 2, '기록 왕복 후 횟수 유지');

mem.set(CODEX_CONFIG.storageKey, '{깨진 JSON');
assert.deepEqual(loadCodex(storage), [], '손상 JSON → 빈 도감');
mem.set(CODEX_CONFIG.storageKey, JSON.stringify([{ name: 1 }, entry]));
assert.equal(loadCodex(storage).length, 1, '스키마 불일치 항목만 걸러냄');

const throwing = {
  getItem: () => { throw new Error('quota'); },
  setItem: () => { throw new Error('quota'); },
};
assert.deepEqual(loadCodex(throwing), [], '스토리지 예외 → 빈 도감');
saveCodex(throwing, [entry]); // throw 없이 조용히 무시돼야 한다

// 5) 표시 정렬 — 최신 사용순, 원본 불변
const display = sortCodexForDisplay(list);
assert.ok(display[0].lastCastAt >= display[display.length - 1].lastCastAt);
assert.notEqual(display, list);

// 6) 인벤토리 필드 — 폼·크기·부속성이 스펙에서 보존된다 (아이콘·정렬용)
const iconEntry = codexEntryFromSpec(spec, 1000);
assert.equal(iconEntry.form, 'bolt', 'form 필드 보존');
assert.equal(iconEntry.size, 'large', 'size 필드 보존');
assert.equal(iconEntry.elementSecondary, 'earth', '부속성 보존');
assert.equal(seqEntry.form, undefined, '시퀀스는 폼 없음(전용 아이콘)');

// 7) 정렬 모드 — 위력·발견·속성·폼, 전부 원본 불변 + 안정
const pool = [
  { ...codexEntryFromSpec({ ...spec, name: 'A', element_primary: 'water', form: 'wave', power: 30 }, 3000) },
  { ...codexEntryFromSpec({ ...spec, name: 'B', element_primary: 'fire', form: 'bolt', power: 90 }, 1000) },
  { ...codexEntryFromSpec({ ...spec, name: 'C', element_primary: 'fire', form: 'nova', power: 60 }, 2000) },
];
assert.deepEqual(sortCodex(pool, 'power').map((e) => e.name), ['B', 'C', 'A'], '위력 내림차순');
assert.deepEqual(sortCodex(pool, 'discovered').map((e) => e.name), ['B', 'C', 'A'], '발견 오름차순');
assert.equal(sortCodex(pool, 'element')[0].element, 'fire', '속성 순서(fire 먼저)');
assert.deepEqual(
  sortCodex(pool, 'element').filter((e) => e.element === 'fire').map((e) => e.name),
  ['B', 'C'], '같은 속성 안에서 위력순',
);
assert.equal(sortCodex(pool, 'form')[0].form, 'bolt', '폼 순서(bolt 먼저)');
// 폼 없는 항목은 폼 정렬에서 맨 뒤
const withSeq = [seqEntry, ...pool];
assert.equal(sortCodex(withSeq, 'form')[withSeq.length - 1].form, undefined, '시퀀스는 폼 정렬 맨 뒤');
assert.notEqual(sortCodex(pool, 'power'), pool, '원본 불변');

console.log('spell codex regression: 생성·병합·상한·저장왕복·손상방어·정렬·인벤토리필드·정렬모드 7군 통과');
