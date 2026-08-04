import type { BossCounterStrategy } from '../spell/bossMemoryContract';
import type { BossResistanceReadout } from '../render/bossResistanceReadout';
import { ELEMENT_LABELS } from '../render/palette';

export interface BossCombatInfoInput {
  counterStrategy: BossCounterStrategy | null;
  resistance: BossResistanceReadout;
}

/** #345 보스 곁 패널은 저항·관통·패턴만 맡는다. HP·페이즈는 상단 보스바의 책임이다. */
export function bossCombatInfoLines(input: BossCombatInfoInput): string[] {
  const lines: string[] = [];

  if (input.resistance.resisted.length > 0) {
    lines.push(`저항  ${input.resistance.resisted
      .map(({ element, reductionPercent }) => `${ELEMENT_LABELS[element]} −${reductionPercent}%`)
      .join('  ')}`);
  }
  if (input.resistance.pierced.length > 0) {
    lines.push(`관통  ${input.resistance.pierced.map((element) => ELEMENT_LABELS[element]).join('  ')}`);
  }

  const pattern = input.counterStrategy === 'rush'
    ? '돌진 강화'
    : input.counterStrategy === 'ranged'
      ? '탄막 강화'
      : '기본 전술';
  lines.push(`패턴  ${pattern}`);
  return lines;
}
