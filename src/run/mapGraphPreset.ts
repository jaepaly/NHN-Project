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
     * 1스테이지 분기의 위험한 쪽 — **위험지대 함정방**.
     *
     * 종전엔 일반 전투방이었다. 그래서 프리셋에는 1스테이지 함정이 하나도 없었고
     * (유일한 함정이 `s2-trap`), 팀원이 *"1런에는 원래 독지대 같은 함정이 안
     * 등장하나?"*라고 물을 만큼 안 보였다. 정화 안내(#293)를 볼 기회도 그만큼 없었다.
     *
     * ⚠️ **노드를 추가하지 않고 교체한다.** 프리셋의 가장 긴 경로가 정확히 8방이고,
     * 컨트롤러의 `maxRooms`가 readonly라 그 값에 묶여 있다(map-generator-regression이
     * 생성 맵과의 일치를 고정한다). 하나 늘리면 `ROOM x/8`과 보스 판정이 어긋난다.
     *
     * 교체가 오히려 낫다: 분기가 `안전한 보물(총리턴 0.767) vs 기믹 전투(1.4)`가 되어
     * 총괄이 지적한 "다들 보상방을 가고 싶을 거 아냐"에 실제 답이 생긴다. 시작 방이
     * 이미 전투(room-a)라 1스테이지에 싸울 곳이 없어지지도 않는다.
     */
    {
      id: 's1-combat',
      stage: 1,
      kind: 'trap',
      layer: 1,
      lane: 0,
      waveSetId: 'trap-hazard',
      trapProfile: TRAP_ROOM_PROFILES.hazard,
      ...emptyRoom,
    },
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
