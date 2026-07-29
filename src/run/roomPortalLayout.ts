import type {
  RoomArrivalContext,
  RoomArrivalPlacement,
  RoomBounds,
  RoomExitPlacement,
  RoomPortalTarget,
} from './roomPortalContract';

export interface RoomPortalLayoutConfig {
  /** Adjacent vertical slot distance as a proportion of room height. */
  slotGapRatio: number;
  /** Portal center distance from the left or right room edge, in pixels. */
  edgeInset: number;
  /** Player spawn distance inward from the arrival portal, in pixels. */
  playerSpawnInwardOffset: number;
  /** Prevents portal centers from approaching the top and bottom edges. */
  verticalMarginRatio: number;
  maxExitCount: number;
}

export const DEFAULT_ROOM_PORTAL_LAYOUT: Readonly<RoomPortalLayoutConfig> = {
  slotGapRatio: 0.16,
  edgeInset: 80,
  playerSpawnInwardOffset: 96,
  verticalMarginRatio: 0.18,
  maxExitCount: 3,
};

/**
 * Places right-side exits from top to bottom according to destination lane.
 * The node id tie-breaker keeps output deterministic if lanes are duplicated.
 */
export function layoutRoomExits(
  room: RoomBounds,
  targets: readonly RoomPortalTarget[],
  config: Readonly<RoomPortalLayoutConfig> = DEFAULT_ROOM_PORTAL_LAYOUT,
): RoomExitPlacement[] {
  assertRoom(room);
  assertConfig(config);
  if (targets.length > config.maxExitCount) {
    throw new Error(`Room portal layout supports at most ${config.maxExitCount} exits`);
  }

  const ordered = [...targets].sort(
    (a, b) => a.lane - b.lane || a.nodeId.localeCompare(b.nodeId),
  );
  const normalizedSlots = centeredSlots(ordered.length, config);
  const x = room.x + room.width - config.edgeInset;

  return ordered.map((target, slotIndex) => {
    if (!target.nodeId || !Number.isFinite(target.lane)) {
      throw new Error('Room portal target requires a node id and finite lane');
    }
    const normalizedY = normalizedSlots[slotIndex];
    return {
      targetNodeId: target.nodeId,
      targetLane: target.lane,
      side: 'right',
      slotIndex,
      normalizedY,
      x,
      y: room.y + room.height * normalizedY,
    };
  });
}

/** Creates the transition payload that R3 can carry between rooms. */
export function toArrivalContext(
  fromNodeId: string,
  exit: RoomExitPlacement,
): RoomArrivalContext {
  if (!fromNodeId) throw new Error('Arrival context requires a source node id');
  return {
    fromNodeId,
    toNodeId: exit.targetNodeId,
  };
}

/**
 * Places the arrival portal on the left and the player just inside it.
 * Arrival always uses the vertical center so every room shares one safe entry
 * contract regardless of how many choices the previous room displayed.
 */
export function layoutRoomArrival(
  room: RoomBounds,
  context: RoomArrivalContext,
  config: Readonly<RoomPortalLayoutConfig> = DEFAULT_ROOM_PORTAL_LAYOUT,
): RoomArrivalPlacement {
  assertRoom(room);
  assertConfig(config);
  if (!context.fromNodeId || !context.toNodeId) {
    throw new Error('Arrival context requires source and target node ids');
  }

  const normalizedY = 0.5;
  const portalX = room.x + config.edgeInset;
  const y = room.y + room.height * normalizedY;

  return {
    fromNodeId: context.fromNodeId,
    side: 'left',
    normalizedY,
    portal: { x: portalX, y },
    playerSpawn: {
      x: portalX + config.playerSpawnInwardOffset,
      y,
    },
  };
}

function centeredSlots(
  count: number,
  config: Readonly<RoomPortalLayoutConfig>,
): number[] {
  const center = 0.5;
  const first = center - ((count - 1) * config.slotGapRatio) / 2;
  return Array.from({ length: count }, (_, index) => (
    clamp(
      first + index * config.slotGapRatio,
      config.verticalMarginRatio,
      1 - config.verticalMarginRatio,
    )
  ));
}

function assertRoom(room: RoomBounds): void {
  if (
    !Number.isFinite(room.x)
    || !Number.isFinite(room.y)
    || !Number.isFinite(room.width)
    || !Number.isFinite(room.height)
    || room.width <= 0
    || room.height <= 0
  ) {
    throw new Error('Room bounds must be finite with positive width and height');
  }
}

function assertConfig(config: Readonly<RoomPortalLayoutConfig>): void {
  if (
    !Number.isFinite(config.slotGapRatio)
    || config.slotGapRatio <= 0
    || !Number.isFinite(config.verticalMarginRatio)
    || config.verticalMarginRatio < 0
    || config.verticalMarginRatio >= 0.5
    || !Number.isFinite(config.edgeInset)
    || config.edgeInset < 0
    || !Number.isFinite(config.playerSpawnInwardOffset)
    || config.playerSpawnInwardOffset < 0
    || !Number.isInteger(config.maxExitCount)
    || config.maxExitCount < 1
  ) {
    throw new Error('Invalid room portal layout config');
  }

  const requiredSpan = (config.maxExitCount - 1) * config.slotGapRatio;
  const availableSpan = 1 - config.verticalMarginRatio * 2;
  if (requiredSpan > availableSpan) {
    throw new Error('Room portal slots do not fit inside the configured margins');
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

