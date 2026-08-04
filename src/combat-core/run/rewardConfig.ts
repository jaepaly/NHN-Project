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
  // 신속 영창 — C 경제 전환(#53)으로 글로벌 쿨다운이 사라져 입력락 감소로 대체 (GATE_DECISION_0728 #67).
  // 기본 0.4s에서 장당 -0.1s, 하한 0.15s(playerCombatState) = 실질 2.5장.
  swiftIncantLockReduction: 0.1,
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

// 각성(awaken)도 제외 — 친화 임계 도달 시에만 조건부 주입되지, 랜덤 풀에서 뽑히지 않는다
// ⚠️ 새 RewardKind를 추가하면 **여기서 명시적으로 빼야** 랜덤 3택 풀에 안 섞인다.
// Exclude가 자동 흡수하는 구조라, 빼먹으면 제단 전용 카드가 일반 방에서 튀어나온다
// (과거 'awaken'에서 실제로 겪은 사고).
type StaticRewardKind = Exclude<
  RewardKind,
  // 제단 전용·특수 보상은 일반 3택 풀에 절대 섞이지 않는다.
  // ⚠️ 여기에 안 넣으면 `buildOption`의 switch가 그 종류를 안 다뤄 반환이 없다 —
  // tsc가 "ending return statement가 없다"로 잡는다(ripple 추가 때 실제로 걸렸다).
  'engrave' | 'spirit' | 'evolve' | 'awaken' | 'altar-leave' | 'legacy-skip' | 'all-affinity' | 'altar-high'
  | 'echo' | 'ripple' | 'starburst' | 'meteor' | 'trail' | 'chorus-awaken'
>;

/**
 * 보상 카드 하나를 만든다.
 *
 * `scale`(기본 1)은 보물방·제단방(#214) 같은 강화 보상의 배율이다. 설명 수치와
 * `powerScale`을 함께 배율 반영해 **카드 표시 = 실제 적용 값**이 일치하게 한다
 * (applyReward가 powerScale을 곱하므로 — 표시만 표준이면 거짓말이 된다).
 * scale=1이면 문자열·필드가 기존과 정확히 동일하다.
 *
 * ⚠️ spirit-haste는 정령 매니저(씬)가 적용해 applyReward가 배율을 못 곱한다 →
 * 표시·powerScale 모두 표준으로 둔다(거짓 표시 방지). 씬 배선 후 함께 강화.
 */
function buildOption(
  kind: StaticRewardKind,
  roomIndex: number,
  element: SpellElement,
  scale = 1,
): RewardOption {
  const premium = scale !== 1 ? { powerScale: scale } : {};
  const roundS = (v: number) => Math.round(v * scale);            // 정수 (HP·마나·수호)
  const decS = (v: number) => Math.round(v * scale * 100) / 100;  // 소수 (초)
  const pctS = (v: number) => Math.round(v * 100 * scale);        // 퍼센트
  switch (kind) {
    case 'max-hp':
      return {
        id: `room-${roomIndex}-max-hp`,
        kind,
        title: '생명 증폭',
        description: `최대 HP +${roundS(RUN_REWARD_CONFIG.maxHpIncrease)}, 즉시 ${roundS(RUN_REWARD_CONFIG.hpRecovery)} 회복`,
        ...premium,
      };
    case 'max-mana':
      return {
        id: `room-${roomIndex}-max-mana`,
        kind,
        title: '마나 증폭',
        description: `최대 마나 +${roundS(RUN_REWARD_CONFIG.maxManaIncrease)}, 즉시 ${roundS(RUN_REWARD_CONFIG.manaRecovery)} 회복`,
        ...premium,
      };
    case 'affinity':
      return {
        id: `room-${roomIndex}-affinity-${element}`,
        kind,
        title: `${ELEMENT_LABELS[element]} 친화`,
        description: `${ELEMENT_LABELS[element]} 원소 위력 +${pctS(RUN_REWARD_CONFIG.affinityBonus)}% · 이펙트 격상 (3단계까지)`,
        element,
        ...premium,
      };
    case 'swift-incant':
      return {
        id: `room-${roomIndex}-swift-incant`,
        kind,
        title: '신속 영창',
        description: `영창 후 딜레이 -${decS(RUN_REWARD_CONFIG.swiftIncantLockReduction)}초 (하한 0.15초 · 영창가 빌드)`,
        ...premium,
      };
    case 'mana-surge':
      return {
        id: `room-${roomIndex}-mana-surge`,
        kind,
        title: '마나 격류',
        description: `마나 획득 +${pctS(RUN_REWARD_CONFIG.manaSurgeGainBonus)}% · 수정 흡수 범위 +${pctS(RUN_REWARD_CONFIG.manaSurgePickupRadiusBonus)}%`,
        ...premium,
      };
    case 'spirit-haste':
      // 씬(정령 매니저)이 적용 → applyReward가 배율 못 곱함. 표준 표시·powerScale 없음.
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
        description: `이후 매 방 시작 시 보호막 +${roundS(RUN_REWARD_CONFIG.wardStartShield)}`,
        ...premium,
      };
  }
}

/** 시드 랜덤 추첨이 뽑는 카드 풀 (PROGRESSION_DESIGN §1 — 각인·정령은 ②③에서 추가) */
const REWARD_POOL: readonly StaticRewardKind[] = [
  // swift-incant는 all-plan 영창에서 효용이 없어 재설계 전까지 추첨에서 제외한다.
  // 기존 런 기록 호환을 위해 RewardKind와 적용 로직은 유지한다.
  'max-hp', 'max-mana', 'affinity', 'mana-surge', 'ward-start', 'spirit-haste',
];

/**
 * 런 시드 랜덤 3택 — LLM 호출 없음, 같은 시드면 같은 결과(재현 가능).
 * 종류 중복 없이 3장. 친화 원소도 rand로 결정.
 * `scale`(기본 1)은 보물방·제단방(#214) 강화 배율 — 설명·powerScale에 함께 반영된다.
 */
export function drawRewardOptions(
  roomIndex: number,
  rand: () => number,
  scale = 1,
): readonly RewardOption[] {
  const pool = [...REWARD_POOL];
  const picked: StaticRewardKind[] = [];
  while (picked.length < 3 && pool.length > 0) {
    const index = Math.floor(rand() * pool.length) % pool.length;
    picked.push(pool.splice(index, 1)[0]);
  }
  const element = ELEMENTS[Math.floor(rand() * ELEMENTS.length) % ELEMENTS.length];
  return picked.map((kind) => buildOption(kind, roomIndex, element, scale));
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
