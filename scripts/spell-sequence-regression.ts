import assert from 'node:assert/strict';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { SpellHistory } from '../src/spell/spellHistory';
import { SEQUENCE_FIXTURE_CATALOG } from '../src/spell/sequenceFixtureCatalog';
import { sequenceEngraveCandidate } from '../src/spell/sequenceEngraveCandidate';
import {
  behaviorUsesAnyElement,
  debugSpellPlan,
  maxSequenceDurationMs,
  resolveSpellPlan,
  SEQUENCE_PLAN_LIMITS,
  type FormBehavior,
  type SpellPlan,
} from '../src/spell/sequencePlan';

const dashNova = resolveSpellPlan(debugSpellPlan('#seq dash-nova')!);
assert.equal(dashNova.power, 75);
assert.equal(dashNova.manaCost, 45, 'mana cost should use the original total power');
assert.deepEqual(dashNova.sequences.map((sequence) => sequence.durationMs), [1000, 500]);
const dashNovaForm = dashNova.sequences[1].behaviors[0];
assert.equal(dashNovaForm.type, 'form');
if (dashNovaForm.type === 'form') {
  assert.equal(dashNovaForm.spec.power, 68,
    'one move should reserve 10% of total power before form allocation');
}

const duplicatePlan: SpellPlan = {
  name: 'duplicate',
  power: 50,
  durationMs: 1000,
  sequences: [{
    behaviors: [
      { type: 'wait' },
      ...debugSpellPlan('#seq single')!.sequences[0].behaviors,
      ...debugSpellPlan('#seq single')!.sequences[0].behaviors,
    ],
  }],
};
const normalizedDuplicate = resolveSpellPlan(duplicatePlan);
assert.equal(normalizedDuplicate.sequences[0].behaviors.length, 1,
  'mixed wait and exact form duplicates should be removed');
assert.equal(normalizedDuplicate.sequences[0].behaviors[0].type, 'form');

const zeroWeights: SpellPlan = {
  name: 'zero weights',
  power: 40,
  durationMs: 1200,
  sequences: [
    { durationWeight: 0, behaviors: debugSpellPlan('#seq single')!.sequences[0].behaviors },
    { durationWeight: 0, behaviors: debugSpellPlan('#seq single')!.sequences[0].behaviors },
  ],
};
assert.deepEqual(
  resolveSpellPlan(zeroWeights).sequences.map((sequence) => sequence.durationMs),
  [600, 600],
  'all-zero duration weights should fall back to equal sequence durations',
);

const capped: SpellPlan = {
  name: 'capped',
  power: 999,
  durationMs: 99999,
  sequences: Array.from({ length: 12 }, () => ({
    behaviors: debugSpellPlan('#seq single')!.sequences[0].behaviors,
  })),
};
const resolvedCapped = resolveSpellPlan(capped);
assert.equal(resolvedCapped.power, 100);
assert.equal(resolvedCapped.sequences.length, SEQUENCE_PLAN_LIMITS.maxSequences);
assert.equal(
  resolvedCapped.sequences.reduce((sum, sequence) => sum + sequence.durationMs, 0),
  SEQUENCE_PLAN_LIMITS.maxDurationMs,
);

assert.equal(maxSequenceDurationMs(0), 500);
assert.equal(maxSequenceDurationMs(10), 750);
assert.equal(maxSequenceDurationMs(50), 1750);
assert.equal(maxSequenceDurationMs(100), 3000);

const lowPowerLongSequence = resolveSpellPlan({
  name: 'low power long sequence',
  power: 10,
  durationMs: 5000,
  sequences: [{ behaviors: debugSpellPlan('#seq single')!.sequences[0].behaviors }],
});
assert.equal(
  lowPowerLongSequence.sequences.reduce((sum, sequence) => sum + sequence.durationMs, 0),
  750,
  'low-power plans must not receive the full three-second execution window',
);

const invulnerabilityState = new PlayerCombatState();
invulnerabilityState.applyTimedBuff('ward', 0.5, 3);
invulnerabilityState.applyInvulnerability(1);
assert.deepEqual(invulnerabilityState.takeDamage(20), { hpDamage: 0, shieldDamage: 0 });
invulnerabilityState.update(1.1);
assert.deepEqual(
  invulnerabilityState.takeDamage(20),
  { hpDamage: 10, shieldDamage: 0 },
  'sequence invulnerability must expire without extending a separate ward buff',
);

assert.ok(debugSpellPlan('#seq petal-dance'));
for (const fixture of [
  'phoenix-dive',
  'thunder-hunt',
  'winter-garden',
  'eclipse-waltz',
  'last-bastion',
  'receding-tide',
  'eye-of-storm',
  'abyssal-host',
  'dawn-pilgrimage',
  'void-steps',
  'glass-star-shot',
  'octave-of-elements',
]) {
  assert.ok(debugSpellPlan(`#seq ${fixture}`), `${fixture} fixture should resolve`);
}
for (const name of [
  '불사조의 낙화',
  '뇌광의 사냥',
  '겨울 정원의 폐막',
  '일식의 왈츠',
  '최후의 성채',
  '해일의 역류',
  '폭풍의 눈',
  '심연의 군세',
  '새벽의 순례',
  '허공답보',
  '유리별의 사격',
  '팔원소 대합창',
]) {
  assert.equal(debugSpellPlan(name)?.name, name, `${name} should resolve by its display name`);
}
assert.equal(debugSpellPlan('일반적인 화염구'), null,
  'ordinary incantations must continue to the judge');
assert.equal(debugSpellPlan('#seq unknown'), null);

