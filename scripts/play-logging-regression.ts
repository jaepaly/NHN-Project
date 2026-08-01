import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judgementLogFields } from '../src/spell/loggingJudge';
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
          { type: 'form', spec: { ...spell, effect: 'buff', target: 'self', form: 'buff', power: 0, cost: 0 } },
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

const sceneSource = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
for (const token of [
  "type: 'run_started'",
  "type: 'room_started'",
  "type: 'run_completed'",
  'power: plan.power',
  'manaCost: plan.manaCost',
]) {
  assert.ok(sceneSource.includes(token), `플레이 로그 배선 누락: ${token}`);
}
assert.ok(
  sceneSource.indexOf("this.logRunStarted('new'") < sceneSource.indexOf('this.logRoomStarted(initialRunState)'),
  '초기 런 경계가 첫 방 경계보다 먼저 기록되어야 함',
);

console.log('Play logging regression: 단일·시퀀스 요약·거절·세션 envelope·런경계배선 5군 통과');
