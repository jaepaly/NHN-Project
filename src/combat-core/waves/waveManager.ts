/** R1 전투 코어의 웨이브 구성과 진행 상태. */
export interface WaveDefinition {
  chaserCount: number;
  shooterCount: number;
  splitterCount: number;
  shieldSentinelCount?: number;
  hazard?: boolean;
}

export const WAVE_CONFIG = {
  betweenWaveDelaySeconds: 2,
  spawnDistance: 350,
} as const;

export const WAVE_DEFINITIONS: readonly WaveDefinition[] = [
  { chaserCount: 3, shooterCount: 0, splitterCount: 0 },
  { chaserCount: 2, shooterCount: 2, splitterCount: 0 },
  { chaserCount: 2, shooterCount: 2, splitterCount: 1 },
];

export const WAVE_SETS: Readonly<Record<string, readonly WaveDefinition[]>> = {
  legacy: WAVE_DEFINITIONS,
  'room-a': [
    { chaserCount: 4, shooterCount: 0, splitterCount: 0 },
    { chaserCount: 4, shooterCount: 1, splitterCount: 0 },
  ],
  'room-b': [
    { chaserCount: 1, shooterCount: 3, splitterCount: 1 },
    { chaserCount: 2, shooterCount: 3, splitterCount: 2 },
  ],
  'room-c-shield': [
    { chaserCount: 2, shooterCount: 1, splitterCount: 0, shieldSentinelCount: 1 },
    { chaserCount: 2, shooterCount: 2, splitterCount: 1, shieldSentinelCount: 1 },
  ],
  'room-c-hazard': [
    { chaserCount: 3, shooterCount: 2, splitterCount: 0, hazard: true },
    { chaserCount: 2, shooterCount: 2, splitterCount: 2, hazard: true },
  ],
  elite: [
    { chaserCount: 2, shooterCount: 2, splitterCount: 1 },
  ],
};

export type WavePhase = 'active' | 'waiting' | 'room-clear';

export class WaveManager {
  private waveIndex = -1;
  private readonly definitions: readonly WaveDefinition[];

  phase: WavePhase = 'waiting';
  delayRemaining = 0;

  constructor(definitions: readonly WaveDefinition[] = WAVE_DEFINITIONS) {
    if (definitions.length === 0) throw new Error('WaveManager requires at least one wave');
    this.definitions = definitions;
  }

  get currentWaveNumber(): number {
    return this.waveIndex + 1;
  }

  get totalWaves(): number {
    return this.definitions.length;
  }

  start(): WaveDefinition {
    this.waveIndex = 0;
    this.phase = 'active';
    this.delayRemaining = 0;
    return this.definitions[this.waveIndex];
  }

  notifyEnemiesCleared(): void {
    if (this.phase !== 'active') return;

    if (this.waveIndex >= this.definitions.length - 1) {
      this.phase = 'room-clear';
      this.delayRemaining = 0;
      return;
    }

    this.phase = 'waiting';
    this.delayRemaining = WAVE_CONFIG.betweenWaveDelaySeconds;
  }

  /** 대기 완료 시 다음 웨이브 정의를 반환한다. */
  update(deltaSeconds: number): WaveDefinition | null {
    if (this.phase !== 'waiting' || this.waveIndex < 0) return null;

    this.delayRemaining = Math.max(0, this.delayRemaining - Math.max(0, deltaSeconds));
    if (this.delayRemaining > 0) return null;

    this.waveIndex += 1;
    this.phase = 'active';
    return this.definitions[this.waveIndex];
  }
}
