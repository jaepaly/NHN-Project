import type { MapNodeKind } from '../run/mapGraphContract';

/**
 * 다음 경로 선택 DOM과 Phaser 미니맵이 공유하는 방 특성 아이콘입니다.
 *
 * 위험·보상 수치를 직접 표시하지 않고 방의 경험을 실루엣으로 전달합니다. 시작 노드는
 * 선택 대상이 아니므로 전용 아이콘 없이 기존 시작점 도형을 유지합니다.
 */
export const ROOM_ICON_KINDS = [
  'combat',
  'elite',
  'trap',
  'treasure',
  'altar',
  'stage-boss',
  'memory-boss',
] as const satisfies readonly MapNodeKind[];

export type RoomIconKind = typeof ROOM_ICON_KINDS[number];

const SVG_BY_KIND: Record<RoomIconKind, string> = {
  combat: iconSvg(`
    <g stroke="#aaa1c8">
      <path d="M14 11l8 3 28 31-5 5-31-28z" fill="#aaa1c8" fill-opacity=".2"/>
      <path d="M50 11l-8 3-28 31 5 5 31-28z" fill="#aaa1c8" fill-opacity=".2"/>
      <path d="M12 19l9-8M43 53l9-8M52 19l-9-8M21 53l-9-8"/>
    </g>`),
  elite: iconSvg(`
    <path d="M15 28c2-12 9-18 17-18s15 6 17 18l-5 22-12 7-12-7z" stroke="#c26f49" fill="#c26f49" fill-opacity=".2"/>
    <path d="M20 31h24M24 37l5 3M40 37l-5 3M32 31v19" stroke="#e0a070"/>
    <path d="M20 15l3-10 9 7 9-7 3 10z" stroke="#e2b95f" fill="#e2b95f" fill-opacity=".48"/>`),
  trap: iconSvg(`
    <path d="M8 49h48M10 55h44" stroke="#72aa98"/>
    <path d="M11 47l7-23 7 23M25 47l7-34 7 34M39 47l7-23 7 23" stroke="#8e79a8" fill="#8e79a8" fill-opacity=".22"/>
    <path d="M10 15l8-6M54 15l-8-6" stroke="#72aa98"/>`),
  treasure: iconSvg(`
    <g stroke="#d2aa58">
      <path d="M8 28h48v25H8z" fill="#d2aa58" fill-opacity=".14"/>
      <path d="M8 28l6-15h36l6 15M8 38h48M26 38h12v11H26z"/>
    </g>
    <path d="M32 13l9 10-9 11-9-11z" stroke="#8fe3e0" fill="#63c9c9" fill-opacity=".58"/>`),
  altar: iconSvg(`
    <g stroke="#8f78a6">
      <path d="M10 34h44c-3 11-10 16-22 16S13 45 10 34z" fill="#8f78a6" fill-opacity=".24"/>
      <path d="M22 50h20M18 56h28"/>
    </g>
    <path d="M32 6c9 10 9 17 0 24-9-7-9-14 0-24z" stroke="#d0a6e2" fill="#b477cf" fill-opacity=".58"/>
    <path d="M15 28v-8M49 28v-8" stroke="#c5a466"/>`),
  'stage-boss': bossSvg(`
    <path d="M15 49V19h34v30M22 49V27h20v22M27 49V32M37 49V32" stroke="#8d7f91" fill="#8d7f91" fill-opacity=".14"/>
    <path d="M32 25l10 6-2 13-8 7-8-7-2-13z" stroke="#d8bb72" fill="#d8bb72" fill-opacity=".18"/>
    <path d="M32 31v13M27 36h10" stroke="#d8bb72"/>`),
  'memory-boss': bossSvg(`
    <path d="M10 35c11-14 33-14 44 0-11 14-33 14-44 0z" stroke="#d8bb72" fill="#d8bb72" fill-opacity=".12"/>
    <circle cx="32" cy="35" r="8" stroke="#b94f68" fill="#b94f68" fill-opacity=".36"/>
    <circle cx="32" cy="35" r="2.5" fill="#d8bb72" stroke="none"/>
    <path d="M22 17l3-10 7 6 7-6 3 10z" stroke="#d8bb72" fill="#d8bb72" fill-opacity=".34"/>
    <path d="M22 48l4-5M42 48l-4-5" stroke="#a9465e"/>`),
};

export function roomIconTextureKey(kind: MapNodeKind): string | null {
  return isRoomIconKind(kind) ? `room-kind-icon-${kind}` : null;
}

export function roomIconDataUri(kind: MapNodeKind): string | null {
  if (!isRoomIconKind(kind)) return null;
  // Phaser의 SVG loader에서 이미 검증된 폼 글리프와 같은 형식을 사용한다.
  // percent-encoded URI는 DOM에서는 표시되어도 씬 preload가 멈출 수 있다.
  return `data:image/svg+xml;base64,${btoa(SVG_BY_KIND[kind])}`;
}

export function allRoomIconTextures(): Array<{ key: string; dataUri: string }> {
  return ROOM_ICON_KINDS.map((kind) => ({
    key: roomIconTextureKey(kind)!,
    dataUri: roomIconDataUri(kind)!,
  }));
}

function isRoomIconKind(kind: MapNodeKind): kind is RoomIconKind {
  return (ROOM_ICON_KINDS as readonly MapNodeKind[]).includes(kind);
}

function iconSvg(content: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;
}

function bossSvg(content: string): string {
  return iconSvg(`
    <path d="M32 5l7 5 9-1 3 8 7 6-4 9 4 9-7 6-3 8-9-1-7 5-7-5-9 1-3-8-7-6 4-9-4-9 7-6 3-8 9 1z" stroke="#a9465e"/>
    <path d="M32 10l7 4 8 1 2 8 4 9-4 9-2 8-8 1-7 4-7-4-8-1-2-8-4-9 4-9 2-8 8-1z" stroke="#7c2f43"/>
    ${content}`);
}
