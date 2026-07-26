import type { SpellForm } from './types';
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
  /**
   * 런 전체에서 약화되는 **폼** (플레이어가 최근 과의존한 패턴). 티어<2면 빈 배열.
   *
   * 원소 → 폼 전환 (#171 합의, MASTERY_REDESIGN §3①): 원소를 벌하면 다채로운
   * 화염 마스터(볼트→벽→폭발→분신)까지 때려 친화 보상과 자기모순이었다.
   * 폼을 벌하면 "같은 수를 반복하는 사람"만 맞는다 — 원소 집중은 숙련이고,
   * 벌해야 할 것은 표현의 정체다. 보스 장기 저항(원소·서사 축)은 별개로 유지.
   */
  weakenedForms: SpellForm[];
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
    weakenedForms: escalating ? overRelliedForms(memory) : [],
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

/**
 * 최근 과의존 폼 — recentDominantForms에서 중복 제거.
 * 구버전 프로필(폼 이력 없음)은 빈 배열 → 데이터가 쌓일 때까지 약화 없음.
 * 원소 시절의 favoriteElement 폴백 같은 대체 축은 두지 않는다 — 잘못된 축으로
 * 벌하느니 한 런 쉬는 게 낫다.
 */
function overRelliedForms(memory: RunMemory): SpellForm[] {
  return [...new Set(memory.recentDominantForms)];
}
