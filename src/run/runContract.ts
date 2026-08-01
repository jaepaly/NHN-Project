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
  | 'evolve'
  | 'awaken'
  // ── 제단 전용 (#214) — 일반 3택 풀에는 절대 섞이지 않는다 ──────────────
  /** 대가 없이 나간다 — 제단을 거절하는 선택지 */
  | 'altar-leave'
  /** 모든 원소 친화 상승 — 일반 풀은 랜덤 1원소만 준다 */
  | 'all-affinity'
  /** 영창 에코 — 수동 단일 주문이 **같은 자리에** 한 번 더 울린다 (시간축) */
  | 'echo'
  /**
   * 영창 파문 — 수동 단일 주문이 **다른 적에게** 번진다 (공간축).
   * 에코와 같은 값·같은 급이되 축이 다르다 — 한 런에서 제단을 두 번 만나는
   * 플레이어가 "이미 가진 걸 또 사는" 상황을 없앤다.
   */
  | 'ripple';

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

/**
 * 원소 각성 — 친화가 임계(1.2)에 닿은 원소에 성질을 새긴다. 원소당 1회.
 * 세 갈래 모두 **수동 영창 전용**이라 오토 비중 상한(#67)과 무관하다.
 */
export interface AwakenRewardData {
  element: SpellElement;
  awakening: 'searing' | 'chaining' | 'brand';
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
  /** kind='awaken' 전용 — 각성할 원소와 갈래 (AWAKENING_PROPOSAL) */
  awaken?: AwakenRewardData;
  /**
   * 강화 배율 — 표준 보상은 미지정(=1). 제단방(#214) 같은 "상급" 보상이 1보다 큰 값을
   * 실어 `applyReward`가 수치형 효과(HP·마나·친화·수호 등)에 곱한다. 미지정이면 1로 본다.
   * (적용부 = RunController.applyReward, R3 소유 — 배선은 별도 조율.)
   */
  powerScale?: number;
  /**
   * 제단 거래 전용 (#214) — 이 카드를 고르면 치를 **최대 체력** 대가.
   * 거절 카드('altar-leave')와 잠긴 등급은 cost 0이다. 씬이 이 값으로 지불을 집행한다.
   */
  altar?: AltarRewardData;
}

/** 제단 거래 데이터 — 대가와 잠금 여부 (altarOffer) */
export interface AltarRewardData {
  /** 치를 최대 체력. 0이면 대가 없음(거절·잠김) */
  cost: number;
  /** 감당 못 해 잠긴 등급 — 카드는 보이되 고르면 아무 일도 안 일어난다 */
  locked: boolean;
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
  /** Fixed runs may show a denominator; branching maps cannot know it before choices resolve. */
  roomCountMode?: 'fixed' | 'dynamic';
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