assert.ok(SEQUENCE_FIXTURE_CATALOG.length >= 18,
  'the R1→R2 executable fixture catalog should cover a broad schema surface');
for (const fixture of SEQUENCE_FIXTURE_CATALOG) {
  assert.equal(debugSpellPlan(fixture.input)?.name, fixture.input,
    `${fixture.input} should run by its incantation name`);
  assert.equal(debugSpellPlan(`#seq ${fixture.key}`)?.name, fixture.input,
    `${fixture.key} should run by its debug key`);
  const resolved = resolveSpellPlan(fixture.plan);
  assert.ok(resolved.sequences.length > 0, `${fixture.key} should retain a runnable sequence`);
  assert.ok(resolved.sequences.length <= SEQUENCE_PLAN_LIMITS.maxSequences);
  assert.ok(resolved.sequences.every(
    (sequence) => sequence.behaviors.length <= SEQUENCE_PLAN_LIMITS.maxBehaviorsPerSequence,
  ));
}

const retreatPlan = resolveSpellPlan({
  name: 'retreat schema fixture',
  power: 40,
  durationMs: 1000,
  sequences: [{ behaviors: [{
    type: 'move',
    destination: 'away-from-target',
    element: 'wind',
    distance: 180,
  }] }],
});
assert.deepEqual(retreatPlan.sequences[0].behaviors[0], {
  type: 'move',
  destination: 'away-from-target',
  element: 'wind',
  distance: 180,
});
assert.equal(
  behaviorUsesAnyElement(retreatPlan.sequences[0].behaviors[0], ['wind']),
  true,
  'elemental move behaviors qualify for element-affinity curse effects',
);
assert.equal(
  behaviorUsesAnyElement(retreatPlan.sequences[0].behaviors[0], ['light', 'fire']),
  false,
  'unrelated move elements do not trigger another affinity',
);
assert.equal(
  behaviorUsesAnyElement({ type: 'wait' }, ['wind']),
  false,
  'wait behaviors never carry an elemental affinity',
);

const rainbowSpear = resolveSpellPlan(debugSpellPlan('#seq rainbow-spear')!);
const rainbowBehavior = rainbowSpear.sequences[0].behaviors[0];
assert.equal(rainbowBehavior.type, 'form');
assert.equal(
  behaviorUsesAnyElement(rainbowBehavior, ['lightning']),
  true,
  'secondary form elements qualify for element-affinity curse effects',
);
assert.equal(
  behaviorUsesAnyElement(rainbowBehavior, ['light']),
  true,
  'primary form elements continue to qualify for element-affinity curse effects',
);

const sequenceHistory = new SpellHistory();
const phoenix = resolveSpellPlan(debugSpellPlan('불사조의 낙화')!);
const phoenixBehaviors = phoenix.sequences.flatMap((sequence) => (
  sequence.behaviors
    .filter((behavior): behavior is FormBehavior => behavior.type === 'form')
    .map((behavior) => behavior.spec)
));
sequenceHistory.recordSequence({
  rawText: '불사조의 낙화',
  name: phoenix.name,
  elements: ['fire', 'wind'],
  power: phoenix.power,
  cost: phoenix.manaCost,
  source: 'local',
  castAt: 1000,
});
for (const behavior of phoenixBehaviors) sequenceHistory.recordBehaviorUsage(behavior, 1000);
assert.equal(sequenceHistory.size, 1, 'a multi-behavior sequence is one player cast');
assert.equal(sequenceHistory.allBehaviorUsages.length, 2,
  'move and wait are excluded while both form behaviors are counted');
assert.equal(sequenceHistory.bossMemory().dominantElement, 'fire');
assert.equal(sequenceHistory.bossMemory().totalCasts, 1);
assert.deepEqual(sequenceHistory.bossMemory().recentSpellNames, ['불사조의 낙화']);

const movementOnly = resolveSpellPlan(debugSpellPlan('허공답보')!);
sequenceHistory.recordSequence({
  rawText: '허공답보',
  name: movementOnly.name,
  elements: [],
  power: movementOnly.power,
  cost: movementOnly.manaCost,
  source: 'local',
  castAt: 2000,
});
assert.equal(sequenceHistory.size, 2, 'elementless movement plans still count as casts');
assert.equal(sequenceHistory.allBehaviorUsages.length, 2,
  'movement-only plans must not add element or form counter samples');

const phoenixEngrave = sequenceEngraveCandidate(phoenix);
assert.ok(phoenixEngrave);
assert.equal(phoenixEngrave.form, 'nova', 'the stronger finisher supplies the projected form');
assert.equal(
  phoenixEngrave.power,
  phoenixBehaviors.reduce((sum, spell) => sum + spell.power, 0),
  'engraving pools all eligible damage power instead of scaling one split twice',
);
assert.equal(sequenceEngraveCandidate(movementOnly), null,
  'movement-only incantations must not become engrave candidates');
assert.equal(
  sequenceEngraveCandidate(resolveSpellPlan(debugSpellPlan('최후의 성채')!)),
  null,
  'shield and control-only sequences must not become damage engravings',
);
const barrageEngrave = sequenceEngraveCandidate(
  resolveSpellPlan(debugSpellPlan('사방의 포화')!),
);
assert.ok(barrageEngrave);
assert.equal(barrageEngrave.form, 'rain',
  'equal-power candidates prefer the latest eligible finisher while wall remains excluded');
assert.equal(barrageEngrave.power, 80,
  'four eligible attacks pool their budget while the excluded wall contributes nothing');

console.info('spell sequence regression: normalization, budgets, and debug fixtures passed');
