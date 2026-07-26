/**
 * 맵 그래프 계약 (#214 — R1↔R3 인터페이스).
 *
 * ⚠️ 이 파일은 **계약 표면**이다. 그래프 내부 구현(생성·프리셋·진행 규칙)은 R1 소유이고,
 * R3(씬·미니맵·포탈)는 이 표면만 소비한다. 표면 변경은 #214에서 합의 후에만.
 *
 * 미니맵·포탈은 R1 산출물보다 먼저 개발되므로(크리티컬 패스 병렬화), 씬 쪽은
 * 여기 정의된 **뷰모델(MinimapModel)** 만 입력으로 받는다 — R1의 실제 스냅샷 구조가
 * 어떻게 확정되든 어댑터 한 겹(toMinimapModel)으로 흡수한다.
 */

/** 방 종류 — 기존 encounterKind(combat/elite/stage-boss/memory-boss) + #214 신규 3종 */
export type MapNodeKind =
  | 'start'
  | 'combat'
  | 'elite'
  | 'stage-boss'
  | 'memory-boss'
  | 'treasure' // 보물방 — 무전투 즉시 3택 (R2)
  | 'altar'    // 제단방 — 대가 지불 → 상급 3택 (R2)
  | 'trap';    // 함정방 (R1)

export type MapNodeStatus = 'cleared' | 'current' | 'reachable' | 'unvisited';

/** 미니맵 렌더 전용 뷰모델 — 렌더에 필요한 최소만 담는다 */
export interface MinimapNode {
  id: string;
  kind: MapNodeKind;
  status: MapNodeStatus;
  /** 진행 축 (0 = 시작, 클수록 보스에 가까움) — 미니맵 가로 배치 기준 */
  layer: number;
  /** 같은 layer 안의 분기 위치 (0..laneCount-1) — 미니맵 세로 배치 기준 */
  lane: number;
}

export interface MinimapEdge {
  from: string;
  to: string;
}

export interface MinimapModel {
  nodes: MinimapNode[];
  edges: MinimapEdge[];
}

/**
 * R1 그래프 스냅샷 → 미니맵 뷰모델 어댑터 자리.
 * R1의 MapGraphState가 확정되면 여기서 변환한다. 그 전까지 미니맵은
 * 목데이터 MinimapModel로 개발·검증한다 (scripts/minimap-regression.ts 참조).
 */
export type ToMinimapModel<GraphState> = (state: GraphState) => MinimapModel;
