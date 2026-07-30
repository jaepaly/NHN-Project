import type { MapNodeKind } from '../run/mapGraphContract';

export interface RoomBackdropPalette {
  base: number;
  grid: number;
  gridAlpha: number;
  /** AI 배경 이미지에 얹는 스테이지 색조 틴트 — 전용 배경 생성 전까지 한 이미지로 변화를 준다 */
  bgTint: number;
}

export const ROOM_BACKDROP_PALETTES = {
  stage1: { base: 0x050711, grid: 0x24366f, gridAlpha: 0.42, bgTint: 0xffffff },
  // stage2도 전용 배경(bg-stage2, 부패한 보라 아케인)이 생겨 틴트 없이 아트 그대로 보여준다 (#72).
  // 로드 실패로 stage1 이미지로 폴백하는 경우엔 보라감이 빠지지만, 전용 배경이 정상 경로다.
  stage2: { base: 0x0b0718, grid: 0x4b2b70, gridAlpha: 0.48, bgTint: 0xffffff },
  // 보스는 전용 배경(bg-boss)이 있으므로 틴트를 걸지 않고 아트 그대로 보여준다
  boss: { base: 0x17060d, grid: 0x7a2341, gridAlpha: 0.58, bgTint: 0xffffff },
} as const satisfies Record<string, RoomBackdropPalette>;

/**
 * 방 종류별 배경 (총괄 지적: "맵 유형 별로 배경을 다르게 해야하지 않을까?").
 *
 * 종전엔 `stage + isBoss` 세 가지뿐이라 **정예·함정·보물·제단이 전부 그 스테이지의 일반
 * 방과 똑같이 생겼다.** 포탈 라벨을 보고 고른 방이 들어가 보니 구분이 안 되면 선택이
 * 무의미해 보인다 — #266에서 "포탈이 거짓말한다"고 고친 것과 같은 종류의 문제다.
 *
 * ⚠️ **새 배경 아트를 만들지 않는다.** 프리즈가 가까워 이미지 생성은 위험하고, 있는
 * 세 장(bg-stage1·bg-stage2·bg-boss) 위에 **바탕색·격자·틴트** 세 채널로 구분한다.
 * `bgTint`가 원래 그 용도로 있던 채널이다.
 *
 * 색은 장식이 아니라 **정보**다:
 *  - 안전한 방(보물·제단)은 **밝다** — 싸울 것이 없다는 게 한눈에 읽힌다
 *  - 적대적인 방(정예·보스)은 **어둡다** — 경계 신호
 *  - 회귀가 "안전한 방이 적대적인 방보다 밝다"와 "여덟 종류가 서로 다르다"를 고정한다
 */
export const ROOM_KIND_BACKDROPS = {
  /** 시작 방 — 스테이지 기본. 기준점이라 특징이 없는 게 특징이다 */
  start: { base: 0x050711, grid: 0x24366f, gridAlpha: 0.42, bgTint: 0xffffff },
  /** 일반 전투 — 스테이지 기본 (스테이지로 한 번 더 갈린다) */
  combat: { base: 0x050711, grid: 0x24366f, gridAlpha: 0.42, bgTint: 0xffffff },
  /** 정예 — 붉은 위압. 격자를 진하게 해 공간이 조여드는 느낌 */
  elite: { base: 0x140609, grid: 0x8f3a2e, gridAlpha: 0.55, bgTint: 0xffc9b8 },
  /** 함정 — 독기 청록. 격자를 흐리게 해 "바닥이 안 보인다"는 불안 */
  trap: { base: 0x081a14, grid: 0x2e8f6a, gridAlpha: 0.34, bgTint: 0xbdf0d8 },
  /** 보물 — 금빛. 여덟 중 **가장 밝다**. 싸울 것이 없다는 신호 */
  treasure: { base: 0x2a2110, grid: 0xb08a2e, gridAlpha: 0.5, bgTint: 0xffe9b0 },
  /** 제단 — 자주. 밝지만 차갑다 — 안전하되 값을 치르는 곳 */
  altar: { base: 0x1e1130, grid: 0x7d4bb8, gridAlpha: 0.5, bgTint: 0xe3c8ff },
  /** 수문장 — 보스 계열 */
  'stage-boss': { base: 0x17060d, grid: 0x7a2341, gridAlpha: 0.58, bgTint: 0xffffff },
  /** 기억의 주인 — 최종. 가장 어둡다 */
  'memory-boss': { base: 0x0d0310, grid: 0x8f2352, gridAlpha: 0.62, bgTint: 0xffffff },
} as const satisfies Record<MapNodeKind, RoomBackdropPalette>;

/** 지각 밝기 (0~1, ITU-R BT.601) — 회귀가 "안전한 방이 더 밝다"를 검사하는 데 쓴다 */
export function backdropBrightness(palette: RoomBackdropPalette): number {
  const r = (palette.base >> 16) & 0xff;
  const g = (palette.base >> 8) & 0xff;
  const b = palette.base & 0xff;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * 노드 종류 → 배경. 일반 전투·시작 방은 **스테이지로 한 번 더** 갈린다
 * (그 둘은 종류로 구분할 특징이 없고, 스테이지 진행감이 그 자리를 대신한다).
 */
export function backdropPaletteForNode(
  kind: MapNodeKind,
  stage: 1 | 2,
): RoomBackdropPalette {
  if (kind === 'combat' || kind === 'start') {
    return stage === 2 ? ROOM_BACKDROP_PALETTES.stage2 : ROOM_BACKDROP_PALETTES.stage1;
  }
  return ROOM_KIND_BACKDROPS[kind];
}

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
