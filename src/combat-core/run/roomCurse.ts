import type { EncounterDefinition } from '../../run/runContract';
import type { CurseBehaviorMemory } from '../../spell/runMemory';

export type RoomCurseKind = 'silence' | 'blackout';
export type RoomCurseCategory = 'movement' | 'element' | 'casting';

export const ROOM_CURSE_CATEGORY_BY_KIND = {
  silence: 'movement',
  blackout: 'element',
} as const satisfies Record<RoomCurseKind, RoomCurseCategory>;

export const ROOM_CURSE_POOL_BY_CATEGORY = {
  movement: ['silence'],
  element: ['blackout'],
  casting: [],
} as const satisfies Record<RoomCurseCategory, readonly RoomCurseKind[]>;

export interface RoomCurseAssignment {
  roomIndex: number;
  stage: EncounterDefinition['stage'];
  kind: RoomCurseKind;
}

export interface RoomCursePlan {
  /** 이번 런에서 카테고리별로 선택된 저주. 현재는 이동/원소 각 1종이다. */
  selectedKinds: Readonly<Partial<Record<RoomCurseCategory, RoomCurseKind>>>;
  /** 직전 런 행동으로 계산한 저주 후보별 우선도. */
  curseWeights: Readonly<Record<RoomCurseKind, number>>;
  assignments: readonly RoomCurseAssignment[];
}

export const ROOM_CURSE_BEHAVIOR_CONFIG = {
  movementReferenceDistance: 12_000,
  minimumManualCasts: 5,
  neutralWeight: 0.5,
} as const;

export const ROOM_CURSE_CONFIG = {
  roomRatio: 0.4,
  maxCategoriesPerRun: 2,
  silenceRadius: 185,
  /** 결계 밖 초당 최대 마나 침식 비율. 기본 재생 2/s를 넘겨 실제로 천천히 감소한다. */
  silenceManaDrainRatio: 0.05,
  blackoutVisionRadius: 95,
  blackoutIlluminationSeconds: 4,
} as const;

/**
 * 스테이지별 적용 가능 전투방의 약 40%를 저주방으로 뽑는다.
 * 최소 한 방은 정상 규칙으로 남기며, 같은 난수열이면 같은 계획을 돌려준다.
 *
 * 현재 플레이 가능한 저주는 침묵뿐이다. 암전이 완성되면 candidates만 확장하고
 * 주/보조 1:1 배분은 이 계획 계층에서 담당한다.
 */
export function createRoomCursePlan(
  encounters: readonly EncounterDefinition[],
  gimmicksUnlocked: boolean,
  rand: () => number,
  pools: Readonly<Partial<Record<RoomCurseCategory, readonly RoomCurseKind[]>>>
    = ROOM_CURSE_POOL_BY_CATEGORY,
  behavior?: CurseBehaviorMemory,
): RoomCursePlan {
  const curseWeights = roomCurseWeights(behavior);
  if (!gimmicksUnlocked) {
    return { selectedKinds: {}, curseWeights, assignments: [] };
  }

  const selectedKinds = selectRoomCursesByCategory(pools, curseWeights, rand);
  const candidates = Object.values(selectedKinds).filter(
    (kind): kind is RoomCurseKind => kind !== undefined,
  );
  if (candidates.length === 0) return { selectedKinds, curseWeights, assignments: [] };

  const assignments: RoomCurseAssignment[] = [];
  const stages = [...new Set(encounters.map((encounter) => encounter.stage))];
  let curseIndex = 0;

  for (const stage of stages) {
    const eligible = encounters
      .map((encounter, index) => ({ encounter, roomIndex: index + 1 }))
      .filter(({ encounter }) => encounter.stage === stage);
    if (eligible.length <= 1) continue;

    const count = Math.min(
      eligible.length - 1,
      Math.max(1, Math.round(eligible.length * ROOM_CURSE_CONFIG.roomRatio)),
    );
    shuffleInPlace(eligible, rand);
    for (let index = 0; index < count; index += 1) {
      const selected = eligible[index];
      assignments.push({
        roomIndex: selected.roomIndex,
        stage,
        kind: candidates[curseIndex % candidates.length],
      });
      curseIndex += 1;
    }
  }

  return {
    selectedKinds,
    curseWeights,
    assignments: assignments.sort((a, b) => a.roomIndex - b.roomIndex),
  };
}

