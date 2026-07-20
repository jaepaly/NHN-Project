import assert from 'node:assert/strict';
import {
  GRIMOIRE_CAPACITY,
  addEntry,
  bestEntryFromRun,
  loadGrimoire,
  offerEntries,
  saveGrimoire,
  specFromEntry,
} from '../src/spell/grimoire';
import type { GrimoireEntry, StorageLike } from '../src/spell/grimoire';
import { SpellHistory } from '../src/spell/spellHistory';
import type { SpellElement, SpellForm, SpellSpec } from '../src/spell/types';

function spell(
  name: string,
  element: SpellElement,
  power: number,
  effect: SpellSpec['effect'] = 'damage',
  form: SpellForm = 'bolt',
): SpellSpec {
  return {
    name, effect, target: 'enemy',
    element_primary: element, element_secondary: null,
    form, size: 'medium', speed: 'normal', status: [], power, cost: 10,
  };
}

function entry(
  normalized: string, element: SpellElement, power: number,
): GrimoireEntry {
  return {
    normalized, rawText: normalized, name: normalized,
    element, form: 'bolt', power, result: 'win', recordedAt: 1,
  };
}

// 1) 런 최고 주문 추출 — damage만, 패널티 전 원 위력 기준
{
  const history = new SpellHistory();
  history.record({ rawText: '약한 불', spell: spell('약한 불', 'fire', 30), source: 'mock', castAt: 1 });
  history.record({ rawText: '거대한 빙하', spell: spell('거대한 빙하', 'ice', 80), source: 'mock', castAt: 2 });
  history.record({ rawText: '나를 지켜줘', spell: spell('보호막', 'light', 95, 'shield'), source: 'mock', castAt: 3 });
  const best = bestEntryFromRun(history, 'win', 1234);
  assert.ok(best);
  assert.equal(best.name, '거대한 빙하', '최고 위력 damage 주문 선택');
  assert.equal(best.element, 'ice');
  assert.equal(best.power, 80);
  assert.equal(best.result, 'win');
  assert.equal(best.recordedAt, 1234, '기록 시각 주입');

  // shield가 더 강해도 각인 대상이 아니므로 뽑히지 않는다 (EngraveManager 규칙과 일치)
  assert.notEqual(best.name, '보호막');

  // 반복 패널티로 깎인 값이 아니라 원 위력으로 비교한다
  const repeat = new SpellHistory();
  for (let i = 0; i < 4; i++) {
    repeat.record({ rawText: '같은 주문', spell: spell('같은 주문', 'fire', 70), source: 'mock', castAt: i });
  }
  const repeated = bestEntryFromRun(repeat, 'lose');
  assert.equal(repeated?.power, 70, '반복 패널티 전 원 위력 기록');
  assert.equal(repeated?.result, 'lose', '패배해도 기록된다');

  // 공격 주문이 없으면 기록할 게 없다
  const noDamage = new SpellHistory();
  noDamage.record({ rawText: '지켜줘', spell: spell('보호', 'light', 50, 'shield'), source: 'mock', castAt: 1 });
  assert.equal(bestEntryFromRun(noDamage, 'win'), null, '공격 주문 없으면 null');
  assert.equal(bestEntryFromRun(new SpellHistory(), 'win'), null, '빈 런은 null');
}

// 2) 추가 규칙 — 같은 주문은 더 강한 쪽만, 상한 유지
{
  let book: GrimoireEntry[] = [];
  book = addEntry(book, entry('화염구', 'fire', 50));
  book = addEntry(book, entry('화염구', 'fire', 80));
  assert.equal(book.length, 1, '같은 주문은 중복 저장 안 함');
  assert.equal(book[0].power, 80, '더 강한 쪽으로 갱신');
  book = addEntry(book, entry('화염구', 'fire', 40));
  assert.equal(book[0].power, 80, '약한 재기록은 무시');

  for (let i = 0; i < 20; i++) book = addEntry(book, entry(`주문${i}`, 'water', i + 1));
  assert.equal(book.length, GRIMOIRE_CAPACITY, '상한 유지');
  assert.ok(book.every((e, i, arr) => i === 0 || arr[i - 1].power >= e.power), '위력 내림차순');
  assert.equal(book[0].power, 80, '최강 주문은 밀려나지 않음');
}

