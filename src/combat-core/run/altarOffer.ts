import type { RewardOption } from '../../run/runContract';
import type { SpellElement } from '../../spell/types';
import { ELEMENT_LABELS } from '../../render/palette';
import { RUN_REWARD_CONFIG } from './rewardConfig';

/**
 * 제단 거래 (#214 재설계 — 총괄 결정 2026-07-29).
 *
 * **왜 다시 짰나** (총괄): 종전 제단은 방에 들어서는 순간 최대 HP의 25%를 강제로
 * 걷고 표준 보상 풀에 배율만 얹어 3택을 줬다. 문제가 셋이었다:
 *  - 거절할 수 없다 — 포탈을 고른 것이 곧 동의로 처리됐다
 *  - 대가를 들어가기 전에 모른다 — 라벨에 "제단"뿐이었다
 *  - 보상이 일반 방 카드와 같은 종류라 "여기서만 얻는 것"이 없었다
 *
 * 그래서 **거래 자체를 카드로** 만든다. 대가와 보상이 한 장에 붙어 있으니 한 화면에서
 * 정보 있는 선택이 되고, "그냥 나간다" 카드가 거절권을 준다. 새 UI도 필요 없다 —
 * 기존 보상 오버레이를 그대로 쓴다.
 *
 * **대가는 최대 체력을 영구히 깎는다** (현재 체력이 아니라). 회복으로 되돌릴 수 없어야
 * 진짜 대가다. 현재 체력이 대가보다 적어도 거절하지 않는다 — 최대치만 깎고 현재
 * 체력은 새 최대치로 클램프한다.
 */

export const ALTAR_OFFER_CONFIG = {
  /**
   * 최대 체력 하한 — 이 아래로 내려가는 거래는 잠근다.
   * "깎을 수 있는 만큼만 깎고 보상은 다 준다"로 하면 저체력일 때 대형 보상을
   * 헐값에 사는 구멍이 된다. 감당 못 하면 못 사는 게 맞다.
   */
  minMaxHp: 30,
  /** 전 원소 친화 상승분 — 일반 카드와 같은 폭이되 **모든 원소**에 걸린다 */
  allAffinityBonus: RUN_REWARD_CONFIG.affinityBonus,
  /**
   * 영창 에코 — 수동 단일 주문이 한 번 더 울린다.
   *
   * ⚠️ **확률 발동이 아니라 확정 발동이다** (총괄과 검토): 이 게임은 한 방에 수동
   * 영창이 4회뿐이라(#258) 확률이 평탄화될 표본이 없다. 50% 확률이면 16방 중 1방은
   * 최대 체력을 절반 내고도 에코를 한 번도 못 본다. 대가가 확정·영구인데 보상이
   * 확률이면 나쁜 쪽 분산을 플레이어가 전부 떠안는다.
   *
   * 대신 **확률을 위쪽에 둔다** — 확정 1회에 더해 낮은 확률로 한 번 더(3중 울림).
   * 잃을 수 있는 확률이 아니라 얻을 수 있는 확률이다.
   */
  echo: {
    delayMs: 250,
    powerScale: 0.7,
    /** 3중 울림 확률 — 다섯 번에 한 번쯤 */
    extraChance: 0.2,
  },
} as const;

/** 거래 등급 — 대가(최대 체력)와 보상이 한 장에 묶인다 */
export interface AltarTier {
  cost: number;
  kind: 'all-affinity' | 'awaken' | 'echo';
}

export const ALTAR_TIERS: readonly AltarTier[] = [
  { cost: 10, kind: 'all-affinity' },
  { cost: 25, kind: 'awaken' },
  { cost: 50, kind: 'echo' },
];

