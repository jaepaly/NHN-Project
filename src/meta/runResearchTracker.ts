import type { MapNodeKind } from '../run/mapGraphContract';
import type { ResolvedSpellPlan } from '../spell/sequencePlan';
import type { SpellSpec } from '../spell/types';
import {
  discoverySignatureFromSpec,
  discoverySignaturesFromPlan,
  type DiscoverySignature,
} from './discoverySignature';
import type { MetaRunOutcome } from './metaProfile';

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
  newSignatures: readonly DiscoverySignature[];
}

export class RunResearchTracker {
  private knownSignatures = new Set<DiscoverySignature>();
  private newSignatures = new Set<DiscoverySignature>();
  private clearedRoomIds = new Set<string>();
  private combatRoomInsight = 0;
  private bossInsight = 0;

  constructor(knownSignatures: readonly DiscoverySignature[] = []) {
    this.reset(knownSignatures);
  }

  reset(knownSignatures: readonly DiscoverySignature[] = []): void {
    this.knownSignatures = new Set(knownSignatures);
    this.newSignatures.clear();
    this.clearedRoomIds.clear();
    this.combatRoomInsight = 0;
    this.bossInsight = 0;
  }

  recordNormalSpell(spec: SpellSpec): DiscoverySignature[] {
    return this.recordSignatures([discoverySignatureFromSpec(spec)]);
  }

  recordNormalPlan(plan: ResolvedSpellPlan): DiscoverySignature[] {
    return this.recordSignatures(discoverySignaturesFromPlan(plan));
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
    return {
      insightEarned: discoveryInsight + roomInsight,
      discoveryInsight,
      roomInsight,
      newSignatures: [...this.newSignatures],
    };
  }

  outcome(result: 'win' | 'lose'): MetaRunOutcome {
    const snapshot = this.snapshot();
    return {
      result,
      insightEarned: snapshot.insightEarned,
      discoveredSignatures: snapshot.newSignatures,
    };
  }
}
