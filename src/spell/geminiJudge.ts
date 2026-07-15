import type { SpellJudge } from './judge';
import type { SpellJudgement } from './types';
import { validateJudgement } from './validate';
import { MockJudge, precheckText } from './mockJudge';

/**
 * GeminiJudge — 실제 LLM 판정기 (Cloudflare 프록시 경유) — GDD §3.5
 *
 * 판정 체인:
 *   1) localStorage 캐시 조회 (동일 문장 = 동일 판정 → 재현성·속도·호출량 절감)
 *   2) 프록시로 판정 요청 (2.5초 타임아웃)
 *   3) validateJudgement 재검증 — 스키마 밖 값은 거부 (LLM을 신뢰하지 않음)
 *   4) 실패/타임아웃/무효 → MockJudge 폴백 (게임은 절대 멈추지 않는다)
 *
 * 프롬프트·API 키는 서버(worker.js)에 고정 — 클라이언트는 { text }만 보낸다.
 * 인터페이스 계약상 judge()는 throw하지 않고 항상 SpellJudgement를 반환한다.
 */

export const JUDGE_SCHEMA_VERSION = 2;
export const JUDGE_PROMPT_VERSION = 'meaning-v2.0';
const CACHE_PREFIX = `incant:judge:v${JUDGE_SCHEMA_VERSION}:${JUDGE_PROMPT_VERSION}:`;
const TIMEOUT_MS = 2500;

export class GeminiJudge implements SpellJudge {
  readonly name = 'GeminiJudge(gemini-via-proxy)';
  /** [디버그] 직전 판정 출처 — HUD 표기용 (⑤ 폴백 빈도 관찰) */
  lastSource: 'gemini' | 'cache' | 'fallback' | 'local' = 'gemini';
  private readonly fallback: SpellJudge;

  constructor(
    private readonly proxyUrl: string,
    fallback: SpellJudge = new MockJudge(),
  ) {
    this.fallback = fallback;
  }

  async judge(text: string): Promise<SpellJudgement> {
    const key = text.trim();
    const prechecked = precheckText(key);
    if (prechecked) {
      this.lastSource = 'local';
      return prechecked;
    }

    // 1) 캐시 히트 시 즉시 반환 (프록시 호출 없음)
    const cached = this.readCache(key);
    if (cached) {
      this.lastSource = 'cache';
      return cached;
    }

    // 2~3) 프록시 요청 + 스키마 재검증
    try {
      const raw = await this.fetchWithTimeout(key);
      const judgement = validateJudgement(raw);
      if (judgement) {
        // 유효 결과는 재현성을 위해 캐시하되, 장애 폴백은 캐시하지 않는다.
        this.writeCache(key, judgement);
        this.lastSource = 'gemini';
        return judgement;
      }
    } catch {
      // 네트워크 오류·타임아웃·비정상 응답 — 아래 폴백으로 처리
    }

    // 4) 폴백 — 무중단 보장
    this.lastSource = 'fallback';
    return this.fallback.judge(text);
  }

  /** 프록시에 POST하고 2.5초 초과 시 abort. */
  private async fetchWithTimeout(text: string): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`proxy responded ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private readCache(text: string): SpellJudgement | null {
    try {
      const hit = localStorage.getItem(CACHE_PREFIX + text);
      if (!hit) return null;
      return validateJudgement(JSON.parse(hit)); // 캐시도 재검증 (스키마 변경 대비)
    } catch {
      return null;
    }
  }

  private writeCache(text: string, judgement: SpellJudgement): void {
    try {
      localStorage.setItem(CACHE_PREFIX + text, JSON.stringify(judgement));
    } catch {
      // localStorage 가득참·비활성 — 캐시는 선택적 기능이므로 무시
    }
  }
}
