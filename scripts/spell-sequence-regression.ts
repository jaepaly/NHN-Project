import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import {
  debugSpellPlan,
  resolveSpellPlan,
  sequencePlanHasActionBehavior,
  sequenceFlowTimeline,
  type ResolvedSpellSequence,
} from '../src/spell/sequencePlan';
import { SEQUENCE_FIXTURE_CATALOG } from '../src/spell/sequenceFixtureCatalog';

for (const fixture of SEQUENCE_FIXTURE_CATALOG) {
  const behaviors = fixture.plan.sequences.flatMap((sequence) => sequence.behaviors);
  assert.ok(behaviors.every((behavior) => behavior.type === 'form' || behavior.type === 'wait'),
    `${fixture.key} must not contain legacy move behaviors`);
}

const phoenix = resolveSpellPlan(debugSpellPlan('불사조의 낙화')!);
assert.ok(phoenix.sequences.length >= 2, 'movement imagery keeps a multi-beat plan');
assert.ok(phoenix.sequences.some((sequence) => sequence.behaviors.some((behavior) => behavior.type === 'wait')),
  'movement imagery keeps explicit timing gaps');

const formSequence = (durationMs: number): ResolvedSpellSequence => ({
  durationMs,
  behaviors: [{ type: 'form', spec: {
    name: '타격', effect: 'damage', target: 'enemy', element_primary: 'fire',
    element_secondary: null, form: 'bolt', size: 'small', speed: 'fast', status: [], power: 10, cost: 0,
  } }],
});
const waitSequence = (durationMs: number): ResolvedSpellSequence => ({
  durationMs, behaviors: [{ type: 'wait' }],
});
const actionSpec = {
  name: '?대룞', effect: 'summon' as const, target: 'enemy' as const, element_primary: 'fire' as const,
  element_secondary: null, form: 'summon' as const, size: 'small' as const, speed: 'fast' as const,
  status: [], power: 10, cost: 0,
  behavior: { steps: [{ kind: 'dash' as const, seconds: 1 }], loop: false },
};
assert.equal(
  sequencePlanHasActionBehavior({ sequences: [formSequence(1000)] }),
  false,
  '순수 주문 시퀀스는 에코 허용 대상',
);
assert.equal(
  sequencePlanHasActionBehavior({ sequences: [{ durationMs: 1000, behaviors: [{ type: 'form', spec: actionSpec }] }] }),
  true,
  '행동 DSL 시퀀스는 에코 제외',
);
const timeline = sequenceFlowTimeline([formSequence(1000), waitSequence(300), formSequence(1000)]);
assert.deepEqual(timeline.waitsMs, [700, 300, 200]);
assert.equal(timeline.totalMs, 1200, 'form timing remains after movement removal');

const state = new PlayerCombatState();
state.applyTimedBuff('ward', 0.5, 1);
assert.deepEqual(state.takeDamage(20), { hpDamage: 10, shieldDamage: 0 }, 'explicit ward still mitigates damage');
assert.equal(state.takeEnvironmentalDamage(10), 10, 'sequence execution no longer blocks environmental damage');

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
assert.ok(!scene.includes('executeSequenceMove'), 'sequence runtime must not move the player');
assert.ok(!scene.includes('applyInvulnerability(timeline.totalMs'), 'sequence runtime must not grant blanket invulnerability');
assert.ok(!scene.includes('sequenceMoveTweens'), 'sequence runtime must not own player movement tweens');
assert.ok(!scene.includes('this.incanting || this.casting || !this.playerState.alive'), 'casting must not lock WASD movement');
assert.ok(scene.includes("private incantCastMode: 'normal' | 'ultimate' = 'normal'"),
  '필살 여부는 입력창 진입 시 고정한다');
assert.ok(scene.includes("this.tryOpenIncant(event.shiftKey ? 'ultimate' : 'normal')"),
  'Shift+Enter는 필살 입력창 진입에 사용한다');
assert.ok(scene.includes("const castMode = forceUltimate ? 'ultimate' : this.incantCastMode"),
  '제출 순간 Shift 상태로 필살 여부를 다시 결정하지 않는다');

console.log('spell sequence regression: form/wait timeline, no forced move/invulnerability, latched ultimate entry');
