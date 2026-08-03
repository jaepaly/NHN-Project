import type {
  TrapProfileKind,
  TrapRoomProfile,
  TrapSafeCorridor,
} from './mapGraphContract';

/**
 * 위험지대/저주방 통합 프로필의 R1 소유 정의입니다.
 * 실제 Phaser 필드 생성과 MapGraph trapProfile 소비는 R3 통합부가 담당합니다.
 */
export const TRAP_ROOM_PROFILES: Readonly<Record<TrapProfileKind, TrapRoomProfile>> = {
  hazard: {
    kind: 'hazard',
    safeCorridor: { shape: 'cross', halfWidth: 64 },
  },
  silence: {
    kind: 'silence',
    safeCorridor: { shape: 'cross', halfWidth: 64 },
  },
  blackout: { kind: 'blackout' },
  'word-limit': { kind: 'word-limit' },
  heatwave: { kind: 'heatwave' },
};

/** 위험지대 함정방의 원형 장판 반경. 배치·통로 검증도 같은 값으로 계산한다. */
export const TRAP_HAZARD_CIRCLE_RADIUS = 120;

/** 십자 통로 사이의 사분면에만 장판을 두어 네 방향 진입로를 모두 보존한다. */
export const TRAP_HAZARD_CIRCLE_OFFSETS = [
  [-260, -220],
  [260, -220],
  [260, 220],
] as const;

/** 기존 RoomCurseKind를 trap 노드 프로필로 보존 이관할 때 쓰는 명시적 매핑입니다. */
export function trapProfileFromLegacyCurse(kind: 'silence' | 'blackout' | 'word-limit' | 'heatwave'): TrapRoomProfile {
  return cloneTrapProfile(TRAP_ROOM_PROFILES[kind]);
}

/** DEV에서만 첫 전투방에 특정 함정 프로필을 강제하는 임시 플레이테스트 훅입니다. */
export function debugTrapProfileFromEnv(): TrapRoomProfile | null {
  const env = import.meta.env;
  if (!env?.DEV) return null;
  const requested = env.VITE_DEBUG_TRAP_PROFILE;
  if (!isTrapProfileKind(requested)) return null;
  return cloneTrapProfile(TRAP_ROOM_PROFILES[requested]);
}

function isTrapProfileKind(value: unknown): value is TrapProfileKind {
  return value === 'hazard'
    || value === 'silence'
    || value === 'blackout'
    || value === 'word-limit'
    || value === 'heatwave';
}

/**
 * 십자 통로는 방 중앙을 상하·좌우로 관통합니다.
 * 함정의 안전 구역이지 적 투사체나 일반 공격까지 막는 보호막은 아닙니다.
 */
export function isInsideTrapSafeCorridor(
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  corridor: TrapSafeCorridor | undefined,
): boolean {
  if (!corridor) return false;
  const halfWidth = Number.isFinite(corridor.halfWidth)
    ? Math.max(0, corridor.halfWidth)
    : 0;
  return Math.abs(x - centerX) <= halfWidth || Math.abs(y - centerY) <= halfWidth;
}

/** 원형 위험지대가 십자 통로를 침범하지 않는지 확인합니다. */
export function canPlaceTrapHazardCircle(
  x: number,
  y: number,
  radius: number,
  centerX: number,
  centerY: number,
  corridor: TrapSafeCorridor | undefined,
  navigationClearance = 0,
): boolean {
  if (!corridor) return true;
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const safeClearance = Number.isFinite(navigationClearance)
    ? Math.max(0, navigationClearance)
    : 0;
  const protectedHalfWidth = Math.max(0, corridor.halfWidth)
    + safeRadius
    + safeClearance;
  return Math.abs(x - centerX) > protectedHalfWidth
    && Math.abs(y - centerY) > protectedHalfWidth;
}

export interface TrapHazardCirclePlacement {
  x: number;
  y: number;
  radius: number;
}

export function trapHazardCirclePlacements(
  centerX: number,
  centerY: number,
  corridor: TrapSafeCorridor | undefined,
  navigationClearance: number,
): TrapHazardCirclePlacement[] {
  return TRAP_HAZARD_CIRCLE_OFFSETS
    .map(([offsetX, offsetY]) => ({
      x: centerX + offsetX,
      y: centerY + offsetY,
      radius: TRAP_HAZARD_CIRCLE_RADIUS,
    }))
    .filter((placement) => canPlaceTrapHazardCircle(
      placement.x,
      placement.y,
      placement.radius,
      centerX,
      centerY,
      corridor,
      navigationClearance,
    ));
}

export function cloneTrapProfile(profile: TrapRoomProfile): TrapRoomProfile {
  return {
    ...profile,
    safeCorridor: profile.safeCorridor && { ...profile.safeCorridor },
  };
}
