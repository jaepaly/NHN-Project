import { ELEMENTS } from '../../spell/types';
import type { SpellElement } from '../../spell/types';
import type { RewardKind, RewardOption } from '../../run/runContract';
import { ELEMENT_LABELS } from '../../render/palette';
import { ACTIVE_MANA_CONFIG } from '../mana/activeManaConfig';

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
  // Phase 3.5 신규 패시브 (PROGRESSION_DESIGN §1)
  swiftIncantReduction: 0.4,
  // 신속 정령 — 순수 빈도 증가(스택당 실질 DPS ×1.25). 소환사 빌드의 투자 축.
  // 하한 0.5 = 최대 2배 속사. 풀투자 오토 상한은 spiritManager.levelDpsGrowth 주석 참조.
  spiritHasteScale: 0.8,
  spiritHasteFloorMultiplier: 0.5,
  manaSurgeGainBonus: ACTIVE_MANA_CONFIG.surgeManaGainBonus,
  manaSurgePickupRadiusBonus: ACTIVE_MANA_CONFIG.surgePickupRadiusBonus,
  wardStartShield: 30,
} as const;

/** 방 번호만으로 같은 보상 후보가 만들어지도록 원소를 결정한다. (고정 3택 하네스용) */
export function affinityElementForRoom(roomIndex: number): SpellElement {
  const safeRoomIndex = Math.max(1, Math.floor(roomIndex));
  return ELEMENTS[(safeRoomIndex - 1) % ELEMENTS.length];
}

type StaticRewardKind = Exclude<RewardKind, 'engrave' | 'spirit' | 'evolve'>;

function buildOption(
  kind: StaticRewardKind,
  roomIndex: number,
  element: SpellElement,
): RewardOption {
  const affinityPercent = Math.round(RUN_REWARD_CONFIG.affinityBonus * 100);
  switch (kind) {
    case 'max-hp':
      return {
        id: `room-${roomIndex}-max-hp`,
        kind,
        title: '생명 증폭',
        description: `최대 HP +${RUN_REWARD_CONFIG.maxHpIncrease}, 즉시 ${RUN_REWARD_CONFIG.hpRecovery} 회복`,
      };
    case 'max-mana':
      return {
        id: `room-${roomIndex}-max-mana`,
        kind,
        title: '마나 증폭',
        description: `최대 마나 +${RUN_REWARD_CONFIG.maxManaIncrease}, 즉시 ${RUN_REWARD_CONFIG.manaRecovery} 회복`,
      };
    case 'affinity':
      return {
        id: `room-${roomIndex}-affinity-${element}`,
        kind,
        title: `${ELEMENT_LABELS[element]} 친화`,
        description: `${ELEMENT_LABELS[element]} 원소 위력 +${affinityPercent}% · 이펙트 격상 (3단계까지)`,
        element,
      };
    case 'swift-incant':
      return {
        id: `room-${roomIndex}-swift-incant`,
        kind,
        title: '신속 영창',
        description: `영창 쿨다운 -${RUN_REWARD_CONFIG.swiftIncantReduction}초 (하한 1초)`,
      };
    case 'mana-surge':
      return {
        id: `room-${roomIndex}-mana-surge`,
        kind,
        title: '마나 격류',
        description: `마나 획득 +${Math.round(RUN_REWARD_CONFIG.manaSurgeGainBonus * 100)}% · 수정 흡수 범위 +${Math.round(RUN_REWARD_CONFIG.manaSurgePickupRadiusBonus * 100)}%`,
      };
    case 'spirit-haste':
      return {
        id: `room-${roomIndex}-spirit-haste`,
        kind: 'spirit-haste',
        title: '신속 정령',
        description: `정령 시전 주기 -${Math.round((1 - RUN_REWARD_CONFIG.spiritHasteScale) * 100)}% (중첩 가능 · 소환사 빌드)`,
      };
    case 'ward-start':
      return {
        id: `room-${roomIndex}-ward-start`,
        kind,
        title: '수호 기점',
        description: `이후 매 방 시작 시 보호막 +${RUN_REWARD_CONFIG.wardStartShield}`,
      };
  }
}

/** 시드 랜덤 추첨이 뽑는 카드 풀 (PROGRESSION_DESIGN §1 — 각인·정령은 ②③에서 추가) */
const REWARD_POOL: readonly StaticRewardKind[] = [
  // Issue #53 C prototype has no global cast cooldown, so swift-incant is a dead reward here.
  'max-hp', 'max-mana', 'affinity', 'mana-surge', 'ward-start', 'spirit-haste',
];

/**
 * 런 시드 랜덤 3택 — LLM 호출 없음, 같은 시드면 같은 결과(재현 가능).
 * 종류 중복 없이 3장. 친화 원소도 rand로 결정.
 */
export function drawRewardOptions(
  roomIndex: number,
  rand: () => number,
): readonly RewardOption[] {
  const pool = [...REWARD_POOL];
  const picked: StaticRewardKind[] = [];
  while (picked.length < 3 && pool.length > 0) {
    const index = Math.floor(rand() * pool.length) % pool.length;
    picked.push(pool.splice(index, 1)[0]);
  }
  const element = ELEMENTS[Math.floor(rand() * ELEMENTS.length) % ELEMENTS.length];
  return picked.map((kind) => buildOption(kind, roomIndex, element));
}

/** 고정 3택 (회귀 하네스용 — 매번 동일: 생명/마나/방 원소 친화) */
export function createRewardOptions(roomIndex: number): readonly RewardOption[] {
  const element = affinityElementForRoom(roomIndex);
  return [
    buildOption('max-hp', roomIndex, element),
    buildOption('max-mana', roomIndex, element),
    buildOption('affinity', roomIndex, element),
  ];
}
