import type { SpellElement } from '../spell/types';

/**
 * 런 진행(방·보상) R1↔R3 인터페이스 계약 — 타입 전용, 구현은 R1 소유.
 * 제안 문서: docs/R3_RUN_UI_CONTRACT.md (PHASE_2.md §2 "런 계약 확정" 게이트)
 *
 * 책임 경계:
 *   R1 — RunController 구현: phase 전이, 보상 수치 적용, reward-select 중 전투 정지,
 *        결정론적 보상 3택 생성 (LLM 호출 금지 — PHASE_2 §2-3)
 *   R3 — 이 인터페이스와 이벤트만 사용해 카드 UI·입력(마우스+1/2/3)·HUD·전환 연출 구현
 */

// 'max-hp': 최대 HP 증가 + 즉시 일부 회복 (PHASE_2 R1 P0 요구 — 단순 회복 아님, R1 답변 1)
// Phase 3.5 확장 (PROGRESSION_DESIGN §1): swift-incant(쿨다운 감소) / mana-surge(재생 증가) / ward-start(방 개막 보호막)
export type RewardKind =
  | 'max-hp'
  | 'max-mana'
  | 'affinity'
  | 'swift-incant'
  | 'mana-surge'
  | 'ward-start'
  | 'spirit-haste'
  | 'engrave'
  | 'spirit'
  | 'evolve';

/** 각인·정령 공통 성장 레벨 — 범위 밖 값이 보상으로 소비되는 경로를 타입에서 차단 (R1 리뷰) */
export type GrowthLevel = 1 | 2 | 3;

export interface EngraveRewardData {
  /** 정규화된 원문 주문 키 — 이번 런의 수동 영창 기록과 연결한다. */
  spellKey: string;
  /** 선택 후 도달할 각인 레벨. */
  level: GrowthLevel;
}

export type SpiritRole = 'attack' | 'heal' | 'guard';

export interface SpiritRewardData {
  /** 같은 정령의 획득·강화를 연결하는 안정 ID. */
  spiritId: string;
  role: SpiritRole;
  /** 선택 후 도달할 레벨. */
  level: GrowthLevel;
}

/** 성장의 정점(PROGRESSION_DESIGN §2·§3) — 격상 이름은 씬이 LLM(/evolve-name)으로 짓는다 */
export interface EvolveRewardData {
  /** 'engrave' = 각인 Lv3 진화, 'spirit-fuse' = 공격 정령 2체 융합 */
  target: 'engrave' | 'spirit-fuse';
  /** target='engrave' 전용 — 진화할 각인의 spellKey */
  engraveKey?: string;
  /** target='spirit-fuse' 전용 — 융합에 소모될 공격 정령 2체 */
  spiritIds?: readonly string[];
  /** 작명·연출용 원소 (진화 1개, 융합 2개) */
  elements: readonly SpellElement[];
}

export interface RewardOption {
  /** 고유 id — chooseReward()에 그대로 전달 */
  id: string;
  kind: RewardKind;
  /** 카드 제목 (예: "마나 증폭") */
  title: string;
  /** 효과·수치·대상이 드러나는 설명 (예: "최대 마나 +20") */
  description: string;
  /** kind='affinity' 전용 — 카드 색상·아이콘 표시용 */
  element?: SpellElement;
  /** kind='engrave' 전용 — 각인 대상과 선택 후 레벨 */
  engrave?: EngraveRewardData;
  /** kind='spirit' 전용 — 정령 역할과 선택 후 레벨 */
  spirit?: SpiritRewardData;
  /** kind='evolve' 전용 — 진화·융합 대상 */
  evolve?: EvolveRewardData;
}

export type RunPhase = 'combat' | 'reward-select' | 'room-transition' | 'run-over';

export type EncounterKind = 'combat' | 'elite' | 'stage-boss' | 'memory-boss';
export type EliteModifier = 'swift' | 'guard' | 'unstable';

export interface EncounterVariantDefinition {
  id: string;
  waveSetId: string;
}

export interface EncounterDefinition {
  id: string;
  stage: 1 | 2;
  kind: EncounterKind;
  rewardAfterClear: boolean;
  waveSetId?: string;
  variants?: readonly EncounterVariantDefinition[];
  eliteModifiers?: readonly EliteModifier[];
}

export interface RunStateSnapshot {
  /** 1부터 시작 */
  roomIndex: number;
  maxRooms: number;
  stage: 1 | 2;
  encounterId: string;
  encounterKind: EncounterKind;
  encounterVariantId?: string;
  waveSetId?: string;
  phase: RunPhase;
  /** 보스 후 이어가기 루프 (0=첫 런). 이어갈수록 난이도↑ */
  loopIndex: number;
  /** 이번 런에서 획득한 보상 누적 기록 (선택 순서대로) — R1 답변 3 */
  readonly rewards: readonly RewardOption[];
  /** 원소별 위력 배율 보너스 (0.15 = +15%) — HUD 요약 표시용 */
  elementalAffinity: Partial<Record<SpellElement, number>>;
}

export interface RunEvents {
  /** 방 클리어 → 보상 3택 제시. phase는 이미 'reward-select' */
  'room-cleared': (options: RewardOption[], state: RunStateSnapshot) => void;
  /** 보상 적용 직후 (HUD 즉시 갱신 트리거). phase는 'room-transition' */
  'reward-applied': (chosen: RewardOption, state: RunStateSnapshot) => void;
  /** 방 전환 연출 시작. durationMs 동안 R3가 페이드·문구 연출 (500~1000ms) */
  'room-transition': (state: RunStateSnapshot, durationMs: number) => void;
  /** 다음 방 전투 시작. phase는 'combat' */
  'room-started': (state: RunStateSnapshot) => void;
  /** 마지막 방 클리어 → 런 완주. phase는 'run-over' (보상 선택 없음) — R1 답변 2 */
  'run-completed': (state: RunStateSnapshot) => void;
}

/** R1이 구현·소유. R3 UI는 이 계약 밖의 전투 내부 상태에 접근하지 않는다. */
export interface RunController {
  readonly state: Readonly<RunStateSnapshot>;
  /**
   * 보상 선택. phase='reward-select'에서만 유효 (그 외 no-op).
   * R1: 수치 적용 → 'reward-applied' → 'room-transition' → 'room-started' 순서로 발화.
   */
  chooseReward(optionId: string): void;
  on<K extends keyof RunEvents>(event: K, handler: RunEvents[K]): void;
  off<K extends keyof RunEvents>(event: K, handler: RunEvents[K]): void;
}
