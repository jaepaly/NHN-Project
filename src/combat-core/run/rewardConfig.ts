import { ELEMENTS } from '../../spell/types';
import type { SpellElement } from '../../spell/types';
import type { RewardOption } from '../../run/runContract';

/** Phase 2 R1 임시 런·보상 수치. 플레이테스트와 팀 합의 후 조정한다. */
export const RUN_REWARD_CONFIG = {
  // 마지막 방(= maxRooms번째)은 관례상 보스방 — 웨이브 대신 보스 스폰 (Phase 3)
  maxRooms: 3,
  transitionDurationMs: 700,
  maxHpIncrease: 20,
  hpRecovery: 20,
  maxManaIncrease: 20,
  manaRecovery: 20,
  affinityBonus: 0.15,
} as const;

/** 방 번호만으로 같은 보상 후보가 만들어지도록 원소를 결정한다. */
export function affinityElementForRoom(roomIndex: number): SpellElement {
  const safeRoomIndex = Math.max(1, Math.floor(roomIndex));
  return ELEMENTS[(safeRoomIndex - 1) % ELEMENTS.length];
}

/** LLM 호출 없이 생성되는 결정론적 3택 보상. */
export function createRewardOptions(roomIndex: number): readonly RewardOption[] {
  const element = affinityElementForRoom(roomIndex);
  const affinityPercent = Math.round(RUN_REWARD_CONFIG.affinityBonus * 100);

  return [
    {
      id: `room-${roomIndex}-max-hp`,
      kind: 'max-hp',
      title: '생명 증폭',
      description: `최대 HP +${RUN_REWARD_CONFIG.maxHpIncrease}, 즉시 ${RUN_REWARD_CONFIG.hpRecovery} 회복`,
    },
    {
      id: `room-${roomIndex}-max-mana`,
      kind: 'max-mana',
      title: '마나 증폭',
      description: `최대 마나 +${RUN_REWARD_CONFIG.maxManaIncrease}, 즉시 ${RUN_REWARD_CONFIG.manaRecovery} 회복`,
    },
    {
      id: `room-${roomIndex}-affinity-${element}`,
      kind: 'affinity',
      title: `${element.toUpperCase()} 친화`,
      description: `${element.toUpperCase()} 원소 위력 +${affinityPercent}%`,
      element,
    },
  ];
}
