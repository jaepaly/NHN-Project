import type { UltimateResonanceContext } from '../../spell/judge';
import type { SpellEffect, SpellElement, SpellForm, SpellStatus } from '../../spell/types';

/**
 * 일반 영창으로 충전하고, 명시적으로 진입한 필살영창에서만 소비하는 게이지.
 * 일반 판정 결과의 형태나 원소 수는 소비 조건에 영향을 주지 않는다.
 */

export const FUSION_CONFIG = {
  /** 만충 기준 — 수동 영창으로 지불한 마나 누적. 보스전까지 1~2회 방출 페이스(튜닝 노브) */
  fullCharge: 120,
} as const;

/** 각인·각성에서 공유하는 원소별 대표 상태이상. */
export const FUSION_ELEMENT_STATUS: Record<SpellElement, SpellStatus> = {
  fire: 'burn',
  water: 'knockback',
  lightning: 'shock',
  ice: 'freeze',
  earth: 'slow',
  wind: 'knockback',
  light: 'weaken',
  dark: 'weaken',
};

export class FusionGauge {
  private chargeValue = 0;
  private readonly elementWeights = new Map<SpellElement, number>();
  private readonly formWeights = new Map<SpellForm, number>();
  private readonly effectWeights = new Map<SpellEffect, number>();
  private readonly recentNames: string[] = [];

  /** 방금 만충에 도달했는지 — 안내 1회용 (charge가 true를 돌려준 그 호출에서만) */
  charge(spentMana: number, contribution?: {
    name: string;
    elements: readonly SpellElement[];
    forms: readonly SpellForm[];
    effects: readonly SpellEffect[];
  }): boolean {
    const spend = Number.isFinite(spentMana) ? Math.max(0, spentMana) : 0;
    if (spend === 0) return false;
    const before = this.chargeValue;
    this.chargeValue = Math.min(FUSION_CONFIG.fullCharge, this.chargeValue + spend);
    const accepted = this.chargeValue - before;
    if (accepted > 0 && contribution) this.recordContribution(contribution, accepted);
    return before < FUSION_CONFIG.fullCharge && this.chargeValue >= FUSION_CONFIG.fullCharge;
  }

  get resonance(): UltimateResonanceContext {
    const ranked = <T extends string>(weights: Map<T, number>, limit: number): T[] => (
      [...weights.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([value]) => value)
    );
    return {
      elements: ranked(this.elementWeights, 4),
      forms: ranked(this.formWeights, 4),
      effects: ranked(this.effectWeights, 3),
      recentNames: [...this.recentNames],
    };
  }

  get ratio(): number {
    return this.chargeValue / FUSION_CONFIG.fullCharge;
  }

  get ready(): boolean {
    return this.chargeValue >= FUSION_CONFIG.fullCharge;
  }

  /** A valid ultimate plan consumes the full gauge exactly once. */
  consumeUltimate(): boolean {
    if (!this.ready) return false;
    this.clear();
    return true;
  }

  reset(): void {
    this.clear();
  }

  private recordContribution(contribution: {
    name: string;
    elements: readonly SpellElement[];
    forms: readonly SpellForm[];
    effects: readonly SpellEffect[];
  }, weight: number): void {
    const add = <T extends string>(map: Map<T, number>, values: readonly T[]) => {
      for (const value of new Set(values)) map.set(value, (map.get(value) ?? 0) + weight);
    };
    add(this.elementWeights, contribution.elements);
    add(this.formWeights, contribution.forms);
    add(this.effectWeights, contribution.effects);
    const name = contribution.name.trim();
    if (name) {
      const previous = this.recentNames.indexOf(name);
      if (previous >= 0) this.recentNames.splice(previous, 1);
      this.recentNames.push(name.slice(0, 30));
      if (this.recentNames.length > 3) this.recentNames.shift();
    }
  }

  private clear(): void {
    this.chargeValue = 0;
    this.elementWeights.clear();
    this.formWeights.clear();
    this.effectWeights.clear();
    this.recentNames.length = 0;
  }
}
