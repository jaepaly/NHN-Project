import type { MapNodeKind } from '../../run/mapGraphContract';

/**
 * 방 종류별 보상 배율 (총괄 지적 2026-07-30).
 *
 * 총괄 지적: *"다음 방 선택지로 함정방, 보상방이 있으면 누가 함정방을 선택하겠어."*
 *
 * **근본 원인은 함정방이 아니라 체계였다.** 확인해보니 `treasure`·`altar`만 전용 보상표를
 * 쓰고 `combat`·`elite`·`trap`은 전부 같은 `drawRewardOptions(roomIndex, rand)` —
 * 배율 없이 동일했다. 즉:
 *
 *   정예방 = 일반 전투방 + 실드·엘리트 특성, 보상은 똑같음  → **엄격히 손해**
 *   함정방 = 일반 전투방 + 기믹·공간 제약, 보상은 똑같음     → **엄격히 손해**
 *
 * 분기 맵의 위험–보상 축이 아예 없었던 것이다. 함정방을 아무도 안 고르는 게 아니라,
 * **고를 이유를 준 적이 없다.**
 *
 * ⚠️ 수치는 placeholder다 — 밸런스는 R1 몫(#258). 여기서 고정하는 건 **구조**다:
 * "더 위험한 방이 더 준다", 그리고 그 값이 **포탈에 표시된다**. 정보 없는 선택은
 * 분기가 아니라 제비뽑기다.
 */

export interface RoomRewardScale {
  /** 수치형 보상에 곱하는 배율 (buildOption → applyReward가 함께 반영) */
  scale: number;
  /** 3택 중 몇 장을 낼지. 미지정이면 3 */
  optionCount?: number;
  /** 포탈에 붙는 한 줄 — 고르기 전에 보상 크기를 알아야 한다 */
  hint: string;
}

export const ROOM_REWARD_SCALES = {
  /** 시작 방 — 기준값 */
  start: { scale: 1, hint: '' },
  /** 일반 전투 — 기준값. 다른 방들이 이보다 나을지 못할지로 읽힌다 */
  combat: { scale: 1, hint: '보상 표준' },
  /**
   * 정예 — 실드 파수꾼·엘리트 특성으로 실질 생존시간이 길다(#258 기준 60초).
   * 함정보다 위험하므로 함정보다 많이 준다.
   */
  elite: { scale: 1.5, hint: '위험 · 보상 ×1.5' },
  /**
   * 함정 — 기믹 판단·공간 제약이 붙는다(#258 기준 54초). 일반보다 위험하지만
   * 정예처럼 적의 생존시간을 직접 늘리지는 않아 정예보다 낮다.
   */
  trap: { scale: 1.4, hint: '기믹 · 보상 ×1.4' },
  /**
   * 보물 — 무전투. 배율은 있지만 **선택지가 2장**이라 폭이 좁다(treasureRewardConfig가
   * 깊이별로 2~3장·1.3~1.6배를 낸다). "안전하지만 고를 게 적다"가 대가다.
   */
  treasure: { scale: 1.3, optionCount: 2, hint: '무전투 · 2택' },
  /** 제단 — 최대 체력을 내고 산다. 배율은 altarOffer가 등급별로 정한다 */
  altar: { scale: 2, hint: '생명 대가 · 상급' },
  'stage-boss': { scale: 1, hint: '수문장' },
  'memory-boss': { scale: 1, hint: '기억의 주인' },
} as const satisfies Record<MapNodeKind, RoomRewardScale>;

export function rewardScaleFor(kind: MapNodeKind): RoomRewardScale {
  return ROOM_REWARD_SCALES[kind];
}

/**
 * 위험한 방이 실제로 더 주는가 — 회귀가 이걸 고정한다.
 * 이 부등식이 깨지면 그 방을 고를 이유가 사라진다.
 */
export const RISK_ORDER: readonly MapNodeKind[] = ['combat', 'trap', 'elite'];
