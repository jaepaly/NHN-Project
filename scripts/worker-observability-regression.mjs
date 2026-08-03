import assert from 'node:assert/strict';
import { buildJudgeTimingLog, sanitizeRequestId, sha256Hex } from '../proxy/observability.js';

assert.equal(sanitizeRequestId('req-test-1234'), 'req-test-1234');
assert.match(sanitizeRequestId('contains spaces'), /^req-/u);
assert.match(sanitizeRequestId(''), /^req-/u);

const hash = await sha256Hex('얼음 가시가 땅에서 솟아오른다');
assert.equal(hash.length, 64);
assert.notEqual(hash, '얼음 가시가 땅에서 솟아오른다');

const log = buildJudgeTimingLog({
  requestId: 'req-test-1234',
  route: '/',
  inputLength: 15,
  inputHash: hash,
  attempts: [{ attempt: 1, status: 200, elapsedMs: 2100 }],
  retryReason: 'none',
  outcome: 'cast',
  validation: 'valid',
  elapsedMs: 2110,
  geminiElapsedMs: 2100,
  colo: 'NRT',
});
assert.deepEqual(log, {
  event: 'judge_timing',
  requestId: 'req-test-1234',
  route: '/',
  inputLength: 15,
  inputHash: hash,
  attempts: [{ attempt: 1, status: 200, elapsedMs: 2100 }],
  retryReason: 'none',
  outcome: 'cast',
  validation: 'valid',
  elapsedMs: 2110,
  geminiElapsedMs: 2100,
  colo: 'NRT',
});
assert.equal(Object.hasOwn(log, 'text'), false, 'structured log must not contain raw incantation');

console.log('Worker observability regression: request-id·SHA-256·attempt timing·raw input exclusion 4군 통과');
