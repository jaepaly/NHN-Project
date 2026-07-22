import assert from 'node:assert/strict';
import {
  validateSummonBehavior,
  BEHAVIOR_LIMITS,
} from '../src/spell/summonBehavior';
import { SummonBehaviorRunner } from '../src/combat-core/summons/behaviorRunner';
import { MockJudge } from '../src/spell/mockJudge';

// 1) 검증기 — 쓰레기 거부, 화이트리스트, 클램프
assert.equal(validateSummonBehavior(null), null);
assert.equal(validateSummonBehavior({ steps: 'x' }), null);
assert.equal(validateSummonBehavior({ steps: [{ kind: 'teleport' }] }), null, '미지 kind 거부');
const clamped = validateSummonBehavior({
  steps: [{ kind: 'dash', seconds: 999, speed: 99999 }],
});
assert.ok(clamped, '유효 스텝 통과');
assert.equal(clamped!.steps[0].seconds, BEHAVIOR_LIMITS.maxStepSeconds, 'seconds 클램프');
assert.equal(clamped!.steps[0].speed, BEHAVIOR_LIMITS.maxSpeed, 'speed 클램프');
const many = validateSummonBehavior({
  steps: Array.from({ length: 20 }, () => ({ kind: 'hold', seconds: 1 })),
});
assert.equal(many!.steps.length, BEHAVIOR_LIMITS.maxSteps, '스텝 수 상한');

// 2) 런너 — hold는 제자리, chase는 표적 접근
const hold = new SummonBehaviorRunner({ steps: [{ kind: 'hold', seconds: 5 }], loop: true });
const p0 = { x: 100, y: 100 };
assert.deepEqual(hold.advance(0.5, p0, { x: 0, y: 0 }, { x: 500, y: 500 }), p0, 'hold 제자리');

const chase = new SummonBehaviorRunner({
  steps: [{ kind: 'chase', seconds: 5, speed: 100 }], loop: true,
});
const c1 = chase.advance(0.5, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 300, y: 0 });
assert.ok(Math.abs(c1.x - 50) < 1e-6 && c1.y === 0, 'chase: 100px/s × 0.5s = 50px 접근');

// 3) 런너 — 스텝 전환·루프
const seq = new SummonBehaviorRunner({
  steps: [{ kind: 'hold', seconds: 1 }, { kind: 'chase', seconds: 1, speed: 100 }],
  loop: true,
});
let pos = { x: 0, y: 0 };
pos = seq.advance(0.5, pos, { x: 0, y: 0 }, { x: 1000, y: 0 });
assert.equal(pos.x, 0, '스텝1(hold) 중');
pos = seq.advance(0.6, pos, { x: 0, y: 0 }, { x: 1000, y: 0 }); // 1.1s → 스텝2 진입
assert.ok(pos.x > 0, '스텝2(chase) 전환됨');

// 4) 런너 — zigzag는 전진하면서 수직 진동 (표적에 접근)
const zig = new SummonBehaviorRunner({
  steps: [{ kind: 'zigzag', seconds: 6, speed: 100, amplitude: 40 }], loop: true,
});
let zp = { x: 0, y: 0 };
let sawOffAxis = false;
for (let i = 0; i < 20; i += 1) {
  zp = zig.advance(0.1, zp, { x: 0, y: 0 }, { x: 1000, y: 0 });
  if (Math.abs(zp.y) > 0.5) sawOffAxis = true;
}
assert.ok(zp.x > 100, 'zigzag 전진');
assert.ok(sawOffAxis, 'zigzag 수직 진동 관측');

// 5) MockJudge — 그 문장이 진짜 프로그램이 된다
const judge = new MockJudge();
const j = await judge.judge('분신을 만들어서 지그재그로 돌진시켜라');
assert.equal(j.disposition, 'cast');
const spec = (j as { spell: { effect: string; behavior?: { steps: { kind: string }[] } } }).spell;
assert.equal(spec.effect, 'summon', '분신 → summon');
assert.ok(spec.behavior, 'behavior 산출됨');
assert.deepEqual(
  spec.behavior!.steps.map((s) => s.kind),
  ['zigzag', 'dash'],
  '등장 순서대로 [지그재그, 돌진]',
);
// 행동 동사 없으면 behavior 없음 (기본 궤도 유지)
const plain = await judge.judge('물의 정령을 소환하라');
assert.equal((plain as { spell: { behavior?: unknown } }).spell.behavior, undefined, '동사 없음 → 기본');

console.log('SummonBehavior regression: 검증기·런너(hold/chase/전환/zigzag)·Mock조합 5군 통과');
