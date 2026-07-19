import type { SpellForm } from '../../spell/types';

export const CHAIN_CONFIG = {
  initialRange: 420,
  jumpRadius: 380,
  maxAdditionalJumps: 3,
  damageMultipliers: [1, 0.75, 0.55, 0.4] as readonly number[],
  segmentDelayMs: 90,
} as const;

export const CAGE_CONFIG = {
  rootDurationSeconds: 2,
  baseRadius: 34,
  indicatorColor: 0x9fe8ff,
} as const;

export interface ChainCandidate {
  x: number;
  y: number;
  alive?: boolean;
}

/**
 * Cage는 투사체 충돌 콜백 없이 대상 위치에서 point impact를 발생시킨다.
 * 따라서 effect와 무관하게 시전 시점의 대상을 고정해야 한다.
 */
export function lockedPointTargetForForm<T>(form: SpellForm, target: T | null): T | null {
  return form === 'cage' ? target : null;
}

/**
 * 최초 대상 뒤 가까운 미적중 대상에 최대 3회 연쇄한다.
 * 같은 객체는 한 경로에서 두 번 선택하지 않으며, 동률은 입력 순서를 유지한다.
 */
export function selectChainTargets<T extends ChainCandidate>(
  originX: number,
  originY: number,
  candidates: readonly T[],
  initialRange = CHAIN_CONFIG.initialRange,
  jumpRadius = CHAIN_CONFIG.jumpRadius,
  maxAdditionalJumps = CHAIN_CONFIG.maxAdditionalJumps,
): T[] {
  const available = candidates.filter((candidate) => candidate.alive !== false);
  const first = nearestWithin(originX, originY, available, initialRange);
  if (!first) return [];

  const selected = [first];
  const used = new Set<T>(selected);
  const safeJumps = Number.isFinite(maxAdditionalJumps)
    ? Math.max(0, Math.floor(maxAdditionalJumps))
    : 0;

  while (selected.length <= safeJumps) {
    const previous = selected[selected.length - 1];
    const next = nearestWithin(
      previous.x,
      previous.y,
      available.filter((candidate) => !used.has(candidate)),
      jumpRadius,
    );
    if (!next) break;
    selected.push(next);
    used.add(next);
  }

  return selected;
}

function nearestWithin<T extends ChainCandidate>(
  fromX: number,
  fromY: number,
  candidates: readonly T[],
  maxDistance: number,
): T | null {
  const safeDistance = Number.isFinite(maxDistance) ? Math.max(0, maxDistance) : 0;
  const maxDistanceSquared = safeDistance * safeDistance;
  let nearest: T | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const dx = candidate.x - fromX;
    const dy = candidate.y - fromY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > maxDistanceSquared || distanceSquared >= nearestDistanceSquared) continue;
    nearest = candidate;
    nearestDistanceSquared = distanceSquared;
  }

  return nearest;
}
