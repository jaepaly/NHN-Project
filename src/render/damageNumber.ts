/**
 * 피해 숫자 — 맞은 적 근처에 뜬다 (총괄 발안).
 *
 * **왜 절대값이 아니라 비율인가** (총괄 지적):
 * 친화·이어가기 루프로 피해량은 런을 거듭할수록 무한히 커진다. 글자 크기를 절대
 * 피해량에 비례시키면 금세 상한에 붙어버려 그 뒤로는 아무 정보도 안 준다.
 * **적 최대 체력 대비 비율**로 재면 성장해도 척도가 살아 있고, 오히려
 * "보스를 한 방에 몇 % 깎았나"가 곧 성장 체감이 된다.
 *
 * 다만 잡몹은 대부분 한 방에 죽어 항상 100%가 되므로, **fullRatio(50%)에서 최대**에
 * 닿게 해 잡몹 일격과 보스 대타격이 같은 무게로 읽히게 한다.
 *
 * 이 게임에서 피해 숫자는 타격감이 아니라 **플레이어 문장에 대한 채점표**다 —
 * "구체적으로 쓰면 세진다"를 배우는 유일한 경로이므로 수동 영창에만 붙인다
 * (호출측이 source로 거른다).
 */

export const DAMAGE_NUMBER = {
  /** 이 비율에서 글자가 최대 크기 — 잡몹 일격(100%)과 보스 대타격이 같은 무게가 된다 */
  fullRatio: 0.5,
  minFontPx: 13,
  maxFontPx: 34,
  /** 이 비율 이상이면 강조(색·튀어오름) */
  emphasisRatio: 0.25,
  /** 같은 적에게 이 시간 안에 또 맞으면 새 숫자를 띄우지 않고 **누적**한다 */
  mergeWindowMs: 260,
  riseDistance: 34,
  durationMs: 620,
} as const;

export interface DamageEmphasis {
  /** 적 최대 체력 대비 피해 비율 (0~1로 클램프) */
  ratio: number;
  fontPx: number;
  /** 강조 등급 — 0=평범, 1=묵직, 2=치명적 */
  tier: 0 | 1 | 2;
}

/**
 * 피해 → 강조 정도 (순수). maxHp를 모르면(0·NaN) 비율을 0으로 보고 최소 크기를 준다 —
 * 숫자가 아예 안 뜨는 것보다 작게라도 뜨는 게 낫다.
 */
export function damageEmphasis(damage: number, enemyMaxHp: number): DamageEmphasis {
  const dmg = Number.isFinite(damage) ? Math.max(0, damage) : 0;
  const maxHp = Number.isFinite(enemyMaxHp) && enemyMaxHp > 0 ? enemyMaxHp : 0;
  const ratio = maxHp > 0 ? Math.min(1, dmg / maxHp) : 0;
  const t = Math.min(1, ratio / DAMAGE_NUMBER.fullRatio);
  const fontPx = Math.round(
    DAMAGE_NUMBER.minFontPx + (DAMAGE_NUMBER.maxFontPx - DAMAGE_NUMBER.minFontPx) * t,
  );
  const tier: 0 | 1 | 2 = ratio >= DAMAGE_NUMBER.fullRatio
    ? 2
    : ratio >= DAMAGE_NUMBER.emphasisRatio ? 1 : 0;
  return { ratio, fontPx, tier };
}

/** 등급별 글자색 — 저항이 걸린 타격은 등급과 무관하게 붉게 내린다. */
export function damageColor(tier: 0 | 1 | 2, resisted: boolean): string {
  if (resisted) return '#ff8fa3';
  return tier === 2 ? '#ffe08a' : tier === 1 ? '#ffd166' : '#eef1ff';
}

/** 화면에 뜨는 문자열 — 저항이면 아래 화살표를 붙여 "덜 들어갔다"를 표시한다. */
export function damageLabel(total: number, resisted: boolean): string {
  return `${Math.max(1, Math.round(total))}${resisted ? ' ↓' : ''}`;
}
