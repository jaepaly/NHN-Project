import type { SpellJudge } from './judge';
import { MockJudge } from './mockJudge';
import { GeminiJudge } from './geminiJudge';

/**
 * 환경에 따라 판정기를 선택한다 — GDD §3.5 판정기 추상화.
 *   - VITE_JUDGE_PROXY_URL 설정됨 → GeminiJudge (실제 LLM, 폴백은 MockJudge)
 *   - 미설정 → MockJudge (API 키 없이 로컬 개발·데모)
 *
 * .env 설정은 proxy/README.md 및 .env.example 참조.
 */
export function createJudge(): SpellJudge {
  const proxyUrl = import.meta.env.VITE_JUDGE_PROXY_URL?.trim();
  if (proxyUrl) {
    return new GeminiJudge(proxyUrl);
  }
  return new MockJudge();
}
