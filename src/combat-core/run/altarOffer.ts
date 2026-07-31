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
  /**
   * 파문 — 에코와 **같은 값(50) · 같은 급**이되 축이 다르다.
   *
   * 위력이 에코(0.7)보다 낮은 이유: 대상이 늘어나므로 총 산출을 맞춰야 한다.
   * 다만 **적이 둘 이상 있을 때만 발동**한다 — 보스전에서는 완전히 논다.
   * 그 상황 의존성이 에코와의 균형을 잡는다(에코는 어디서나 켜진다).
   */
  ripple: {
    delayMs: 260,
    powerScale: 0.55,
    /** 번지는 최대 대상 수 (원본 대상 제외) */
    maxTargets: 2,
    /** 이 거리 안의 적에게만 — 화면 밖까지 번지면 무슨 일인지 안 읽힌다 */
    radius: 420,
    decorScale: 0.45,
  },
  echo: {
    /**
     * 원본과 에코 사이 간격 (총괄 제보: "거의 직후에 바로 발동되는 탓에 에코가
     * 체감되질 않는듯"). 250ms는 원본이 아직 날아가는 중이라 **두 발이 한 덩어리로**
     * 읽혔다. 메아리는 원본이 끝난 뒤에 와야 메아리다.
     */
    delayMs: 520,
    powerScale: 0.7,
    /** 3중 울림 확률 — 다섯 번에 한 번쯤 */
    extraChance: 0.2,
    /**
     * 겹별 장식 밝기 (총괄 지적: "유저가 쓴 영창보다는 좀 더 투명하게. 3번째 에코는
     * 그보다도 더 투명하게"). 원본 1.0 → 첫 에코 → 둘째 에코 순으로 옅어진다.
     * 이게 없으면 세 발이 같은 밝기로 나가 "왜 세 번 나갔는지" 알 수 없다.
     */
    decorScales: [0.55, 0.32] as readonly number[],
  },
} as const;

/** 거래 등급 — 대가(최대 체력)와 보상이 한 장에 묶인다 */
export type AltarTierKind = 'all-affinity' | 'awaken' | 'echo' | 'ripple';

export interface AltarTier {
  cost: number;
  kind: AltarTierKind;
}

/**
 * 거래 등급.
 *
 * ⚠️ **최상위가 둘인 이유** (총괄 지적: "제단을 한 런에서 2회 이상 방문하는 플레이어를
 * 위해 다른 보상 하나 더"). 실측으로 한 런에 제단 2회가 3.2%이고, 맵에 제단이 2개
 * 이상인 경우가 21.7%다 — 일부러 노리면 더 잦다. 최상위가 하나뿐이면 두 번째 제단이
 * "이미 가진 걸 또 사거나 하위로 내려가는" 자리가 된다.
 *
 * 에코와 파문은 **값도 급도 같고 축이 다르다**:
 *   에코 — 같은 자리에 한 번 더 (시간축). 단일 대상 화력 → 보스용
 *   파문 — 다른 적에게 번진다 (공간축). 다수 동시 타격 → 잡몹·정예용
 *
 * 그래서 두 번째 제단이 "남은 걸 줍는 자리"가 아니라 **빌드 방향을 정하는 자리**다.
 */
export const ALTAR_TIERS: readonly AltarTier[] = [
  { cost: 10, kind: 'all-affinity' },
  { cost: 25, kind: 'awaken' },
  { cost: 50, kind: 'echo' },
  { cost: 50, kind: 'ripple' },
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
    case 'ripple':
      return `수동 영창이 **다른 적에게** 번진다 (위력 ${Math.round(ALTAR_OFFER_CONFIG.ripple.powerScale * 100)}%)`
        + `\n가장 가까운 다른 적 ${ALTAR_OFFER_CONFIG.ripple.maxTargets}체까지 · 시퀀스 제외`;
    case 'echo':
    default:
      return `수동 영창이 **같은 자리에** 한 번 더 울린다 (위력 ${Math.round(ALTAR_OFFER_CONFIG.echo.powerScale * 100)}%)`
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
  /**
   * 이미 가진 등급 — **잠근다.**
   *
   * ⚠️ 종전엔 이 정보가 없어 2회차 제단이 이미 가진 능력을 또 제시했다. 에코는
   * boolean이라 두 번 사도 아무 일도 안 일어나는데 **최대 체력 50은 그대로 나간다.**
   */
  ownedKinds: readonly AltarTierKind[] = [],
): RewardOption[] {
  const options: RewardOption[] = ALTAR_TIERS.map((tier) => {
    const owned = ownedKinds.includes(tier.kind);
    const affordable = !owned
      && canAffordAltarTier(maxHp, tier.cost)
      && (tier.kind !== 'awaken' || awakenElement !== null);
    const locked = !affordable;
    const title = !locked
      ? `생명 −${tier.cost}`
      : owned ? '이미 지녔다' : `봉인됨 · 생명 −${tier.cost}`;
    const description = !locked
      ? tierDescription(tier, awakenElement)
      : owned
        ? '이미 이 힘을 지녔다 — 같은 것을 두 번 살 수는 없다'
        : (tier.kind === 'awaken' && awakenElement === null
          ? '아직 어떤 원소도 부르지 못한다 — 먼저 영창하라'
          : `최대 생명이 ${ALTAR_OFFER_CONFIG.minMaxHp} 아래로 내려간다`);
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
