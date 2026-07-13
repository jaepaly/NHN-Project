export interface WaveDefinition {
  chaserCount: number;
  shooterCount: number;
  splitterCount: number;
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

export type WavePhase = 'active' | 'waiting' | 'room-clear';

export class WaveManager {
  private waveIndex = -1;

  phase: WavePhase = 'waiting';
  delayRemaining = 0;

  get currentWaveNumber(): number {
    return this.waveIndex + 1;
  }

  get totalWaves(): number {
    return WAVE_DEFINITIONS.length;
  }

  start(): WaveDefinition {
    this.waveIndex = 0;
    this.phase = 'active';
    this.delayRemaining = 0;
    return WAVE_DEFINITIONS[this.waveIndex];
  }

  notifyEnemiesCleared(): void {
    if (this.phase !== 'active') return;

    if (this.waveIndex >= WAVE_DEFINITIONS.length - 1) {
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
    return WAVE_DEFINITIONS[this.waveIndex];
  }
}
