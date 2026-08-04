import assert from 'node:assert/strict';
import { GeminiJudge, judgeTimeoutMs } from '../src/spell/geminiJudge';
import { MockJudge } from '../src/spell/mockJudge';
import type { SpellJudgement } from '../src/spell/types';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  clear(): void {
    this.values.clear();
  }
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const originalFetch = globalThis.fetch;
const fastRetryPolicy = { attemptTimeoutMs: 5, maxAttempts: 2 };
const mock = new MockJudge();
const remotePayload: SpellJudgement = await mock.judge('화염 화살');

function successResponse(): Response {
  return new Response(JSON.stringify(remotePayload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function waitForAbort(signal: AbortSignal | null | undefined): Promise<Response> {
  return new Promise((_resolve, reject) => {
    if (!signal) {
      reject(new Error('missing request signal'));
      return;
    }
    if (signal.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    signal.addEventListener('abort', () => {
      reject(new DOMException('aborted', 'AbortError'));
    }, { once: true });
  });
}

try {
  assert.equal(judgeTimeoutMs('아무 주문'), 5000, '총 대기 예산은 5초다');

  // 첫 요청만 장기 지연이면 즉시 두 번째 요청으로 회복한다.
  storage.clear();
  let retryCalls = 0;
  globalThis.fetch = async (_input, init) => {
    retryCalls += 1;
    return retryCalls === 1 ? waitForAbort(init?.signal) : successResponse();
  };
  const recoveredJudge = new GeminiJudge(
    'https://proxy.invalid',
    new MockJudge(),
    fastRetryPolicy,
  );
  assert.equal((await recoveredJudge.judge('첫 요청 지연')).disposition, 'cast');
  assert.equal(recoveredJudge.lastSource, 'gemini');
  assert.equal(recoveredJudge.lastFallbackReason, undefined);
  assert.equal(retryCalls, 2, 'timeout 뒤에만 두 번째 요청을 보낸다');

  // 두 요청 모두 장기 지연이면 5초 예산 뒤에 기존 MockJudge fallback으로 돌아온다.
  storage.clear();
  let timeoutCalls = 0;
  globalThis.fetch = async (_input, init) => {
    timeoutCalls += 1;
    return waitForAbort(init?.signal);
  };
  const timeoutJudge = new GeminiJudge(
    'https://proxy.invalid',
    new MockJudge(),
    fastRetryPolicy,
  );
  assert.equal((await timeoutJudge.judge('두 요청 지연')).disposition, 'cast');
  assert.equal(timeoutJudge.lastSource, 'fallback');
  assert.equal(timeoutJudge.lastFallbackReason, 'timeout');
  assert.equal(timeoutCalls, 2, '재시도는 한 번으로 제한한다');

  // 확정된 HTTP 실패와 JSON 오류에는 재시도하지 않아 할당량/오류를 반복하지 않는다.
  storage.clear();
  let httpCalls = 0;
  globalThis.fetch = async () => {
    httpCalls += 1;
    return new Response(JSON.stringify({ error: 'upstream', status: 400 }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  const httpJudge = new GeminiJudge(
    'https://proxy.invalid',
    new MockJudge(),
    fastRetryPolicy,
  );
  assert.equal((await httpJudge.judge('즉시 오류')).disposition, 'cast');
  assert.equal(httpJudge.lastFallbackReason, 'http_502_upstream_400');
  assert.equal(httpCalls, 1, 'HTTP 오류는 같은 요청을 반복하지 않는다');

  storage.clear();
  let jsonCalls = 0;
  globalThis.fetch = async () => {
    jsonCalls += 1;
    return new Response('{not-json', { status: 200 });
  };
  const invalidJsonJudge = new GeminiJudge(
    'https://proxy.invalid',
    new MockJudge(),
    fastRetryPolicy,
  );
  assert.equal((await invalidJsonJudge.judge('무효 응답')).disposition, 'cast');
  assert.equal(invalidJsonJudge.lastFallbackReason, 'invalid_response');
  assert.equal(jsonCalls, 1, '무효 JSON은 재시도하지 않는다');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Gemini timeout retry regression: timeout 1회 재시도·5초 총 예산·확정 오류 비재시도 통과');
