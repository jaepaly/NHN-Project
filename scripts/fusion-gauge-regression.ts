import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FUSION_CONFIG, FusionGauge } from '../src/combat-core/player/fusionGauge';

const gauge = new FusionGauge();
assert.equal(gauge.ready, false);
assert.equal(gauge.charge(50), false);
assert.equal(gauge.charge(50), false);
assert.equal(gauge.charge(50), true);
assert.equal(gauge.ready, true);
assert.equal(gauge.charge(50), false);
assert.equal(gauge.ratio, 1);
assert.equal(new FusionGauge().charge(Number.NaN), false);

const notReady = new FusionGauge();
notReady.charge(60, {
  name: '화염구', elements: ['fire'], forms: ['bolt'], effects: ['damage'],
});
assert.equal(notReady.consumeUltimate(), false);
assert.equal(notReady.ratio, 0.5);
assert.deepEqual(notReady.resonance.recentNames, ['화염구']);

assert.equal(gauge.consumeUltimate(), true);
assert.equal(gauge.ready, false);
assert.equal(gauge.ratio, 0);
assert.equal(gauge.consumeUltimate(), false);

const resonanceGauge = new FusionGauge();
resonanceGauge.charge(100, {
  name: '화염구', elements: ['fire'], forms: ['bolt'], effects: ['damage'],
});
resonanceGauge.charge(50, {
  name: '얼음 장벽', elements: ['ice'], forms: ['wall'], effects: ['shield'],
});
assert.deepEqual(resonanceGauge.resonance.elements, ['fire', 'ice']);
assert.deepEqual(resonanceGauge.resonance.forms, ['bolt', 'wall']);
assert.deepEqual(resonanceGauge.resonance.effects, ['damage', 'shield']);
assert.deepEqual(resonanceGauge.resonance.recentNames, ['화염구', '얼음 장벽']);
assert.equal(resonanceGauge.consumeUltimate(), true);
assert.deepEqual(resonanceGauge.resonance, {
  elements: [], forms: [], effects: [], recentNames: [],
});

const resetGauge = new FusionGauge();
resetGauge.charge(FUSION_CONFIG.fullCharge, {
  name: '바람 칼날', elements: ['wind'], forms: ['slash'], effects: ['damage'],
});
resetGauge.reset();
assert.equal(resetGauge.ready, false);
assert.equal(resetGauge.ratio, 0);
assert.equal(resetGauge.resonance.recentNames.length, 0);

// MockJudge의 단일 SpellSpec도 일반 영창이므로 게이지를 소비하면 안 된다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(!scene.includes('fusionGauge.tryRelease'), '레거시 자동 융합 방출 경로가 없어야 한다');
  const castAt = scene.indexOf('private async castFromText');
  const castEnd = scene.indexOf('private currentJudgeSource', castAt);
  const castBody = scene.slice(castAt, castEnd);
  assert.ok(!castBody.includes('consumeUltimate()'), '일반/Mock 단일 영창 경로는 게이지를 소비하지 않는다');

  const sequenceAt = scene.indexOf('private async runSequenceCast');
  const sequenceEnd = scene.indexOf('private currentJudgeSource', sequenceAt);
  const sequenceBody = scene.slice(sequenceAt, sequenceEnd);
  assert.ok(sequenceBody.includes("plan.castMode === 'ultimate'"));
  assert.ok(sequenceBody.includes('this.fusionGauge.consumeUltimate()'));
}

console.log('fusion gauge regression: 명시적 필살영창 전용 소비 6그룹 통과');
