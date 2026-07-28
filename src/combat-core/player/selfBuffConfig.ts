import type { SpellElement } from '../../spell/types';

/**
 * 자기 강화(buff 효과) 해석 — "말이 곧 마법"의 자기 대상 표현을 넓힌다.
 *
 * 기존 buff 효과는 마나 회복 스텁이라 "이동속도 빠르게"·"무적"·"돌진" 같은 표현이
 * 전부 죽었다. 여기서 buff 스펙(원소·주문명·위력)을 **실제 자기 강화**로 매핑한다.
 * 순수 함수 — 게임 상태 없이 결정되므로 회귀로 고정한다.
 */

export type SelfBuffKind = 'haste' | 'empower' | 'ward';

/** 지속 버프: 배율을 duration초 동안 적용 */
export interface TimedBuffOutcome {
  kind: 'buff';
  buff: SelfBuffKind;
  /** haste=이동배율, empower=주는피해배율(≥1), ward=받는피해배율(≤1, 0=무적) */
  multiplier: number;
  seconds: number;
  label: string;
  color: number;
}

/** 돌진: 즉시 변위 (지속 버프가 아니라 한 방 이동) */
export interface DashOutcome {
  kind: 'dash';
  distance: number;
  label: string;
}

export type SelfBuffOutcome = TimedBuffOutcome | DashOutcome;

export const SELF_BUFF_CONFIG = {
  haste: { perPower: 0.009, min: 1.15, max: 2.0, baseSeconds: 3, secPerPower: 0.05, color: 0x63e6be },
  empower: { perPower: 0.007, min: 1.12, max: 1.8, baseSeconds: 3, secPerPower: 0.045, color: 0xffa62b },
  // ward: 받는 피해 배율 = 1 - power/100 (위력100 → 0 = 무적). 강력하므로 지속은 짧게.
  ward: { reducePerPower: 0.01, floor: 0, baseSeconds: 2, secPerPower: 0.03, color: 0x8fa4ff },
  dash: { baseDistance: 130, perPower: 2.2, iframeSeconds: 0.35 },
} as const;

const DASH_RE = /돌진|대시|짓쳐|들이받|박치기|쇄도|dash|charge|rush|lunge/i;
const WARD_RE = /무적|불멸|무결|철벽|가호|방어막|갑옷|불사|invincible|immortal|impervious|guard|ward/i;
const HASTE_RE = /빠르|신속|가속|질주|재빠|속도|경신|haste|swift|speed|hast/i;
const EMPOWER_RE = /강화|위력|힘을|증폭|파워|맹렬|격노|empower|strengthen|power|might|enrage/i;

/** 원소별 기본 버프 종류 (주문명에 단서가 없을 때) */
const ELEMENT_DEFAULT: Record<SpellElement, SelfBuffKind> = {
  wind: 'haste',
  lightning: 'haste',
  fire: 'empower',
  dark: 'empower',
  earth: 'ward',
  water: 'ward',
  ice: 'ward',
  light: 'ward',
};

const LABELS: Record<SelfBuffKind, string> = {
  haste: '가속',
  empower: '맹렬',
  ward: '철벽',
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** 상태창 표시 문자열 — "가속 +54% 3.2s" / "무적 1.5s" / "철벽 −50% 2.0s" */
export function formatSelfBuffStatus(
  kind: SelfBuffKind,
  multiplier: number,
  remaining: number,
): string {
  const t = Math.max(0, remaining).toFixed(1);
  if (kind === 'ward') {
    return multiplier <= 0
      ? `무적 ${t}s`
      : `${LABELS.ward} −${Math.round((1 - multiplier) * 100)}% ${t}s`;
  }
  return `${LABELS[kind]} +${Math.round((multiplier - 1) * 100)}% ${t}s`;
}

/** 버프 종류별 표시 색 (상태창 색상용) */
export function selfBuffColor(kind: SelfBuffKind): number {
  return SELF_BUFF_CONFIG[kind].color;
}

/**
 * buff 스펙 → 실제 자기 강화. 주문명 키워드가 원소 기본값보다 우선한다
 * (유저가 "돌진"이라 말하면 원소와 무관하게 돌진).
 */
export function resolveSelfBuff(
  element: SpellElement,
  name: string,
  power: number,
): SelfBuffOutcome {
  const p = clamp(Number.isFinite(power) ? power : 0, 0, 100);
  const n = name ?? '';

  if (DASH_RE.test(n)) {
    return {
      kind: 'dash',
      distance: SELF_BUFF_CONFIG.dash.baseDistance + p * SELF_BUFF_CONFIG.dash.perPower,
      label: '돌진',
    };
  }

  let buff: SelfBuffKind;
  if (WARD_RE.test(n)) buff = 'ward';
  else if (HASTE_RE.test(n)) buff = 'haste';
  else if (EMPOWER_RE.test(n)) buff = 'empower';
  else buff = ELEMENT_DEFAULT[element] ?? 'haste';

  const c = SELF_BUFF_CONFIG[buff];
  if (buff === 'ward') {
    const w = SELF_BUFF_CONFIG.ward;
    const multiplier = clamp(1 - p * w.reducePerPower, w.floor, 1);
    return {
      kind: 'buff',
      buff,
      multiplier,
      seconds: w.baseSeconds + p * w.secPerPower,
      label: multiplier <= 0 ? '무적' : LABELS.ward,
      color: w.color,
    };
  }
  const cfg = c as typeof SELF_BUFF_CONFIG.haste;
  return {
    kind: 'buff',
    buff,
    multiplier: clamp(1 + p * cfg.perPower, cfg.min, cfg.max),
    seconds: cfg.baseSeconds + p * cfg.secPerPower,
    label: LABELS[buff],
    color: cfg.color,
  };
}
