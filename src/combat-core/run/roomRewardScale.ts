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
  /**
   * 일반 전투 — 기준값. 다른 방들이 이보다 나을지 못할지로 읽힌다.
   * 힌트에 **친화 성장**을 적는다: 전투방의 리턴은 카드 3장만이 아니다. 방 하나에서
   * 약 4회 영창하면 `useAffinity.perCast 0.02` × 4 = **+0.08 사용 친화도**가 붙고
   * 인그레이브 후보도 쌓인다(캐스트한 주문만 새길 수 있다). 친화 카드가 +0.15이니
   * 반 장 값이다 — 실재하는 리턴인데 지금까지 화면 어디에도 안 적혀 있었다.
   */
  combat: { scale: 1, hint: '3택 · 친화 성장' },
  /**
   * 정예 — 실드 파수꾼·엘리트 특성으로 실질 생존시간이 길다(#258 기준 60초).
   * 함정보다 위험하므로 함정보다 많이 준다.
   */
  elite: { scale: 1.5, hint: '위험 · 3택 ×1.5' },
  /**
   * 함정 — 기믹 판단·공간 제약이 붙는다(#258 기준 54초). 일반보다 위험하지만
   * 정예처럼 적의 생존시간을 직접 늘리지는 않아 정예보다 낮다.
   */
  trap: { scale: 1.4, hint: '기믹 · 3택 ×1.4' },
  /**
   * 보물 — 무전투. **일반 전투방보다 총 리턴이 낮아야 한다** (총괄 지적 2026-07-30:
   * *"일반전투방과 보상방이 있으면 다들 보상방을 가고 싶을 거 아냐"*).
   *
   * 종전 2택 ×1.3은 **리스크 0인데 배율은 함정 근처**여서 방 선택이 아니라 정답이었다.
   * 게다가 실제 추첨은 `treasureRewardConfig`가 따로 했고 거기엔 깊이 0.5 이상에서
   * **3택 ×1.6** 등급까지 있었다 — 정예(×1.5)를 무전투로 넘는 값이다. 표가 둘로
   * 갈려 있었으니 밸런스 논의가 굴러가지도 않는 숫자를 놓고 벌어질 상황이었다.
   *
   * 이제 여기가 유일한 출처다. ×1.15 · 2택 — **숫자로 이기지 않는다.**
   * 보물방의 존재 이유는 배율이 아니라 *"지금 체력이 아깝다"*다. 안전이 값이고,
   * 그 대가로 고르는 폭(2택)과 배율 모두 전투방 아래에 둔다. 캐스트 0회라
   * 친화 성장·인그레이브 후보도 못 얻는다 — 그게 진짜 비용이고 힌트에 적는다.
   */
  treasure: { scale: 1.15, optionCount: 2, hint: '무전투 · 2택 · 성장 없음' },
  /** 제단 — 최대 체력을 내고 산다. 배율은 altarOffer가 등급별로 정한다 */
  altar: { scale: 2, hint: '생명 대가 · 상급' },
  'stage-boss': { scale: 1, hint: '수문장' },
  'memory-boss': { scale: 1, hint: '기억의 주인' },
} as const satisfies Record<MapNodeKind, RoomRewardScale>;

export function rewardScaleFor(kind: MapNodeKind): RoomRewardScale {
  // `as const satisfies`가 리터럴로 좁히므로 optionCount를 선언하지 않은 항목에는
  // 그 키가 아예 없다. 인터페이스 타입으로 넓혀 읽는 지점을 여기 하나로 모은다.
  return ROOM_REWARD_SCALES[kind] as RoomRewardScale;
}

/** 그 방이 낼 카드 수. 미지정이면 기본 3택 */
export function rewardOptionCount(kind: MapNodeKind): number {
  return rewardScaleFor(kind).optionCount ?? 3;
}

