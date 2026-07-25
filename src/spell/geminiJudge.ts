import type { SpellJudge } from './judge';
import type { SpellJudgement } from './types';
import { validateJudgement } from './validate';
import { MockJudge, looksSequential, precheckText } from './mockJudge';

/**
 * GeminiJudge — 실제 LLM 판정기 (Cloudflare 프록시 경유) — GDD §3.5
 *
 * 판정 체인:
 *   1) localStorage 캐시 조회 (동일 문장 = 동일 판정 → 재현성·속도·호출량 절감)
 *   2) 프록시로 판정 요청 (2.5초 타임아웃)
 *   3) validateJudgement 재검증 — 스키마 밖 값은 거부 (LLM을 신뢰하지 않음)
 *   4) 실패/타임아웃/무효/의미 입력의 원격 fizzle → MockJudge 폴백
 *
 * 프롬프트·API 키는 서버(worker.js)에 고정 — 클라이언트는 { text }만 보낸다.
 * 인터페이스 계약상 judge()는 throw하지 않고 항상 SpellJudgement를 반환한다.
 */

export const JUDGE_SCHEMA_VERSION = 2;
export const JUDGE_PROMPT_VERSION = 'meaning-v2.12-seq-directional-r1';
const CACHE_PREFIX = `incant:judge:v${JUDGE_SCHEMA_VERSION}:${JUDGE_PROMPT_VERSION}:`;
const TIMEOUT_MS = 2500;
/**
 * 복합 영창 전용 상한 (#180, 총괄 승인). 복합은 spell_plan을 실어 응답이 커서 tail이
 * 2.5초 경계에 붙는다(실측 1.86~2.55s). 단순 영창(p90 1.35s)은 여유가 있으므로 2.5초를
 * 그대로 두고, **순차 마커가 보이는 입력만** 더 기다린다.
 *
 * 왜 기다리는 쪽이 맞나: 긴 문장을 친 직후라 기대 대기가 다르고, 영창 슬로모션 UI가
 * 대기를 흡수한다. 폴백되면 Mock의 뭉툭한 plan이 나가 복합 영창의 인상이 되레 나빠진다.
 */
const SEQUENCE_TIMEOUT_MS = 3200;

/** 입력 모양에 따른 판정 대기 상한 — 단순 2.5초 / 복합 3.2초 (#180) */
export function judgeTimeoutMs(text: string): number {
  return looksSequential(text) ? SEQUENCE_TIMEOUT_MS : TIMEOUT_MS;
}

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
      if (judgement && judgement.disposition !== 'fizzle') {
        // cast/blocked만 캐시한다. 모델 드리프트가 만든 fizzle은 캐시에 고착시키지 않는다.
        this.writeCache(key, judgement);
        this.lastSource = 'gemini';
        return judgement;
      }
    } catch {
      // 네트워크 오류·타임아웃·비정상 응답 — 아래 폴백으로 처리
    }

    // 4) 폴백 — 로컬 사전검사를 통과한 입력은 원격 fizzle도 모델 오류로 간주한다.
    // 명백한 키보드 매시·금칙어는 위 precheckText에서 이미 fizzle/blocked 처리됐다.
    this.lastSource = 'fallback';
    return this.fallback.judge(text);
  }

  /** 프록시에 POST하고 상한(단순 2.5초 / 복합 3.2초) 초과 시 abort. */
  private async fetchWithTimeout(text: string): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), judgeTimeoutMs(text));
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
      const judgement = validateJudgement(JSON.parse(hit));
      // v2.4 정책상 fizzle 캐시는 신뢰하지 않는다. 부분 배포·수동 주입에도 안전하게 무시한다.
      return judgement?.disposition === 'fizzle' ? null : judgement;
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
