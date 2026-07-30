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
/**
 * 방에 놓이는 지형 한 개.
 *
 * 두 종류를 담는다:
 *  - **원형** (`radius`) — 바닥 장판. `FloorHazardZone`과 같은 모양이다
 *  - **선분** (`halfLength`·`angleDeg`) — 지형 장벽. `kind: 'barrier'`로 표시한다
 *
 * ⚠️ `halfLength`/`angleDeg`는 나중에 추가됐다. 원래 이 타입은 원형뿐이어서
 * **장벽을 표현할 수 없었고**, 그래서 `MapNode.terrain`이 채워진 적이 없다
 * (`TerrainBarrier`는 각도와 길이를 요구한다). 배선이 빠진 게 아니라 담을 자리가
 * 없었던 것이다. 자세한 경위는 `roomTerrainConfig.ts` 참조.
 */
export interface MapTerrainPlacement {
  kind: string;
  x: number;
  y: number;
  /** 원형 지형(바닥 장판)의 반경 */
  radius?: number;
  /** 선분 지형(장벽)의 길이 절반 — 있으면 장벽으로 읽는다 */
  halfLength?: number;
  /** 선분 지형의 각도(도). 0 = 가로 */
  angleDeg?: number;
}

/** 기존 위험지대·저주방을 MapNode.kind='trap'으로 통합하는 프로필 종류입니다. */
export type TrapProfileKind = 'hazard' | 'silence' | 'blackout' | 'word-limit' | 'heatwave';

/**
 * 중앙 시작을 전제했던 공간형 기믹의 입구 안전 통로입니다.
 * 안전 효과를 추가하지 않고, 해당 함정 필드의 생성/판정 영역에서만 제외합니다.
 */
export interface TrapSafeCorridor {
  shape: 'cross';
  halfWidth: number;
}

export interface TrapRoomProfile {
  kind: TrapProfileKind;
  safeCorridor?: TrapSafeCorridor;
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
  /** kind='trap'일 때 실행할 기존 기믹 통합 프로필입니다. */
  trapProfile?: TrapRoomProfile;
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
