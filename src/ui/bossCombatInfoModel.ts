import type { BossResistanceReadout } from '../render/bossResistanceReadout';
import type { SpellElement } from '../spell/types';

export interface BossResistanceBadge {
  element: SpellElement;
  reductionPercent: number;
  /** 마스터리로 저항이 실제 피해 계산에서 제거됐는가. */
  negated: boolean;
}

/** 실제 저항과 마스터리로 제거한 저항을 한 HUD에서 구분해 지속 표시한다. */
export function bossResistanceBadges(readout: BossResistanceReadout): BossResistanceBadge[] {
  return [
    ...readout.resisted.map(({ element, reductionPercent }) => ({
      element,
      reductionPercent,
      negated: false,
    })),
    ...readout.pierced.map((element) => ({
      element,
      reductionPercent: 0,
      negated: true,
    })),
  ];
}
