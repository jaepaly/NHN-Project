import { FLOOR_HAZARD_CONFIG, spellCountersHazard } from './floorHazardConfig';
import type { FloorHazardKind } from './floorHazardConfig';
import type { SpellEffect, SpellElement } from '../../spell/types';

/**
 * 바닥형 지형에 대한 **플레이어 쪽 상태** (#214 지형 Tier 1 Step 4~5 — #239 축소안).
 *
 * R2가 config(#237)에 `lingerSeconds`·`cleansesPerRoom`·`immunitySeconds`·
 * `spellCountersHazard`를 이미 정의해뒀지만 배선이 없어서, 용암과 독지대의 차이가
 * **틱 피해 숫자뿐**이었다(6 vs 2). 독지대의 정체성(이탈 후 잔류)도, 원소 선택의
 * 의미(카운터플레이)도 없었다. 이 모듈이 그 둘을 채운다.
 *
 * ⚠️ **정화를 "상태이상 해제"가 아니라 "그 지형에 N초 면역"으로 정의한다** (#239 결정).
 * 원안은 플레이어 디버프 서브시스템(화상·약화·슬로우)을 먼저 짓고 그 위에 해제를
 * 얹는 것이었는데, 그러면 상태 목록·중첩 규칙에 **HUD 표시**까지 따라온다 —
 * 자기한테 뭐가 걸렸는지 못 보면 디버프는 "이유 없이 아픈 것"이 된다.
 * 면역으로 정의하면 플레이어 체감("얼음 갑옷을 둘렀더니 용암이 안 아프다")은 같으면서
 * 새 서브시스템이 필요 없다. 해제할 디버프가 없을 뿐이다.
 */

export const FLOOR_HAZARD_KINDS: readonly FloorHazardKind[] = ['lava', 'poison'];

export interface FloorHazardPlayerState {
  /** 종류별 잔류 도트 남은 시간 — 존을 나와도 이만큼 더 아프다 (용암 0, 독 2) */
  linger: Record<FloorHazardKind, number>;
  /** 종류별 면역 남은 시간 — 정화 성공의 보상 */
  immunity: Record<FloorHazardKind, number>;
  /** 이번 방에서 쓴 정화 횟수 — 밟을 때마다 정화하면 위협이 무의미해진다 */
  cleansesUsed: number;
}

export function createFloorHazardPlayerState(): FloorHazardPlayerState {
  return {
    linger: { lava: 0, poison: 0 },
    immunity: { lava: 0, poison: 0 },
    cleansesUsed: 0,
  };
}

function clone(state: FloorHazardPlayerState): FloorHazardPlayerState {
  return {
    linger: { ...state.linger },
    immunity: { ...state.immunity },
    cleansesUsed: state.cleansesUsed,
  };
}

function safeSeconds(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

/** 타이머 감소 — 씬의 **스케일된 게임 시간**으로 부른다 (영창 슬로모 중엔 같이 느려진다). */
export function advanceFloorHazardTimers(
  state: FloorHazardPlayerState,
  deltaSeconds: number,
): FloorHazardPlayerState {
  const delta = safeSeconds(deltaSeconds);
  const next = clone(state);
  for (const kind of FLOOR_HAZARD_KINDS) {
    next.linger[kind] = Math.max(0, safeSeconds(next.linger[kind]) - delta);
    next.immunity[kind] = Math.max(0, safeSeconds(next.immunity[kind]) - delta);
  }
  return next;
}

export function isFloorHazardImmune(
  state: FloorHazardPlayerState,
  kind: FloorHazardKind,
): boolean {
  return safeSeconds(state.immunity[kind]) > 0;
}

/**
 * 이번 틱에 실제로 피해를 받는 지형 종류 + 갱신된 상태.
 *
 * 밟고 있으면 잔류를 가득 채우고, 나와도 잔류가 남아 있으면 계속 아프다.
 * 면역 중에는 밟아도 잔류가 채워지지 않고 피해도 없다 — 그게 정화의 값어치다.
 */
export function floorHazardTickKinds(
  state: FloorHazardPlayerState,
  insideKinds: readonly FloorHazardKind[],
): { kinds: FloorHazardKind[]; state: FloorHazardPlayerState } {
  const next = clone(state);
  const kinds: FloorHazardKind[] = [];
  for (const kind of FLOOR_HAZARD_KINDS) {
    if (isFloorHazardImmune(next, kind)) {
      next.linger[kind] = 0;
      continue;
    }
    if (insideKinds.includes(kind)) {
      next.linger[kind] = FLOOR_HAZARD_CONFIG[kind].lingerSeconds;
      kinds.push(kind);
    } else if (safeSeconds(next.linger[kind]) > 0) {
      kinds.push(kind);
    }
  }
  return { kinds, state: next };
}

export interface FloorHazardCleanseResult {
  state: FloorHazardPlayerState;
  /** 이번 시전으로 정화된 종류 (빈 배열이면 아무것도 안 걸렸고 횟수도 안 쓴다) */
  cleansed: FloorHazardKind[];
}

/**
 * 시전한 주문이 이 방의 지형을 정화하는가 (#237 `spellCountersHazard` 규칙 사용).
 *
 * **방에 없는 지형은 정화하지 않는다** — 아무 효과도 없이 횟수만 태우면 억울하다.
 * 반대로 밟기 **전에** 미리 두르는 것은 허용한다(그게 더 영리한 플레이다).
 * 하나도 안 걸리면 횟수를 소모하지 않는다.
 */
export function tryCleanseFloorHazards(
  state: FloorHazardPlayerState,
  element: SpellElement,
  effect: SpellEffect,
  presentKinds: readonly FloorHazardKind[],
): FloorHazardCleanseResult {
  if (state.cleansesUsed >= FLOOR_HAZARD_CONFIG.cleansesPerRoom) {
    return { state, cleansed: [] };
  }
  const cleansed = FLOOR_HAZARD_KINDS.filter(
    (kind) => presentKinds.includes(kind) && spellCountersHazard(element, effect, kind),
  );
  if (cleansed.length === 0) return { state, cleansed: [] };

  const next = clone(state);
  for (const kind of cleansed) {
    next.linger[kind] = 0;
    next.immunity[kind] = FLOOR_HAZARD_CONFIG.immunitySeconds;
  }
  next.cleansesUsed += 1;
  return { state: next, cleansed };
}

/** 정화 횟수가 남았는가 — HUD·안내 문구 분기에 쓴다. */
export function floorHazardCleansesRemaining(state: FloorHazardPlayerState): number {
  return Math.max(0, FLOOR_HAZARD_CONFIG.cleansesPerRoom - state.cleansesUsed);
}
