import type { MetaProfileV1 } from './metaProfile';
import type { SpellElement, SpellForm, SpellSpec } from '../spell/types';

export const BASIC_RESEARCH_UNLOCK_INSIGHT = 4;
export const EXPANDED_RESEARCH_UNLOCK_INSIGHT = 14;
export const RESEARCH_GOAL = 3;
export const VARIATION_RESEARCH_GOAL = 4;
export const RESEARCH_FIRST_REWARD = 3;
export const RESEARCH_REPEAT_REWARD = 2;
export const ELEMENTAL_FOCUS_START_AFFINITY = 0.15;
/** 연구 행동 자체가 현재 런의 성장으로 이어지게 하는 단계 보상. */
export const ELEMENTAL_FOCUS_MILESTONE_AFFINITY = 0.05;
/** 원소 연구 진행도마다 대상 원소 주문의 사거리·범위를 10%씩 확장한다. */
export const ELEMENTAL_FOCUS_SPATIAL_SCALE_PER_STAGE = 0.1;
/** 원소 연구 완료 뒤 대상 원소 영창 3회마다 낮은 위력의 공명 재시전을 만든다. */
export const ELEMENTAL_FOCUS_ECHO_EVERY_CASTS = 3;
export const ELEMENTAL_FOCUS_ECHO_POWER_SCALE = 0.25;
/** 수호 연구 첫 단계부터 보호막이 남아 있으면 받는 전투 피해를 줄인다. */
/** 수호 연구 완료 뒤 지원 영창이 밀어내는 결계 파동의 전투 수치. */
export const SPIRIT_RESONANCE_START_HASTE_SCALE = 0.9;
export const SPIRIT_RESONANCE_MILESTONE_HASTE_SCALE = 0.9;
export const VARIATION_DIVERSITY_BASE_BONUS = 0.4;
/** 4단계에 걸쳐 최대 +30%p. 매번 다른 원소·형태를 시도할 이유가 된다. */
export const VARIATION_DIVERSITY_BONUS_PER_STAGE = 0.075;
export const VARIATION_DIVERSITY_MAX_BONUS = 0.7;

export type ResearchContractId = 'elemental-focus' | 'spirit-resonance' | 'variation-study';

export const RESEARCH_ELEMENTS: readonly SpellElement[] = [
  'fire', 'water', 'lightning', 'ice', 'earth', 'wind', 'light', 'dark',
];

export type ResearchContractSelection =
  | { id: 'elemental-focus'; element: SpellElement }
  | { id: 'spirit-resonance' }
  | { id: 'variation-study' };

export interface ActiveResearchContract {
  id: ResearchContractId;
  element: SpellElement | null;
  progress: number;
  goal: number;
  completed: boolean;
  rewardInsight: number;
  usedElements: readonly SpellElement[];
  usedForms: readonly SpellForm[];
  spiritAcquisitions?: number;
  spiritFusions?: number;
}

export interface ResearchAdvanceResult {
  contract: ActiveResearchContract;
  changed: boolean;
  justCompleted: boolean;
}

export interface ResearchMilestoneReward {
  affinity: number;
  spiritHasteApplications: number;
  milestones: number;
}

export function spellMatchesElementalResearch(
  contract: ActiveResearchContract | null,
  spec: Pick<SpellSpec, 'element_primary' | 'element_secondary'>,
): boolean {
  return contract?.id === 'elemental-focus'
    && contract.element !== null
    && (spec.element_primary === contract.element || spec.element_secondary === contract.element);
}

/** 달성한 단계가 즉시 전투 공간에 보이도록 대상 원소 주문의 사거리·범위를 키운다. */
export function elementalFocusSpatialScale(
  contract: ActiveResearchContract | null,
  spec: Pick<SpellSpec, 'element_primary' | 'element_secondary'>,
): number {
  if (!contract || !spellMatchesElementalResearch(contract, spec)) return 1;
  return 1 + contract.progress * ELEMENTAL_FOCUS_SPATIAL_SCALE_PER_STAGE;
}

export function elementalFocusEchoUnlocked(contract: ActiveResearchContract | null): boolean {
  return contract?.id === 'elemental-focus' && contract.completed;
}

export function advanceElementalFocusEchoCharge(charge: number): {
  charge: number;
  triggered: boolean;
} {
  const safeCharge = Number.isFinite(charge) ? Math.max(0, Math.floor(charge)) : 0;
  const next = safeCharge + 1;
  return next >= ELEMENTAL_FOCUS_ECHO_EVERY_CASTS
    ? { charge: 0, triggered: true }
    : { charge: next, triggered: false };
}

export function spiritResonanceUnlocked(contract: ActiveResearchContract | null): boolean {
  return contract?.id === 'spirit-resonance' && contract.completed;
}

/** 만물의 변주 진행 단계가 실제 다양성 피해 상한을 조금씩 끌어올린다. */
export function variationDiversityMaxBonus(contract: ActiveResearchContract | null): number {
  if (contract?.id !== 'variation-study') return VARIATION_DIVERSITY_BASE_BONUS;
  return Math.min(
    VARIATION_DIVERSITY_MAX_BONUS,
    VARIATION_DIVERSITY_BASE_BONUS
      + contract.progress * VARIATION_DIVERSITY_BONUS_PER_STAGE,
  );
}

