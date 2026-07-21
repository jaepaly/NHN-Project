import type { SpellElement } from './types';
import type { RunMemory } from './runMemory';

/**
 * 런 반복 격상 (Phase 5 Track B, #77) — R2 순수 로직.
 *
 * 설계 명제: 난이도는 "더 아프게(HP↑)"가 아니라 **"지난 런에 통했던 답을 못 쓰게"**.
 * `runMemory`의 회차(clears)·최근 최다 원소를 읽어, 이번 런에 적용할 **격상 프로필**을 낸다.
 * (렌더·전투 적용은 소비자 몫 — 이 모듈은 "무엇을 얼마나 봉인/약화하나"만 결정)
 */

export const RUN_ESCALATION_CONFIG = {
  /** 티어 상한 — 그 이상 회차는 같은 강도 (무한 인플레 방지) */
  maxTier: 5,
  /** 애용 원소 런-전체 약화가 시작되는 티어 */
  weakenStartTier: 2,
  /** 티어당 약화 폭 (위력·효율 배율 감소분) */
  weakenPerTier: 0.15,
  /** 약화 배율 하한 (완전 봉인은 처벌 → 최소 40%는 남김) */
  weakenFloor: 0.4,
  /** 방 기믹 해금 티어 (R1이 이 플래그로 기믹 노출) */
  gimmickUnlockTier: 3,
  /** 보스 이중 저항 발동 티어 (bossEnemy가 이미 2원소 지원) */
  dualResistTier: 4,
} as const;

export interface RunEscalationProfile {
  /** 이번 런의 격상 티어 (1-based, 상한 maxTier) */
  tier: number;
  /** 런 전체에서 약화되는 원소 (플레이어가 최근 과의존한 것). 티어<2면 빈 배열 */
  weakenedElements: SpellElement[];
  /** 약화 원소에 적용할 위력 배율 (1=정상, <1=약화, 하한 weakenFloor) */
  weakenMultiplier: number;
  /** 방 기믹 해금 여부 (R1이 침묵대·정전 등 노출 판단에 사용) */
  gimmicksUnlocked: boolean;
  /** 보스 이중 저항 여부 (2원소 동시 저항) */
  bossDualResistance: boolean;
}

/** 누적 클리어(clears)를 이번 런의 격상 티어로. clears 0(첫 런)=티어 1. */
export function runEscalationTier(clears: number): number {
  const c = Number.isFinite(clears) ? Math.max(0, Math.floor(clears)) : 0;
  return Math.min(RUN_ESCALATION_CONFIG.maxTier, c + 1);
}

/** runMemory → 이번 런 격상 프로필. */
export function runEscalationProfile(memory: RunMemory): RunEscalationProfile {
  const tier = runEscalationTier(memory.clears);
  const escalating = tier >= RUN_ESCALATION_CONFIG.weakenStartTier;

  return {
    tier,
    weakenedElements: escalating ? overRelliedElements(memory) : [],
    weakenMultiplier: escalating
      ? Math.max(
        RUN_ESCALATION_CONFIG.weakenFloor,
        1 - RUN_ESCALATION_CONFIG.weakenPerTier * (tier - 1),
      )
      : 1,
    gimmicksUnlocked: tier >= RUN_ESCALATION_CONFIG.gimmickUnlockTier,
    bossDualResistance: tier >= RUN_ESCALATION_CONFIG.dualResistTier,
  };
}

/** 최근 과의존 원소 — recentDominantElements 우선, 없으면 favoriteElement. 중복 제거. */
function overRelliedElements(memory: RunMemory): SpellElement[] {
  const source = memory.recentDominantElements.length > 0
    ? memory.recentDominantElements
    : memory.favoriteElement
      ? [memory.favoriteElement]
      : [];
  return [...new Set(source)];
}
