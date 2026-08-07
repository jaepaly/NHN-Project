import type { BossResistanceReadout } from '../render/bossResistanceReadout';
import type { SpellElement } from '../spell/types';

export interface BossResistanceBadge {
  element: SpellElement;
  reductionPercent: number;
}

/** Only resistance that currently reduces damage remains in the persistent boss HUD. */
export function bossResistanceBadges(readout: BossResistanceReadout): BossResistanceBadge[] {
  return readout.resisted.map(({ element, reductionPercent }) => ({ element, reductionPercent }));
}
