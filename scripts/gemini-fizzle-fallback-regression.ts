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
let lastRequestBody: { text?: unknown; requestId?: unknown } | undefined;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_input, init) => {
  fetchCount += 1;
  lastRequestBody = JSON.parse(String(init?.body ?? '{}')) as {
    text?: unknown;
    requestId?: unknown;
  };
  return new Response(JSON.stringify(remotePayload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Server-Timing': 'worker;dur=1200, gemini;dur=1180',
      'X-Incant-Request-Id': String(lastRequestBody.requestId),
    },
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
  assert.equal(castJudge.lastFallbackReason, undefined);
  assert.equal(lastRequestBody?.text, '화염구');
  assert.equal(lastRequestBody?.requestId, castJudge.lastRequestId);
  assert.match(castJudge.lastRequestId ?? '', /^[0-9a-f-]{36}$/);
  assert.equal(castJudge.lastTimeoutBudgetMs, 2500);
  assert.equal(castJudge.lastSequentialHint, false);
  assert.equal(castJudge.lastServerTiming, 'worker;dur=1200, gemini;dur=1180');
  assert.equal(fetchCount, 1);
  assert.equal((await castJudge.judge('화염구')).disposition, 'cast');
  assert.equal(castJudge.lastSource, 'cache');
  assert.equal(castJudge.lastFallbackReason, undefined);
  assert.equal(fetchCount, 1);

  storage.clear();
  const sequenceHintJudge = new GeminiJudge('https://proxy.invalid');
  assert.equal(
    (await sequenceHintJudge.judge('물러섰다가 화염 폭풍을 부른다')).disposition,
    'cast',
  );
  assert.equal(sequenceHintJudge.lastTimeoutBudgetMs, 3200);
  assert.equal(sequenceHintJudge.lastSequentialHint, true);

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
  assert.equal(driftJudge.lastFallbackReason, 'remote_fizzle');
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
  assert.equal(driftJudge.lastFallbackReason, 'remote_fizzle');
  assert.equal(fetchCount, countBeforePoisoned + 1, '오염된 fizzle 캐시를 읽지 않음');

  // 6) fallback 원인을 HTTP·timeout·invalid JSON·network로 구분해 관측한다.
  storage.clear();
  globalThis.fetch = async () => new Response('quota', { status: 429 });
  const quotaJudge = new GeminiJudge('https://proxy.invalid');
  assert.equal((await quotaJudge.judge('별빛 공격')).disposition, 'cast');
  assert.equal(quotaJudge.lastSource, 'fallback');
  assert.equal(quotaJudge.lastFallbackReason, 'http_429');

  globalThis.fetch = async () => {
    throw new DOMException('aborted', 'AbortError');
  };
  const timeoutJudge = new GeminiJudge('https://proxy.invalid');
  assert.equal((await timeoutJudge.judge('달빛 공격')).disposition, 'cast');
  assert.equal(timeoutJudge.lastFallbackReason, 'timeout');

  globalThis.fetch = async () => new Response('{not-json', { status: 200 });
  const invalidJudge = new GeminiJudge('https://proxy.invalid');
  assert.equal((await invalidJudge.judge('서리 공격')).disposition, 'cast');
  assert.equal(invalidJudge.lastFallbackReason, 'invalid_response');

  globalThis.fetch = async () => {
    throw new Error('offline');
  };
  const networkJudge = new GeminiJudge('https://proxy.invalid');
  assert.equal((await networkJudge.judge('폭풍 공격')).disposition, 'cast');
  assert.equal(networkJudge.lastFallbackReason, 'network_error');

  assert.equal(JUDGE_PROMPT_VERSION, 'meaning-v2.15-abstract-seq');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Gemini fizzle safety regression: 로컬차단·cast캐시·fizzle폴백·회복의도·오염캐시·fallback원인 6군 통과');
