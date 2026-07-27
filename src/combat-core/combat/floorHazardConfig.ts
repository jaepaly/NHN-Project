/**
 * 바닥형 지형 (#214 지형 Tier 1 — R2, 2026-07-27).
 *
 * 방 바닥에 깔리는 **지속 피해 장판**. 정적 장벽(Tier 2, terrainBarrier)이 "막는 것"이라면
 * 이건 "밟으면 아픈 것"이다 — 기존 장판 틱·화상 DOT 문법을 물려받아 플레이어가
 * "저 위엔 오래 못 서 있다"를 이미 아는 상태로 만난다.
 *
 * 이 모듈은 **순수 config + 판정 로직만** 제공한다. 배치 좌표는 R1 프리셋 소유,
 * 렌더·틱 루프·플레이어 위치 체크(씬 배선)는 별도(ProtoScene, #236 terrainBarrier 패턴).
 *
 * ⚠️ **placeholder 수치** — 초당 피해·틱 간격·잔류는 총괄·이도원 밸런스 튜닝 대상.
 */

export type FloorHazardKind = 'lava' | 'poison';

export const FLOOR_HAZARD_CONFIG = {
  /** 틱 간격(초) — 이 간격마다 밟고 있으면 피해가 들어간다. 공통. */
  tickIntervalSeconds: 0.5,
  /** 용암 — 해저드 리스킨(주황). 밟으면 확실히 아파 빠지게 만든다. 잔류 없음. */
  lava: {
    damagePerSecond: 12,
    lingerSeconds: 0,
  },
  /** 독지대 — 피해는 낮지만 **이탈 후에도 도트가 잔류**한다(초록). */
  poison: {
    damagePerSecond: 4,
    lingerSeconds: 2,
  },
} as const;

/** 한 틱에 들어가는 피해 = 초당 피해 × 틱 간격. (용암 > 독지대) */
export function floorHazardTickDamage(kind: FloorHazardKind): number {
  return Math.round(
    FLOOR_HAZARD_CONFIG[kind].damagePerSecond * FLOOR_HAZARD_CONFIG.tickIntervalSeconds,
  );
}

/** 존을 벗어난 뒤 도트가 잔류하는 시간(초). 용암=0(즉시 멈춤), 독지대=2. */
export function floorHazardLingerSeconds(kind: FloorHazardKind): number {
  return FLOOR_HAZARD_CONFIG[kind].lingerSeconds;
}

/**
 * 지형 존 하나 — 원형 장판(중심 + 반경). 배치(좌표·반경)는 R1 프리셋이 정한다.
 * (사각 타일이 필요하면 별도 shape를 추가 — 지금은 "존" 기본형인 원.)
 */
export interface FloorHazardZone {
  kind: FloorHazardKind;
  x: number;
  y: number;
  radius: number;
}

/** 점(플레이어 위치)이 지형 존 안인가 — 원형 판정. */
export function isInFloorHazard(px: number, py: number, zone: FloorHazardZone): boolean {
  const dx = px - zone.x;
  const dy = py - zone.y;
  return dx * dx + dy * dy <= zone.radius * zone.radius;
}
