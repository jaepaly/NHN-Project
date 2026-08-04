import type { EnemyKind } from '../enemies/combatEnemy';
import type { EliteModifier } from '../../run/runContract';
import type { WaveDefinition } from './waveManager';

export type EncounterTier = 1 | 2 | 3;

export interface EliteModifierBudget {
  swift: number;
  unstable: number;
  guard: number;
}

export interface EliteTargetRule {
  allowedKinds?: readonly EnemyKind[];
  preferredKinds?: readonly EnemyKind[];
}

export interface EliteWavePlan {
  budget: EliteModifierBudget;
  targets?: Readonly<Partial<Record<EliteModifier, EliteTargetRule>>>;
}

export interface EncounterPreset {
  id: string;
  tier: EncounterTier;
  waves: readonly WaveDefinition[];
  elitePlan: readonly EliteWavePlan[];
}

const wave = (
  chaserCount: number,
  shooterCount: number,
  splitterCount = 0,
  shieldSentinelCount = 0,
): WaveDefinition => ({ chaserCount, shooterCount, splitterCount, shieldSentinelCount });

const plan = (
  swift: number,
  unstable: number,
  guard: number,
  targets?: EliteWavePlan['targets'],
): EliteWavePlan => ({ budget: { swift, unstable, guard }, targets });

const shooterGuard = { guard: { allowedKinds: ['shooter'] as const } } as const;
const chaserSwiftShooterGuard = {
  guard: { allowedKinds: ['shooter'] as const },
  swift: { preferredKinds: ['chaser'] as const },
} as const;

export const ENCOUNTER_PRESETS: Readonly<Record<string, EncounterPreset>> = {
  't1-a': { id: 't1-a', tier: 1, waves: [wave(4, 0), wave(4, 1)], elitePlan: [plan(3, 1, 0), plan(3, 1, 1, shooterGuard)] },
  't1-b': { id: 't1-b', tier: 1, waves: [wave(3, 1), wave(3, 2)], elitePlan: [plan(3, 1, 0), plan(2, 2, 1, shooterGuard)] },
  't1-c': { id: 't1-c', tier: 1, waves: [wave(3, 0), wave(2, 1), wave(2, 1)], elitePlan: [plan(3, 0, 0), plan(2, 1, 0), plan(1, 1, 1, shooterGuard)] },
  't2-a': { id: 't2-a', tier: 2, waves: [wave(3, 1), wave(4, 2)], elitePlan: [plan(2, 1, 1, chaserSwiftShooterGuard), plan(3, 2, 1, chaserSwiftShooterGuard)] },
  // 분열체의 소형 자식까지 포함하면 실질 처치 대상은 10체다.
  't2-b': { id: 't2-b', tier: 2, waves: [wave(2, 1, 1), wave(3, 1)], elitePlan: [plan(2, 2, 0), plan(2, 2, 0)] },
  't2-c': { id: 't2-c', tier: 2, waves: [wave(3, 2), wave(4, 1)], elitePlan: [plan(2, 2, 1, shooterGuard), plan(2, 2, 1, shooterGuard)] },
  't3-a': { id: 't3-a', tier: 3, waves: [wave(3, 2), wave(3, 2, 0, 1)], elitePlan: [plan(2, 2, 1, shooterGuard), plan(3, 3, 0)] },
  't3-b': { id: 't3-b', tier: 3, waves: [wave(3, 1), wave(1, 0, 1), wave(1, 1, 0, 1)], elitePlan: [plan(2, 1, 1, shooterGuard), plan(1, 1, 0), plan(2, 1, 0)] },
  't3-c': { id: 't3-c', tier: 3, waves: [wave(2, 2), wave(3, 2, 1)], elitePlan: [plan(2, 1, 1, shooterGuard), plan(3, 2, 1, shooterGuard)] },
} as const;

