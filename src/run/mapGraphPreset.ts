import type { MapGraphDefinition } from './mapGraph';

const emptyRoom = {
  terrain: [],
  curseWeights: {},
} as const;

/**
 * #214 통합 전용 최소 고정 프리셋입니다.
 *
 * 1스테이지의 전투/보상 분기와 2스테이지의 함정/제단 분기를 모두 포함해
 * 포탈 선택과 미니맵 상태를 확인할 수 있습니다. #240 승인 후 이 고정 데이터의
 * 공급부만 파티션 생성기로 교체합니다.
 */
export const MAP_GRAPH_PRESET_01: MapGraphDefinition = {
  startNodeId: 's1-start',
  lastBeforeBossNodeId: 's2-elite',
  nodes: [
    { id: 's1-start', stage: 1, kind: 'start', layer: 0, lane: 0, waveSetId: 'room-a', ...emptyRoom },
    { id: 's1-combat', stage: 1, kind: 'combat', layer: 1, lane: 0, waveSetId: 'room-b', ...emptyRoom },
    { id: 's1-treasure', stage: 1, kind: 'treasure', layer: 1, lane: 1, ...emptyRoom },
    { id: 's1-elite', stage: 1, kind: 'elite', layer: 2, lane: 0, waveSetId: 'elite', ...emptyRoom },
    { id: 's1-boss', stage: 1, kind: 'stage-boss', layer: 3, lane: 0, ...emptyRoom },
    { id: 's2-combat', stage: 2, kind: 'combat', layer: 4, lane: 0, waveSetId: 'room-c', ...emptyRoom },
    { id: 's2-trap', stage: 2, kind: 'trap', layer: 5, lane: 0, waveSetId: 'room-c-hazard', ...emptyRoom },
    { id: 's2-altar', stage: 2, kind: 'altar', layer: 5, lane: 1, ...emptyRoom },
    { id: 's2-elite', stage: 2, kind: 'elite', layer: 6, lane: 0, waveSetId: 'elite', ...emptyRoom },
    { id: 's2-memory-boss', stage: 2, kind: 'memory-boss', layer: 7, lane: 0, ...emptyRoom },
  ],
  edges: [
    { from: 's1-start', to: 's1-combat' },
    { from: 's1-start', to: 's1-treasure' },
    { from: 's1-combat', to: 's1-elite' },
    { from: 's1-treasure', to: 's1-elite' },
    { from: 's1-elite', to: 's1-boss' },
    { from: 's1-boss', to: 's2-combat' },
    { from: 's2-combat', to: 's2-trap' },
    { from: 's2-combat', to: 's2-altar' },
    { from: 's2-trap', to: 's2-elite' },
    { from: 's2-altar', to: 's2-elite' },
    { from: 's2-elite', to: 's2-memory-boss' },
  ],
};
