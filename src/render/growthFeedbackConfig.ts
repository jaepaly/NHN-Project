import type { RewardOption } from '../run/runContract';
import type { SpellElement } from '../spell/types';
import { AWAKENING_LABELS } from '../combat-core/run/awakening';
import { ALTAR_OFFER_CONFIG } from '../combat-core/run/altarOffer';
import { RUN_REWARD_CONFIG } from '../combat-core/run/rewardConfig';
import { ELEMENT_LABELS, ELEMENT_PALETTES } from './palette';

/**
 * 강화 체감 연출의 순수 규칙 (성장 시스템 ⑤ — PROGRESSION_DESIGN §4).
 * Phaser 없이 계산되는 부분만 모아 회귀로 고정한다. 실제 연출은 growthFeedback.ts.
 *
 * 원칙: 보상을 고른 순간 **무엇이 얼마나 늘었는지 숫자로** 보이고,
 *       런이 진행될수록 플레이어 발밑에 성장이 **누적되어 보인다**.
 */

/** 부상 텍스트 1줄 + 색 */
export interface GainLabel {
  text: string;
  color: number;
}

const DEFAULT_COLOR = 0x8fa4ff;
const KIND_COLORS: Partial<Record<RewardOption['kind'], number>> = {
  'max-hp': 0x72f1a8,
  'max-mana': 0x91b7ff,
  'swift-incant': 0xffd166,
  'mana-surge': 0x91b7ff,
  'ward-start': 0x72d8ff,
  'spirit-haste': 0x8fa4ff,
  engrave: 0xffd166,
  spirit: 0x8fa4ff,
  evolve: 0xffd166,
  // 각성은 진화(금)와 구분되는 자주 — "성질이 바뀌었다"를 색으로 알린다
  awaken: 0xd0a8ff,
  // 제단 전용 (#214) — 대가를 치른 보상이라 각성과 같은 자주 계열로 묶는다
  'altar-leave': 0x7f8aba,
  'all-affinity': 0x8fe3c8,
  'altar-high': 0xd0a8ff,
  echo: 0xd0a8ff,
  starburst: 0xb18cff,
  meteor: 0xffd166,
  trail: 0x63e6be,
};

/** 보상 → 증가분을 숫자로 드러내는 부상 텍스트. 수치는 RUN_REWARD_CONFIG 단일 출처. */
export function gainLabelFor(option: RewardOption): GainLabel {
  const color = colorFor(option);
  switch (option.kind) {
    case 'max-hp':
      return { text: `+${RUN_REWARD_CONFIG.maxHpIncrease} MAX HP`, color };
    case 'max-mana':
      return { text: `+${RUN_REWARD_CONFIG.maxManaIncrease} MAX MANA`, color };
    case 'affinity': {
      const percent = Math.round(RUN_REWARD_CONFIG.affinityBonus * 100);
      const label = option.element ? ELEMENT_LABELS[option.element] : '원소';
      return { text: `${label} 위력 +${percent}%`, color };
    }
    case 'swift-incant':
      return { text: `영창 딜레이 -${RUN_REWARD_CONFIG.swiftIncantLockReduction}s`, color };
    case 'mana-surge':
      return {
        text: `마나 획득 +${Math.round(RUN_REWARD_CONFIG.manaSurgeGainBonus * 100)}% · 흡수 범위 증가`,
        color,
      };
    case 'ward-start':
      return { text: `방 개막 보호막 +${RUN_REWARD_CONFIG.wardStartShield}`, color };
    case 'spirit-haste':
      return {
        text: `정령 시전 주기 -${Math.round((1 - RUN_REWARD_CONFIG.spiritHasteScale) * 100)}%`,
        color,
      };
    case 'engrave':
      return { text: `각인 Lv${option.engrave?.level ?? 1}`, color };
    case 'spirit':
      return { text: `정령 Lv${option.spirit?.level ?? 1}`, color };
    case 'evolve':
      return {
        text: option.evolve?.target === 'spirit-fuse' ? '정령 융합' : '각인 진화',
        color,
      };
    case 'awaken':
      // 일반 각성 카드는 갈래(`awaken`)를 싣지만, 제단 각성 카드는 대상 원소만 싣고
      // 갈래는 선택 뒤 무작위로 정한다. 제단 카드를 일반 카드처럼 단정해 읽으면
      // 보상 연출에서 예외가 나고 컨트롤러의 방 전환 예약까지 중단된다.
      return {
        text: option.awaken
          ? `각성 · ${AWAKENING_LABELS[option.awaken.awakening]}`
          : `${option.element ? ELEMENT_LABELS[option.element] : '원소'} 각성`,
        color,
      };
    // ── 제단 거래 (#214) ────────────────────────────────────────────────
    case 'all-affinity': {
      const percent = Math.round(ALTAR_OFFER_CONFIG.allAffinityBonus * 100);
      return { text: `모든 원소 위력 +${percent}%`, color };
    }
    case 'echo':
      return {
        text: `영창 에코 · 위력 ${Math.round(ALTAR_OFFER_CONFIG.echo.powerScale * 100)}%`,
        color,
      };
    case 'altar-high':
      return { text: '고위 제단술을 고른다', color };
    case 'altar-leave':
    default:
      // 거절·잠긴 카드는 얻은 게 없으니 부상 텍스트도 없다
      return { text: '', color };
  }
}

/** 카드와 같은 색 규칙 — 원소가 있으면 원소색, 없으면 종류색 (UI 일관성) */
export function colorFor(option: RewardOption): number {
  if (option.element) return ELEMENT_PALETTES[option.element].core;
  return KIND_COLORS[option.kind] ?? DEFAULT_COLOR;
}

export const GROWTH_FEEDBACK_CONFIG = {
  /** 수렴 파티클 시작 반경·개수 */
  convergeRadius: 120,
  convergeParticles: 14,
  convergeDurationMs: 520,
  gainTextRiseY: 46,
  gainTextDurationMs: 1500,
  /** 룬 링 1개가 표현하는 보상 수 — 링이 무한정 늘지 않게 상한을 둔다 */
  runeRingMaxCount: 5,
  runeRingBaseRadius: 52,
  runeRingSpacing: 7,
  auraRadius: 34,
} as const;

/**
 * 누적 보상 수 → 발밑 룬 링 개수 (상한 5).
 * "고를수록 발밑이 화려해진다"를 수치가 아니라 눈으로 알게 하는 장치.
 */
export function runeRingCount(rewardCount: number): number {
  const safe = Number.isFinite(rewardCount) ? Math.max(0, Math.floor(rewardCount)) : 0;
  return Math.min(GROWTH_FEEDBACK_CONFIG.runeRingMaxCount, safe);
}

/**
 * 오라 원소 — 친화 보너스가 가장 높은 원소. 동률이면 먼저 획득한 쪽(키 순서) 유지.
 * 친화가 없으면 null (오라 미표시).
 */
export function auraElement(
  affinity: Partial<Record<SpellElement, number>>,
): SpellElement | null {
  let best: SpellElement | null = null;
  let bestValue = 0;
  for (const [element, value] of Object.entries(affinity) as Array<[SpellElement, number]>) {
    if (!Number.isFinite(value) || value <= bestValue) continue;
    best = element;
    bestValue = value;
  }
  return best;
}
