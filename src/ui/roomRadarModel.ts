/** 현재 전투방의 월드 좌표를 우상단 레이더 안으로 투영하는 순수 모델. */
export interface RoomRadarBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomRadarPosition {
  x: number;
  y: number;
}

export interface RoomRadarPoint {
  x: number;
  y: number;
}

export const ROOM_RADAR_CONFIG = {
  width: 228,
  height: 166,
  padding: 14,
  /** 제목 + ROOM/WAVE/ENEMIES 두 줄. 별도 상태판을 만들지 않는다. */
  headerHeight: 47,
  playerRadius: 4.5,
  enemyRadius: 3.5,
} as const;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

/** 방 밖 좌표도 레이더 가장자리에 붙여, 돌진·넉백 순간 점이 사라지지 않게 한다. */
export function projectRoomRadarPoint(
  bounds: RoomRadarBounds,
  position: RoomRadarPosition,
): RoomRadarPoint {
  const worldWidth = Number.isFinite(bounds.width) && bounds.width > 0 ? bounds.width : 1;
  const worldHeight = Number.isFinite(bounds.height) && bounds.height > 0 ? bounds.height : 1;
  const nx = clamp01((position.x - bounds.x) / worldWidth);
  const ny = clamp01((position.y - bounds.y) / worldHeight);
  const innerWidth = ROOM_RADAR_CONFIG.width - ROOM_RADAR_CONFIG.padding * 2;
  const mapTop = ROOM_RADAR_CONFIG.headerHeight;
  const innerHeight = ROOM_RADAR_CONFIG.height - mapTop - ROOM_RADAR_CONFIG.padding;
  return {
    x: ROOM_RADAR_CONFIG.padding + nx * innerWidth,
    y: mapTop + ny * innerHeight,
  };
}
