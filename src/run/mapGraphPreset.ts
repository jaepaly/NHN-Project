import type { MapGraphDefinition } from './mapGraph';
import { TRAP_ROOM_PROFILES } from './trapRoomProfile';

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
    /**
     * 1스테이지 분기의 싸우는 쪽 — 일반 전투방.
     *
     * ⚠️ #298이 여기를 위험지대 함정방으로 **교체**했다가 #304에서 되돌렸다.
     *
     * 당시 근거는 *"1런에는 원래 독지대 같은 함정이 안 등장하나?"* 였는데, 위험지대
     * 함정방은 용암·독지대와 **다른 체계다** — 붉은 원을 깔 뿐 원소도 정화(#293)도
     * 없다. 여기를 함정방으로 바꿔도 독지대는 한 개도 안 늘었다. 진짜 원인은
     * 바닥지형의 실런 배선이 없던 것이었고, 그건 `roomTerrainConfig`에서 따로 고쳤다.
     *
     * 게다가 방 분포 설계는 R1 소관인데 승인 없이 일반 전투 노드를 함정으로 바꿨다.
     * 이 프리셋은 **심사자가 하는 판**이라 더더욱 임의로 기울이면 안 된다.
     */
    { id: 's1-combat', stage: 1, kind: 'combat', layer: 1, lane: 0, waveSetId: 'room-b', ...emptyRoom },
    { id: 's1-treasure', stage: 1, kind: 'treasure', layer: 1, lane: 1, waveSetId: null, ...emptyRoom },
    { id: 's1-elite', stage: 1, kind: 'elite', layer: 2, lane: 0, waveSetId: 'elite', ...emptyRoom },
    { id: 's1-boss', stage: 1, kind: 'stage-boss', layer: 3, lane: 0, waveSetId: null, ...emptyRoom },
    // ⚠️ 'room-c'는 WAVE_SETS에 없다 — 실제 키는 room-c-shield / room-c-hazard 두 변형이다.
    // 그래서 5번 방에서 startRoom이 예외를 던져 몹도 포탈도 없는 빈 방이 됐다(총괄 제보).
    // 그래프에는 변형(variants) 개념이 없어 하나를 골라야 한다 — 실드 파수꾼이 별개
    // 기믹이라 shield를 택했다. 두 변형을 살릴지는 R1 판단(#283).
    { id: 's2-combat', stage: 2, kind: 'combat', layer: 4, lane: 0, waveSetId: 'room-c-shield', ...emptyRoom },
    {
      id: 's2-trap',
      stage: 2,
      kind: 'trap',
      layer: 5,
      lane: 0,
      waveSetId: 'trap-hazard',
      trapProfile: TRAP_ROOM_PROFILES.hazard,
      ...emptyRoom,
    },
    { id: 's2-altar', stage: 2, kind: 'altar', layer: 5, lane: 1, waveSetId: null, ...emptyRoom },
    { id: 's2-elite', stage: 2, kind: 'elite', layer: 6, lane: 0, waveSetId: 'elite', ...emptyRoom },
    { id: 's2-memory-boss', stage: 2, kind: 'memory-boss', layer: 7, lane: 0, waveSetId: null, ...emptyRoom },
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
