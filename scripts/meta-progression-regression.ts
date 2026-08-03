import assert from 'node:assert/strict';
import {
  discoverySignatureFromSpec,
  discoverySignaturesFromPlan,
  isDiscoverySignature,
} from '../src/meta/discoverySignature';
import {
  applySpellTokenSale,
  applyMetaRunOutcome,
  EMPTY_META_PROFILE,
  loadMetaProfile,
  META_PROFILE_STORAGE_KEY,
  saveMetaProfile,
  type StorageLike,
} from '../src/meta/metaProfile';
import { RunResearchTracker } from '../src/meta/runResearchTracker';
import type { ResolvedSpellPlan } from '../src/spell/sequencePlan';
import type { SpellElement, SpellForm, SpellSpec } from '../src/spell/types';

function spell(
  form: SpellForm,
  primary: SpellElement,
  secondary: SpellElement | null = null,
): SpellSpec {
  return {
    name: `${primary}-${form}`,
    effect: 'damage',
    target: 'enemy',
    element_primary: primary,
    element_secondary: secondary,
    form,
    size: 'medium',
    speed: 'normal',
    status: [],
    power: 20,
    cost: 10,
  };
}

function plan(castMode: 'normal' | 'ultimate'): ResolvedSpellPlan {
  const bolt = spell('bolt', 'lightning');
  const wave = spell('wave', 'water', 'wind');
  return {
    name: '폭풍 해일',
    castMode,
    power: castMode === 'ultimate' ? 100 : 60,
    manaCost: castMode === 'ultimate' ? 0 : 36,
    sequences: [
      { durationMs: 300, behaviors: [{ type: 'form', spec: bolt }] },
      { durationMs: 200, behaviors: [{ type: 'wait' }] },
      { durationMs: 300, behaviors: [
        { type: 'form', spec: bolt },
        { type: 'form', spec: wave },
      ] },
    ],
  };
}

class MemoryStorage implements StorageLike {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const single = spell('bolt', 'fire');
assert.equal(discoverySignatureFromSpec(single), 'damage:fire:none:bolt');
assert.equal(isDiscoverySignature('damage:fire:none:bolt'), true);
assert.equal(isDiscoverySignature('damage:fire:none:unknown'), false);

assert.deepEqual(discoverySignaturesFromPlan(plan('normal')), [
  'damage:lightning:none:bolt',
  'damage:water:wind:wave',
]);
assert.deepEqual(discoverySignaturesFromPlan(plan('ultimate')), []);

const known = discoverySignatureFromSpec(single);
const tracker = new RunResearchTracker([known]);
assert.deepEqual(tracker.recordNormalSpell(single), []);

const discoveries: SpellSpec[] = [
  spell('bolt', 'water'),
  spell('beam', 'light'),
  spell('wave', 'wind'),
  spell('nova', 'fire'),
  spell('zone', 'ice'),
];
for (const spec of discoveries) tracker.recordNormalSpell(spec);

assert.equal(tracker.recordRoomCleared('combat-1', 'combat'), 1);
assert.equal(tracker.recordRoomCleared('combat-1', 'combat'), 0);
assert.equal(tracker.recordRoomCleared('combat-2', 'elite'), 1);
assert.equal(tracker.recordRoomCleared('combat-3', 'trap'), 1);
assert.equal(tracker.recordRoomCleared('combat-4', 'start'), 1);
assert.equal(tracker.recordRoomCleared('combat-5', 'combat'), 0);
assert.equal(tracker.recordRoomCleared('treasure-1', 'treasure'), 0);
assert.equal(tracker.recordRoomCleared('altar-1', 'altar'), 0);
assert.equal(tracker.recordRoomCleared('stage-boss', 'stage-boss'), 2);
assert.equal(tracker.recordRoomCleared('memory-boss', 'memory-boss'), 5);

const snapshot = tracker.snapshot();
assert.equal(snapshot.discoveryInsight, 4);
assert.equal(snapshot.roomInsight, 11);
assert.equal(snapshot.insightEarned, 15);
assert.equal(snapshot.newSignatures.length, 5);

const lostProfile = applyMetaRunOutcome(
  { ...EMPTY_META_PROFILE, discoveredSignatures: [], completedContractIds: [] },
  tracker.outcome('lose'),
);
assert.equal(lostProfile.insight, 15);
assert.equal(lostProfile.totalRuns, 1);
assert.equal(lostProfile.totalWins, 0);
assert.equal(lostProfile.discoveredSignatures.length, 5);

const wonProfile = applyMetaRunOutcome(lostProfile, {
  result: 'win',
  insightEarned: 0,
  discoveredSignatures: [],
});
assert.equal(wonProfile.totalRuns, 2);
assert.equal(wonProfile.totalWins, 1);

const firstSale = applySpellTokenSale(wonProfile, 'damage:fire:none:bolt:medium', 10);
assert.equal(firstSale.amount, 10);
assert.equal(firstSale.profile.spellTokens, 10);
assert.equal(firstSale.profile.spellTokenSales['damage:fire:none:bolt:medium'], 1);
const secondSale = applySpellTokenSale(firstSale.profile, 'damage:fire:none:bolt:medium', 5);
assert.equal(secondSale.profile.spellTokens, 15);
assert.equal(secondSale.profile.spellTokenSales['damage:fire:none:bolt:medium'], 2);

const storage = new MemoryStorage();
storage.setItem(META_PROFILE_STORAGE_KEY, '{broken-json');
assert.deepEqual(loadMetaProfile(storage), {
  ...EMPTY_META_PROFILE,
  discoveredSignatures: [],
  completedContractIds: [],
});

storage.setItem(META_PROFILE_STORAGE_KEY, JSON.stringify({
  ...EMPTY_META_PROFILE,
  discoveredSignatures: [],
  completedContractIds: [],
}));
assert.equal(loadMetaProfile(storage).spellTokens, 0, '기존 메타 저장은 토큰 0으로 안전 이행');

saveMetaProfile(wonProfile, storage);
assert.deepEqual(loadMetaProfile(storage), wonProfile);

console.log('meta progression regression: ok');
