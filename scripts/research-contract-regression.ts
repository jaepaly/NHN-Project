import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';
import { RunResearchTracker } from '../src/meta/runResearchTracker';
import { applyMetaRunOutcome, EMPTY_META_PROFILE } from '../src/meta/metaProfile';
import {
  advanceElementalFocusEchoCharge,
  advanceResearchContract,
  availableBasicResearchContracts,
  elementalFocusEchoUnlocked,
  elementalFocusSpatialScale,
  ELEMENTAL_FOCUS_START_AFFINITY,
  EXPANDED_RESEARCH_UNLOCK_INSIGHT,
  ELEMENTAL_FOCUS_MILESTONE_AFFINITY,
  isWardResearchSupportSpell,
  RESEARCH_FIRST_REWARD,
  RESEARCH_REPEAT_REWARD,
  researchMilestoneReward,
  researchProgressSlots,
  spellMatchesElementalResearch,
  startResearchContract,
  wardStudyIncomingDamageScale,
  wardStudyPulseUnlocked,
  variationDiversityMaxBonus,
  VARIATION_DIVERSITY_MAX_BONUS,
  WARD_STUDY_GUARD_DAMAGE_SCALE,
  WARD_STUDY_MILESTONE_SHIELD,
  WARD_STUDY_START_SHIELD,
} from '../src/meta/researchContract';
import type { ResolvedSpellPlan } from '../src/spell/sequencePlan';
import type { SpellEffect, SpellElement, SpellForm, SpellSpec } from '../src/spell/types';

function spell(
  effect: SpellEffect,
  form: SpellForm,
  primary: SpellElement,
  secondary: SpellElement | null = null,
): SpellSpec {
  return {
    name: `${primary}-${form}`,
    effect,
    target: effect === 'heal' || effect === 'shield' || effect === 'buff' ? 'self' : 'enemy',
    element_primary: primary,
    element_secondary: secondary,
    form,
    size: 'medium',
    speed: 'normal',
    status: [],
    power: 30,
    cost: 15,
  };
}

// 첫 런·통찰 미달은 선택을 요구하지 않는다.
assert.deepEqual(availableBasicResearchContracts({ insight: 20, totalRuns: 0 }, 'fire'), []);
assert.deepEqual(availableBasicResearchContracts({ insight: 3, totalRuns: 2 }, 'fire'), []);
assert.deepEqual(
  availableBasicResearchContracts({ insight: 4, totalRuns: 1 }, null),
  [{ id: 'ward-study' }],
);
assert.deepEqual(
  availableBasicResearchContracts({ insight: 4, totalRuns: 1 }, 'fire'),
  [{ id: 'elemental-focus', element: 'fire' }, { id: 'ward-study' }],
);
assert.deepEqual(
  availableBasicResearchContracts({ insight: EXPANDED_RESEARCH_UNLOCK_INSIGHT - 1, totalRuns: 1 }, 'fire'),
  [{ id: 'elemental-focus', element: 'fire' }, { id: 'ward-study' }],
);
assert.deepEqual(
  availableBasicResearchContracts({ insight: EXPANDED_RESEARCH_UNLOCK_INSIGHT, totalRuns: 1 }, 'fire'),
  [
    { id: 'elemental-focus', element: 'fire' },
    { id: 'ward-study' },
    { id: 'variation-study' },
  ],
);

// 최초 완료 +3, 다른 런의 반복 완료 +2.
const firstFocus = startResearchContract({ id: 'elemental-focus', element: 'fire' }, []);
const repeatFocus = startResearchContract({ id: 'elemental-focus', element: 'fire' }, ['elemental-focus']);
assert.equal(firstFocus.rewardInsight, RESEARCH_FIRST_REWARD);
assert.equal(repeatFocus.rewardInsight, RESEARCH_REPEAT_REWARD);
assert.equal(researchProgressSlots(firstFocus), '○○○');

