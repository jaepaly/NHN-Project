export interface RoomBackdropPalette {
  base: number;
  grid: number;
  gridAlpha: number;
  /** AI 배경 이미지에 얹는 스테이지 색조 틴트 — 전용 배경 생성 전까지 한 이미지로 변화를 준다 */
  bgTint: number;
}

export const ROOM_BACKDROP_PALETTES = {
  stage1: { base: 0x050711, grid: 0x24366f, gridAlpha: 0.42, bgTint: 0xffffff },
  stage2: { base: 0x0b0718, grid: 0x4b2b70, gridAlpha: 0.48, bgTint: 0xd0b8ff },
  boss: { base: 0x17060d, grid: 0x7a2341, gridAlpha: 0.58, bgTint: 0xffbcbc },
} as const satisfies Record<string, RoomBackdropPalette>;

export function backdropPaletteForEncounter(
  stage: 1 | 2,
  isBoss: boolean,
): RoomBackdropPalette {
  if (isBoss) return ROOM_BACKDROP_PALETTES.boss;
  return stage === 1 ? ROOM_BACKDROP_PALETTES.stage1 : ROOM_BACKDROP_PALETTES.stage2;
}

/** 현재 3방 프로토타입에서 일반 방은 단계별 색조, 마지막 방은 보스 색조를 사용한다. */
export function backdropPaletteForRoom(
  roomIndex: number,
  maxRooms: number,
): RoomBackdropPalette {
  const safeRoom = Number.isFinite(roomIndex) ? Math.max(1, Math.floor(roomIndex)) : 1;
  const safeMax = Number.isFinite(maxRooms) ? Math.max(1, Math.floor(maxRooms)) : 1;
  if (safeRoom >= safeMax) return ROOM_BACKDROP_PALETTES.boss;
  return safeRoom === 1
    ? ROOM_BACKDROP_PALETTES.stage1
    : ROOM_BACKDROP_PALETTES.stage2;
}
