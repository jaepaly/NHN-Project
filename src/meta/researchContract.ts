import type { MetaProfileV1 } from './metaProfile';
import type { SpellElement, SpellForm, SpellSpec } from '../spell/types';

/**
 * 만물 변주가 열리는 최소 완료 회차 (총괄 결정 2026-08-06).
 *
 * 종전엔 통찰 14(`EXPANDED_RESEARCH_UNLOCK_INSIGHT`)로 열었는데, 그 값은 완주해야
 * 겨우 닿아서 "2회차에 열린다"가 보장되지 않았다 — 일찍 죽으면 3·4회차까지 밀린다.
 * 회차 기준이면 결정적이다. 자세한 근거는 `availableBasicResearchContracts` 참조.
 */
export const VARIATION_RESEARCH_UNLOCK_RUNS = 1;
export const RESEARCH_GOAL = 3;
export const VARIATION_RESEARCH_GOAL = 4;
export const RESEARCH_FIRST_REWARD = 3;
export const RESEARCH_REPEAT_REWARD = 2;
export const ELEMENTAL_FOCUS_START_AFFINITY = 0.15;
/** 연구 행동 자체가 현재 런의 성장으로 이어지게 하는 단계 보상. */
export const ELEMENTAL_FOCUS_MILESTONE_AFFINITY = 0.05;
/** 원소 연구 진행도마다 대상 원소 주문의 사거리·범위를 10%씩 확장한다. */
export const ELEMENTAL_FOCUS_SPATIAL_SCALE_PER_STAGE = 0.1;
/** 원소 연구 완료 뒤 대상 원소 영창 3회마다 낮은 위력의 공명 재시전을 만든다. */
export const ELEMENTAL_FOCUS_ECHO_EVERY_CASTS = 3;
export const ELEMENTAL_FOCUS_ECHO_POWER_SCALE = 0.25;
/** 수호 연구 첫 단계부터 보호막이 남아 있으면 받는 전투 피해를 줄인다. */
/** 수호 연구 완료 뒤 지원 영창이 밀어내는 결계 파동의 전투 수치. */
export const SPIRIT_RESONANCE_START_HASTE_SCALE = 0.9;
export const SPIRIT_RESONANCE_MILESTONE_HASTE_SCALE = 0.9;
export const VARIATION_DIVERSITY_BASE_BONUS = 0.4;
/** 4단계에 걸쳐 최대 +30%p. 매번 다른 원소·형태를 시도할 이유가 된다. */
export const VARIATION_DIVERSITY_BONUS_PER_STAGE = 0.075;
export const VARIATION_DIVERSITY_MAX_BONUS = 0.7;

export type ResearchContractId = 'elemental-focus' | 'spirit-resonance' | 'variation-study';

export const RESEARCH_ELEMENTS: readonly SpellElement[] = [
  'fire', 'water', 'lightning', 'ice', 'earth', 'wind', 'light', 'dark',
];

export type ResearchContractSelection =
  | { id: 'elemental-focus'; element: SpellElement }
  | { id: 'spirit-resonance' }
  | { id: 'variation-study' };

export interface ActiveResearchContract {
  id: ResearchContractId;
  element: SpellElement | null;
  progress: number;
  goal: number;
  completed: boolean;
  rewardInsight: number;
  usedElements: readonly SpellElement[];
  usedForms: readonly SpellForm[];
  spiritAcquisitions?: number;
  spiritFusions?: number;
}

export interface ResearchAdvanceResult {
  contract: ActiveResearchContract;
  changed: boolean;
  justCompleted: boolean;
}

export interface ResearchMilestoneReward {
  affinity: number;
  spiritHasteApplications: number;
  milestones: number;
}

export function spellMatchesElementalResearch(
  contract: ActiveResearchContract | null,
  spec: Pick<SpellSpec, 'element_primary' | 'element_secondary'>,
): boolean {
  return contract?.id === 'elemental-focus'
    && contract.element !== null
    && (spec.element_primary === contract.element || spec.element_secondary === contract.element);
}

/** 달성한 단계가 즉시 전투 공간에 보이도록 대상 원소 주문의 사거리·범위를 키운다. */
export function elementalFocusSpatialScale(
  contract: ActiveResearchContract | null,
  spec: Pick<SpellSpec, 'element_primary' | 'element_secondary'>,
): number {
  if (!contract || !spellMatchesElementalResearch(contract, spec)) return 1;
  return 1 + contract.progress * ELEMENTAL_FOCUS_SPATIAL_SCALE_PER_STAGE;
}

