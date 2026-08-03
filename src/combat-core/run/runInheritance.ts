import { ELEMENTS, type SpellElement } from '../../spell/types';
import { chorusStage } from './elementalChorus';

/**
 * 런 계승 (총괄 결정 2026-07-31) — 이어가기에서 **무엇을 들고 가는가**.
 *
 * ## 왜 바꿨나
 *
 * 종전 `continueRun()`은 친화·각인·정령·최대 체력·제단 능력을 **전부** 유지했다.
 * 그래서 2회차부터는 성장이 아니라 **누적**이었다.
 *
 * 맵이 2스테이지 구조가 되면서 한 런 안에서도 성장이 체감된다. 총괄 판단:
 * *"지금처럼 해당 런에서 얻은 자산을 그대로 가지고서 다음 런으로 넘어갈 필요가 없지
 * 않나? 물론 완전히 초기화하면 박탈감이 느껴질 테니 약간의 성장 결과물을 계승."*
 *
 * ## 왜 친화도 하나만인가
 *
 * 총괄: *"각인이나 정령을 그대로 가져가면 다음 런에 해당 보상을 선택하지 못하니까
 * 자유도가 떨어진다."* 맞다 — 각인·정령은 **슬롯을 차지**해 다음 런의 선택지를 막는다.
 * 친화도는 **방향만 주고 자리를 안 먹는다.** 그래서 계승 대상으로 구조가 맞다.
 *
 * ## 왜 절반이고 왜 상한이 0.6인가
 *
 * 런 끝에 주력 원소는 대개 **0.45(사용 상한) + 친화 카드 3장(0.45) = 0.9** 근처다.
 * 그대로 계승하면 다음 런을 **마스터리 관통(0.9)** 상태로 시작한다. 그러면 둘을 잃는다:
 *
 *  - **보스 저항 퍼즐** — "내 주력이 안 통한다"가 첫 방부터 사라진다
 *  - **관통의 순간** — #171에서 설계한 "네가 불에 저항해? 내가 곧 불이다"가 켜진 채 시작
 *
 * 절반(0.5배) + 상한 0.6이면 0.9를 가져와도 0.45가 되고, 어떤 경우에도 관통 문턱
 * 아래다. 0.45는 "사용만으로 쌓을 수 있는 최대"라 정체성은 확실히 남고, 카드 3장이면
 * 다시 0.9에 닿으니 **관통을 다시 벌어야** 한다.
 */

export const RUN_INHERITANCE = {
  /** 계승 비율 — 고른 원소의 친화를 이만큼만 들고 간다 */
  affinityRatio: 0.5,
  /**
   * 계승 상한.
   * ⚠️ **마스터리 관통(0.9)보다 반드시 낮아야 한다.** 넘으면 다음 런이 보스 저항
   * 퍼즐 없이 시작한다.
   */
  affinityCap: 0.6,
} as const;

/** 이어가기에서 들고 갈 친화도 — 고른 원소 하나만, 절반, 상한 적용 (순수) */
export function inheritedAffinity(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const halved = value * RUN_INHERITANCE.affinityRatio;
  return Math.min(RUN_INHERITANCE.affinityCap, Math.round(halved * 100) / 100);
}

/**
 * The strongest affinity survives automatically, but its destination mutates
 * to another element. The seed makes ties and the destination reproducible
 * without letting the player perpetuate the same one-element build.
 */
export function mutateInheritedAffinity(
  affinity: Readonly<Partial<Record<SpellElement, number>>>,
  seed: number,
): { source: SpellElement; element: SpellElement; value: number; echoes: readonly { element: SpellElement; value: number }[] } | null {
  const entries = (Object.entries(affinity) as [SpellElement, number][])
    .filter(([, value]) => Number.isFinite(value) && value > 0);
  if (entries.length === 0) return null;
  const highest = Math.max(...entries.map(([, value]) => value));
  const tied = entries.filter(([, value]) => value === highest).map(([element]) => element);
  const next = (Math.abs(Math.floor(seed)) >>> 0) || 1;
  const source = tied[next % tied.length];
  const targets = ELEMENTS.filter((element) => element !== source);
  const element = targets[(next >>> 8) % targets.length];
  const stage = chorusStage(affinity);
  const echoCount = stage === 0 ? 0 : stage;
  const echoes = targets
    .filter((target) => target !== element)
    .slice(0, echoCount)
    .map((target) => ({ element: target, value: Math.round(inheritedAffinity(highest) * 0.4 * 100) / 100 }));
  return { source, element, value: inheritedAffinity(highest), echoes };
}

/**
 * 계승 후보 — 친화가 있는 원소를 높은 순으로.
 *
 * 0인 원소는 빼야 한다. 여덟 개를 다 보여주면 "무엇을 키웠는지"가 안 읽히고,
 * 아무거나 골라도 0을 계승해 선택이 무의미해진다.
 */
export function inheritCandidates(
  affinity: Readonly<Partial<Record<SpellElement, number>>>,
): { element: SpellElement; value: number; inherited: number }[] {
  return (Object.entries(affinity) as [SpellElement, number][])
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .map(([element, value]) => ({ element, value, inherited: inheritedAffinity(value) }))
    .sort((a, b) => b.value - a.value);
}