// 원소 심화는 대상 원소가 들어간 서로 다른 form만 센다.
let focus = advanceResearchContract(firstFocus, [spell('damage', 'bolt', 'water')]).contract;
assert.equal(focus.progress, 0);
focus = advanceResearchContract(focus, [spell('damage', 'bolt', 'fire')]).contract;
const focusFirstReward = researchMilestoneReward(firstFocus, focus);
assert.deepEqual(focusFirstReward, {
  affinity: ELEMENTAL_FOCUS_MILESTONE_AFFINITY,
  shield: 0,
  milestones: 1,
});
assert.equal(elementalFocusSpatialScale(focus, spell('damage', 'bolt', 'fire')), 1.1);
assert.equal(elementalFocusSpatialScale(focus, spell('damage', 'bolt', 'water', 'fire')), 1.1);
assert.equal(elementalFocusSpatialScale(focus, spell('damage', 'bolt', 'water')), 1);
assert.equal(spellMatchesElementalResearch(focus, spell('damage', 'bolt', 'water', 'fire')), true);
assert.equal(elementalFocusEchoUnlocked(focus), false);
focus = advanceResearchContract(focus, [spell('damage', 'bolt', 'water', 'fire')]).contract;
assert.equal(focus.progress, 1, '같은 form 재사용은 중복 집계하지 않음');
focus = advanceResearchContract(focus, [
  spell('damage', 'beam', 'fire'),
  spell('control', 'wall', 'earth', 'fire'),
]).contract;
assert.equal(focus.progress, 3);
assert.equal(focus.completed, true);
assert.ok(Math.abs(elementalFocusSpatialScale(focus, spell('damage', 'nova', 'fire')) - 1.3) < 1e-9);
assert.equal(elementalFocusEchoUnlocked(focus), true);
assert.deepEqual(advanceElementalFocusEchoCharge(0), { charge: 1, triggered: false });
assert.deepEqual(advanceElementalFocusEchoCharge(1), { charge: 2, triggered: false });
assert.deepEqual(advanceElementalFocusEchoCharge(2), { charge: 0, triggered: true });
assert.equal(researchProgressSlots(focus), '●●●');
assert.deepEqual(researchMilestoneReward(focus, focus), {
  affinity: 0,
  shield: 0,
  milestones: 0,
}, '같은 상태를 재보고하면 단계 보상을 중복 지급하지 않음');

// 수호 연구는 한 영창 안 지원 behavior 수와 무관하게 최대 +1.
let ward = startResearchContract({ id: 'ward-study' }, []);
const wardStart = ward;
ward = advanceResearchContract(ward, [
  spell('heal', 'nova', 'light'),
  spell('shield', 'wall', 'earth'),
  spell('control', 'cage', 'ice'),
]).contract;
assert.equal(ward.progress, 1);
assert.deepEqual(researchMilestoneReward(wardStart, ward), {
  affinity: 0,
  shield: WARD_STUDY_MILESTONE_SHIELD,
  milestones: 1,
});
assert.equal(isWardResearchSupportSpell(spell('heal', 'nova', 'light')), true);
assert.equal(isWardResearchSupportSpell(spell('damage', 'bolt', 'fire')), false);
assert.equal(wardStudyIncomingDamageScale(ward, 20), 1, '수호 1단계에는 피해 감소 없음');
ward = advanceResearchContract(ward, [spell('damage', 'bolt', 'fire')]).contract;
assert.equal(ward.progress, 1);
ward = advanceResearchContract(ward, [spell('buff', 'buff', 'wind')]).contract;
assert.equal(wardStudyIncomingDamageScale(ward, 20), WARD_STUDY_GUARD_DAMAGE_SCALE);
assert.equal(wardStudyIncomingDamageScale(ward, 0), 1, '보호막이 없으면 수호 감소 미적용');
ward = advanceResearchContract(ward, [spell('control', 'zone', 'dark')]).contract;
assert.equal(ward.completed, true);
assert.equal(wardStudyPulseUnlocked(ward), true);

// 만물의 변주는 원소·형태의 더 적은 고유 개수를 단계로 삼고, 단계마다 상한을 올린다.
let variation = startResearchContract({ id: 'variation-study' }, []);
assert.equal(variation.goal, 4);
assert.equal(researchProgressSlots(variation), '○○○○');
assert.equal(variationDiversityMaxBonus(variation), 0.3);
variation = advanceResearchContract(variation, [
  spell('damage', 'bolt', 'fire', 'water'),
]).contract;
assert.deepEqual(variation.usedElements, ['fire', 'water']);
assert.deepEqual(variation.usedForms, ['bolt']);
assert.equal(variation.progress, 1);
assert.equal(variationDiversityMaxBonus(variation), 0.325);
variation = advanceResearchContract(variation, [spell('damage', 'beam', 'water')]).contract;
assert.equal(variation.progress, 2);
variation = advanceResearchContract(variation, [spell('control', 'wall', 'ice')]).contract;
assert.equal(variation.progress, 3);
variation = advanceResearchContract(variation, [spell('damage', 'nova', 'wind')]).contract;
assert.equal(variation.progress, 4);
assert.equal(variation.completed, true);
assert.equal(variationDiversityMaxBonus(variation), VARIATION_DIVERSITY_MAX_BONUS);
assert.equal(researchProgressSlots(variation), '●●●●');

