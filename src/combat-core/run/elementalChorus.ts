import { ELEMENTS, type SpellElement } from '../../spell/types';

export const ELEMENTAL_CHORUS = {
  affinityThreshold: 0.3,
  entryAffinity: 0.15,
  useAffinityPerCast: 0.01,
  affinityCap: 0.3,
  stages: [0.15, 0.23, 0.3] as const,
  projectileCounts: [1, 3, 5] as const,
  projectilePowerScale: 0.05,
} as const;

export function chorusElements(
  affinity: Readonly<Partial<Record<SpellElement, number>>>,
): SpellElement[] {
  return ELEMENTS.filter((element) => (affinity[element] ?? 0) >= ELEMENTAL_CHORUS.affinityThreshold);
}

export function shouldEnterElementalChorus(
  affinity: Readonly<Partial<Record<SpellElement, number>>>,
): boolean {
  return chorusElements(affinity).length >= 3;
}

export function chorusStage(
  affinity: Readonly<Partial<Record<SpellElement, number>>>,
  chorusAffinity: number | null = null,
): 0 | 1 | 2 | 3 {
  if (chorusAffinity !== null) {
    if (chorusAffinity >= ELEMENTAL_CHORUS.stages[2]) return 3;
    if (chorusAffinity >= ELEMENTAL_CHORUS.stages[1]) return 2;
    return chorusAffinity >= ELEMENTAL_CHORUS.stages[0] ? 1 : 0;
  }
  const count = chorusElements(affinity).length;
  return count >= 3 ? 1 : 0;
}

export function affinityForElement(
  affinity: Readonly<Partial<Record<SpellElement, number>>>,
  chorusAffinity: number | null,
  element: SpellElement,
): number {
  return chorusAffinity ?? affinity[element] ?? 0;
}

export function chorusProjectileCount(stage: number): number {
  return ELEMENTAL_CHORUS.projectileCounts[Math.max(0, Math.min(2, stage - 1))] ?? 0;
}
