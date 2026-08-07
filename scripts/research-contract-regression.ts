import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CombatRunController } from '../src/combat-core/run/runController';
import { RunResearchTracker } from '../src/meta/runResearchTracker';
import { applyMetaRunOutcome, EMPTY_META_PROFILE } from '../src/meta/metaProfile';
import {
  advanceElementalFocusEchoCharge,
  advanceSpiritResonance,
  advanceResearchContract,
  availableBasicResearchContracts,
  elementalFocusEchoUnlocked,
  elementalFocusSpatialScale,
  ELEMENTAL_FOCUS_START_AFFINITY,
  VARIATION_RESEARCH_UNLOCK_RUNS,
  ELEMENTAL_FOCUS_MILESTONE_AFFINITY,
  RESEARCH_FIRST_REWARD,
  RESEARCH_REPEAT_REWARD,
  RESEARCH_ELEMENTS,
  researchMilestoneReward,
  researchProgressSlots,
  spellMatchesElementalResearch,
  startResearchContract,
  spiritResonanceUnlocked,
  variationDiversityMaxBonus,
  VARIATION_DIVERSITY_MAX_BONUS,
  SPIRIT_RESONANCE_MILESTONE_HASTE_SCALE,
  SPIRIT_RESONANCE_START_HASTE_SCALE,
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

// ── 연구 해금 — **첫 런부터 뜬다** (총괄 결정 2026-08-06) ───────────────────
//
// ⚠️ 종전 게이트는 `totalRuns >= 1 && insight >= 4`였고, 그래서 **첫 판에 연구가
// 아예 안 보였다**(총괄 제보). 심사위원은 대개 한 판만 하고, 통찰은 localStorage에
// 쌓이므로 시크릿 창이면 항상 1회차다 — 소개 문서가 연구를 성장의 핵심으로 쓰는데
// 화면에 없으면 그게 더 나쁘다. 이 단언들이 그 회귀를 막는다.
{
  // 아무것도 없는 새 프로필(첫 런)에도 둘은 뜬다
  assert.deepEqual(
    availableBasicResearchContracts({ insight: 0, totalRuns: 0 }, 'fire'),
    [{ id: 'elemental-focus', element: 'fire' }, { id: 'spirit-resonance' }],
    '첫 런에도 원소 심화·정령 공명은 제시돼야 한다',
  );
  // 통찰은 더 이상 게이트가 아니다 — 통찰 0이어도 위와 같아야 한다
  assert.deepEqual(
    availableBasicResearchContracts({ insight: 0, totalRuns: 0 }, 'fire'),
    availableBasicResearchContracts({ insight: 999, totalRuns: 0 }, 'fire'),
    '통찰량이 1회차 선택지를 바꾸면 안 된다 — 회차만 본다',
  );
  // 원소가 없으면 그 항목만 빠진다
  assert.deepEqual(
    availableBasicResearchContracts({ insight: 0, totalRuns: 0 }, null),
    [{ id: 'spirit-resonance' }],
  );

  // 만물 변주는 2회차부터. 통찰이 아니라 **회차**로 여는 이유는 통찰 기준(옛 14)이
  // 완주해야 겨우 닿는 값이라 "2회차에 열린다"가 보장되지 않았기 때문이다.
  assert.deepEqual(
    availableBasicResearchContracts({ insight: 999, totalRuns: VARIATION_RESEARCH_UNLOCK_RUNS - 1 }, 'fire'),
    [{ id: 'elemental-focus', element: 'fire' }, { id: 'spirit-resonance' }],
    '1회차에는 만물 변주가 없다',
  );
  assert.deepEqual(
    availableBasicResearchContracts({ insight: 0, totalRuns: VARIATION_RESEARCH_UNLOCK_RUNS }, 'fire'),
    [
      { id: 'elemental-focus', element: 'fire' },
      { id: 'spirit-resonance' },
      { id: 'variation-study' },
    ],
    '2회차부터 만물 변주가 열린다 — 통찰 0이어도',
  );
  // 절대 빈 배열이 되지 않는다 — 빈 배열이면 연구 선택 화면 자체가 안 뜬다
  for (const totalRuns of [0, 1, 5]) {
    for (const insight of [0, 4, 100]) {
      assert.ok(
        availableBasicResearchContracts({ insight, totalRuns }, 'fire').length >= 2,
        `연구 선택지가 비었다 (회차 ${totalRuns} · 통찰 ${insight})`,
      );
    }
  }
}
assert.deepEqual(RESEARCH_ELEMENTS, ['fire', 'water', 'lightning', 'ice', 'earth', 'wind', 'light', 'dark']);

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
  spiritHasteApplications: 0,
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
  spiritHasteApplications: 0,
  milestones: 0,
}, '같은 상태를 재보고하면 단계 보상을 중복 지급하지 않음');

