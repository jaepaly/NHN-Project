import assert from 'node:assert/strict';
import {
  seedJudgeCache,
  JUDGE_PROMPT_VERSION,
  JUDGE_SCHEMA_VERSION,
} from '../src/spell/geminiJudge';
import type { JudgeCacheSeed } from '../src/spell/geminiJudge';

/** Map 기반 최소 Storage — seedJudgeCache가 쓰는 get/set만 실제 동작하면 된다. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => { map.delete(k); },
    setItem: (k: string, v: string) => { map.set(k, v); },
  } as Storage;
}

const PREFIX = `incant:judge:v${JUDGE_SCHEMA_VERSION}:${JUDGE_PROMPT_VERSION}:`;
const cast = (name: string) => ({
  schema_version: 2, disposition: 'cast',
  spell: {
    name, effect: 'damage', target: 'enemy', element_primary: 'fire',
    element_secondary: null, form: 'bolt', size: 'medium', speed: 'normal',
    status: [], power: 50, cost: 30,
  },
});
const fizzle = { schema_version: 2, disposition: 'fizzle', reason: 'nonsense', message: 'x' };

// ── 버전 일치: cast만 주입, 기존 키·fizzle 제외 ──
{
  const storage = fakeStorage();
  storage.setItem(PREFIX + '기존', 'REAL-CACHE'); // 실제 라이브 판정이 이미 있는 상태
  const seed: JudgeCacheSeed = {
    version: JUDGE_PROMPT_VERSION, schema: JUDGE_SCHEMA_VERSION,
    entries: {
      '파이어볼': cast('파이어볼'),
      '기존': cast('덮으면안됨'),   // 기존 키 → 스킵
      'ㅁㄴㅇㄹ': fizzle,            // fizzle → 스킵
    },
  };
  assert.equal(seedJudgeCache(storage, seed), 1, 'cast 1개만 주입(기존·fizzle 제외)');
  assert.ok(storage.getItem(PREFIX + '파이어볼'), '새 cast 주입됨');
  assert.equal(storage.getItem(PREFIX + '기존'), 'REAL-CACHE', '기존 캐시 안 덮음');
  assert.equal(storage.getItem(PREFIX + 'ㅁㄴㅇㄹ'), null, 'fizzle 미주입');
  assert.equal(JSON.parse(storage.getItem(PREFIX + '파이어볼') as string).disposition, 'cast', '주입값=판정 JSON');
}

// ── 버전/스키마 불일치: 아무것도 주입하지 않는다 (스테일 방지) ──
{
  const storage = fakeStorage();
  assert.equal(
    seedJudgeCache(storage, { version: 'meaning-v0-stale', schema: JUDGE_SCHEMA_VERSION, entries: { x: cast('x') } }),
    0, '버전 불일치 → 0',
  );
  assert.equal(
    seedJudgeCache(storage, { version: JUDGE_PROMPT_VERSION, schema: 99, entries: { x: cast('x') } }),
    0, '스키마 불일치 → 0',
  );
  assert.equal(storage.length, 0, '불일치 시 저장소 비어 있음');
}

// ── trim: 앞뒤 공백 제거한 키로 저장(judge()의 key.trim()과 정합) ──
{
  const storage = fakeStorage();
  seedJudgeCache(storage, {
    version: JUDGE_PROMPT_VERSION, schema: JUDGE_SCHEMA_VERSION,
    entries: { '  여백  ': cast('여백') },
  });
  assert.ok(storage.getItem(PREFIX + '여백'), 'trim된 키로 저장');
}

console.log('Cache seed regression: 버전게이트·기존캐시우선·fizzle제외·trim 4군 통과');
