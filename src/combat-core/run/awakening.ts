import type { RewardOption } from '../../run/runContract';
import type { SpellElement, SpellSpec, SpellStatus } from '../../spell/types';
import { ELEMENT_LABELS } from '../../render/palette';
import { FUSION_ELEMENT_STATUS } from '../player/fusionGauge';

/**
 * 원소 각성 — 성장 포화 이후의 **질적** 축 (AWAKENING_PROPOSAL, 총괄 결정 2026-07-29).
 *
 * 문제: 각인(8) + 정령(7) ≈ 15개 보상이면 성장 축이 다 찬다. 한 런이 8방이라 두 런이면
 * 포화하고, 그 뒤 남는 7종은 전부 스탯이라 **화면에서 달라지는 게 없다.**
 *
 * 친화 곡선에도 같은 빈 구간이 있다:
 *   0.45 사용 상한 · **0.9 마스터리 면역(#204)·VFX 6** · **1.2 VFX 상한** · 그 위는 숫자만.
 * 그래서 임계를 **1.2**로 둔다 — 0.9는 이미 "내성을 뚫는다"는 큰 보상이 있어 겹친다.
 *
 * ⚠️ **세 각성 모두 수동 영창 전용이다.** 각인·정령(자동 시전)에 적용하면 오토 비중
 * 40% 상한(#67)이 깨진다 — 회귀로 고정된 불변식이라 건드리지 않는다.
 */

export const AWAKENING_CONFIG = {
  /** 각성이 열리는 친화 임계 — VFX 강도 상한(intensityCap 8 = 친화 1.2)과 같은 지점 */
  threshold: 1.2,
  /** 연환 파급 대상 수 */
  chainingExtraTargets: 1,
  /** 연환 파급 피해 배율 — 본체보다 약하게 (광역 전환이지 배수가 아니다) */
  chainingDamageScale: 0.5,
  /** 낙인 취약 배율·지속 */
  brandWeakenMultiplier: 1.25,
  brandWeakenSeconds: 4,
} as const;

export type AwakeningKind = 'searing' | 'chaining' | 'brand';

export const AWAKENING_KINDS: readonly AwakeningKind[] = ['searing', 'chaining', 'brand'];

export const AWAKENING_LABELS: Record<AwakeningKind, string> = {
  searing: '작열',
  chaining: '연환',
  brand: '낙인',
};

/** 원소별 각성 상태 — 원소당 1회. undefined면 아직 각성 안 함. */
export type AwakeningState = Partial<Record<SpellElement, AwakeningKind>>;

export function awakeningDescription(kind: AwakeningKind, element: SpellElement): string {
  const el = ELEMENT_LABELS[element];
  switch (kind) {
    case 'searing':
      return `${el} 영창이 언제나 본성을 새긴다`;
    case 'chaining':
      return `${el} 영창이 곁의 적에게 번진다`;
    case 'brand':
    default:
      return `${el}에 맞은 적이 무너지기 쉬워진다`;
  }
}

/** 선택 카드 호버에만 쓰는 상세 계약. 카드 본문은 짧게, 실제 수치·조건은 여기서 설명한다. */
export function awakeningDetail(kind: AwakeningKind, element: SpellElement): string {
  const elementStatus = FUSION_ELEMENT_STATUS[element];
  const statusLabels: Record<SpellStatus, string> = {
    burn: '화상', freeze: '빙결', shock: '감전', slow: '둔화', knockback: '밀쳐냄', weaken: '취약',
  };
  switch (kind) {
    case 'searing':
      return `수동 ${ELEMENT_LABELS[element]} 영창에 ${statusLabels[elementStatus]}을 추가합니다. 자동 시전에는 적용되지 않습니다.`;
    case 'chaining':
      return `명중 후 가장 가까운 적 1명에게 원본 피해의 ${Math.round(AWAKENING_CONFIG.chainingDamageScale * 100)}%로 추가 파급합니다.`;
    case 'brand':
    default:
      return `명중 적은 ${AWAKENING_CONFIG.brandWeakenSeconds}초 동안 받는 피해가 ${Math.round((AWAKENING_CONFIG.brandWeakenMultiplier - 1) * 100)}% 증가합니다.`;
  }
}

/**
 * 각성 후보 원소 — 임계 이상이면서 아직 각성하지 않은 것 중 **가장 높은 하나**.
 * 여러 개가 동시에 걸리면 가장 깊이 투자한 쪽을 먼저 준다(집중형 보상이라는 취지).
 */
export function awakenableElement(
  affinity: Readonly<Partial<Record<SpellElement, number>>>,
  awakened: AwakeningState,
  threshold = AWAKENING_CONFIG.threshold,
): SpellElement | null {
  let best: { element: SpellElement; value: number } | null = null;
  for (const [key, raw] of Object.entries(affinity)) {
    const element = key as SpellElement;
    const value = Number.isFinite(raw) ? (raw as number) : 0;
    if (value < threshold || awakened[element]) continue;
    if (!best || value > best.value) best = { element, value };
  }
  return best?.element ?? null;
}

/** 각성 보상 3택 — 한 원소에 대해 세 갈래를 모두 낸다 (스타일 선택). */
export function awakeningOptions(element: SpellElement): RewardOption[] {
  return AWAKENING_KINDS.map((kind) => ({
    id: `awaken-${element}-${kind}`,
    kind: 'awaken' as const,
    title: `각성 — ${AWAKENING_LABELS[kind]}`,
    description: awakeningDescription(kind, element),
    element,
    awaken: { element, awakening: kind },
  }));
}

/** 보상 id에서 각성 정보를 되읽는다 (컨트롤러가 선택을 적용할 때). */
export function applyAwakening(
  state: AwakeningState,
  element: SpellElement,
  kind: AwakeningKind,
): AwakeningState {
  if (state[element]) return state; // 원소당 1회 — 이미 각성했으면 불변
  return { ...state, [element]: kind };
}

/**
 * 작열 — 그 원소 주문에 본성 상태이상을 새긴다 (순수).
 * 이미 있으면 그대로 — 중복을 만들지 않는다.
 */
export function searingStatus(spell: SpellSpec): SpellStatus[] {
  const innate = FUSION_ELEMENT_STATUS[spell.element_primary];
  return spell.status.includes(innate) ? [...spell.status] : [...spell.status, innate];
}

/** 이 시전이 해당 각성을 받는가 — **수동 영창의 주속성**만 (자동 시전 제외). */
export function awakeningFor(
  state: AwakeningState,
  spell: SpellSpec,
  auto: boolean,
): AwakeningKind | null {
  if (auto) return null;
  return state[spell.element_primary] ?? null;
}
