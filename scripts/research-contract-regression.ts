import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';
import { RunResearchTracker } from '../src/meta/runResearchTracker';
import { applyMetaRunOutcome, EMPTY_META_PROFILE } from '../src/meta/metaProfile';
import {
  advanceResearchContract,
  availableBasicResearchContracts,
  ELEMENTAL_FOCUS_START_AFFINITY,
  RESEARCH_FIRST_REWARD,
  RESEARCH_REPEAT_REWARD,
  startResearchContract,
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

// 최초 완료 +3, 다른 런의 반복 완료 +2.
const firstFocus = startResearchContract({ id: 'elemental-focus', element: 'fire' }, []);
const repeatFocus = startResearchContract({ id: 'elemental-focus', element: 'fire' }, ['elemental-focus']);
assert.equal(firstFocus.rewardInsight, RESEARCH_FIRST_REWARD);
assert.equal(repeatFocus.rewardInsight, RESEARCH_REPEAT_REWARD);

// 원소 심화는 대상 원소가 들어간 서로 다른 form만 센다.
let focus = advanceResearchContract(firstFocus, [spell('damage', 'bolt', 'water')]).contract;
assert.equal(focus.progress, 0);
focus = advanceResearchContract(focus, [spell('damage', 'bolt', 'fire')]).contract;
focus = advanceResearchContract(focus, [spell('damage', 'bolt', 'water', 'fire')]).contract;
assert.equal(focus.progress, 1, '같은 form 재사용은 중복 집계하지 않음');
focus = advanceResearchContract(focus, [
  spell('damage', 'beam', 'fire'),
  spell('control', 'wall', 'earth', 'fire'),
]).contract;
assert.equal(focus.progress, 3);
assert.equal(focus.completed, true);

// 수호 연구는 한 영창 안 지원 behavior 수와 무관하게 최대 +1.
let ward = startResearchContract({ id: 'ward-study' }, []);
ward = advanceResearchContract(ward, [
  spell('heal', 'nova', 'light'),
  spell('shield', 'wall', 'earth'),
  spell('control', 'cage', 'ice'),
]).contract;
assert.equal(ward.progress, 1);
ward = advanceResearchContract(ward, [spell('damage', 'bolt', 'fire')]).contract;
assert.equal(ward.progress, 1);
ward = advanceResearchContract(ward, [spell('buff', 'buff', 'wind')]).contract;
ward = advanceResearchContract(ward, [spell('control', 'zone', 'dark')]).contract;
assert.equal(ward.completed, true);

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
assert.ok(sceneSource.includes("actionState = 'RESEARCH SELECT'"), '연구 선택 중 전투 정지 HUD');
assert.equal(
  (sceneSource.match(/offerRunStartChoices\(\)/g) ?? []).length,
  3,
  '메서드 정의 + 최초 시작 + 사망 재시작 경로',
);

console.log('research contract regression: 해금·2종목표·중복방지·이어가기·보너스 7군 통과');
