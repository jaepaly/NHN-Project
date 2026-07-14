import type { SpellJudge } from './judge';
import { MockJudge } from './mockJudge';
import { GeminiJudge } from './geminiJudge';

/**
 * 판정기를 선택한다 — GDD §3.5 판정기 추상화.
 *   - 기본값: **GeminiJudge** (실제 LLM). 팀 공용 프록시를 기본 URL로 써서
 *     로컬·데모 어디서나 별도 설정 없이 실제 판정이 동작한다.
 *   - `VITE_JUDGE_PROXY_URL` 설정 시: 그 프록시 사용 (다른/유료 프록시로 교체용).
 *   - `VITE_JUDGE_MOCK=1` 설정 시: MockJudge 강제 (오프라인·할당량 절약용, 예: 전투 개발).
 *
 * GeminiJudge 내부에서 실패·타임아웃 시 MockJudge로 자동 폴백하므로 게임은 항상 동작한다.
 * (프록시 URL은 비밀 아님 — 실제 API 키는 Cloudflare secret에만 존재)
 */
const DEFAULT_PROXY_URL = 'https://incant-judge-proxy.diawodbsdot.workers.dev';

export function createJudge(): SpellJudge {
  if (import.meta.env.VITE_JUDGE_MOCK === '1') {
    return new MockJudge();
  }
  const proxyUrl = import.meta.env.VITE_JUDGE_PROXY_URL?.trim() || DEFAULT_PROXY_URL;
  return new GeminiJudge(proxyUrl);
}
