import type { SpellElement } from '../../spell/types';

/** 폭염 저주의 초기 플레이테스트 수치. */
export const HEATWAVE_CURSE_CONFIG = {
  damageRatioPerSecond: 0.01,
  entryGraceSeconds: 3,
  coolingHealRatio: 0.1,
  coolingImmunitySeconds: 5,
  damageNoticeIntervalSeconds: 1,
} as const;

export const HEATWAVE_COOLING_ELEMENTS = ['water', 'ice', 'wind'] as const satisfies readonly SpellElement[];

export function isHeatwaveCoolingElement(element: SpellElement | null | undefined): boolean {
  return element !== undefined
    && element !== null
    && (HEATWAVE_COOLING_ELEMENTS as readonly SpellElement[]).includes(element);
}

export function heatwaveDamagePerSecond(maxHp: number): number {
  return Number.isFinite(maxHp) && maxHp > 0
    ? maxHp * HEATWAVE_CURSE_CONFIG.damageRatioPerSecond
    : 0;
}

export function heatwaveCoolingHeal(maxHp: number): number {
  return Number.isFinite(maxHp) && maxHp > 0
    ? maxHp * HEATWAVE_CURSE_CONFIG.coolingHealRatio
    : 0;
}
