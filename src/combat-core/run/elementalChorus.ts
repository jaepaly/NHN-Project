import { ELEMENTS, type SpellElement } from '../../spell/types';

export const ELEMENTAL_CHORUS = {
  affinityThreshold: 0.3,
  stages: [3, 5, 8] as const,
  projectileCounts: [1, 3, 5] as const,
} as const;

export function chorusElements(
  affinity: Readonly<Partial<Record<SpellElement, number>>>,
): SpellElement[] {
  return ELEMENTS.filter((element) => (affinity[element] ?? 0) >= ELEMENTAL_CHORUS.affinityThreshold);
}

export function chorusStage(affinity: Readonly<Partial<Record<SpellElement, number>>>): 0 | 1 | 2 | 3 {
  const count = chorusElements(affinity).length;
  if (count >= 8) return 3;
  if (count >= 5) return 2;
  if (count >= 3) return 1;
  return 0;
}

export function chorusProjectileCount(stage: number): number {
  return ELEMENTAL_CHORUS.projectileCounts[Math.max(0, Math.min(2, stage - 1))] ?? 0;
}
