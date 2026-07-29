import assert from 'node:assert/strict';
import { judgementLogFields, judgeTraceLogFields } from '../src/spell/loggingJudge';
import type { SpellJudge } from '../src/spell/judge';
import { buildPlayLogRecord } from '../src/spell/playLog';
import type { SpellJudgement, SpellSpec } from '../src/spell/types';

const spell: SpellSpec = {
  name: '별빛 연쇄',
  effect: 'damage',
  target: 'enemy',
  element_primary: 'light',
  element_secondary: null,
  form: 'bolt',
  size: 'medium',
  speed: 'normal',
  status: [],
  power: 70,
  cost: 42,
};

const single: SpellJudgement = {
  schema_version: 2,
  disposition: 'cast',
  spell,
};
assert.deepEqual(judgementLogFields(single), {
  disp: 'cast',
  mode: 'single',
  sequenceCount: 0,
  behaviorCount: 0,
  name: '별빛 연쇄',
  el: 'light',
  form: 'bolt',
  effect: 'damage',
  power: 70,
  cost: 42,
});

const sequence: SpellJudgement = {
  schema_version: 2,
  disposition: 'cast',
  spell,
  plan: {
    name: '별빛 장례',
    power: 80,
    durationMs: 1800,
    sequences: [
      {
        behaviors: [
          { type: 'move', destination: 'away-from-target', element: 'light', distance: 120 },
          { type: 'wait' },
        ],
      },
      {
        behaviors: [
          { type: 'form', spec: { ...spell, power: 0, cost: 0 } },
        ],
      },
    ],
  },
};
assert.deepEqual(judgementLogFields(sequence), {
  disp: 'cast',
  mode: 'sequence',
  sequenceCount: 2,
  behaviorCount: 3,
  name: '별빛 연쇄',
  el: 'light',
  form: 'bolt',
  effect: 'damage',
  power: 70,
  cost: 42,
});

assert.deepEqual(judgementLogFields({
  schema_version: 2,
  disposition: 'fizzle',
  reason: 'nonsense',
  message: '불발',
}), { disp: 'fizzle' });

const tracedJudge: SpellJudge = {
  name: 'trace-test',
  async judge() {
    return single;
  },
  lastRequestId: 'judge-request-test',
  lastTimeoutBudgetMs: 3200,
  lastSequentialHint: true,
  lastServerTiming: 'worker;dur=1500, gemini;dur=1480',
};
assert.deepEqual(judgeTraceLogFields(tracedJudge), {
  requestId: 'judge-request-test',
  timeoutBudgetMs: 3200,
  sequentialHint: true,
  serverTiming: 'worker;dur=1500, gemini;dur=1480',
});

const envelope = buildPlayLogRecord(
  { type: 'sequence_exec', input: '달빛의 장례 행렬' },
  { sessionId: 'session-test', atMs: Date.UTC(2026, 6, 29, 8, 0, 0) },
);
assert.deepEqual(envelope, {
  type: 'sequence_exec',
  input: '달빛의 장례 행렬',
  at: '2026-07-29T08:00:00.000Z',
  sessionId: 'session-test',
});

console.log('Play logging regression: 단일·시퀀스 요약·거절·timing trace·세션 envelope 5군 통과');