/** 직전 런 행동을 각 저주 후보의 0~1 우선도로 정규화한다. */
export function roomCurseWeights(
  behavior?: CurseBehaviorMemory,
): Record<RoomCurseKind, number> {
  if (!behavior) {
    return {
      silence: ROOM_CURSE_BEHAVIOR_CONFIG.neutralWeight,
      blackout: ROOM_CURSE_BEHAVIOR_CONFIG.neutralWeight,
    };
  }
  return {
    silence: clamp01(
      behavior.movementDistance / ROOM_CURSE_BEHAVIOR_CONFIG.movementReferenceDistance,
    ),
    blackout: behavior.manualCastCount < ROOM_CURSE_BEHAVIOR_CONFIG.minimumManualCasts
      ? ROOM_CURSE_BEHAVIOR_CONFIG.neutralWeight
      : 1 - clamp01(behavior.lightFireCastCount / behavior.manualCastCount),
  };
}

/** 가중치가 한 행동 축에 몰려도 다른 축의 저주 후보를 잠식하지 않도록 카테고리별로 뽑는다. */
export function selectRoomCursesByCategory(
  pools: Readonly<Partial<Record<RoomCurseCategory, readonly RoomCurseKind[]>>>,
  weights: Readonly<Record<RoomCurseKind, number>>,
  rand: () => number,
): Partial<Record<RoomCurseCategory, RoomCurseKind>> {
  const selected: Partial<Record<RoomCurseCategory, RoomCurseKind>> = {};
  const candidatesByCategory = new Map<RoomCurseCategory, readonly RoomCurseKind[]>();
  for (const category of ['movement', 'element', 'casting'] as const) {
    const candidates = (pools[category] ?? []).filter(
      (kind) => ROOM_CURSE_CATEGORY_BY_KIND[kind] === category,
    );
    if (candidates.length > 0) candidatesByCategory.set(category, candidates);
  }

  const categories = selectRoomCurseCategories(
    [...candidatesByCategory.keys()],
    rand,
  );
  for (const category of categories) {
    const candidates = candidatesByCategory.get(category) ?? [];
    selected[category] = selectHighestWeightedCurse(candidates, weights, rand);
  }
  return selected;
}

export function selectHighestWeightedCurse(
  candidates: readonly RoomCurseKind[],
  weights: Readonly<Record<RoomCurseKind, number>>,
  rand: () => number,
): RoomCurseKind {
  return candidates
    .map((kind) => ({ kind, weight: clamp01(weights[kind]), tieBreak: clampRandom(rand()) }))
    .sort((a, b) => b.weight - a.weight || a.tieBreak - b.tieBreak)[0].kind;
}

/** 후보가 있는 행동 축 중 가중치가 높은 축을 런 상한만큼 선택한다. 동점은 결정적 난수로 해소한다. */
export function selectRoomCurseCategories(
  available: readonly RoomCurseCategory[],
  rand: () => number,
  limit = ROOM_CURSE_CONFIG.maxCategoriesPerRun,
): RoomCurseCategory[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  const unique = [...new Set(available)];
  shuffleInPlace(unique, rand);
  return unique.slice(0, safeLimit);
}

export function curseForRoom(
  plan: RoomCursePlan,
  roomIndex: number,
): RoomCurseAssignment | null {
  return plan.assignments.find((assignment) => assignment.roomIndex === roomIndex) ?? null;
}

/** Phaser 없이도 영창 허용 경계를 회귀 검증할 수 있는 원 판정. */
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

function shuffleInPlace<T>(values: T[], rand: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.min(index, Math.floor(clampRandom(rand()) * (index + 1)));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
}

function clampRandom(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999999999, Math.max(0, value));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