export function elementalFocusEchoUnlocked(contract: ActiveResearchContract | null): boolean {
  return contract?.id === 'elemental-focus' && contract.completed;
}

export function advanceElementalFocusEchoCharge(charge: number): {
  charge: number;
  triggered: boolean;
} {
  const safeCharge = Number.isFinite(charge) ? Math.max(0, Math.floor(charge)) : 0;
  const next = safeCharge + 1;
  return next >= ELEMENTAL_FOCUS_ECHO_EVERY_CASTS
    ? { charge: 0, triggered: true }
    : { charge: next, triggered: false };
}

export function spiritResonanceUnlocked(contract: ActiveResearchContract | null): boolean {
  return contract?.id === 'spirit-resonance' && contract.completed;
}

/**
 * 정령 공명 완료 보상 — **정령 공격 매회, 유저 주문 위력에 공명하는 추가탄**
 * (총괄 결정 2026-08-02, 3회 충전식에서 개편).
 *
 * ## 왜 충전식(3회마다 1발)을 버렸나
 *
 * 두 겹으로 약했다:
 *
 *  1. **위력 기준이 정령탄(7.5)이라** 0.5배 = 3.75 — 수동 출력 대비 +1.25%였다.
 *     심화(+10%)·변주(+12~29%)의 1/10
 *  2. **벽시계 고정 텀** (총괄 지적) — 심화·변주 충전은 시전 속도로 당길 수 있는데
 *     정령은 6초 간격 고정이고, 슬로모션(영창 입력 중 0.1배)이 정령 시계를 세워
 *     실효 주기가 18초 → ~33초까지 늘어졌다
 *
 * 총괄 결정: *"텀을 짧게, 위력도 약하게 해서 자주 보여주는게 멋있기도 하고 체감도
 * 잘 되는 거 아냐?"* — 매회 발사로 바꾸고, 위력 기준을 **유저의 최근 수동 영창
 * 평균**으로 갈아끼운다. 정령 빌드가 수동 영창을 놓지 않을 이유도 된다(세게
 * 영창할수록 공명도 세진다).
 *
 * ## 오토 게이트 (#67) 최악 산식 — 회귀가 고정한다
 *
 *     최악 발사율 = 정령 2기 / (간격 6초 × 신속 하한 0.5) = 0.667발/초
 *     공명 지분   = 0.667 × 0.12 × 평균위력 55 ÷ 수동 기준 16.7/s ≈ 26%
 *     전체 오토   = 각인 40 + 정령 30 + 공명 26 ≈ 96% < 100%  (불변식 유지)
 */
export const SPIRIT_RESONANCE_BOLT_MANUAL_SCALE = 0.12;
/** 평균에 넣는 최근 수동 영창 수 — 짧아야 "지금 빌드"를 따라간다 */
export const SPIRIT_RESONANCE_POWER_WINDOW = 5;
/** 수동 영창 기록이 없을 때의 기준 위력 (런 초반 — 정령 기본 위력 산정 기준과 동일) */
export const SPIRIT_RESONANCE_FALLBACK_POWER = 50;

/** 공명탄 위력 — 최근 수동 영창 평균 × 0.12. 기록이 없으면 기준 위력으로. */
export function spiritResonanceBoltPower(recentManualPowers: readonly number[]): number {
  const window = recentManualPowers
    .filter((power) => Number.isFinite(power) && power > 0)
    .slice(-SPIRIT_RESONANCE_POWER_WINDOW);
  const base = window.length > 0
    ? window.reduce((sum, power) => sum + power, 0) / window.length
    : SPIRIT_RESONANCE_FALLBACK_POWER;
  return Math.max(1, Math.round(base * SPIRIT_RESONANCE_BOLT_MANUAL_SCALE));
}

/**
 * 공명탄 원소 — 융합 정령은 **발마다 교대** (총괄 결정).
 *
 * 동시 이중 링은 반대했다: 매 공격 반복 연출이라 색을 겹치면 #220을 정면으로 치고,
 * 융합 정령은 이미 본탄+보조 파편으로 "두 속성"을 보여주고 있다. 교대는 발당 광량이
 * 단일 원소와 같으면서, 판정 원소도 번갈아 바뀌어 보스가 한 원소에 내성을 세워도
 * 절반은 통한다 — 융합 정령의 존재 이유(내성 커버)와 맞물린다.
 */
