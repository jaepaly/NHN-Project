/**
 * 영창 대역 (속삭임 · 영창 · 외침) — 순수 모델.
 *
 * **왜 필요한가** (총괄 지적: "영창 화면의 위계가 정돈되지 않았다"):
 * 영창 창은 이 게임에서 가장 중요한 결정이 일어나는 곳이다 — *얼마나 큰 말을 쓸 것인가*.
 * 그런데 그 결정에 필요한 정보가 전부 12px 회색 한 줄에 뭉쳐 있었다:
 *
 *   `속삭임 ~10 · 영창 ~25 · 외침 40+ — Enter 발동 · Esc 취소`
 *
 * **비용 등급표**(무엇을 고를지)와 **조작 안내**(어떻게 제출할지)는 완전히 다른 층위인데
 * 같은 크기·같은 색으로 붙어 있어 둘 다 안 읽혔다. 게다가 지금 내가 **어느 대역에
 * 있는지·무엇을 감당할 수 있는지**는 어디에도 안 떴다.
 *
 * ⚠️ **길이로 위력을 추정하지 않는다.** 기존 공명 게이지는 `글자수/24`로 차올랐는데,
 * 실제 위력은 심판(LLM)이 문장의 **구체성**으로 매긴다. 가장 크고 밝게 빛나던 요소가
 * 엉뚱한 변수를 재면서 "길게 쓰면 세진다"를 가르치고 있었다 — 이 게임의 명제
 * ("구체적으로 쓰면 세진다", damageNumber 참고)와 정반대다. 그래서 길이 기반 추정을
 * 걷어내고, **거짓말하지 않는 정보**(내 마나로 어느 대역을 감당할 수 있는가)만 남긴다.
 */

/** 위력 → 마나 비용. sequencePlan·mockJudge와 같은 식 (여기가 표시용 단일 출처). */
export function spellManaCost(power: number): number {
  const safe = Number.isFinite(power) ? Math.max(0, power) : 0;
  return Math.max(5, Math.round(safe * 0.6));
}

export type IncantBandKey = 'whisper' | 'chant' | 'shout';

export interface IncantBand {
  key: IncantBandKey;
  label: string;
  /** 이 대역의 대표 위력 — 비용은 여기서 유도한다(수치가 따로 놀지 않게) */
  power: number;
  /** 대역을 고를 때 실제로 쓰는 말투 — 라벨만으로는 "그래서 어떻게 쓰라고"가 안 온다 */
  hint: string;
}

/**
 * 세 대역. 비용은 spellManaCost로 유도되어 10 / 25 / 40이 된다 —
 * 기존 힌트 문자열의 `~10 · ~25 · 40+`와 같은 값이고, 이제 공식이 바뀌면 함께 움직인다.
 */
export const INCANT_BANDS: readonly IncantBand[] = [
  { key: 'whisper', label: '속삭임', power: 17, hint: '짧고 가볍게' },
  { key: 'chant', label: '영창', power: 42, hint: '한 장면을 그리듯' },
  { key: 'shout', label: '외침', power: 67, hint: '크고 구체적으로' },
];

export interface BandAffordance {
  band: IncantBand;
  cost: number;
  affordable: boolean;
}

/**
 * 지금 마나로 각 대역을 감당할 수 있는가.
 *
 * 이게 화면에 띄울 수 있는 **유일하게 정직한 실시간 정보**다: 위력은 심판이 정하므로
 * 제출 전에는 알 수 없지만, 내 마나와 각 대역의 가격표는 지금 확실히 안다.
 */
export function bandAffordances(mana: number): BandAffordance[] {
  const safe = Number.isFinite(mana) ? Math.max(0, mana) : 0;
  return INCANT_BANDS.map((band) => {
    const cost = spellManaCost(band.power);
    return { band, cost, affordable: safe >= cost };
  });
}

/**
 * 지금 마나로 닿는 **가장 큰** 대역 (하나도 못 쓰면 null).
 * 헤딩의 마나 수치를 이걸로 물들여 "지금 내가 뭘 할 수 있는지"를 한눈에 준다.
 */
export function reachableBand(mana: number): IncantBand | null {
  const affordable = bandAffordances(mana).filter((entry) => entry.affordable);
  return affordable.length > 0 ? affordable[affordable.length - 1].band : null;
}

/** 심판 결과 비용 → 실제로 어느 대역이었나. 대역이 사후에도 같은 잣대로 읽히게 한다. */
export function bandForCost(cost: number): IncantBand {
  const safe = Number.isFinite(cost) ? Math.max(0, cost) : 0;
  let matched = INCANT_BANDS[0];
  for (const band of INCANT_BANDS) {
    if (safe >= spellManaCost(band.power)) matched = band;
  }
  return matched;
}
