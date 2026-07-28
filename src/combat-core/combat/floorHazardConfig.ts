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

import type { SpellElement, SpellEffect } from '../../spell/types';

export type FloorHazardKind = 'lava' | 'poison';

export const FLOOR_HAZARD_CONFIG = {
  /** 틱 간격(초) — 이 간격마다 밟고 있으면 피해가 들어간다. 공통. */
  tickIntervalSeconds: 0.5,
  /**
   * 정화(cleanse) 방당 허용 횟수 — 남발 방지. 밟을 때마다 정화하면 위협이 무의미해진다.
   * (씬 배선이 방 진입마다 리셋한다) placeholder.
   */
  cleansesPerRoom: 1,
  /** 정화 성공 시 그 지형에 면역인 시간(초) — "아이스워크" 순간. placeholder. */
  immunitySeconds: 3,
  /**
   * 용암 — 해저드 리스킨(주황·fire). 밟으면 확실히 아파 빠지게. 잔류 없음.
   * 카운터: 물·얼음으로 식히거나(원소) 보호막으로 막는다(effect).
   */
  lava: {
    element: 'fire' as SpellElement,
    damagePerSecond: 12,
    lingerSeconds: 0,
    counterElements: ['water', 'ice'] as readonly SpellElement[],
    counterEffects: ['shield'] as readonly SpellEffect[],
  },
  /**
   * 독지대 — 피해 낮음·**이탈 후 도트 잔류**(초록·dark).
   * 카운터: 빛으로 정화하거나(원소) 회복/해독으로 씻는다(effect).
   */
  poison: {
    element: 'dark' as SpellElement,
    damagePerSecond: 4,
    lingerSeconds: 2,
    counterElements: ['light'] as readonly SpellElement[],
    counterEffects: ['heal'] as readonly SpellEffect[],
    // 밟는 동안 거는 디버프 (placeholder) — 약화(주는피해 배율)·둔화(이동속도 배율).
    // 용암엔 없다(화상은 DOT). 틱마다 리프레시되어 이탈 후 debuffSeconds 뒤 사라진다.
    sapMultiplier: 0.75,
    mireMultiplier: 0.6,
    debuffSeconds: 1.5,
  },
} as const;

/** 한 틱에 들어가는 피해 = 초당 피해 × 틱 간격. (용암 > 독지대) */
export function floorHazardTickDamage(kind: FloorHazardKind): number {
  return Math.max(
    1,
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

/**
 * 플레이어가 시전한 주문이 이 지형을 카운터(정화)하는가 — **원소 상성 OR 보호 effect**로 판정.
 *
 * "정확한 단어"가 아니라 판정이 준 element/effect의 **카테고리**로 매칭하므로,
 * `얼음 신발`·`서리 장화`·`물의 보호막`이 전부 용암을 카운터한다("말이 곧 마법"의 강건함).
 * 예: 용암(fire) ← water·ice·shield / 독지대(dark) ← light·heal.
 *
 * 씬은 이 판정이 true이고 정화 쿨(방당 cleansesPerRoom)이 남았을 때만 상태를 해제한다.
 */
export function spellCountersHazard(
  spellElement: SpellElement,
  spellEffect: SpellEffect,
  kind: FloorHazardKind,
): boolean {
  const hazard = FLOOR_HAZARD_CONFIG[kind];
  return hazard.counterElements.includes(spellElement)
    || hazard.counterEffects.includes(spellEffect);
}
