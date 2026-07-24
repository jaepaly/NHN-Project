import { RUN_REWARD_CONFIG } from '../combat-core/run/rewardConfig';

/**
 * 원소 친화 VFX 격상 — 영창가 빌드의 선택 동기 (총괄 결정 2026-07-22, 연속화 07-24).
 *
 * 친화를 쌓을수록 그 원소 주문의 이펙트가 화려해진다 — 위력·판정은 불변(순수 연출).
 *
 * **연속 스케일(07-24 개편)**: 이전엔 티어가 0.45(3스택)에서 상한이라, 사용 성장(#166)으로
 * 친화가 0.9까지 올라도 0.45와 똑같아 "체감이 안 됐다". 이제 강도를 친화에 **연속 비례**시켜
 * ① 매 시전의 작은 성장(+0.02)도 스파크·반경이 눈에 띄게 늘고 ② 깊은 마스터(0.9+)는
 * 얕은 투자와 확연히 다르게 보인다.
 *
 * ⚠️ 판정 영역(onHit)과 무관한 오버레이만 격상한다. 폼 scale을 키우면 적중 반경이
 * 커져 숨은 버프가 되므로 건드리지 않는다.
 */

export const AFFINITY_VFX_CONFIG = {
  /** 강도 상한 — 친화 1.2(스택 8)에서 최대 연출. 그 위로는 안 커진다 */
  intensityCap: 8,
  /** 이 강도 미만이면 플러리시 없음 (무친화 기본형 보존) — ≈친화 0.06 */
  minIntensity: 0.4,
  /** 확장 링 최대 개수 (강도 반올림, 이 값에서 캡) */
  maxRings: 5,
  /** 스파크 기본량 + 강도당 증가 (스택당 +9 → 매 시전 성장이 보인다) */
  sparksBase: 10,
  sparksPerStack: 9,
  /** 링 최대 반경 기본 + 강도당 증가 */
  radiusBase: 78,
  radiusPerStack: 14,
  /** 이 강도부터 엠버 잔광(원소 불씨) — 스택 3(친화 0.45) */
  emberFromIntensity: 3,
  emberPerStack: 2.4,
  emberCap: 18,
  /** 이 강도부터 마스터리 섬광(밝은 확장 원) — 스택 5(친화 0.75) */
  flashFromIntensity: 5,
} as const;

/**
 * 친화 보너스 → 연속 VFX 강도 (스택 단위, 0=기본). 친화 0.15당 강도 1, 상한 8.
 * 정수 티어가 아니라 **연속**이라 매 시전의 작은 친화 성장도 강도에 반영된다.
 */
export function affinityVfxIntensity(affinityBonus: number): number {
  const bonus = Number.isFinite(affinityBonus) ? Math.max(0, affinityBonus) : 0;
  return Math.min(AFFINITY_VFX_CONFIG.intensityCap, bonus / RUN_REWARD_CONFIG.affinityBonus);
}

/** 자동 시전처럼 시각적 우선순위를 낮출 때 — 강도에서 감산(0 하한). */
export function reducedAffinityVfxIntensity(affinityBonus: number, reduction: number): number {
  const safeReduction = Number.isFinite(reduction) ? Math.max(0, reduction) : 0;
  return Math.max(0, affinityVfxIntensity(affinityBonus) - safeReduction);
}
