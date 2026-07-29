import type { SpellElement } from '../../spell/types';
import type { AwakeningState } from './awakening';
import { ENGRAVE_CONFIG } from '../engrave/engraveManager';
import { SPIRIT_CONFIG } from '../spirit/spiritManager';

/**
 * 플레이어 파워 지표 (순수) — "지금 이 빌드가 런 시작 대비 몇 배로 때리는가".
 *
 * **왜 필요한가** (총괄 지적): 적 체력을 루프 수로 올리면 안 된다. 루프 수는 성장의
 * 나쁜 대리 지표다 —
 *  - 친화 카드는 7종 풀에서 3택이라 **뜰 확률 3/7**, 게다가 **원소가 8종 중 랜덤**이다
 *    (drawRewardOptions). 주력 원소에 맞을 기대값은 방당 ≈5%뿐이라 카드 성장은 운이다.
 *  - 사용 친화는 **원소당 상한 0.45**(useAffinity)라 초반에 차고 거기서 멈춘다.
 *  - 시연 로드아웃(seedAffinity)·각인·정령·각성은 루프 수에 아예 안 잡힌다.
 * 그래서 같은 loop 3에서도 실제 파워가 배 이상 갈린다. 재고 싶은 건 경과한 방 수가
 * 아니라 **파워 대 체력 비율**이므로 그걸 직접 잰다.
 *
 * **왜 실측 DPS가 아니라 빌드 상태인가**: 실측은 노이즈가 크고(방마다 적 수·배치가
 * 다르다) 불투명하며 회귀로 고정할 수 없다. 빌드 상태에서 뽑으면 순수 함수가 되어
 * 같은 빌드 = 같은 값이 보장되고, 회귀로 불변식을 못 박을 수 있다.
 *
 * 세 축을 **곱**한다 — 실제 피해 계산이 곱이기 때문이다:
 *   (1 + 주력친화) × (1 + 오토비중) × (1 + 각성보너스)
 */

export const POWER_INDEX = {
  /**
   * 오토 시전(각인·정령)이 총 피해에 더할 수 있는 최대 비중.
   * **#67 게이트와 같은 0.4** — 오토는 수동의 40%를 넘을 수 없다는 회귀 고정 불변식이라,
   * 빌드를 아무리 채워도 여기가 천장이다. 별도 튜닝값이 아니라 게이트의 반영이다.
   */
  autoShare: 0.4,
  /** 각성 1개당 실질 피해 상승분 — 연환 파급·낙인 취약(×1.25)의 대략치 */
  awakeningBonus: 0.15,
  /** 진화·융합이 슬롯 충전도에 더하는 몫 — 진화 각인은 3발(=DPS ×1.5)이라 레벨 만렙의 절반 */
  upgradeFill: 0.5,
} as const;

/** 각인 슬롯 — 레벨과 진화 여부만 본다 (매니저 스냅샷에 결합하지 않는 구조적 타입) */
export interface EngraveSlotPower {
  level: number;
  evolved: boolean;
}

/** 정령 슬롯 — 융합은 2슬롯 예산을 하나로 합친 것이라 충전도도 2배로 센다 */
export interface SpiritSlotPower {
  level: number;
  fused: boolean;
}

export interface PlayerPowerInput {
  affinity: Readonly<Partial<Record<SpellElement, number>>>;
  engraves: readonly EngraveSlotPower[];
  spirits: readonly SpiritSlotPower[];
  awakenings: AwakeningState;
}

function safeLevel(level: number, maxLevel: number): number {
  const value = Number.isFinite(level) ? Math.max(0, level) : 0;
  return Math.min(1, value / maxLevel);
}

/** 슬롯 하나의 충전도 0~1 — 만렙(1) + 진화/융합(0.5)을 1.5로 정규화한다. */
function slotFill(level: number, maxLevel: number, upgraded: boolean): number {
  const base = safeLevel(level, maxLevel) + (upgraded ? POWER_INDEX.upgradeFill : 0);
  return Math.min(1, base / (1 + POWER_INDEX.upgradeFill));
}

/**
 * 주력 원소 친화 — 가장 높은 값 하나.
 *
 * 왜 합이 아니라 최대인가: 수동 피해는 `power × (1 + affinity[그 주문의 원소])`라 한
 * 번의 타격에 **한 원소만** 걸린다. 8원소에 고루 뿌린 플레이어를 합으로 재면 실제보다
 * 훨씬 세다고 잘못 읽는다. 게다가 최대치는 HUD 친화 바 맨 윗줄에 이미 떠 있어서,
 * "내가 보고 있는 그 바에 적이 반응한다"가 되어 읽히기도 한다.
 */
export function mainAffinity(
  affinity: Readonly<Partial<Record<SpellElement, number>>>,
): number {
  let best = 0;
  for (const raw of Object.values(affinity)) {
    const value = Number.isFinite(raw) ? (raw as number) : 0;
    if (value > best) best = value;
  }
  return Math.max(0, best);
}

/**
 * 오토 빌드 충전도 0~1 — 각인 줄과 정령 줄의 평균.
 * 융합 정령은 빈 슬롯 하나를 남기지만 예산은 그대로이므로 2슬롯 몫으로 센다.
 */
export function autoBuildFill(
  engraves: readonly EngraveSlotPower[],
  spirits: readonly SpiritSlotPower[],
): number {
  let engraveSum = 0;
  for (const slot of engraves.slice(0, ENGRAVE_CONFIG.maxSlots)) {
    engraveSum += slotFill(slot.level, ENGRAVE_CONFIG.maxLevel, slot.evolved);
  }
  let spiritSum = 0;
  for (const slot of spirits.slice(0, SPIRIT_CONFIG.maxSlots)) {
    spiritSum += slotFill(slot.level, SPIRIT_CONFIG.maxLevel, slot.fused) * (slot.fused ? 2 : 1);
  }
  const engraveFill = Math.min(1, engraveSum / ENGRAVE_CONFIG.maxSlots);
  const spiritFill = Math.min(1, spiritSum / SPIRIT_CONFIG.maxSlots);
  return (engraveFill + spiritFill) / 2;
}

/**
 * 빌드 → 파워 배율 (1 = 런 시작 시점, 성장 없음). 하한 1 — 성장이 음수일 수는 없다.
 *
 * 세 축은 실제 피해 계산이 곱이라 곱한다: 친화는 위력에 곱해지고(spellPowerWithAffinity),
 * 오토는 그 위에 얹히는 별도 DPS이며, 각성은 그 둘 모두에 걸리는 질적 상승이다.
 */
export function playerPowerIndex(input: PlayerPowerInput): number {
  const affinityFactor = 1 + mainAffinity(input.affinity);
  const autoFactor = 1 + POWER_INDEX.autoShare * autoBuildFill(input.engraves, input.spirits);
  const awakenCount = Object.values(input.awakenings).filter(Boolean).length;
  const awakenFactor = 1 + POWER_INDEX.awakeningBonus * awakenCount;
  return Math.max(1, affinityFactor * autoFactor * awakenFactor);
}