export function spiritResonanceBoltElement(
  elements: readonly SpellElement[],
  shotIndex: number,
): SpellElement {
  if (elements.length === 0) return 'light';
  const safeIndex = Number.isFinite(shotIndex) ? Math.max(0, Math.floor(shotIndex)) : 0;
  return elements[safeIndex % elements.length];
}

/**
 * 만물 변주 완료 보상 — **영창을 바꿔 쓸 때마다 충전, 3충전에 무지개 파동** (총괄 결정).
 *
 * 종전 완료 보상은 파동 **VFX뿐**이었다 — 피해 코드가 없었다. 진행 보상(다양성 상한
 * 0.4→0.7)은 실전투 효과지만 수동 배율이라 체감이 안 된다는 총괄 지적.
 *
 * ## 왜 "누적 종류 수"가 아니라 "직전과 다른가"인가
 *
 * 누적으로 세면 한 번 채운 뒤 **같은 주문 난사로도 유지**된다. 직전 영창과
 * (원소, 형태) 쌍이 달라야만 충전되게 하면 계속 바꿔 써야 돌아간다 — 변주라는
 * 이름 그대로다. 같은 쌍을 반복하면 충전이 멈출 뿐 깎이지는 않는다(벌칙이 아니라
 * 유인이다).
 */
export const VARIATION_WAVE_EVERY_SHIFTS = 3;
export const VARIATION_WAVE_POWER_SCALE = 0.35;
export const VARIATION_WAVE_RADIUS = 420;
/**
 * 파동이 때리는 최대 적 수 — 정예 무리(4~6체)에서 +47~70%까지 튀는 위쪽 꼬리를
 * 자른다. 상한 4면 전형 무리(2~3체)는 전혀 안 건드리고 극단만 깎는다. R1이 나중에
 * 밸런스 볼 때 변수 하나를 줄여두는 가드다.
 */
export const VARIATION_WAVE_MAX_TARGETS = 4;

export function variationWaveUnlocked(contract: ActiveResearchContract | null): boolean {
  return contract?.id === 'variation-study' && contract.completed;
}

/** 영창의 변주 판별 키 — 원소·형태 쌍. 위력·크기가 달라도 같은 쌍이면 변주가 아니다. */
export function variationCastKey(
  spec: Pick<SpellSpec, 'element_primary' | 'form'>,
): string {
  return `${spec.element_primary}:${spec.form}`;
}

/**
 * 충전 핍 모델 — **캐릭터 아래 원 3개** (총괄 제보 2026-08-02).
 *
 * 제보: *"공격 3회마다 해당 기믹들이 발동하니까 유저 입장에서는 그 타이밍을 알기가
 * 어려움."* 발동 주기가 숨어 있으면 지속 효과가 랜덤 발동처럼 읽힌다 — 원이 차오르는
 * 게 보여야 "다음 발동까지 얼마"를 계획할 수 있고, 그래야 변주(영창을 바꿔 쓰기)나
 * 심화(같은 원소 반복) 같은 **의도적 플레이**가 성립한다.
 *
 * 활성 연구는 하나뿐이므로 핍도 한 벌이다. 완료 전에는 null — 진행도는 HUD의
 * `researchProgressSlots`(●○○)가 이미 보여주고 있어서 겹치면 소음이다.
 */
export interface ResearchChargePips {
  id: ResearchContractId;
  element: SpellElement | null;
  total: number;
  filled: number;
}

export function researchChargePips(
  contract: ActiveResearchContract | null,
  charges: { echo: number; wave: number },
): ResearchChargePips | null {
  if (!contract?.completed) return null;
  // 공명은 매회 발사(주기 없음)로 개편돼 핍 대상이 아니다 — 충전이 없는데 원을
  // 그리면 "언젠가 찬다"는 거짓 신호가 된다
  if (contract.id === 'spirit-resonance') return null;
  const raw = contract.id === 'elemental-focus' ? charges.echo : charges.wave;
  const total = contract.id === 'elemental-focus'
    ? ELEMENTAL_FOCUS_ECHO_EVERY_CASTS
    : VARIATION_WAVE_EVERY_SHIFTS;
  const filled = Math.max(0, Math.min(total, Number.isFinite(raw) ? Math.floor(raw) : 0));
  return { id: contract.id, element: contract.element, total, filled };
}

