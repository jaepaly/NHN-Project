export interface BossHealthBarInput {
  label: string;
  hp: number;
  maxHp: number;
  phase: 1 | 2 | 3;
  resistances?: readonly import('./bossCombatInfoModel').BossResistanceBadge[];
}

export interface BossHealthBarReadout {
  title: string;
  hpLabel: string;
  ratio: number;
}

/** 화면 상단 보스바용 순수 모델 — 보스 곁 정보판과 HP를 중복하지 않는다. */
export function bossHealthBarReadout(input: BossHealthBarInput): BossHealthBarReadout {
  const hp = Math.max(0, Math.ceil(Number.isFinite(input.hp) ? input.hp : 0));
  const maxHp = Math.max(1, Math.ceil(Number.isFinite(input.maxHp) ? input.maxHp : 1));
  return {
    title: `${input.label}  ·  PHASE ${input.phase}`,
    hpLabel: `${hp}/${maxHp}`,
    ratio: Math.max(0, Math.min(1, hp / maxHp)),
  };
}
