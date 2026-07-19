import type { SpellJudge } from './judge';
import type { SpellJudgement } from './types';

/**
 * 개발 전용 판정 로거 — inner 판정기를 감싸 각 판정을 dev 서버(`/__log`)로 보낸다.
 * vite 플러그인이 `logs/play.jsonl`에 한 줄씩 append → 플레이 피드백용으로 읽는다.
 * 프로덕션 빌드에선 사용하지 않는다(createJudge가 dev에서만 감쌈). 게임 로직 무영향.
 */
export class LoggingJudge implements SpellJudge {
  readonly name: string;
  private readonly start = Date.now();

  constructor(private readonly inner: SpellJudge) {
    this.name = inner.name;
    void this.post({ t: 0, type: 'session_start', judge: inner.name });
  }

  /** ProtoScene의 디버그 출처 표기가 그대로 동작하도록 inner 값을 위임한다. */
  get lastSource(): string | undefined {
    return (this.inner as { lastSource?: string }).lastSource;
  }

  async judge(text: string): Promise<SpellJudgement> {
    const j = await this.inner.judge(text);
    const src = (this.inner as { lastSource?: string }).lastSource ?? 'mock';
    const t = Math.round((Date.now() - this.start) / 100) / 10; // 0.1초 단위 상대시각
    if (j.disposition === 'cast') {
      const s = j.spell;
      void this.post({
        t, type: 'cast', input: text, disp: 'cast', name: s.name,
        el: s.element_primary + (s.element_secondary ? '+' + s.element_secondary : ''),
        form: s.form, effect: s.effect, power: s.power, cost: s.cost, src,
      });
    } else {
      void this.post({ t, type: j.disposition, input: text, disp: j.disposition, src });
    }
    return j;
  }

  private async post(ev: Record<string, unknown>): Promise<void> {
    try {
      await fetch('/__log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ev),
      });
    } catch {
      // 개발 로깅은 best-effort — 실패해도 게임엔 영향 없음
    }
  }
}
