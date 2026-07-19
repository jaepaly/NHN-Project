import assert from 'node:assert/strict';
import {
  sanitizeName,
  templateEvolvedName,
  getEvolvedName,
  evolveCacheKey,
} from '../src/spell/evolveName';
import type { EvolveNameRequest } from '../src/spell/evolveName';

// 1) sanitizeName — 공백·따옴표/괄호 정리·12자 제한·무효값
assert.equal(sanitizeName('  업화의   뇌격 '), '업화의 뇌격', '공백 정리');
assert.equal(sanitizeName('『멸망의 낙하』'), '멸망의 낙하', '겹낫표 제거');
assert.equal(sanitizeName('"작열"'), '작열', '따옴표 제거');
assert.equal(sanitizeName(''), null, '빈 문자열 무효');
assert.equal(sanitizeName(42), null, '비문자열 무효');
assert.equal(sanitizeName('가'.repeat(30))?.length, 12, '12자 제한(주문명 스키마 일치)');

// 2) templateEvolvedName — 폴백 결정론
const fuse: EvolveNameRequest = { kind: 'fuse', elements: ['fire', 'lightning'] };
assert.equal(templateEvolvedName(fuse), '불꽃·뇌전 융합', '융합 템플릿');
const fuseDark: EvolveNameRequest = { kind: 'fuse', elements: ['fire', 'dark'] };
assert.equal(templateEvolvedName(fuseDark), '불꽃·심연 융합', '융합(fire+dark)');
const evolve: EvolveNameRequest = { kind: 'evolve', baseName: '화염구', elements: ['fire'], level: 2 };
assert.equal(templateEvolvedName(evolve), '불꽃 대격변', '진화 템플릿');
const noElem: EvolveNameRequest = { kind: 'evolve', elements: [] };
assert.equal(templateEvolvedName(noElem), '마력 대격변', '원소 없어도 이름 나옴');

// 3) getEvolvedName — 프록시 도달 불가 시 템플릿 폴백 (작명은 반드시 성공)
const name = await getEvolvedName(fuse, 'http://127.0.0.1:9'); // 닫힌 포트
assert.equal(name, '불꽃·뇌전 융합', '프록시 실패 → 템플릿 폴백');
assert.ok(name.length > 0 && name.length <= 12, '항상 유효한 12자 이내 이름');

// 4) evolveCacheKey — 결정론 + 원소 정렬(같은 융합=같은 키)
assert.equal(
  evolveCacheKey({ kind: 'fuse', elements: ['fire', 'lightning'] }),
  evolveCacheKey({ kind: 'fuse', elements: ['lightning', 'fire'] }),
  '원소 순서 무관 동일 키',
);
assert.equal(
  evolveCacheKey({ kind: 'evolve', baseName: '화염구', elements: ['fire'] }),
  'evolve:fire:화염구',
  '진화 키에 baseName 포함',
);

// 5) 캐시 동작 — localStorage·fetch 스텁으로 히트/미스/폴백-비저장 검증
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};
let fetchCalls = 0;
const okFetch = (name: string) => async () =>
  ({ ok: true, json: async () => ({ name }) }) as Response;
const setFetch = (fn: () => Promise<Response>) => {
  (globalThis as { fetch: unknown }).fetch = () => {
    fetchCalls++;
    return fn();
  };
};

const req: EvolveNameRequest = { kind: 'fuse', elements: ['fire', 'lightning'] };
setFetch(okFetch('업화의 뇌격'));
assert.equal(await getEvolvedName(req, 'http://x'), '업화의 뇌격', '첫 호출 프록시');
assert.equal(fetchCalls, 1, '첫 호출은 프록시 1회');
assert.equal(await getEvolvedName(req, 'http://x'), '업화의 뇌격', '둘째 캐시 히트');
assert.equal(fetchCalls, 1, '캐시 히트 → 프록시 재호출 없음');
assert.equal(
  await getEvolvedName({ kind: 'fuse', elements: ['lightning', 'fire'] }, 'http://x'),
  '업화의 뇌격',
  '원소 순서 반대여도 같은 캐시',
);
assert.equal(fetchCalls, 1, '정렬 키 덕에 프록시 재호출 없음');

// 폴백은 캐시하지 않는다 → 프록시 복구 시 진짜 이름을 받는다
const evReq: EvolveNameRequest = { kind: 'evolve', baseName: '화염구', elements: ['fire'] };
setFetch(async () => {
  throw new Error('down');
});
assert.equal(await getEvolvedName(evReq, 'http://x'), '불꽃 대격변', '프록시 실패 → 템플릿');
fetchCalls = 0;
setFetch(okFetch('작열의 핵'));
assert.equal(await getEvolvedName(evReq, 'http://x'), '작열의 핵', '복구 후 진짜 이름');
assert.equal(fetchCalls, 1, '폴백은 캐시 안 됨 → 프록시 재호출');

console.log('EvolveName regression: sanitize·템플릿·폴백·캐시키·캐시히트/폴백비저장 5군 통과');
