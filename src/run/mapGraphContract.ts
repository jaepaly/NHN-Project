import type { RoomCurseKind } from '../combat-core/run/roomCurse';

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
 * R1이 소유하는 실제 방 노드 데이터입니다. Phaser/씬 객체를 참조하지 않아
 * 그래프 생성, 회귀 테스트, 미니맵 소비자가 같은 값을 안전하게 공유할 수 있습니다.
 */
export interface MapTerrainPlacement {
  kind: string;
  x: number;
  y: number;
  radius?: number;
}

export interface MapNode {
  id: string;
  stage: number;
  kind: MapNodeKind;
  layer: number;
  lane: number;
  waveSetId: string | null;
  terrain: readonly MapTerrainPlacement[];
  /** 저주 배정기가 소비할 후보별 가중치 자리입니다. */
  curseWeights: Readonly<Partial<Record<RoomCurseKind, number>>>;
}

export interface MapNodeSnapshot extends MapNode {
  status: MapNodeStatus;
}

export interface MapGraphEdge {
  from: string;
  to: string;
}

/** R3가 미니맵과 포탈 UI를 갱신할 때 소비하는 불변 스냅샷입니다. */
export interface MapGraphState {
  currentNodeId: string;
  nodes: readonly MapNodeSnapshot[];
  edges: readonly MapGraphEdge[];
}

export interface MapGraphProgress {
  stage: number;
  /** Current stage's one-based visit order. There is no fixed denominator. */
  roomNumber: number;
  totalVisitedRooms: number;
}

/** #214에서 합의한 R1 → R3 공개 표면입니다. */
export interface MapGraph {
  current(): MapNode;
  choices(): MapNode[];
  canEnter(nodeId: string): boolean;
  enter(nodeId: string): MapNode;
  progress(): MapGraphProgress;
  snapshot(): MapGraphState;
  isBossNode(nodeId: string): boolean;
  /**
   * MapGraph identifies the final boss room. RunController remains authoritative
   * for completion and ends the run only after that encounter is cleared.
   */
  isFinalBossNode(nodeId: string): boolean;
  lastBeforeBoss(): MapNode;
}

/**
 * R1 그래프 스냅샷 → 미니맵 뷰모델 어댑터의 공통 형식입니다.
 * 실제 어댑터는 mapGraph.ts의 toMinimapModel()에 두고, 목데이터는
 * R3의 병렬 UI 개발과 회귀 검증을 위해 계속 유지합니다.
 */
export type ToMinimapModel<GraphState> = (state: GraphState) => MinimapModel;
