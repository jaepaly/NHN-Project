import type { JudgeOptions, SpellJudge } from './judge';
import type { SpellJudgement } from './types';

export const OFFLINE_FALLBACK_THRESHOLD = 2;

/**
 * 한 런에서 연속 fallback이 반복되면 현재 영창을 로컬에서 즉시 판정하고,
 * 실제 원격 경로는 백그라운드로만 확인한다. 회복 응답은 이미 실행한 영창을
 * 뒤집지 않고 다음 영창부터 적용한다.
 */
export class RunRecoveryJudge implements SpellJudge {
  readonly name: string;
  lastSource: string | undefined;
  lastFallbackReason: string | undefined;
  offlineMode = false;

  private consecutiveFallbackCasts = 0;
  private recoveryProbe: Promise<void> | null = null;
  private runGeneration = 0;

  constructor(
    private readonly remote: SpellJudge,
    private readonly local: SpellJudge,
    private readonly fallbackThreshold = OFFLINE_FALLBACK_THRESHOLD,
  ) {
    this.name = remote.name;
  }

  async judge(text: string, options?: JudgeOptions): Promise<SpellJudgement> {
    if (this.offlineMode) {
      const judgement = await this.local.judge(text, options);
      this.lastSource = 'mock';
      this.lastFallbackReason = undefined;
      this.startRecoveryProbe(text, options);
      return judgement;
    }

    const judgement = await this.remote.judge(text, options);
    this.lastSource = this.remote.lastSource;
    this.lastFallbackReason = this.remote.lastFallbackReason;
    if (this.lastSource === 'fallback') {
      this.consecutiveFallbackCasts += 1;
      if (this.consecutiveFallbackCasts >= this.fallbackThreshold) {
        this.offlineMode = true;
      }
    } else {
      this.consecutiveFallbackCasts = 0;
    }
    return judgement;
  }

  resetRun(): void {
    this.runGeneration += 1;
    this.consecutiveFallbackCasts = 0;
    this.offlineMode = false;
    this.recoveryProbe = null;
    this.remote.resetRun?.();
    this.local.resetRun?.();
  }

  private startRecoveryProbe(text: string, options?: JudgeOptions): void {
    if (this.recoveryProbe) return;
    const generation = this.runGeneration;
    const probe = this.remote.probeRemote
      ? this.remote.probeRemote(text, options)
      : this.probeThroughJudge(text, options);
    this.recoveryProbe = probe
      .then((recovered) => {
        if (!recovered || generation !== this.runGeneration) return;
        this.consecutiveFallbackCasts = 0;
        this.offlineMode = false;
      })
      .catch(() => undefined)
      .finally(() => {
        if (generation === this.runGeneration) this.recoveryProbe = null;
      });
  }

  private async probeThroughJudge(text: string, options?: JudgeOptions): Promise<boolean> {
    await this.remote.judge(text, options);
    return this.remote.lastSource === 'gemini';
  }
}