/**
 * 선택지 수까지 반영한 **총 리턴 근사** — 배율만 비교하면 "2택 ×1.3이 3택 ×1.0보다
 * 크다"는 잘못된 결론이 나온다. 카드가 한 장 적으면 원하는 걸 못 볼 확률이 커지므로
 * 폭도 리턴의 일부다. 회귀가 이 값으로 방들의 순서를 고정한다.
 *
 * 정확한 기대값이 아니라 **순서를 못박는 대리지표**다 (풀 분산은 R1 밸런스 몫).
 */
export function totalReturn(kind: MapNodeKind): number {
  return rewardScaleFor(kind).scale * (rewardOptionCount(kind) / 3);
}

/**
 * 위험한 방이 실제로 더 주는가 — 회귀가 이걸 고정한다.
 * 이 부등식이 깨지면 그 방을 고를 이유가 사라진다.
 */
export const RISK_ORDER: readonly MapNodeKind[] = ['combat', 'trap', 'elite'];

/**
 * **리스크 0인 방이 싸운 방을 이기면 안 된다.** 위 RISK_ORDER는 전투방들 사이의
 * 순서만 봤고, 총괄이 지적한 "무전투 방이 제일 좋다"는 그 축에 안 걸렸다.
 * `totalReturn` 기준으로 보물 < 일반전투를 고정한다.
 */
export const SAFE_BELOW_COMBAT: readonly MapNodeKind[] = ['treasure'];

/**
 * 방 종류별 **위험도** — 맵 생성기(#240)의 경로 비교축.
 *
 * R1 설계 §2의 값을 기준으로 하되 **제단을 1 → 2로 올렸다.** 제단은 최대 체력을
 * 영구히 10/25/50 깎는다. 그 값을 1로 두면 `제단(위험1·보상2.0)`이
 * `정예(위험2·보상1.5)`를 **지배**해서 — 위험이 낮은데 보상이 높다 — 생성기의
 * 지배 금지 규칙(§5.3)에 걸려 "정예 vs 제단" 분기가 아예 생성 불가가 된다.
 *
 * 보스는 경로 비교에서 제외한다(R1 설계 §2). 시작 방도 분기 이전이라 제외 대상이나
 * 값이 없으면 합산이 깨지므로 일반 전투와 같게 둔다.
 */
export const ROOM_RISK_SCORES = {
  start: 1,
  combat: 1,
  elite: 2,
  trap: 2,
  treasure: 0,
  altar: 2,
  'stage-boss': 0,
  'memory-boss': 0,
} as const satisfies Record<MapNodeKind, number>;

export function roomRisk(kind: MapNodeKind): number {
  return ROOM_RISK_SCORES[kind];
}

/**
 * 맵 생성기가 쓰는 **보상도** — `totalReturn`을 그대로 쓴다.
 *
 * ⚠️ #240 프로토타입은 `roomReward`가 보물·제단만 1을 주고 **전투·정예·함정에
 * 0을 줬다.** 즉 "싸우는 방은 보상이 없다"는 모델이다. 그러면 생성기 자신의 지배
 * 금지 규칙에 의해 `전투(위험1·보상0)` vs `보물(위험0·보상1)` — 가장 자연스러운
 * 로그라이크 분기가 **불법**이 된다. 프로토타입에 재조정 후처리가 6개나 붙어 있는
 * 이유가 이것이다: 과제약을 후처리로 떠받치고 있었다.
 *
 * 실제 값은 보물 0.767 < 전투 1.000 < 함정 1.400 < 정예 1.500 < 제단 2.000이다.
 * 부정확한 게 아니라 전투방과 보물방 사이가 **역전**돼 있었다.
 */
export function roomRewardValue(kind: MapNodeKind): number {
  return totalReturn(kind);
}

/**
 * 지배 관계 — A가 B보다 위험한데 보상이 낮으면 A를 고를 이유가 없다 (R1 설계 §5.3).
 * 위험이 높고 보상이 같은 경우, 위험이 같고 보상이 다른 경우는 **허용**한다:
 * 모든 선택지를 하나의 정답으로 수렴시키지 않기 위한 의도적 규칙이다.
 */
export function dominates(
  a: { risk: number; reward: number },
  b: { risk: number; reward: number },
): boolean {
  return a.risk > b.risk && a.reward < b.reward;
}
