/**
 * Scene-independent room portal placement contract.
 *
 * R1 calculates these values. R3 may render them and apply the player spawn,
 * but does not need to know how slots are selected.
 */
export type RoomPortalSide = 'left' | 'right';

export interface RoomBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RoomPortalTarget {
  nodeId: string;
  lane: number;
}

export interface RoomExitPlacement {
  targetNodeId: string;
  targetLane: number;
  side: 'right';
  slotIndex: number;
  normalizedY: number;
  x: number;
  y: number;
}

export interface RoomArrivalContext {
  fromNodeId: string;
  toNodeId: string;
}

export interface RoomArrivalPlacement {
  fromNodeId: string;
  side: 'left';
  normalizedY: number;
  portal: {
    x: number;
    y: number;
  };
  playerSpawn: {
    x: number;
    y: number;
  };
}

