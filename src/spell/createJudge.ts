import type { SpellJudge } from './judge';
import { MockJudge } from './mockJudge';
import { GeminiJudge, JUDGE_PROMPT_VERSION, seedJudgeCache } from './geminiJudge';
import { CACHE_SEED } from './cacheSeed.generated';
import { LoggingJudge } from './loggingJudge';

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
    return withDevLogging(new MockJudge());
  }
  const proxyUrl = import.meta.env.VITE_JUDGE_PROXY_URL?.trim() || DEFAULT_PROXY_URL;
  // 캐시 프리워밍(③, #158) — 시연 코퍼스의 사전 판정을 localStorage에 주입한다.
  // 심사위원 첫 영창이 네트워크 왕복 없이 즉시 나가고, 라이브 호출이 줄어 할당량(RPD)
  // 압박도 낮아진다. 버전 불일치·기존 캐시·fizzle은 seedJudgeCache가 알아서 건너뛴다.
  try {
    seedJudgeCache(localStorage, CACHE_SEED);
  } catch {
    // localStorage 비활성 등 — 프리워밍은 선택적이므로 게임 진행에 영향 없다.
  }
  return withDevLogging(new GeminiJudge(proxyUrl));
}

/** 개발 모드에서만 판정을 logs/play.jsonl로 기록 (피드백용). 프로덕션은 그대로 반환. */
function withDevLogging(judge: SpellJudge): SpellJudge {
  return import.meta.env.DEV
    ? new LoggingJudge(judge, {
        promptVersion: JUDGE_PROMPT_VERSION,
        sequenceJudgeEnabled: import.meta.env.VITE_SEQUENCE_JUDGE !== '0',
        mockForced: import.meta.env.VITE_JUDGE_MOCK === '1',
      })
    : judge;
}
