import assert from 'node:assert/strict';
import worker from '../proxy/worker.js';

const originalFetch = globalThis.fetch;
const originalLog = console.log;
const timingLogs: string[] = [];
const backgroundTasks: Promise<unknown>[] = [];

globalThis.fetch = async () => new Response(JSON.stringify({
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          schema_version: 2,
          disposition: 'fizzle',
          reason: 'nonsense',
          message: '마력이 형태를 이루지 못했다',
        }),
      }],
    },
  }],
}), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
console.log = (...args: unknown[]) => {
  timingLogs.push(args.map(String).join(' '));
};

try {
  const requestId = 'judge-observability-test';
  const response = await worker.fetch(
    new Request('https://worker.invalid/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'http://127.0.0.1:5173',
      },
      body: JSON.stringify({ text: '관측 시험', requestId }),
    }),
    {
      GEMINI_API_KEY: 'test-key',
      ALLOWED_ORIGIN: 'https://jaepaly.github.io',
    },
    {
      waitUntil(task: Promise<unknown>) {
        backgroundTasks.push(task);
      },
    },
  );
  await Promise.all(backgroundTasks);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('X-Incant-Request-Id'), requestId);
  assert.match(
    response.headers.get('Server-Timing') ?? '',
    /^worker;dur=\d+(?:\.\d+)?, gemini;dur=\d+(?:\.\d+)?$/,
  );
  assert.equal(
    response.headers.get('Access-Control-Expose-Headers'),
    'Server-Timing, X-Incant-Request-Id',
  );

  assert.equal(timingLogs.length, 2);
  const parsedLogs = timingLogs.map(
    (line) => JSON.parse(line) as Record<string, unknown>,
  );
  const received = parsedLogs.find((record) => record.phase === 'received');
  const timing = parsedLogs.find((record) => record.phase === 'completed');
  assert.ok(received);
  assert.ok(timing);
  assert.equal(received.event, 'judge_timing');
  assert.equal(received.requestId, requestId);
  assert.equal(received.inputChars, 5);
  assert.equal('text' in received, false);
  assert.equal(timing.event, 'judge_timing');
  assert.equal(timing.requestId, requestId);
  assert.equal(timing.outcome, 'ok');
  assert.equal(timing.status, 200);
  assert.equal(timing.upstreamStatus, 200);
  assert.equal(timing.inputChars, 5);
  assert.equal(timing.model, 'gemini-3.5-flash-lite');
  assert.equal(typeof timing.workerPreMs, 'number');
  assert.equal(typeof timing.geminiMs, 'number');
  assert.equal(typeof timing.workerPostMs, 'number');
  assert.equal(typeof timing.workerTotalMs, 'number');
  assert.equal('text' in timing, false, '입력 원문은 서버 timing 로그에 남기지 않는다');
} finally {
  globalThis.fetch = originalFetch;
  console.log = originalLog;
}

console.log('Judge timing observability regression: request ID·구간 timing·CORS 노출·원문 비기록 4군 통과');
