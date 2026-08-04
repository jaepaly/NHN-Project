import type { BossCounterStrategy } from '../spell/bossMemoryContract';
import type { BossResistanceReadout } from '../render/bossResistanceReadout';
import { ELEMENT_LABELS } from '../render/palette';

export interface BossCombatInfoInput {
  label: string;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  counterStrategy: BossCounterStrategy | null;
  resistance: BossResistanceReadout;
}

/** #345 보스 곁 패널의 표시 문구. 전투 로직과 분리해 순수 회귀로 고정한다. */
export function bossCombatInfoLines(input: BossCombatInfoInput): string[] {
  const hp = Math.max(0, Math.ceil(Number.isFinite(input.hp) ? input.hp : 0));
  const maxHp = Math.max(1, Math.ceil(Number.isFinite(input.maxHp) ? input.maxHp : 1));
  const lines = [`${input.label}  ${hp}/${maxHp}  ·  PHASE ${input.phase}`];

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
