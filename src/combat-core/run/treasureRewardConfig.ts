import type { RewardOption } from '../../run/runContract';
import { drawRewardOptions } from './rewardConfig';

/**
 * 보물방 보상 — 무위험 즉시 강화 (#214 R2, 2026-07-27).
 *
 * 설계(팀 합의): 제단방이 "HP 대가·다중선택·최고 배율(고위험고보상)"이라면, 보물방은
 * **무위험·무전투**라 그보다 짜다. 단, 일반 전투방(3택·표준)보다 매력이 떨어지면
 * 플레이어가 피하므로 **일반방보단 확실히 좋게, 제단방보단 약간 아래로** 둔다.
 *
 * 진행 깊이(roomIndex/maxRooms)로 스케일:
 *  - 저층: 옵션 2개 · 배율 1.3 (일반방 3택보다 옵션은 적으나 배율↑ + 무전투 = 메리트)
 *  - 고층: 옵션 3개 · 배율 1.6 (런 후반 보상 — 제단 2.0보다 아래)
 *
 * 배율은 `buildOption`/`applyReward`가 설명·실적용에 함께 반영한다(#234 powerScale).
 * ⚠️ **placeholder 수치**(경계·배율) — 총괄·이도원 밸런스 튜닝 대상.
 */
export const TREASURE_CONFIG = {
  /** 진행 깊이(roomIndex/maxRooms)가 이 값 이상이면 고층 (placeholder) */
  highFloorThreshold: 0.5,
  /** 저층: 옵션 2개 · 배율 1.3 */
  lowFloor: { optionCount: 2, scale: 1.3 },
  /** 고층: 옵션 3개 · 배율 1.6 (제단 2.0보다 아래) */
  highFloor: { optionCount: 3, scale: 1.6 },
} as const;

/**
 * 보물방 보상 — 깊이에 따라 옵션 수·배율이 오른다. 대가 없음.
 * 같은 시드면 같은 결과(재현 가능). LLM 호출 없음.
 */
export function drawTreasureReward(
  roomIndex: number,
  maxRooms: number,
  rand: () => number,
): readonly RewardOption[] {
  const depth = maxRooms > 0 ? roomIndex / maxRooms : 0;
  const tier = depth >= TREASURE_CONFIG.highFloorThreshold
    ? TREASURE_CONFIG.highFloor
    : TREASURE_CONFIG.lowFloor;
  return drawRewardOptions(roomIndex, rand, tier.scale)
    .slice(0, tier.optionCount)
    .map((option) => ({ ...option, id: `treasure-${option.id}` }));
}
