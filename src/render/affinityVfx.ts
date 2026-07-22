import { RUN_REWARD_CONFIG } from '../combat-core/run/rewardConfig';

/**
 * 원소 친화 VFX 격상 (총괄 결정 2026-07-22) — 영창가 빌드의 선택 동기.
 *
 * 소환사 축(정령 레벨·신속)은 화력이 크는데, 친화 축은 +15%씩 조용히 쌓일 뿐이라
 * 카드 선택의 손맛이 약했다. 친화를 쌓을수록 **그 원소 주문의 이펙트가 단계적으로
 * 화려해진다** — 위력·판정은 불변(순수 연출), 동기는 스펙터클.
 *
 * ⚠️ 판정 영역(onHit)과 무관한 오버레이만 격상한다. 폼 scale을 키우면 적중 반경이
 * 커져 숨은 버프가 되므로 건드리지 않는다.
 */

export const AFFINITY_VFX_CONFIG = {
  /** 티어 상한 — 3스택(+45%)이면 최대 연출 */
  maxTier: 3,
  /** 티어별 시전 플러리시: 확장 링 수 */
  ringsPerTier: [0, 1, 2, 3],
  /** 티어별 스파크 파티클 양 */
  sparksPerTier: [0, 6, 12, 20],
  /** 티어별 링 최대 반경 배율 */
  ringRadius: [0, 42, 54, 68],
  /** 티어 3 전용 — 잔광 엠버(원소색 불씨가 잠시 떠오름) */
  emberCountAtMax: 8,
} as const;

/** 친화 보너스(0.15/스택) → VFX 티어 (0=기본, 3=최대) */
export function affinityVfxTier(affinityBonus: number): number {
  const bonus = Number.isFinite(affinityBonus) ? Math.max(0, affinityBonus) : 0;
  const stacks = Math.round(bonus / RUN_REWARD_CONFIG.affinityBonus);
  return Math.min(AFFINITY_VFX_CONFIG.maxTier, stacks);
}