export const PRESET_IDS_BY_TIER: Readonly<Record<EncounterTier, readonly string[]>> = {
  1: ['t1-a', 't1-b', 't1-c'],
  2: ['t2-a', 't2-b', 't2-c'],
  3: ['t3-a', 't3-b', 't3-c'],
};

const ELITE_ALLOWED: Readonly<Record<EnemyKind, readonly EliteModifier[]>> = {
  chaser: ['swift', 'unstable', 'guard'],
  shooter: ['swift', 'unstable', 'guard'],
  splitter: ['swift', 'unstable'],
  'shield-sentinel': ['swift', 'unstable'],
  'small-splitter': [],
  boss: [],
};

export function waveEnemyKinds(definition: WaveDefinition): EnemyKind[] {
  return [
    ...Array<EnemyKind>(definition.chaserCount).fill('chaser'),
    ...Array<EnemyKind>(definition.shooterCount).fill('shooter'),
    ...Array<EnemyKind>(definition.splitterCount).fill('splitter'),
    ...Array<EnemyKind>(definition.shieldSentinelCount ?? 0).fill('shield-sentinel'),
  ];
}

/** 프리셋 예산을 지키면서 동일 시드·노드·웨이브에 같은 대상 배정을 반환한다. */
export function resolveEliteAssignments(
  presetId: string,
  waveIndex: number,
  seed: number,
  nodeId: string,
): EliteModifier[] {
  const preset = ENCOUNTER_PRESETS[presetId];
  if (!preset) throw new Error(`Unknown encounter preset: ${presetId}`);
  const definition = preset.waves[waveIndex];
  const elitePlan = preset.elitePlan[waveIndex];
  if (!definition || !elitePlan) throw new Error(`Missing elite wave plan: ${presetId} wave ${waveIndex + 1}`);
  const kinds = waveEnemyKinds(definition);
  const result: Array<EliteModifier | undefined> = Array(kinds.length);
  const rand = mulberry32(hashText(`${seed}:${nodeId}:${presetId}:${waveIndex}`));
  const order: EliteModifier[] = ['guard', 'unstable', 'swift'];
  for (const modifier of order) {
    const count = elitePlan.budget[modifier];
    const rule = elitePlan.targets?.[modifier];
    let candidates = kinds.map((kind, index) => ({ kind, index })).filter(({ kind, index }) => (
      result[index] === undefined
      && ELITE_ALLOWED[kind].includes(modifier)
      && (!rule?.allowedKinds || rule.allowedKinds.includes(kind))
    ));
    shuffle(candidates, rand);
    if (rule?.preferredKinds) {
      candidates.sort((left, right) => Number(rule.preferredKinds!.includes(right.kind)) - Number(rule.preferredKinds!.includes(left.kind)));
    }
    if (candidates.length < count) throw new Error(`Elite budget cannot be assigned: ${presetId} wave ${waveIndex + 1} ${modifier}`);
    for (const candidate of candidates.slice(0, count)) result[candidate.index] = modifier;
  }
  if (result.some((modifier) => modifier === undefined)) throw new Error(`Elite budget leaves normal enemies: ${presetId} wave ${waveIndex + 1}`);
  return result as EliteModifier[];
}

export function validateEncounterPresets(): void {
  for (const preset of Object.values(ENCOUNTER_PRESETS)) {
    if (preset.waves.length !== preset.elitePlan.length) throw new Error(`Elite plan length mismatch: ${preset.id}`);
    preset.waves.forEach((definition, waveIndex) => {
      const budget = preset.elitePlan[waveIndex].budget;
      const total = budget.swift + budget.unstable + budget.guard;
      if (total !== waveEnemyKinds(definition).length) throw new Error(`Elite budget size mismatch: ${preset.id} wave ${waveIndex + 1}`);
      if (budget.guard > 1) throw new Error(`Guard budget exceeds per-wave cap: ${preset.id} wave ${waveIndex + 1}`);
      resolveEliteAssignments(preset.id, waveIndex, 0, 'validation');
    });
  }
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(values: T[], rand: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rand() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
}
