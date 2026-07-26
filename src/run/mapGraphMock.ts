import type { MinimapModel } from './mapGraphContract';

/**
 * 미니맵·포탈 선행 개발용 목 그래프 (#214).
 *
 * R1의 실제 그래프가 오기 전까지 렌더·회귀가 공유하는 고정 데이터.
 * 구조는 총괄 스케치를 따랐다: 시작 1 → 분기(2~3레인) → 보스(우측 끝) 합류.
 * R1 통합 후에도 **회귀용 고정 픽스처**로 남는다 (레이아웃 계산 검증).
 */
export function mockMinimapModel(): MinimapModel {
  return {
    nodes: [
      { id: 'start', kind: 'start', status: 'cleared', layer: 0, lane: 0 },
      { id: 'a1', kind: 'combat', status: 'cleared', layer: 1, lane: 0 },
      { id: 'a2', kind: 'treasure', status: 'current', layer: 1, lane: 1 },
      { id: 'a3', kind: 'combat', status: 'unvisited', layer: 1, lane: 2 },
      { id: 'b1', kind: 'elite', status: 'reachable', layer: 2, lane: 0 },
      { id: 'b2', kind: 'altar', status: 'reachable', layer: 2, lane: 1 },
      { id: 'b3', kind: 'trap', status: 'unvisited', layer: 2, lane: 2 },
      { id: 'c1', kind: 'combat', status: 'unvisited', layer: 3, lane: 0 },
      { id: 'c2', kind: 'combat', status: 'unvisited', layer: 3, lane: 1 },
      { id: 'boss', kind: 'memory-boss', status: 'unvisited', layer: 4, lane: 0 },
    ],
    edges: [
      { from: 'start', to: 'a1' },
      { from: 'start', to: 'a2' },
      { from: 'start', to: 'a3' },
      { from: 'a1', to: 'b1' },
      { from: 'a2', to: 'b1' },
      { from: 'a2', to: 'b2' },
      { from: 'a3', to: 'b3' },
      { from: 'b1', to: 'c1' },
      { from: 'b2', to: 'c1' },
      { from: 'b2', to: 'c2' },
      { from: 'b3', to: 'c2' },
      { from: 'c1', to: 'boss' },
      { from: 'c2', to: 'boss' },
    ],
  };
}
