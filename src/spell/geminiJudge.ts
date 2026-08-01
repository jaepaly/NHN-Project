import type { JudgeOptions, SpellJudge, UltimateResonanceContext } from './judge';
import type { SpellJudgement } from './types';
import { validateJudgement } from './validate';
import { MockJudge, precheckText } from './mockJudge';

/**
 * GeminiJudge — 실제 LLM 판정기 (Cloudflare 프록시 경유) — GDD §3.5
 *
 * 판정 체인:
 *   1) localStorage 캐시 조회 (동일 문장 = 동일 판정 → 재현성·속도·호출량 절감)
 *   2) 프록시로 판정 요청 (모든 정상 입력에 공통 6초 타임아웃)
 *   3) validateJudgement 재검증 — 스키마 밖 값은 거부 (LLM을 신뢰하지 않음)
 *   4) 실패/타임아웃/무효/의미 입력의 원격 fizzle → MockJudge 폴백
 *
 * 프롬프트·API 키는 서버(worker.js)에 고정 — 클라이언트는 { text }만 보낸다.
 * 인터페이스 계약상 judge()는 throw하지 않고 항상 SpellJudgement를 반환한다.
 */

export const JUDGE_SCHEMA_VERSION = 2;
export const JUDGE_PROMPT_VERSION = 'meaning-v2.31-ultimate-resonance-echo';
const CACHE_PREFIX = `incant:judge:v${JUDGE_SCHEMA_VERSION}:${JUDGE_PROMPT_VERSION}:`;
const JUDGE_TIMEOUT_MS = 6000;

export type JudgeFallbackReason =
  | 'timeout'
  | `http_${number}`
  | `http_${number}_upstream_${number}`
  | 'invalid_response'
  | 'remote_fizzle'
  | 'network_error';

class JudgeHttpError extends Error {
  constructor(
    readonly status: number,
    readonly upstreamStatus?: number,
  ) {
    super(
      upstreamStatus === undefined
        ? `proxy responded ${status}`
        : `proxy responded ${status} (upstream ${upstreamStatus})`,
    );
  }
}

function fallbackReasonFromError(error: unknown): JudgeFallbackReason {
  if (error instanceof JudgeHttpError) {
    return error.upstreamStatus === undefined
      ? `http_${error.status}`
      : `http_${error.status}_upstream_${error.upstreamStatus}`;
  }
  if ((error as { name?: unknown })?.name === 'AbortError') return 'timeout';
  if (error instanceof SyntaxError) return 'invalid_response';
  return 'network_error';
}
/** 모든 정상 원격 판정의 공통 대기 상한. 인자는 기존 호출 계약 호환용이다. */
export function judgeTimeoutMs(_text: string): number {
  return JUDGE_TIMEOUT_MS;
}

export class GeminiJudge implements SpellJudge {
  readonly name = 'GeminiJudge(gemini-via-proxy)';
  /** [디버그] 직전 판정 출처 — HUD 표기용 (⑤ 폴백 빈도 관찰) */
  lastSource: 'gemini' | 'cache' | 'fallback' | 'local' = 'gemini';
  /** [디버그] 직전 fallback의 직접 원인 — 플레이 로그 관측용. */
  lastFallbackReason: JudgeFallbackReason | undefined;
  private readonly fallback: SpellJudge;

  constructor(
    private readonly proxyUrl: string,
    fallback: SpellJudge = new MockJudge(),
  ) {
    this.fallback = fallback;
  }