// 정령 연성은 영창이 아닌 실제 계약 2회와 공격 정령 융합 1회를 센다.
let resonance = startResearchContract({ id: 'spirit-resonance' }, []);
const resonanceStart = resonance;
resonance = advanceResearchContract(resonance, [spell('damage', 'bolt', 'fire')]).contract;
assert.equal(resonance.progress, 0, '영창만으로 연성 과제가 진행되면 안 된다');
resonance = advanceSpiritResonance(resonance, 'acquired').contract;
assert.equal(resonance.progress, 1);
assert.deepEqual(researchMilestoneReward(resonanceStart, resonance), {
  affinity: 0,
  spiritHasteApplications: 1,
  milestones: 1,
});
resonance = advanceSpiritResonance(resonance, 'acquired').contract;
resonance = advanceSpiritResonance(resonance, 'fused').contract;
assert.equal(resonance.completed, true);
assert.equal(spiritResonanceUnlocked(resonance), true);

// 만물의 변주는 원소·형태의 더 적은 고유 개수를 단계로 삼고, 단계마다 상한을 올린다.
let variation = startResearchContract({ id: 'variation-study' }, []);
assert.equal(variation.goal, 4);
assert.equal(researchProgressSlots(variation), '○○○○');
assert.equal(variationDiversityMaxBonus(variation), 0.4);
variation = advanceResearchContract(variation, [
  spell('damage', 'bolt', 'fire', 'water'),
]).contract;
assert.deepEqual(variation.usedElements, ['fire', 'water']);
assert.deepEqual(variation.usedForms, ['bolt']);
assert.equal(variation.progress, 1);
assert.ok(Math.abs(variationDiversityMaxBonus(variation) - 0.475) < 1e-9);
variation = advanceResearchContract(variation, [spell('damage', 'beam', 'water')]).contract;
assert.equal(variation.progress, 2);
variation = advanceResearchContract(variation, [spell('control', 'wall', 'ice')]).contract;
assert.equal(variation.progress, 3);
variation = advanceResearchContract(variation, [spell('damage', 'nova', 'wind')]).contract;
assert.equal(variation.progress, 4);
assert.equal(variation.completed, true);
assert.equal(variationDiversityMaxBonus(variation), VARIATION_DIVERSITY_MAX_BONUS);
assert.equal(researchProgressSlots(variation), '●●●●');

// Tracker는 정령 보상·융합만 반영하고 완료 보상을 결과에 한 번만 싣는다.
const tracker = new RunResearchTracker();
tracker.selectResearch({ id: 'spirit-resonance' });
const supportPlan: ResolvedSpellPlan = {
  name: '수호 연쇄',
  castMode: 'ultimate',
  power: 100,
  manaCost: 0,
  sequences: [{ durationMs: 500, behaviors: [
    { type: 'form', spec: spell('shield', 'wall', 'earth') },
  ] }],
};
supportPlan.castMode = 'normal';
tracker.recordNormalPlan(supportPlan);
assert.equal(tracker.snapshot().research?.progress, 0);
tracker.recordSpiritResearch('acquired');
tracker.recordSpiritResearch('acquired');
tracker.recordSpiritResearch('fused');
const outcome = tracker.outcome('lose');
assert.equal(outcome.insightEarned, 4, '신규 발견 +1, 최초 연구 완료 +3');
assert.deepEqual(outcome.completedContractIds, ['spirit-resonance']);
const persisted = applyMetaRunOutcome(
  { ...EMPTY_META_PROFILE, discoveredSignatures: [], completedContractIds: [] },
  outcome,
);
assert.equal(persisted.insight, 4);
assert.deepEqual(persisted.completedContractIds, ['spirit-resonance']);
assert.equal(persisted.totalRuns, 1);