export function availableBasicResearchContracts(
  profile: Pick<MetaProfileV1, 'insight' | 'totalRuns'>,
  elementalFocusElement: SpellElement | null,
): ResearchContractSelection[] {
  if (profile.totalRuns < 1 || profile.insight < BASIC_RESEARCH_UNLOCK_INSIGHT) return [];
  return [
    ...(elementalFocusElement
      ? [{ id: 'elemental-focus' as const, element: elementalFocusElement }]
      : []),
    { id: 'spirit-resonance' as const },
    ...(profile.insight >= EXPANDED_RESEARCH_UNLOCK_INSIGHT
      ? [{ id: 'variation-study' as const }]
      : []),
  ];
}

export function startResearchContract(
  selection: ResearchContractSelection,
  completedContractIds: readonly string[],
): ActiveResearchContract {
  return {
    id: selection.id,
    element: selection.id === 'elemental-focus' ? selection.element : null,
    progress: 0,
    goal: selection.id === 'variation-study' ? VARIATION_RESEARCH_GOAL : RESEARCH_GOAL,
    completed: false,
    rewardInsight: completedContractIds.includes(selection.id)
      ? RESEARCH_REPEAT_REWARD
      : RESEARCH_FIRST_REWARD,
    usedElements: [],
    usedForms: [],
    spiritAcquisitions: 0,
    spiritFusions: 0,
  };
}

/** 한 번의 일반 수동 영창을 연구에 반영한다. */
export function advanceResearchContract(
  contract: ActiveResearchContract,
  executedSpecs: readonly SpellSpec[],
): ResearchAdvanceResult {
  if (contract.completed || executedSpecs.length === 0) {
    return { contract, changed: false, justCompleted: false };
  }

  let progress = contract.progress;
  let usedElements = [...contract.usedElements];
  let usedForms = [...contract.usedForms];
  if (contract.id === 'elemental-focus' && contract.element) {
    const matchingForms = executedSpecs
      .filter((spec) => spec.element_primary === contract.element
        || spec.element_secondary === contract.element)
      .map((spec) => spec.form);
    usedForms = [...new Set([...usedForms, ...matchingForms])];
    progress = Math.min(contract.goal, usedForms.length);
  } else if (contract.id === 'spirit-resonance') {
    // behavior가 아니라 영창 횟수 기준: 지원 form이 여러 개여도 이번 호출에서 +1만.
    // 정령 연성은 보상 선택·융합 이벤트에서만 advanceSpiritResonance로 진행한다.
  } else if (contract.id === 'variation-study') {
    const elements = executedSpecs.flatMap((spec) => [
      spec.element_primary,
      ...(spec.element_secondary ? [spec.element_secondary] : []),
    ]);
    usedElements = [...new Set([...usedElements, ...elements])];
    usedForms = [...new Set([...usedForms, ...executedSpecs.map((spec) => spec.form)])];
    progress = Math.min(contract.goal, usedElements.length, usedForms.length);
  }

  const changed = progress !== contract.progress
    || usedElements.length !== contract.usedElements.length
    || usedForms.length !== contract.usedForms.length;
  if (!changed) return { contract, changed: false, justCompleted: false };
  const completed = progress >= contract.goal;
  return {
    contract: { ...contract, progress, completed, usedElements, usedForms },
    changed: true,
    justCompleted: completed && !contract.completed,
  };
}

/** 정령 연성은 영창이 아니라 실제 정령 보상·융합을 과제로 삼는다. */
export function advanceSpiritResonance(
  contract: ActiveResearchContract,
  event: 'acquired' | 'fused',
): ResearchAdvanceResult {
  if (contract.id !== 'spirit-resonance' || contract.completed) {
    return { contract, changed: false, justCompleted: false };
  }
  const spiritAcquisitions = Math.min(2, (contract.spiritAcquisitions ?? 0) + (event === 'acquired' ? 1 : 0));
  const spiritFusions = Math.min(1, (contract.spiritFusions ?? 0) + (event === 'fused' ? 1 : 0));
  const progress = Math.min(contract.goal, spiritAcquisitions + spiritFusions);
  const changed = progress !== contract.progress
    || spiritAcquisitions !== (contract.spiritAcquisitions ?? 0)
    || spiritFusions !== (contract.spiritFusions ?? 0);
  if (!changed) return { contract, changed: false, justCompleted: false };
  const completed = progress >= contract.goal;
  return {
    contract: { ...contract, progress, completed, spiritAcquisitions, spiritFusions },
    changed: true,
    justCompleted: completed && !contract.completed,
  };
}

/**
 * 직전 상태와 현재 상태 사이에서 새로 달성한 단계만 런 내 보상으로 바꾼다.
 * 호출이 중복되거나 완료 상태를 다시 보고해도 보상이 생기지 않는다.
 */
export function researchMilestoneReward(
  previous: ActiveResearchContract | null,
  current: ActiveResearchContract,
): ResearchMilestoneReward {
  if (!previous || previous.id !== current.id) {
    return { affinity: 0, spiritHasteApplications: 0, milestones: 0 };
  }
  const milestones = Math.max(0, current.progress - previous.progress);
  return {
    affinity: current.id === 'elemental-focus'
      ? milestones * ELEMENTAL_FOCUS_MILESTONE_AFFINITY
      : 0,
    spiritHasteApplications: current.id === 'spirit-resonance'
      ? Math.max(0, (current.spiritAcquisitions ?? 0) - (previous.spiritAcquisitions ?? 0))
      : 0,
    milestones,
  };
}

/** HUD에서 목표와 남은 단계를 한눈에 읽게 하는 고정 폭 트래커. */
export function researchProgressSlots(contract: ActiveResearchContract): string {
  const filled = Math.min(contract.goal, Math.max(0, contract.progress));
  return `${'●'.repeat(filled)}${'○'.repeat(Math.max(0, contract.goal - filled))}`;
}
