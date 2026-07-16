import type { SpellElement, SpellForm } from './types';
import type { BossMemoryProfile } from './spellHistory';

/**
 * 기억하는 보스 — 내성 프로필 (Phase 3 R2, 트랙 2 ①).
 *
 * 이번 런의 주문 히스토리 요약(`BossMemoryProfile`)을 받아, 보스가 어떤 원소에 저항하고
 * 어떤 전략으로 카운터할지를 계산하는 **순수 함수**. 실제 전투 적용(피해 감소·패턴 전환)은
 * 총괄의 보스 코어가 이 계약을 소비한다. (이 파일이 R2↔총괄·R3 계약)
 *
 * 단기(이번 런) 기준. 런 간 장기 기억은 후속(②)에서 얹는다.
 * ※ 장기 기억 누적 시 "모든 원소 내성" 밸런스 함정 → ②에서 최다 1개·최근성 가중·부분 내성으로 완화.
 */

/** 보스 카운터 전략 — 플레이어 최다 폼에 대응 (GDD §4.1) */
export type BossCounterStrategy = 'rush' | 'ranged';

export interface BossResistanceProfile {
  /** 저항할 원소 (플레이어 최다 사용). 데이터 부족 시 null */
  resistedElement: SpellElement | null;
  /** 저항 시 피해 배수. resistedElement 있으면 0.3, 없으면 1(무저항) */
  resistMultiplier: number;
  /** 플레이어 최다 폼 대응 전략. 원거리 폼 위주 → 'rush', 근거리 위주 → 'ranged' */
  counterStrategy: BossCounterStrategy | null;
}

export const RESISTANCE = {
  /** 저항 원소 피해 배수 */
  multiplier: 0.3,
  /** 내성이 형성되려면 최소 이만큼 기록돼야 함 (1~2회로는 성급하지 않게) */
  minCasts: 3,
} as const;

/** 원거리 성향 폼 — 이걸 주로 쓰면 보스는 거리를 좁히려 돌진(rush)한다 */
const RANGED_FORMS: ReadonlySet<SpellForm> = new Set<SpellForm>([
  'bolt', 'beam', 'rain', 'chain',
]);

/**
 * 이번 런 요약으로 보스 내성 프로필을 계산한다.
 * @param memory `SpellHistory.bossMemory()` 결과 (최다 원소·폼·최근 주문명·총 시전 수)
 */
export function computeResistance(memory: BossMemoryProfile): BossResistanceProfile {
  const enough = memory.totalCasts >= RESISTANCE.minCasts;

  const resistedElement = enough ? memory.dominantElement : null;

  const counterStrategy: BossCounterStrategy | null =
    enough && memory.dominantForm
      ? (RANGED_FORMS.has(memory.dominantForm) ? 'rush' : 'ranged')
      : null;

  return {
    resistedElement,
    resistMultiplier: resistedElement ? RESISTANCE.multiplier : 1,
    counterStrategy,
  };
}