export function advanceVariationWaveCharge(
  charge: number,
  previousKey: string | null,
  key: string,
): { charge: number; key: string; triggered: boolean } {
  const safeCharge = Number.isFinite(charge) ? Math.max(0, Math.floor(charge)) : 0;
  // 직전과 같은 쌍이면 충전 없음 — 난사로는 못 채운다. 깎지도 않는다(유인이지 벌칙이 아니다)
  if (previousKey === key) return { charge: safeCharge, key, triggered: false };
  const next = safeCharge + 1;
  return next >= VARIATION_WAVE_EVERY_SHIFTS
    ? { charge: 0, key, triggered: true }
    : { charge: next, key, triggered: false };
}

/** 만물의 변주 진행 단계가 실제 다양성 피해 상한을 조금씩 끌어올린다. */
export function variationDiversityMaxBonus(contract: ActiveResearchContract | null): number {
  if (contract?.id !== 'variation-study') return VARIATION_DIVERSITY_BASE_BONUS;
  return Math.min(
    VARIATION_DIVERSITY_MAX_BONUS,
    VARIATION_DIVERSITY_BASE_BONUS
      + contract.progress * VARIATION_DIVERSITY_BONUS_PER_STAGE,
  );
}

/**
 * 이번 런에 고를 수 있는 연구 주제 (총괄 결정 2026-08-06 — 해금을 앞당김).
 *
 * ## 왜 첫 런부터 여는가
 *
 * 종전 게이트는 `totalRuns >= 1 && insight >= 4`였다. 설계 문서의
 * *"첫 런에는 추가 선택을 요구하지 않는다"*를 따른 것인데, 실제로는 **첫 판에
 * 연구 시스템이 아예 안 보였다**(총괄 제보).
 *
 * 제출 관점에서 이게 치명적이다:
 *  - 심사위원은 대개 **한 판**만 한다. 그러면 연구를 한 번도 못 본다
 *  - 통찰은 `localStorage`에 쌓이는데 시크릿 창·새 브라우저면 **항상 1회차**다
 *  - 소개 문서(③)가 「연구 주제가 빌드를 가른다」를 성장의 핵심으로 서술한다 —
 *    문서에는 있는데 화면에 없으면 그게 더 나쁘다
 *
 * 그리고 통찰 문턱 4는 방 4개만 돌면 채워지는 값이라 **실질적인 벽은 회차뿐**이었다.
 * 그 벽이 막던 게 하필 가장 최근에 만든 시스템이다.
 *
 * ## 지금 규칙
 *
 * | 회차 | 열리는 주제 |
 * |---|---|
 * | 1회차 | 원소 심화 · 정령 공명 |
 * | 2회차~ | + 만물 변주 |
 *
 * ⚠️ 만물 변주만 **통찰이 아니라 회차**로 연다. 통찰 기준(14)은 완주해야 겨우 닿는
 * 값이라 "2회차에 열린다"가 보장되지 않았다 — 일찍 죽으면 3·4회차까지 밀린다.
 * 회차 기준이면 결정적이다.
 *
 * 변주를 1회차에서 빼는 이유는 난이도가 아니라 **학습 순서**다. 변주는 "매번 다르게
 * 쓰라"는 요구라, 무엇을 쓸 수 있는지 아직 모르는 첫 판에는 지시가 공허하다.
 */
export function availableBasicResearchContracts(
  profile: Pick<MetaProfileV1, 'insight' | 'totalRuns'>,
  elementalFocusElement: SpellElement | null,
): ResearchContractSelection[] {
  return [
    ...(elementalFocusElement
      ? [{ id: 'elemental-focus' as const, element: elementalFocusElement }]
      : []),
    { id: 'spirit-resonance' as const },
    ...(profile.totalRuns >= VARIATION_RESEARCH_UNLOCK_RUNS
      ? [{ id: 'variation-study' as const }]
      : []),
  ];
}

export function startResearchContract(
  selection: ResearchContractSelection,
  completedContractIds: readonly string[],
): ActiveResearchContract {
  return {
    id: selection.id,
    element: selection.id === 'elemental-focus' ? selection.element : null,
    progress: 0,
    goal: selection.id === 'variation-study' ? VARIATION_RESEARCH_GOAL : RESEARCH_GOAL,
    completed: false,
    rewardInsight: completedContractIds.includes(selection.id)
      ? RESEARCH_REPEAT_REWARD
      : RESEARCH_FIRST_REWARD,
    usedElements: [],
    usedForms: [],
    spiritAcquisitions: 0,
    spiritFusions: 0,
  };
}

