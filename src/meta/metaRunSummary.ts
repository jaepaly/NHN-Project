import type { MetaProfileV1 } from './metaProfile';
import type { RunResearchSnapshot } from './runResearchTracker';
import type { DiscoverySignature } from './discoverySignature';
import type { ActiveResearchContract } from './researchContract';

export type MetaUnlockId =
  | 'basic-research'
  | 'expanded-research'
  | 'forbidden-research'
  | 'advanced-records';

export interface MetaInsightUnlock {
  id: MetaUnlockId;
  threshold: number;
}

export const META_INSIGHT_UNLOCKS: readonly MetaInsightUnlock[] = [
  { id: 'basic-research', threshold: 4 },
  { id: 'expanded-research', threshold: 14 },
  { id: 'forbidden-research', threshold: 30 },
  { id: 'advanced-records', threshold: 50 },
];

export interface MetaRunSummary {
  insightEarned: number;
  totalInsight: number;
  discoveryInsight: number;
  roomInsight: number;
  researchInsight: number;
  newSignatures: readonly DiscoverySignature[];
  research: ActiveResearchContract | null;
  nextUnlock: MetaInsightUnlock | null;
  insightToNextUnlock: number;
}

export function nextMetaInsightUnlock(totalInsight: number): MetaInsightUnlock | null {
  const safeInsight = Number.isFinite(totalInsight) ? Math.max(0, Math.floor(totalInsight)) : 0;
  return META_INSIGHT_UNLOCKS.find((unlock) => unlock.threshold > safeInsight) ?? null;
}

/** 저장이 끝난 프로필과 아직 리셋되지 않은 런 추적기를 결과 화면용 데이터로 묶는다. */
export function buildMetaRunSummary(
  profile: Pick<MetaProfileV1, 'insight'>,
  run: RunResearchSnapshot,
): MetaRunSummary {
  const totalInsight = Number.isFinite(profile.insight)
    ? Math.max(0, Math.floor(profile.insight))
    : 0;
  const nextUnlock = nextMetaInsightUnlock(totalInsight);
  return {
    insightEarned: run.insightEarned,
    totalInsight,
    discoveryInsight: run.discoveryInsight,
    roomInsight: run.roomInsight,
    researchInsight: run.researchInsight,
    newSignatures: [...run.newSignatures],
    research: run.research
      ? { ...run.research, usedForms: [...run.research.usedForms] }
      : null,
    nextUnlock,
    insightToNextUnlock: nextUnlock ? nextUnlock.threshold - totalInsight : 0,
  };
}
