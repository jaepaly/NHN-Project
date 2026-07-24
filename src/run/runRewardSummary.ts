import type { RewardOption, RewardKind } from './runContract';
import { ELEMENT_LABELS } from '../render/palette';

/**
 * 이번 런 보상 집계 (게임성 분석 ②: 내가 뭘 골랐는지 보인다).
 *
 * 문제: 스탯·패시브 보상(친화·신속영창·마나격류·수호기점·신속정령)은 적용되고
 * 사라진다 — 각인·정령과 달리 아무 곳에도 안 남아, 4번째 카드를 고를 때 앞서 뭘
 * 골랐는지 기억에 의존하는 장님 선택이 된다. 그 누적을 한 줄로 되돌려준다.
 *
 * 각인·정령·진화는 HUD에 전용 줄이 이미 있으므로 여기선 제외한다 (중복 방지).
 */

/** 한 줄 요약에 넣을 패시브 보상 종류 — 다른 곳에 표시되지 않는 것만 */
const PASSIVE_KINDS: readonly RewardKind[] = [
  'affinity', 'swift-incant', 'mana-surge', 'ward-start', 'spirit-haste', 'max-hp', 'max-mana',
];

const PASSIVE_LABELS: Partial<Record<RewardKind, string>> = {
  'swift-incant': '신속영창',
  'mana-surge': '마나격류',
  'ward-start': '수호기점',
  'spirit-haste': '신속정령',
  'max-hp': '생명',
  'max-mana': '마나',
};

/** 보상 하나의 집계 키 — 친화는 원소별로 나눈다 (화염친화 ≠ 빙결친화) */
function summaryKey(option: RewardOption): string {
  if (option.kind === 'affinity') return `affinity:${option.element ?? '?'}`;
  return option.kind;
}

function keyLabel(key: string): string {
  if (key.startsWith('affinity:')) {
    const element = key.slice('affinity:'.length) as keyof typeof ELEMENT_LABELS;
    return `${ELEMENT_LABELS[element] ?? '원소'}친화`;
  }
  return PASSIVE_LABELS[key as RewardKind] ?? key;
}

/** 같은 종류/원소를 ×N으로 묶은 카운트 맵 (등장 순서 보존) */
export function rewardCounts(rewards: readonly RewardOption[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const reward of rewards) {
    if (!PASSIVE_KINDS.includes(reward.kind)) continue;
    const key = summaryKey(reward);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * HUD 한 줄 요약 — `강화 · 화염친화×2 · 신속영창 · 마나격류`.
 * 패시브 보상이 하나도 없으면 빈 문자열 (첫 방에서 빈 줄로 혼란 주지 않기).
 */
export function summarizeRunRewards(rewards: readonly RewardOption[]): string {
  const counts = rewardCounts(rewards);
  if (counts.size === 0) return '';
  const parts = [...counts.entries()].map(([key, n]) => (
    n > 1 ? `${keyLabel(key)}×${n}` : keyLabel(key)
  ));
  return `강화 · ${parts.join(' · ')}`;
}

/**
 * 카드에 붙일 "이미 보유" 라벨 — 스택형 보상만. 반복 획득이 의미 있는 종류
 * (친화 누적·신속영창·마나격류·신속정령)에서 현재 보유 수를 알려준다.
 * 스택 무의미(max-hp/mana·수호기점)나 미보유는 null.
 */
export function ownedLabelFor(
  option: RewardOption,
  rewards: readonly RewardOption[],
): string | null {
  const STACKABLE: readonly RewardKind[] = ['affinity', 'swift-incant', 'mana-surge', 'spirit-haste'];
  if (!STACKABLE.includes(option.kind)) return null;
  const owned = rewardCounts(rewards).get(summaryKey(option)) ?? 0;
  return owned > 0 ? `보유 ×${owned}` : null;
}