tracker.beginContinuedLoop(
  outcome.discoveredSignatures,
  ['spirit-resonance'],
);
assert.equal(tracker.snapshot().research, null, '완료 연구는 심층 이어가기에서 재지급하지 않음');

const incomplete = new RunResearchTracker();
incomplete.selectResearch({ id: 'spirit-resonance' });
incomplete.recordSpiritResearch('acquired');
incomplete.beginContinuedLoop([], []);
assert.equal(incomplete.snapshot().research?.progress, 1, '미완료 연구는 심층 이어가기에서 유지');

// 시작 보너스는 원소 친화 및 정령 시전 간격에만 작은 가속을 준다.
assert.ok(SPIRIT_RESONANCE_START_HASTE_SCALE < 1);
assert.ok(SPIRIT_RESONANCE_MILESTONE_HASTE_SCALE < 1);
const controller = new CombatRunController({ maxRooms: 2 });
assert.deepEqual(controller.grantStartingAffinity('fire', ELEMENTAL_FOCUS_START_AFFINITY), {
  added: 0.15,
  total: 0.15,
});
assert.equal(controller.state.elementalAffinity.fire, 0.15);

const sceneSource = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
assert.ok(sceneSource.includes('availableBasicResearchContracts('), '첫 런·통찰·직전 원소 선택 조건 배선');
assert.ok(sceneSource.includes('Phaser.Utils.Array.GetRandom([...RESEARCH_ELEMENTS])'), '원소 심화가 이전 런 우세 원소 대신 무작위 원소를 제시한다');
assert.ok(sceneSource.includes('grantStartingAffinity('), '원소 심화 시작 보너스 배선');
assert.ok(sceneSource.includes("recordSpiritResearch('acquired')"), '정령 계약 연구 진행 배선');
assert.ok(sceneSource.includes("recordSpiritResearch('fused')"), '정령 융합 연구 진행 배선');
assert.ok(sceneSource.includes('reportResearchAdvance(previousResearch)'), '일반 단일·시퀀스 진행 피드백 배선');
assert.ok(sceneSource.includes('emitCompletionBanner = true'), '완료 공지를 호출 경로별로 보류할 수 있다');
assert.ok(sceneSource.includes('this.reportResearchAdvance(previousResearch, false)'), '정령 융합 중 연구 완료 공지는 보류한다');
assert.ok(sceneSource.includes("title: '정령 융합 · 연구 완료'"), '융합·연구 완료는 단일 통합 공지로 표시한다');
assert.ok(sceneSource.includes('holdMs: 2300'), '통합 공지는 다음 방을 오래 가리지 않도록 짧게 유지한다');
assert.ok(sceneSource.includes('researchMilestoneReward(previous, current)'), '단계별 즉시 보상 배선');
// 호출 인자 이름은 씬 리팩터링마다 바뀐다(research → current). 배선 여부만 본다.
assert.ok(/researchProgressSlots\(\w+\)/.test(sceneSource), '상시 연구 진행 슬롯 HUD 배선');
assert.ok(sceneSource.includes('scheduleElementalResearchEcho(executedSpecs)'), '시퀀스 공명 재시전 배선');
assert.ok(sceneSource.includes('enableFusionResonance()'), '정령 연성 완료 특성 배선');
assert.ok(sceneSource.includes('variationDiversityMaxBonus('), '변주 단계별 다양성 상한 배선');
assert.ok(sceneSource.includes('원소 ${contract.usedElements.length}/${contract.goal}'), '변주 원소·형태 HUD 배선');
assert.ok(sceneSource.includes("actionState = 'RESEARCH SELECT'"), '연구 선택 중 전투 정지 HUD');
assert.equal(
  (sceneSource.match(/offerRunStartChoices\(\)/g) ?? []).length,
  3,
  '메서드 정의 + 최초 시작 + 사망 재시작 경로',
);

console.log('research contract regression: 해금·3종목표·중복방지·이어가기·보너스 8군 통과');
