import assert from 'node:assert/strict';
import { GeminiJudge, JUDGE_PROMPT_VERSION, JUDGE_SCHEMA_VERSION } from '../src/spell/geminiJudge';
import { MockJudge } from '../src/spell/mockJudge';
import type { SpellJudgement } from '../src/spell/types';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const mock = new MockJudge();
let remotePayload: SpellJudgement = await mock.judge('화염구');
let fetchCount = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  fetchCount += 1;
  return new Response(JSON.stringify(remotePayload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  // 1) 명백한 무의미·금칙 입력은 네트워크 전에 차단한다.
  const localJudge = new GeminiJudge('https://proxy.invalid');
  assert.equal((await localJudge.judge('ㅁㄴㅇㄹ')).disposition, 'fizzle');
  assert.equal((await localJudge.judge('씨발')).disposition, 'blocked');
  assert.equal(localJudge.lastSource, 'local');
  assert.equal(fetchCount, 0);

  // 2) 정상 Gemini cast는 캐시되고 두 번째 호출은 네트워크를 쓰지 않는다.
  storage.clear();
  const castJudge = new GeminiJudge('https://proxy.invalid');
  assert.equal((await castJudge.judge('화염구')).disposition, 'cast');
  assert.equal(castJudge.lastSource, 'gemini');
  assert.equal(fetchCount, 1);
  assert.equal((await castJudge.judge('화염구')).disposition, 'cast');
  assert.equal(castJudge.lastSource, 'cache');
  assert.equal(fetchCount, 1);

  // 3) 모델이 의미 있는 짧은 주문을 fizzle해도 Mock이 발동으로 복구하고 캐시하지 않는다.
  storage.clear();
  remotePayload = {
    schema_version: 2,
    disposition: 'fizzle',
    reason: 'nonsense',
    message: '마력이 형태를 이루지 못했다',
  };
  const driftJudge = new GeminiJudge('https://proxy.invalid');
  const recoveredFire = await driftJudge.judge('화염구');
  assert.equal(recoveredFire.disposition, 'cast');
  assert.equal(driftJudge.lastSource, 'fallback');
  assert.equal(storage.length, 0, '원격 fizzle은 캐시 금지');
  const countAfterFirstRecovery = fetchCount;
  assert.equal((await driftJudge.judge('화염구')).disposition, 'cast');
  assert.equal(fetchCount, countAfterFirstRecovery + 1, 'fizzle 미캐시로 다음 호출 재시도');

  // 4) 의미 기반 회복 주문도 Mock 폴백에서 의도를 보존한다.
  const recoveredHeal = await driftJudge.judge('배고프다');
  assert.equal(recoveredHeal.disposition, 'cast');
  if (recoveredHeal.disposition === 'cast') {
    assert.equal(recoveredHeal.spell.effect, 'heal');
    assert.equal(recoveredHeal.spell.target, 'self');
  }

  // 5) 부분 배포 등으로 현재 버전 prefix에 fizzle 캐시가 생겨도 무시한다.
  const poisonedKey = `incant:judge:v${JUDGE_SCHEMA_VERSION}:${JUDGE_PROMPT_VERSION}:얼음창`;
  storage.setItem(poisonedKey, JSON.stringify(remotePayload));
  const countBeforePoisoned = fetchCount;
  assert.equal((await driftJudge.judge('얼음창')).disposition, 'cast');
  assert.equal(driftJudge.lastSource, 'fallback');
  assert.equal(fetchCount, countBeforePoisoned + 1, '오염된 fizzle 캐시를 읽지 않음');

  assert.equal(JUDGE_PROMPT_VERSION, 'meaning-v2.6-seq');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Gemini fizzle safety regression: 로컬차단·cast캐시·fizzle폴백·회복의도·오염캐시 5군 통과');
