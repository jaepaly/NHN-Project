import type { RewardOption } from '../run/runContract';
import type { SpellElement } from '../spell/types';
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
  engrave: 0xffd166,
  spirit: 0x8fa4ff,
  evolve: 0xffd166,
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
      return { text: `영창 쿨다운 -${RUN_REWARD_CONFIG.swiftIncantReduction}s`, color };
    case 'mana-surge':
      return {
        text: `마나 획득 +${Math.round(RUN_REWARD_CONFIG.manaSurgeGainBonus * 100)}% · 흡수 범위 증가`,
        color,
      };
    case 'ward-start':
      return { text: `방 개막 보호막 +${RUN_REWARD_CONFIG.wardStartShield}`, color };
    case 'engrave':
      return { text: `각인 Lv${option.engrave?.level ?? 1}`, color };
    case 'spirit':
      return { text: `정령 Lv${option.spirit?.level ?? 1}`, color };
    case 'evolve':
      return {
        text: option.evolve?.target === 'spirit-fuse' ? '정령 융합' : '각인 진화',
        color,
      };
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
