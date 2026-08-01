import type { MetaProfileV1 } from './metaProfile';
import type { SpellElement, SpellForm, SpellSpec } from '../spell/types';

export const BASIC_RESEARCH_UNLOCK_INSIGHT = 4;
export const RESEARCH_GOAL = 3;
export const RESEARCH_FIRST_REWARD = 3;
export const RESEARCH_REPEAT_REWARD = 2;
export const ELEMENTAL_FOCUS_START_AFFINITY = 0.15;
export const WARD_STUDY_START_SHIELD = 20;

export type ResearchContractId = 'elemental-focus' | 'ward-study';

export type ResearchContractSelection =
  | { id: 'elemental-focus'; element: SpellElement }
  | { id: 'ward-study' };

export interface ActiveResearchContract {
  id: ResearchContractId;
  element: SpellElement | null;
  progress: number;
  goal: number;
  completed: boolean;
  rewardInsight: number;
  usedForms: readonly SpellForm[];
}

export interface ResearchAdvanceResult {
  contract: ActiveResearchContract;
  changed: boolean;
  justCompleted: boolean;
}

const WARD_EFFECTS = new Set<SpellSpec['effect']>(['heal', 'shield', 'buff', 'control']);

export function availableBasicResearchContracts(
  profile: Pick<MetaProfileV1, 'insight' | 'totalRuns'>,
  previousDominantElement: SpellElement | null,
): ResearchContractSelection[] {
  if (profile.totalRuns < 1 || profile.insight < BASIC_RESEARCH_UNLOCK_INSIGHT) return [];
  return [
    ...(previousDominantElement
      ? [{ id: 'elemental-focus' as const, element: previousDominantElement }]
      : []),
    { id: 'ward-study' as const },
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
    goal: RESEARCH_GOAL,
    completed: false,
    rewardInsight: completedContractIds.includes(selection.id)
      ? RESEARCH_REPEAT_REWARD
      : RESEARCH_FIRST_REWARD,
    usedForms: [],
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
  let usedForms = [...contract.usedForms];
  if (contract.id === 'elemental-focus' && contract.element) {
    const matchingForms = executedSpecs
      .filter((spec) => spec.element_primary === contract.element
        || spec.element_secondary === contract.element)
      .map((spec) => spec.form);
    usedForms = [...new Set([...usedForms, ...matchingForms])];
    progress = Math.min(contract.goal, usedForms.length);
  } else if (
    contract.id === 'ward-study'
    && executedSpecs.some((spec) => WARD_EFFECTS.has(spec.effect))
  ) {
    // behavior가 아니라 영창 횟수 기준: 지원 form이 여러 개여도 이번 호출에서 +1만.
    progress = Math.min(contract.goal, progress + 1);
  }

  const changed = progress !== contract.progress;
  if (!changed) return { contract, changed: false, justCompleted: false };
  const completed = progress >= contract.goal;
  return {
    contract: { ...contract, progress, completed, usedForms },
    changed: true,
    justCompleted: completed && !contract.completed,
  };
}