/** 한 번의 일반 수동 영창을 연구에 반영한다. */
export function advanceResearchContract(
  contract: ActiveResearchContract,
  executedSpecs: readonly SpellSpec[],
): ResearchAdvanceResult {
  if (contract.completed || executedSpecs.length === 0) {
    return { contract, changed: false, justCompleted: false };
  }

  let progress = contract.progress;
  let usedElements = [...contract.usedElements];
  let usedForms = [...contract.usedForms];
  if (contract.id === 'elemental-focus' && contract.element) {
    const matchingForms = executedSpecs
      .filter((spec) => spec.element_primary === contract.element
        || spec.element_secondary === contract.element)
      .map((spec) => spec.form);
    usedForms = [...new Set([...usedForms, ...matchingForms])];
    progress = Math.min(contract.goal, usedForms.length);
  } else if (contract.id === 'spirit-resonance') {
    // behavior가 아니라 영창 횟수 기준: 지원 form이 여러 개여도 이번 호출에서 +1만.
    // 정령 연성은 보상 선택·융합 이벤트에서만 advanceSpiritResonance로 진행한다.
  } else if (contract.id === 'variation-study') {
    const elements = executedSpecs.flatMap((spec) => [
      spec.element_primary,
      ...(spec.element_secondary ? [spec.element_secondary] : []),
    ]);
    usedElements = [...new Set([...usedElements, ...elements])];
    usedForms = [...new Set([...usedForms, ...executedSpecs.map((spec) => spec.form)])];
    progress = Math.min(contract.goal, usedElements.length, usedForms.length);
  }

  const changed = progress !== contract.progress
    || usedElements.length !== contract.usedElements.length
    || usedForms.length !== contract.usedForms.length;
  if (!changed) return { contract, changed: false, justCompleted: false };
  const completed = progress >= contract.goal;
  return {
    contract: { ...contract, progress, completed, usedElements, usedForms },
    changed: true,
    justCompleted: completed && !contract.completed,
  };
}

/** 정령 연성은 영창이 아니라 실제 정령 보상·융합을 과제로 삼는다. */
export function advanceSpiritResonance(
  contract: ActiveResearchContract,
  event: 'acquired' | 'fused',
): ResearchAdvanceResult {
  if (contract.id !== 'spirit-resonance' || contract.completed) {
    return { contract, changed: false, justCompleted: false };
  }
  const spiritAcquisitions = Math.min(2, (contract.spiritAcquisitions ?? 0) + (event === 'acquired' ? 1 : 0));
  const spiritFusions = Math.min(1, (contract.spiritFusions ?? 0) + (event === 'fused' ? 1 : 0));
  const progress = Math.min(contract.goal, spiritAcquisitions + spiritFusions);
  const changed = progress !== contract.progress
    || spiritAcquisitions !== (contract.spiritAcquisitions ?? 0)
    || spiritFusions !== (contract.spiritFusions ?? 0);
  if (!changed) return { contract, changed: false, justCompleted: false };
  const completed = progress >= contract.goal;
  return {
    contract: { ...contract, progress, completed, spiritAcquisitions, spiritFusions },
    changed: true,
    justCompleted: completed && !contract.completed,
  };
}

/**
 * 직전 상태와 현재 상태 사이에서 새로 달성한 단계만 런 내 보상으로 바꾼다.
 * 호출이 중복되거나 완료 상태를 다시 보고해도 보상이 생기지 않는다.
 */
export function researchMilestoneReward(
  previous: ActiveResearchContract | null,
  current: ActiveResearchContract,
): ResearchMilestoneReward {
  if (!previous || previous.id !== current.id) {
    return { affinity: 0, spiritHasteApplications: 0, milestones: 0 };
  }
  const milestones = Math.max(0, current.progress - previous.progress);
  return {
    affinity: current.id === 'elemental-focus'
      ? milestones * ELEMENTAL_FOCUS_MILESTONE_AFFINITY
      : 0,
    spiritHasteApplications: current.id === 'spirit-resonance'
      ? Math.max(0, (current.spiritAcquisitions ?? 0) - (previous.spiritAcquisitions ?? 0))
      : 0,
    milestones,
  };
}

/** HUD에서 목표와 남은 단계를 한눈에 읽게 하는 고정 폭 트래커. */
export function researchProgressSlots(contract: ActiveResearchContract): string {
  const filled = Math.min(contract.goal, Math.max(0, contract.progress));
  return `${'●'.repeat(filled)}${'○'.repeat(Math.max(0, contract.goal - filled))}`;
}
