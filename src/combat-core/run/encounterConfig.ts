import type { EliteModifier, EncounterDefinition } from '../../run/runContract';

export const ELITE_MODIFIERS: readonly EliteModifier[] = ['swift', 'guard', 'unstable'];

/** Phase 4 §2-2의 2스테이지/6전투 구성을 코드와 분리한 단일 원본. */
export const RUN_ENCOUNTERS: readonly EncounterDefinition[] = [
  {
    id: 'stage-1-room-a',
    stage: 1,
    kind: 'combat',
    rewardAfterClear: true,
    waveSetId: 'room-a',
  },
  {
    id: 'stage-1-room-b',
    stage: 1,
    kind: 'combat',
    rewardAfterClear: true,
    waveSetId: 'room-b',
  },
  {
    id: 'stage-1-boss',
    stage: 1,
    kind: 'stage-boss',
    rewardAfterClear: true,
  },
  {
    id: 'stage-2-room-c',
    stage: 2,
    kind: 'combat',
    rewardAfterClear: true,
    variants: [
      { id: 'shield-sentinel', waveSetId: 'room-c-shield' },
      { id: 'hazard-mixed', waveSetId: 'room-c-hazard' },
    ],
  },
  {
    id: 'stage-2-elite',
    stage: 2,
    kind: 'elite',
    rewardAfterClear: true,
    waveSetId: 'elite',
    eliteModifiers: ELITE_MODIFIERS,
  },
  {
    id: 'final-memory-boss',
    stage: 2,
    kind: 'memory-boss',
    rewardAfterClear: false,
  },
] as const;
