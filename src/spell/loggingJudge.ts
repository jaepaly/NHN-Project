import type { JudgeOptions, SpellJudge } from './judge';
import type { SpellJudgement } from './types';
import { createRequestId, hashPlayLogInput, postPlayLog } from './playLog';

export interface LoggingJudgeOptions {
  promptVersion?: string;
  sequenceJudgeEnabled?: boolean;
  mockForced?: boolean;
}

/** 판정 결과를 JSONL 한 줄로 안정적으로 요약한다. */
export function judgementLogFields(judgement: SpellJudgement): Record<string, unknown> {
  if (judgement.disposition !== 'cast') {
    return { disp: judgement.disposition };
  }
  const spell = judgement.spell;
  const sequences = judgement.plan?.sequences ?? [];
  return {
    disp: 'cast',
    mode: judgement.plan ? 'sequence' : 'single',
    sequenceCount: sequences.length,
    behaviorCount: sequences.reduce(
      (sum, sequence) => sum + sequence.behaviors.length,
      0,
    ),
    name: spell.name,
    el: spell.element_primary + (spell.element_secondary ? `+${spell.element_secondary}` : ''),
    form: spell.form,
    effect: spell.effect,
    power: spell.power,
    cost: spell.cost,
  };
}

/**
 * 개발 전용 판정 로거 — inner 판정기를 감싸 각 판정을 dev 서버(`/__log`)로 보낸다.
 * vite 플러그인이 `logs/play.jsonl`에 한 줄씩 append → 플레이 피드백용으로 읽는다.
 * 프로덕션 빌드에선 사용하지 않는다(createJudge가 dev에서만 감쌈). 게임 로직 무영향.
 */
export class LoggingJudge implements SpellJudge {
  readonly name: string;
  private readonly start = Date.now();

  constructor(
    private readonly inner: SpellJudge,
    options: LoggingJudgeOptions = {},
  ) {
    this.name = inner.name;
    void postPlayLog({
      t: 0,
      type: 'session_start',
      judge: inner.name,
      promptVersion: options.promptVersion,
      sequenceJudgeEnabled: options.sequenceJudgeEnabled,
      mockForced: options.mockForced,
    });
  }

  /** ProtoScene의 디버그 출처 표기가 그대로 동작하도록 inner 값을 위임한다. */
  get lastSource(): string | undefined {
    return this.inner.lastSource;
  }

  get lastFallbackReason(): string | undefined {
    return this.inner.lastFallbackReason;
  }

  async judge(text: string, options?: JudgeOptions): Promise<SpellJudgement> {
    const startedAt = Date.now();
    const requestId = options?.requestId ?? createRequestId();
    const j = await this.inner.judge(text, { ...options, requestId });
    const src = this.inner.lastSource ?? 'mock';
    const t = Math.round((Date.now() - this.start) / 100) / 10; // 0.1초 단위 상대시각
    const inputHash = await hashPlayLogInput(text);
    void postPlayLog({
      t,
      type: j.disposition === 'cast' ? 'cast' : j.disposition,
      requestId,
      inputLength: text.length,
      inputHash,
      src,
      elapsedMs: Date.now() - startedAt,
      fallbackReason: this.inner.lastFallbackReason,
      ...judgementLogFields(j),
    });
    return j;
  }
}
