import type { EncounterDefinition } from '../../run/runContract';

export type RoomCurseKind = 'silence' | 'blackout' | 'word-limit' | 'heatwave';

/** A trap node's active curse and the encounter stage it belongs to. */
export interface RoomCurseAssignment {
  roomIndex: number;
  stage: EncounterDefinition['stage'];
  kind: RoomCurseKind;
}

export const ROOM_CURSE_CONFIG = {
  silenceRadius: 185,
  /** Fraction of the normal passive mana drain applied by silence. */
  silenceManaDrainRatio: 0.05,
  blackoutVisionRadius: 95,
  blackoutIlluminationSeconds: 4,
} as const;

export function isInsideCurseCircle(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  radius: number,
): boolean {
  if (![x, y, centerX, centerY, radius].every(Number.isFinite) || radius < 0) return false;
  const dx = x - centerX;
  const dy = y - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

export function silenceManaDrainPerSecond(maxMana: number): number {
  if (!Number.isFinite(maxMana) || maxMana <= 0) return 0;
  return maxMana * ROOM_CURSE_CONFIG.silenceManaDrainRatio;
}
