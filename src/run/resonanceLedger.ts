import type { RewardKind, RewardOption } from './runContract';
import { ELEMENT_LABELS, ELEMENT_PALETTES, paletteColorToCss } from '../render/palette';
import { UI_COLOR, UI_SEMANTIC } from '../ui/uiTokens';

/**
 * ESC의 「획득한 공명」은 HUD용 보상 요약과 의도가 다르다.
 *
 * - HUD는 전투 중 빠르게 읽히도록 같은 패시브를 묶는다.
 * - 이 목록은 플레이어가 이번 런에서 무엇을 골랐는지 다시 찾는 장부라서,
 *   같은 보상도 합치지 않고 획득 순서를 보존한다.
 */
export interface ResonanceLedgerEntry {
  readonly rewardId: string;
  readonly kind: RewardKind;
  readonly title: string;
  readonly description: string;
  readonly category: string;
  readonly glyph: string;
  readonly accent: string;
}

const CATEGORY: Record<RewardKind, string> = {
  'max-hp': '생명 공명',
  'max-mana': '마력 공명',
  affinity: '원소 친화',
  'swift-incant': '영창 보조',
  'mana-surge': '마력 보조',
  'ward-start': '수호 보조',
  'spirit-haste': '정령 보조',
  'spirit-recovery': '정령 보조',
  'spirit-guard': '정령 보조',
  engrave: '주문 각인',
  spirit: '정령 계약',
  evolve: '진화 공명',
  awaken: '각성 공명',
  'altar-leave': '선택하지 않음',
  'legacy-skip': '선택하지 않음',
  'all-affinity': '제단 공명',
  'altar-high': '제단 선택',
  echo: '고위 제단',
  starburst: '고위 제단',
  meteor: '고위 제단',
  trail: '고위 제단',
  'chorus-awaken': '합주 각성',
  ripple: '고위 제단',
};

const GLYPH: Partial<Record<RewardKind, string>> = {
  'max-hp': '✚',
  'max-mana': '✦',
  affinity: '◈',
  'swift-incant': '⌁',
  'mana-surge': '≈',
  'ward-start': '◇',
  'spirit-haste': '➶',
  'spirit-recovery': '✙',
  'spirit-guard': '◉',
  engrave: '✒',
  spirit: '☽',
  evolve: '✧',
  awaken: '☼',
  'all-affinity': '✺',
  echo: '◌',
  starburst: '✹',
  meteor: '☄',
  trail: '∿',
  'chorus-awaken': '✺',
  ripple: '⌇',
};

/** 선택하지 않은 카드와 제단의 중간 단계는 플레이어가 "획득한 효과"가 아니다. */
export function isLedgerReward(option: RewardOption): boolean {
  return option.kind !== 'altar-leave'
    && option.kind !== 'legacy-skip'
    && option.kind !== 'altar-high';
}

function fallbackAccent(kind: RewardKind): string {
  switch (kind) {
    case 'max-hp': return UI_SEMANTIC.hp;
    case 'max-mana': return UI_SEMANTIC.mana;
    case 'mana-surge': return UI_SEMANTIC.mana;
    case 'ward-start':
    case 'spirit-guard': return UI_SEMANTIC.shield;
    case 'spirit-recovery': return UI_SEMANTIC.ok;
    case 'swift-incant':
    case 'spirit-haste': return UI_COLOR.warm;
    case 'chorus-awaken': return '#b68cff';
    default: return UI_COLOR.accent;
  }
}

/** 보상 원본 배열의 순서를 그대로 둔다. 동일한 id/종류라도 절대 합치지 않는다. */
export function buildResonanceLedger(rewards: readonly RewardOption[]): ResonanceLedgerEntry[] {
  return rewards.filter(isLedgerReward).map((reward) => ({
    rewardId: reward.id,
    kind: reward.kind,
    title: reward.title,
    description: reward.description,
    category: reward.element
      ? `${ELEMENT_LABELS[reward.element]} · ${CATEGORY[reward.kind]}`
      : CATEGORY[reward.kind],
    glyph: GLYPH[reward.kind] ?? '✦',
    accent: reward.element
      ? paletteColorToCss(ELEMENT_PALETTES[reward.element].core)
      : fallbackAccent(reward.kind),
  }));
}
