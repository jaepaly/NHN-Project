import type { SpellElement } from '../spell/types';
import { ELEMENT_LABELS } from './palette';

/**
 * 보스 내성 표시 (순수) — 우상단 HUD의 보스 줄을 만든다.
 *
 * **왜 고쳤나 ①: 마스터리 관통을 표시가 부정하고 있었다.**
 * 친화가 이정표(0.9)에 닿은 원소는 보스 내성을 **완전히 무시**한다(#171 — "네가 불에
 * 저항해? 내가 곧 불이다"). 그런데 HUD는 activeBossResistances를 그대로 찍어서,
 * 관통이 걸린 플레이어에게도 `저항 화염 ×0.75`를 계속 보여줬다. 실제로는 온전한
 * 피해가 들어가는데 화면은 "네 주력이 안 통한다"고 말한 셈이다 — 가장 키운 원소를
 * 버리게 만드는 **잘못된 정보**다. 성장 보상을 화면이 취소하면 안 된다.
 *
 * **왜 고쳤나 ②: 한 줄에 두 사실이 섞였다.**
 * 종전 문자열은 `BOSS hp/max` + `\n저항 …` + `  ·  ENEMIES n` 순서라, 적 수가
 * **저항 목록 꼬리에 붙었다.** 저항이 길어 줄바꿈되면 ENEMIES가 어디로 갈지도 모른다.
 * 한 줄에 한 사실만 둔다.
 *
 * **왜 고쳤나 ③: 우측 정렬이라 줄 시작점이 들쭉날쭉했다.**
 * 중앙 정렬 지적(#252 배너)과 같은 문제의 거울상이다 — 오른쪽 끝은 맞지만 왼쪽이
 * 어긋나 눈이 매 줄 시작을 다시 찾는다. 블록은 우측에 고정하되 **안쪽은 왼쪽 정렬**.
 *
 * ×0.75 대신 −25%로 적는다 — 배수는 "높은 게 나쁜가 낮은 게 나쁜가"를 한 번 더
 * 생각하게 하지만, 감소율은 그대로 읽힌다.
 */

export interface BossResistanceReadoutEntry {
  element: SpellElement;
  /** 피해 배수 (0.75 = 75%만 들어감). 1이면 내성 없음 */
  multiplier: number;
  /** 이 원소의 현재 친화 — 이정표 이상이면 내성이 무시된다 */
  affinity: number;
}

export interface BossResistanceReadout {
  /** 실제로 걸리는 내성 (관통된 것은 빠진다) */
  resisted: Array<{ element: SpellElement; reductionPercent: number }>;
  /** 마스터리로 무시하는 내성 — 나쁜 소식이 아니라 **좋은 소식**이라 따로 센다 */
  pierced: SpellElement[];
}

/** 배수 → 감소율(%). 0.75 → 25. 반올림하되 0으로는 내리지 않는다(내성이 있으면 보인다). */
export function reductionPercent(multiplier: number): number {
  const safe = Number.isFinite(multiplier) ? Math.max(0, Math.min(1, multiplier)) : 1;
  return Math.max(1, Math.round((1 - safe) * 100));
}

/**
 * 내성 목록 → 표시 모델. 관통(친화 ≥ 임계)은 resisted에서 빼고 pierced로 옮긴다.
 * 정렬은 감소율이 큰 순 — 가장 아픈 것부터 읽힌다. 동률은 원소명으로 갈라 깜빡임 방지.
 */
export function bossResistanceReadout(
  entries: readonly BossResistanceReadoutEntry[],
  masteryThreshold: number,
): BossResistanceReadout {
  const resisted: BossResistanceReadout['resisted'] = [];
  const pierced: SpellElement[] = [];
  for (const entry of entries) {
    const multiplier = Number.isFinite(entry.multiplier) ? entry.multiplier : 1;
    if (multiplier >= 1) continue; // 내성이 아니다
    const affinity = Number.isFinite(entry.affinity) ? entry.affinity : 0;
    if (affinity >= masteryThreshold) {
      pierced.push(entry.element);
      continue;
    }
    resisted.push({ element: entry.element, reductionPercent: reductionPercent(multiplier) });
  }
  resisted.sort((a, b) => (b.reductionPercent - a.reductionPercent)
    || a.element.localeCompare(b.element));
  pierced.sort((a, b) => a.localeCompare(b));
  return { resisted, pierced };
}

/**
 * HUD 줄 배열 — 한 줄에 한 사실. 호출측이 `\n`으로 이어 붙인다.
 * 내성도 관통도 없으면 상태 줄 하나만 돌려준다(빈 줄을 남기지 않는다).
 */
export function bossResistanceLines(
  statusLine: string,
  readout: BossResistanceReadout,
): string[] {
  const lines = [statusLine];
  if (readout.resisted.length > 0) {
    lines.push(`저항  ${readout.resisted
      .map((entry) => `${ELEMENT_LABELS[entry.element]} −${entry.reductionPercent}%`)
      .join('  ')}`);
  }
  if (readout.pierced.length > 0) {
    lines.push(`관통  ${readout.pierced
      .map((element) => ELEMENT_LABELS[element])
      .join('  ')} — 이미 나의 것`);
  }
  return lines;
}