// 3) 유산 후보 — 원소 다양성 우선 (보스 저항을 피할 선택지를 보장)
{
  const book: GrimoireEntry[] = [
    entry('화염1', 'fire', 90), entry('화염2', 'fire', 85), entry('화염3', 'fire', 80),
    entry('빙결1', 'ice', 70), entry('뇌전1', 'lightning', 60),
  ];
  const offered = offerEntries(book, 3);
  assert.equal(offered.length, 3);
  assert.equal(new Set(offered.map((e) => e.element)).size, 3, '서로 다른 원소 3종');
  assert.equal(offered[0].name, '화염1', '각 원소의 최강 주문 우선');

  // 원소가 부족하면 상위권으로 보충 (후보 수는 유지)
  const monoBook: GrimoireEntry[] = [
    entry('화염1', 'fire', 90), entry('화염2', 'fire', 80), entry('화염3', 'fire', 70),
  ];
  const monoOffer = offerEntries(monoBook, 3);
  assert.equal(monoOffer.length, 3, '단일 원소여도 후보 수 유지');
  assert.equal(new Set(monoOffer.map((e) => e.normalized)).size, 3, '같은 항목 중복 제시 없음');

  assert.deepEqual(offerEntries([], 3), [], '빈 주문서는 빈 후보');
  assert.equal(offerEntries(book, 10).length, book.length, '보유보다 많이 요구해도 보유분까지만');
}

// 4) 각인용 spec 복원 — 광역 폼은 area로
{
  const bolt = specFromEntry(entry('화살', 'wind', 55));
  assert.equal(bolt.effect, 'damage');
  assert.equal(bolt.target, 'enemy');
  assert.equal(bolt.cost, 0, '유산 각인은 자원 무소모');
  assert.equal(bolt.power, 55);

  const zoneEntry: GrimoireEntry = { ...entry('대지진', 'earth', 60), form: 'zone' };
  assert.equal(specFromEntry(zoneEntry).target, 'area', 'zone은 area 대상');
  const novaEntry: GrimoireEntry = { ...entry('폭발', 'fire', 60), form: 'nova' };
  assert.equal(specFromEntry(novaEntry).target, 'area', 'nova는 area 대상');
}

// 5) 저장·로드 — 버전 키, 손상 데이터 방어
{
  const store = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => { store.set(k, v); },
  };
  const book = [entry('화염구', 'fire', 80), entry('빙창', 'ice', 60)];
  saveGrimoire(book, storage);
  assert.ok([...store.keys()][0].startsWith('incant:grimoire:v1:'), '버전 접두사 키');
  assert.deepEqual(loadGrimoire(storage), book, '왕복 보존');

  assert.deepEqual(loadGrimoire(null), [], 'storage 없으면 빈 주문서');
  store.set('incant:grimoire:v1:entries', '{not json');
  assert.deepEqual(loadGrimoire(storage), [], '손상 JSON 방어');
  store.set('incant:grimoire:v1:entries', JSON.stringify([{ bogus: true }, entry('정상', 'fire', 30)]));
  const recovered = loadGrimoire(storage);
  assert.equal(recovered.length, 1, '불량 항목만 버리고 정상 항목은 살린다');
  assert.equal(recovered[0].name, '정상');

  // 저장 실패(용량 초과 등)해도 던지지 않는다 — 게임은 계속돼야 한다
  const throwing: StorageLike = {
    getItem: () => null,
    setItem: () => { throw new Error('quota'); },
  };
  assert.doesNotThrow(() => saveGrimoire(book, throwing), '저장 실패는 무시');
}

console.log('Grimoire regression: 최고주문 추출·중복/상한·원소다양 후보·spec 복원·저장방어 5군 통과');
