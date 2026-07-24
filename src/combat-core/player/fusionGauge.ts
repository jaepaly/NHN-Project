import type { SpellElement, SpellSpec, SpellStatus } from '../../spell/types';

/**
 * 필살기 — 융합 게이지 (게임성 분석 ②: 절정 구조. 총괄 아이디어, backlog 재개).
 *
 * 수동 영창으로만 차오르는 게이지. 만충 상태에서 **두 원소를 담은 문장**을 영창하면
 * (판정이 element_secondary를 내면) 그 주문이 융합 방출로 격상된다:
 * size=huge · 위력 상한 · 두 원소의 대표 상태이상 동시 적용 · 전용 대연출.
 *
 * 왜 수동 전용인가 — 소환사 빌드가 강할수록 "정령이 다 잡는데 왜 영창하지?"가
 * 되는데, 게이지가 수동 영창으로만 차면 직접 외치는 것에만 있는 보상이 생긴다
 * (빌드 무관 수동 영창 동기). 방출도 수동 시전이므로 오토 게이트(#67)와 무관.
 *
 * 원소 지정은 "영창으로 그 자리에서 지정" — 별도 UI 없이, 만충 후 두 원소를 담아
 * 말하는 것 자체가 방아쇠다. 말이 곧 마법이라는 정체성 그대로.
 */

export const FUSION_CONFIG = {
  /** 만충 기준 — 수동 영창으로 지불한 마나 누적. 보스전까지 1~2회 방출 페이스(튜닝 노브) */
  fullCharge: 120,
  /** 방출 위력 — 페널티·친화 체인을 덮는 고정 최대치 ("최대 방출"의 약속) */
  releasePower: 100,
  releaseSize: 'huge' as const,
  /** 상태이상 동시 적용 상한 (판정 스키마와 동일) */
  maxStatuses: 3,
} as const;

/** 원소별 대표 상태이상 — 융합 방출이 "진짜 융합"이 되게 두 원소 것을 함께 싣는다 */
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

  /** 방금 만충에 도달했는지 — 안내 1회용 (charge가 true를 돌려준 그 호출에서만) */
  charge(spentMana: number): boolean {
    const spend = Number.isFinite(spentMana) ? Math.max(0, spentMana) : 0;
    if (spend === 0) return false;
    const before = this.chargeValue;
    this.chargeValue = Math.min(FUSION_CONFIG.fullCharge, this.chargeValue + spend);
    return before < FUSION_CONFIG.fullCharge && this.chargeValue >= FUSION_CONFIG.fullCharge;
  }

  get ratio(): number {
    return this.chargeValue / FUSION_CONFIG.fullCharge;
  }

  get ready(): boolean {
    return this.chargeValue >= FUSION_CONFIG.fullCharge;
  }

  /**
   * 방출 시도 — 만충 + 이중 원소 판정일 때만 격상 스펙을 돌려주고 게이지를 비운다.
   * 아니면 null (단일 원소 시전은 게이지를 소모하지 않는다 — 만충이 낭비되지 않게).
   */
  tryRelease(spec: SpellSpec): SpellSpec | null {
    if (!this.ready || !spec.element_secondary) return null;
    this.chargeValue = 0;
    const statuses = [...new Set([
      ...spec.status,
      FUSION_ELEMENT_STATUS[spec.element_primary],
      FUSION_ELEMENT_STATUS[spec.element_secondary],
    ])].slice(0, FUSION_CONFIG.maxStatuses);
    return {
      ...spec,
      size: FUSION_CONFIG.releaseSize,
      power: FUSION_CONFIG.releasePower,
      status: statuses,
    };
  }

  reset(): void {
    this.chargeValue = 0;
  }
}