  async judge(text: string, options: JudgeOptions = {}): Promise<SpellJudgement> {
    this.lastFallbackReason = undefined;
    const key = text.trim();
    const castMode = options.castMode === 'ultimate' ? 'ultimate' : 'normal';
    const resonance = castMode === 'ultimate' ? options.resonance : undefined;
    const cacheKey = `${castMode}:${resonance ? JSON.stringify(resonance) : '-'}:${key}`;
    const prechecked = precheckText(key);
    if (prechecked) {
      this.lastSource = 'local';
      return prechecked;
    }

    // 1) 캐시 히트 시 즉시 반환 (프록시 호출 없음)
    const cached = this.readCache(cacheKey);
    if (cached) {
      this.lastSource = 'cache';
      return cached;
    }

    // 2~3) 프록시 요청 + 스키마 재검증
    try {
      const raw = await this.fetchWithTimeout(key, castMode, resonance);
      const judgement = validateJudgement(raw);
      if (judgement && judgement.disposition !== 'fizzle') {
        // cast/blocked만 캐시한다. 모델 드리프트가 만든 fizzle은 캐시에 고착시키지 않는다.
        this.writeCache(cacheKey, judgement);
        this.lastSource = 'gemini';
        return judgement;
      }
      this.lastFallbackReason = judgement?.disposition === 'fizzle'
        ? 'remote_fizzle'
        : 'invalid_response';
    } catch (error) {
      this.lastFallbackReason = fallbackReasonFromError(error);
    }

    // 4) 폴백 — 로컬 사전검사를 통과한 입력은 원격 fizzle도 모델 오류로 간주한다.
    // 명백한 키보드 매시·금칙어는 위 precheckText에서 이미 fizzle/blocked 처리됐다.
    this.lastSource = 'fallback';
    if (castMode === 'ultimate') {
      return { schema_version: 2, disposition: 'fizzle', reason: 'nonsense', message: '필살영창 해석에 실패했습니다. 게이지는 보존됩니다.' };
    }
    return this.fallback.judge(text, options);
  }

  /** 프록시에 POST하고 상한(단순 2.5초 / 복합 3.2초) 초과 시 abort. */
  private async fetchWithTimeout(
    text: string,
    castMode: 'normal' | 'ultimate',
    resonance?: UltimateResonanceContext,
  ): Promise<unknown> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), judgeTimeoutMs(text));
    try {
      const res = await fetch(this.proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, castMode, ...(resonance ? { resonance } : {}) }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { status?: unknown } | null;
        const upstreamStatus = typeof body?.status === 'number'
          && Number.isInteger(body.status)
          ? body.status
          : undefined;
        throw new JudgeHttpError(res.status, upstreamStatus);
      }
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

/** 캐시 프리워밍 시드 — 시연 코퍼스의 사전 판정. `scripts/generate-cache-seed.ts`가 생성. */
export interface JudgeCacheSeed {
  /** 생성 당시 프롬프트 버전. 현재와 다르면 스테일이므로 주입하지 않는다. */
  version: string;
  /** 생성 당시 스키마 버전. */
  schema: number;
  /** 문장 → 워커 판정(원문). 읽을 때 `validateJudgement`가 한 번 더 검증한다. */
  entries: Record<string, unknown>;
}

/**
 * 캐시 프리워밍 — 시연 코퍼스의 사전 판정을 localStorage 캐시에 주입한다 (③, #158).
 * 심사위원의 첫 영창이 네트워크 왕복 없이 즉시 나가게 하고, 라이브 호출을 줄여
 * 할당량(RPD) 압박도 낮춘다.
 *
 * 규율:
 * - **버전·스키마가 현재와 다르면 주입 안 함** — 프롬프트가 바뀌면 시드 판정은 스테일이다.
 * - **기존 캐시는 덮지 않는다** — 실제 라이브 판정이 항상 우선.
 * - **fizzle은 심지 않는다** — 캐시 정책(cast/blocked만) 준수.
 *
 * @returns 실제로 주입한 항목 수.
 */
export function seedJudgeCache(storage: Storage, seed: JudgeCacheSeed): number {
  if (seed.version !== JUDGE_PROMPT_VERSION || seed.schema !== JUDGE_SCHEMA_VERSION) return 0;
  let injected = 0;
  for (const [text, judgement] of Object.entries(seed.entries)) {
    const disposition = (judgement as { disposition?: unknown })?.disposition;
    if (disposition === 'fizzle') continue;
    const key = CACHE_PREFIX + text.trim();
    try {
      if (storage.getItem(key) !== null) continue; // 실제/기존 캐시 우선
      storage.setItem(key, JSON.stringify(judgement));
      injected += 1;
    } catch {
      // localStorage 가득참·비활성 — 프리워밍은 선택적이므로 무시
    }
  }
  return injected;
}
