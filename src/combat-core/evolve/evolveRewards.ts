import type { RewardOption } from '../../run/runContract';
import type { SpellElement } from '../../spell/types';
import type { EngraveManager } from '../engrave/engraveManager';
import type { SpiritManager } from '../spirit/spiritManager';
import { ELEMENT_LABELS } from '../../render/palette';

/**
 * 진화·융합 보상 카드 (성장 시스템 ④ — PROGRESSION_DESIGN §2·§3).
 * 각인 진화(Lv3 + 동일 원소 친화)와 정령 융합(공격 정령 2체) 후보를 모아
 * 3택 중 정적 카드 한 장을 진화 카드로 치환한다.
 * 격상 이름은 카드 선택 후 씬이 LLM(/evolve-name)으로 짓는다 — 카드엔 예고만 싣는다.
 */

/** 진화·융합 후보로 만든 카드 하나 (없으면 null) */
export function buildEvolveOption(
  roomIndex: number,
  engraveManager: EngraveManager,
  spiritManager: SpiritManager,
  affinity: Partial<Record<SpellElement, number>>,
  rand: () => number,
): RewardOption | null {
  const candidates: RewardOption[] = [];

  for (const slot of engraveManager.evolveCandidates(affinity)) {
    candidates.push({
      id: `room-${roomIndex}-evolve-engrave-${slot.spellKey.length}-${slot.spell.element_primary}`,
      kind: 'evolve',
      title: `각인 진화 · ${slot.spell.name}`,
      description: `${ELEMENT_LABELS[slot.spell.element_primary]} 친화와 공명해 대격변한다 — 새로운 이름을 얻는다`,
      element: slot.spell.element_primary,
      evolve: {
        target: 'engrave',
        engraveKey: slot.spellKey,
        elements: [slot.spell.element_primary],
      },
    });
  }

  const fuse = spiritManager.fuseCandidate();
  if (fuse) {
    const [a, b] = fuse.elements;
    candidates.push({
      id: `room-${roomIndex}-evolve-fuse-${a}-${b}`,
      kind: 'evolve',
      title: `정령 융합 · ${ELEMENT_LABELS[a]}×${ELEMENT_LABELS[b]}`,
      description: '정령 2체를 하나로 — 주·부속성 이중 원소 마법이 태어나고, 새로운 이름을 얻는다',
      element: a,
      evolve: {
        target: 'spirit-fuse',
        spiritIds: fuse.spiritIds,
        elements: fuse.elements,
      },
    });
  }

  if (candidates.length === 0) return null;
  return candidates[randomIndex(candidates.length, rand)];
}

/**
 * 정적 카드 한 장을 진화 카드로 치환한다.
 * 각인·정령 카드는 건드리지 않는다 (성장 경로 카드끼리 서로 덮지 않기).
 */
export function injectEvolveReward(
  options: readonly RewardOption[],
  option: RewardOption | null,
  rand: () => number,
): readonly RewardOption[] {
  if (!option) return options;
  const replaceable = options
    .map((reward, index) => ({ reward, index }))
    .filter(({ reward }) => reward.kind !== 'engrave'
      && reward.kind !== 'spirit'
      && reward.kind !== 'evolve');
  if (replaceable.length === 0) return options;
  const picked = replaceable[randomIndex(replaceable.length, rand)];
  const result = [...options];
  result[picked.index] = option;
  return result;
}

function randomIndex(length: number, rand: () => number): number {
  const raw = rand();
  const value = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999, raw)) : 0;
  return Math.floor(value * length);
}
