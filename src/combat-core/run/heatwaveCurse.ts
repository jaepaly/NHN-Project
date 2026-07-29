import type { SpellElement } from '../../spell/types';

/** 폭염 저주의 초기 플레이테스트 수치. */
export const HEATWAVE_CURSE_CONFIG = {
  damageRatioPerSecond: 0.015,
  entryGraceSeconds: 3,
  coolingHealRatio: 0.1,
  coolingImmunitySeconds: 5,
  damageNoticeIntervalSeconds: 1,
} as const;

export const HEATWAVE_COOLING_ELEMENTS = ['water', 'ice', 'wind'] as const satisfies readonly SpellElement[];

export interface HeatwaveTimerState {
  graceRemaining: number;
  immunityRemaining: number;
}

export interface HeatwaveTimerStep extends HeatwaveTimerState {
  /** Portion of this update interval during which environmental damage applies. */
  damagingSeconds: number;
}

export function advanceHeatwaveTimers(
  state: Readonly<HeatwaveTimerState>,
  deltaSeconds: number,
): HeatwaveTimerStep {
  const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
  const graceRemaining = safeRemaining(state.graceRemaining);
  const immunityRemaining = safeRemaining(state.immunityRemaining);
  const protectedSeconds = Math.max(graceRemaining, immunityRemaining);

  return {
    graceRemaining: Math.max(0, graceRemaining - delta),
    immunityRemaining: Math.max(0, immunityRemaining - delta),
    damagingSeconds: Math.max(0, delta - protectedSeconds),
  };
}

export function isHeatwaveDamaging(state: Readonly<HeatwaveTimerState>): boolean {
  return safeRemaining(state.graceRemaining) <= 0
    && safeRemaining(state.immunityRemaining) <= 0;
}

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

function safeRemaining(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}
