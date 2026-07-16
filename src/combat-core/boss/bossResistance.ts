import type { SpellElement } from '../../spell/types';
import type { BossMemoryProfile } from '../../spell/spellHistory';
import { BOSS_CONFIG } from './bossConfig';

/**
 * 보스 기억 → 원소 내성 프로필 (GDD §4.1 런 내 기억).
 *
 * ⚠️ R2 계약 지점: 이 모듈은 총괄이 만든 1차 구현이다. 임재윤(R2)의 Phase 3 내성 프로필
 * 모듈이 준비되면 이 파일의 함수를 대체·확장한다 (최다 폼 카운터, 런 간 기억 반영 등).
 * 시그니처(BossMemoryProfile 입력 → 프로필/배율 출력)는 유지할 것.
 */

export interface BossResistanceProfile {
  /** 내성 원소. null이면 내성 없음 */
  element: SpellElement | null;
  /** 내성 원소 피해에 곱하는 배율 (1 = 무효과) */
  multiplier: number;
}

export const NO_RESISTANCE: BossResistanceProfile = { element: null, multiplier: 1 };

/** 런 주문 히스토리 요약에서 내성 프로필을 계산한다. 표본이 적으면 내성 없음. */
export function resistanceFromBossMemory(memory: BossMemoryProfile): BossResistanceProfile {
  if (!memory.dominantElement || memory.totalCasts < BOSS_CONFIG.resistanceMinCasts) {
    return NO_RESISTANCE;
  }
  return {
    element: memory.dominantElement,
    multiplier: BOSS_CONFIG.resistanceMultiplier,
  };
}

/** 주문 원소에 적용할 피해 배율. 내성 원소만 감쇄, 나머지는 1. */
export function bossDamageMultiplier(
  profile: BossResistanceProfile,
  element: SpellElement,
): number {
  return profile.element === element ? profile.multiplier : 1;
}
