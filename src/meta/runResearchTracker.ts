import type { MapNodeKind } from '../run/mapGraphContract';
import type { ResolvedSpellPlan } from '../spell/sequencePlan';
import type { SpellSpec } from '../spell/types';
import {
  discoverySignatureFromSpec,
  discoverySignaturesFromPlan,
  type DiscoverySignature,
} from './discoverySignature';
import type { MetaRunOutcome } from './metaProfile';
import {
  advanceResearchContract,
  startResearchContract,
  type ActiveResearchContract,
  type ResearchContractSelection,
} from './researchContract';

export const RUN_RESEARCH_REWARDS = {
  discoveryInsightCap: 4,
  combatRoomInsightCap: 4,
  combatRoomInsight: 1,
  stageBossInsight: 2,
  memoryBossInsight: 5,
} as const;

const COMBAT_ROOM_KINDS = new Set<MapNodeKind>(['start', 'combat', 'elite', 'trap']);

export interface RunResearchSnapshot {
  insightEarned: number;
  discoveryInsight: number;
  roomInsight: number;
  researchInsight: number;
  newSignatures: readonly DiscoverySignature[];
  research: ActiveResearchContract | null;
}

export class RunResearchTracker {
  private knownSignatures = new Set<DiscoverySignature>();
  private newSignatures = new Set<DiscoverySignature>();
  private clearedRoomIds = new Set<string>();
  private combatRoomInsight = 0;
  private bossInsight = 0;
  private completedContractIds = new Set<string>();
  private activeResearch: ActiveResearchContract | null = null;

  constructor(
    knownSignatures: readonly DiscoverySignature[] = [],
    completedContractIds: readonly string[] = [],
  ) {
    this.reset(knownSignatures, completedContractIds);
  }

  reset(
    knownSignatures: readonly DiscoverySignature[] = [],
    completedContractIds: readonly string[] = [],
  ): void {
    this.knownSignatures = new Set(knownSignatures);
    this.completedContractIds = new Set(completedContractIds);
    this.newSignatures.clear();
    this.clearedRoomIds.clear();
    this.combatRoomInsight = 0;
    this.bossInsight = 0;
    this.activeResearch = null;
  }

  /** 심층 이어가기는 같은 연구를 유지하되, 이미 받은 완료 보상은 다시 들고 가지 않는다. */
  beginContinuedLoop(
    knownSignatures: readonly DiscoverySignature[],
    completedContractIds: readonly string[],
  ): void {
    const incompleteResearch = this.activeResearch?.completed ? null : this.activeResearch;
    this.reset(knownSignatures, completedContractIds);
    this.activeResearch = incompleteResearch;
  }

  selectResearch(selection: ResearchContractSelection): ActiveResearchContract {
    this.activeResearch = startResearchContract(selection, [...this.completedContractIds]);
    return this.activeResearch;
  }

  recordNormalSpell(spec: SpellSpec): DiscoverySignature[] {
    const discovered = this.recordSignatures([discoverySignatureFromSpec(spec)]);
    this.advanceResearch([spec]);
    return discovered;
  }

  recordNormalPlan(plan: ResolvedSpellPlan): DiscoverySignature[] {
    if (plan.castMode !== 'normal') return [];
    const discovered = this.recordSignatures(discoverySignaturesFromPlan(plan));
    const specs = plan.sequences.flatMap((sequence) => sequence.behaviors.flatMap((behavior) => (
      behavior.type === 'form' ? [behavior.spec] : []
    )));
    this.advanceResearch(specs);
    return discovered;
  }

  private advanceResearch(specs: readonly SpellSpec[]): void {
    if (!this.activeResearch) return;
    this.activeResearch = advanceResearchContract(this.activeResearch, specs).contract;
  }

  private recordSignatures(signatures: readonly DiscoverySignature[]): DiscoverySignature[] {
    const added: DiscoverySignature[] = [];
    for (const signature of signatures) {
      if (this.knownSignatures.has(signature) || this.newSignatures.has(signature)) continue;
      this.newSignatures.add(signature);
      added.push(signature);
    }
    return added;
  }

  recordRoomCleared(roomId: string, kind: MapNodeKind): number {
    if (this.clearedRoomIds.has(roomId)) return 0;
    this.clearedRoomIds.add(roomId);

    if (COMBAT_ROOM_KINDS.has(kind)) {
      const remaining = RUN_RESEARCH_REWARDS.combatRoomInsightCap - this.combatRoomInsight;
      const earned = Math.max(0, Math.min(RUN_RESEARCH_REWARDS.combatRoomInsight, remaining));
      this.combatRoomInsight += earned;
      return earned;
    }
    if (kind === 'stage-boss') {
      this.bossInsight += RUN_RESEARCH_REWARDS.stageBossInsight;
      return RUN_RESEARCH_REWARDS.stageBossInsight;
    }
    if (kind === 'memory-boss') {
      this.bossInsight += RUN_RESEARCH_REWARDS.memoryBossInsight;
      return RUN_RESEARCH_REWARDS.memoryBossInsight;
    }
    return 0;
  }

  snapshot(): RunResearchSnapshot {
    const discoveryInsight = Math.min(
      this.newSignatures.size,
      RUN_RESEARCH_REWARDS.discoveryInsightCap,
    );
    const roomInsight = this.combatRoomInsight + this.bossInsight;
    const researchInsight = this.activeResearch?.completed
      ? this.activeResearch.rewardInsight
      : 0;
    return {
      insightEarned: discoveryInsight + roomInsight + researchInsight,
      discoveryInsight,
      roomInsight,
      researchInsight,
      newSignatures: [...this.newSignatures],
      research: this.activeResearch
        ? {
          ...this.activeResearch,
          usedElements: [...this.activeResearch.usedElements],
          usedForms: [...this.activeResearch.usedForms],
        }
        : null,
    };
  }

  outcome(result: 'win' | 'lose'): MetaRunOutcome {
    const snapshot = this.snapshot();
    return {
      result,
      insightEarned: snapshot.insightEarned,
      discoveredSignatures: snapshot.newSignatures,
      completedContractIds: snapshot.research?.completed
        ? [snapshot.research.id]
        : [],
    };
  }
}
