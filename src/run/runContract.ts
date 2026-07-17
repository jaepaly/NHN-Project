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
  | 'ward-start';

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
}

export type RunPhase = 'combat' | 'reward-select' | 'room-transition' | 'run-over';

export interface RunStateSnapshot {
  /** 1부터 시작 */
  roomIndex: number;
  maxRooms: number;
  phase: RunPhase;
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