// Tracker는 필살영창을 연구에서 제외하고 완료 보상을 결과에 한 번만 싣는다.
const tracker = new RunResearchTracker();
tracker.selectResearch({ id: 'ward-study' });
const supportPlan: ResolvedSpellPlan = {
  name: '수호 연쇄',
  castMode: 'ultimate',
  power: 100,
  manaCost: 0,
  sequences: [{ durationMs: 500, behaviors: [
    { type: 'form', spec: spell('shield', 'wall', 'earth') },
  ] }],
};
tracker.recordNormalPlan(supportPlan);
assert.equal(tracker.snapshot().research?.progress, 0);
supportPlan.castMode = 'normal';
tracker.recordNormalPlan(supportPlan);
tracker.recordNormalPlan(supportPlan);
tracker.recordNormalPlan(supportPlan);
const outcome = tracker.outcome('lose');
assert.equal(outcome.insightEarned, 4, '신규 발견 +1, 최초 연구 완료 +3');
assert.deepEqual(outcome.completedContractIds, ['ward-study']);
const persisted = applyMetaRunOutcome(
  { ...EMPTY_META_PROFILE, discoveredSignatures: [], completedContractIds: [] },
  outcome,
);
assert.equal(persisted.insight, 4);
assert.deepEqual(persisted.completedContractIds, ['ward-study']);
assert.equal(persisted.totalRuns, 1);

tracker.beginContinuedLoop(
  outcome.discoveredSignatures,
  ['ward-study'],
);
assert.equal(tracker.snapshot().research, null, '완료 연구는 심층 이어가기에서 재지급하지 않음');

const incomplete = new RunResearchTracker();
incomplete.selectResearch({ id: 'ward-study' });
incomplete.recordNormalSpell(spell('heal', 'nova', 'light'));
incomplete.beginContinuedLoop([], []);
assert.equal(incomplete.snapshot().research?.progress, 1, '미완료 연구는 심층 이어가기에서 유지');

// 시작 보너스는 일반 보상 카드 한 장 이하다.
assert.ok(ELEMENTAL_FOCUS_START_AFFINITY <= RUN_REWARD_CONFIG.affinityBonus);
assert.ok(WARD_STUDY_START_SHIELD <= RUN_REWARD_CONFIG.wardStartShield);
const player = new PlayerCombatState();
const controller = new CombatRunController({ playerState: player, maxRooms: 2 });
assert.deepEqual(controller.grantStartingAffinity('fire', ELEMENTAL_FOCUS_START_AFFINITY), {
  added: 0.15,
  total: 0.15,
});
assert.equal(controller.state.elementalAffinity.fire, 0.15);
assert.equal(player.addShield(WARD_STUDY_START_SHIELD), 20);

const sceneSource = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
assert.ok(sceneSource.includes('availableBasicResearchContracts('), '첫 런·통찰·직전 원소 선택 조건 배선');
assert.ok(sceneSource.includes('grantStartingAffinity('), '원소 심화 시작 보너스 배선');
assert.ok(sceneSource.includes('addShield(WARD_STUDY_START_SHIELD)'), '수호 연구 시작 보너스 배선');
assert.ok(sceneSource.includes('reportResearchAdvance(previousResearch)'), '일반 단일·시퀀스 진행 피드백 배선');
assert.ok(sceneSource.includes('researchMilestoneReward(previous, current)'), '단계별 즉시 보상 배선');
assert.ok(sceneSource.includes('researchProgressSlots(research)'), '상시 연구 진행 슬롯 HUD 배선');
assert.ok(sceneSource.includes('scheduleElementalResearchEcho(executedSpecs)'), '시퀀스 공명 재시전 배선');
assert.ok(sceneSource.includes('applyWardResearchCastPerks(previousResearch'), '수호 지속 특성 배선');
assert.ok(sceneSource.includes('wardStudyIncomingDamageScale('), '수호 피해 감소 배선');
assert.ok(sceneSource.includes('variationDiversityMaxBonus('), '변주 단계별 다양성 상한 배선');
assert.ok(sceneSource.includes('원소 ${contract.usedElements.length}/${contract.goal}'), '변주 원소·형태 HUD 배선');
assert.ok(sceneSource.includes("actionState = 'RESEARCH SELECT'"), '연구 선택 중 전투 정지 HUD');
assert.equal(
  (sceneSource.match(/offerRunStartChoices\(\)/g) ?? []).length,
  3,
  '메서드 정의 + 최초 시작 + 사망 재시작 경로',
);

console.log('research contract regression: 해금·3종목표·중복방지·이어가기·보너스 8군 통과');
