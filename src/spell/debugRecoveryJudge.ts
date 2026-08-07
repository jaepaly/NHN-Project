import type { JudgeOptions, SpellJudge } from './judge';
import { MockJudge } from './mockJudge';
import type { SpellJudgement } from './types';

/** DEV `#judge-recovery` 전용: 2회 fallback 뒤 첫 복구 probe가 성공하는 흐름. */
export class DebugRecoveryRemoteJudge implements SpellJudge {
  readonly name = 'DebugRecoveryRemoteJudge';
  lastSource: string = 'fallback';
  lastFallbackReason: string | undefined = 'network_error';
  private recovered = false;
  private readonly result = new MockJudge();

  async judge(text: string, options?: JudgeOptions): Promise<SpellJudgement> {
    const judgement = await this.result.judge(text, options);
    this.lastSource = this.recovered ? 'gemini' : 'fallback';
    this.lastFallbackReason = this.recovered ? undefined : 'network_error';
    return judgement;
  }

  async probeRemote(): Promise<boolean> {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    this.recovered = true;
    return true;
  }
}
