import {
  isDiscoverySignature,
  type DiscoverySignature,
} from './discoverySignature';

export const META_PROFILE_STORAGE_KEY = 'incant:meta:v1';

export interface MetaProfileV1 {
  version: 1;
  insight: number;
  /** 주문 기록을 정제해 얻는 꾸미기 전용 재화. 획득·상점은 후속 단계에서 연결한다. */
  spellTokens: number;
  discoveredSignatures: DiscoverySignature[];
  completedContractIds: string[];
  maxDepthCleared: number;
  totalRuns: number;
  totalWins: number;
  bestDepth: number;
}

export interface MetaRunOutcome {
  result: 'win' | 'lose';
  insightEarned: number;
  discoveredSignatures: readonly DiscoverySignature[];
  completedContractIds?: readonly string[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const EMPTY_META_PROFILE: Readonly<MetaProfileV1> = Object.freeze({
  version: 1,
  insight: 0,
  spellTokens: 0,
  discoveredSignatures: [],
  completedContractIds: [],
  maxDepthCleared: 0,
  totalRuns: 0,
  totalWins: 0,
  bestDepth: 0,
});

function freshProfile(): MetaProfileV1 {
  return {
    ...EMPTY_META_PROFILE,
    discoveredSignatures: [],
    completedContractIds: [],
  };
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string'))];
}

function normalizeProfile(value: unknown): MetaProfileV1 {
  if (typeof value !== 'object' || value === null) return freshProfile();
  const source = value as Partial<MetaProfileV1>;
  return {
    version: 1,
    insight: nonNegativeInteger(source.insight),
    spellTokens: nonNegativeInteger(source.spellTokens),
    discoveredSignatures: uniqueStrings(source.discoveredSignatures)
      .filter(isDiscoverySignature),
    completedContractIds: uniqueStrings(source.completedContractIds),
    maxDepthCleared: nonNegativeInteger(source.maxDepthCleared),
    totalRuns: nonNegativeInteger(source.totalRuns),
    totalWins: nonNegativeInteger(source.totalWins),
    bestDepth: nonNegativeInteger(source.bestDepth),
  };
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadMetaProfile(storage: StorageLike | null = browserStorage()): MetaProfileV1 {
  if (!storage) return freshProfile();
  try {
    const raw = storage.getItem(META_PROFILE_STORAGE_KEY);
    return raw ? normalizeProfile(JSON.parse(raw)) : freshProfile();
  } catch {
    return freshProfile();
  }
}

export function saveMetaProfile(
  profile: MetaProfileV1,
  storage: StorageLike | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(META_PROFILE_STORAGE_KEY, JSON.stringify(normalizeProfile(profile)));
  } catch {
    // 저장 공간 차단/초과는 현재 런을 중단할 이유가 아니다.
  }
}

export function applyMetaRunOutcome(
  profile: MetaProfileV1,
  outcome: MetaRunOutcome,
): MetaProfileV1 {
  return normalizeProfile({
    ...profile,
    insight: profile.insight + nonNegativeInteger(outcome.insightEarned),
    discoveredSignatures: [
      ...profile.discoveredSignatures,
      ...outcome.discoveredSignatures,
    ],
    completedContractIds: [
      ...profile.completedContractIds,
      ...(outcome.completedContractIds ?? []),
    ],
    totalRuns: profile.totalRuns + 1,
    totalWins: profile.totalWins + (outcome.result === 'win' ? 1 : 0),
  });
}