/** 대가를 치른 뒤의 체력. 현재 체력은 새 최대치로 클램프된다. */
export function altarPayment(
  maxHp: number,
  currentHp: number,
  cost: number,
): { maxHp: number; hp: number } {
  const safeMax = Number.isFinite(maxHp) ? Math.max(0, maxHp) : 0;
  const safeHp = Number.isFinite(currentHp) ? Math.max(0, currentHp) : 0;
  const safeCost = Number.isFinite(cost) ? Math.max(0, cost) : 0;
  const nextMax = Math.max(ALTAR_OFFER_CONFIG.minMaxHp, safeMax - safeCost);
  return { maxHp: nextMax, hp: Math.min(safeHp, nextMax) };
}

/** 이 거래를 감당할 수 있는가 — 최대 체력이 하한 아래로 내려가면 잠근다. */
export function canAffordAltarTier(maxHp: number, cost: number): boolean {
  const safeMax = Number.isFinite(maxHp) ? Math.max(0, maxHp) : 0;
  const safeCost = Number.isFinite(cost) ? Math.max(0, cost) : 0;
  return safeMax - safeCost >= ALTAR_OFFER_CONFIG.minMaxHp;
}

function tierDescription(tier: AltarTier, awakenElement: SpellElement | null): string {
  const percent = Math.round(ALTAR_OFFER_CONFIG.allAffinityBonus * 100);
  switch (tier.kind) {
    case 'all-affinity':
      return `모든 원소 위력 +${percent}%\n한 원소가 아니라 **여덟 전부**`;
    case 'awaken':
      return awakenElement
        ? `${ELEMENT_LABELS[awakenElement]} 각성을 지금 연다\n원래 친화를 깊이 쌓아야 열리는 문`
        : '각성을 지금 연다\n원래 친화를 깊이 쌓아야 열리는 문';
    case 'echo':
    default:
      return `수동 영창이 한 번 더 울린다 (위력 ${Math.round(ALTAR_OFFER_CONFIG.echo.powerScale * 100)}%)`
        + `\n${Math.round(ALTAR_OFFER_CONFIG.echo.extraChance * 100)}% 확률로 세 겹 · 시퀀스 제외`;
  }
}

/**
 * 제단 3택 + 거절 카드.
 *
 * 감당 못 하는 등급은 **빼지 않고 잠금 표시로 남긴다** — 사라지면 "원래 뭐가 있었는지"를
 * 모르고, 체력을 아껴야 할 이유도 안 보인다.
 *
 * @param awakenElement 각성을 걸 원소 (친화 최고). null이면 각성 등급이 잠긴다 —
 *   아무 원소나 주면 안 쓰는 원소에 걸려 대가만 날린다.
 */
export function drawAltarOffer(
  maxHp: number,
  awakenElement: SpellElement | null,
): RewardOption[] {
  const options: RewardOption[] = ALTAR_TIERS.map((tier) => {
    const affordable = canAffordAltarTier(maxHp, tier.cost)
      && (tier.kind !== 'awaken' || awakenElement !== null);
    const locked = !affordable;
    const title = locked
      ? `봉인됨 · 생명 −${tier.cost}`
      : `생명 −${tier.cost}`;
    const description = locked
      ? (tier.kind === 'awaken' && awakenElement === null
        ? '아직 어떤 원소도 부르지 못한다 — 먼저 영창하라'
        : `최대 생명이 ${ALTAR_OFFER_CONFIG.minMaxHp} 아래로 내려간다`)
      : tierDescription(tier, awakenElement);
    return {
      id: `altar-${tier.kind}-${tier.cost}${locked ? '-locked' : ''}`,
      kind: locked ? 'altar-leave' : tier.kind,
      title,
      description,
      element: tier.kind === 'awaken' ? awakenElement ?? undefined : undefined,
      altar: { cost: locked ? 0 : tier.cost, locked },
    };
  });
  options.push({
    id: 'altar-leave',
    kind: 'altar-leave',
    title: '그냥 나간다',
    description: '대가 없음 · 아무것도 얻지 않는다',
    altar: { cost: 0, locked: false },
  });
  return options;
}
