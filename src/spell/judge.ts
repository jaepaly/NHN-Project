import type { SpellJudgement } from './types';

/**
 * 주문 판정기 인터페이스 — GDD §3.5
 * 구현체: MockJudge(키워드 결정론) / GeminiJudge(프록시 경유) / WebLLMJudge(W4 옵션)
 */
export interface SpellJudge {
  /** 자유 텍스트를 판정한다. 실패 시 throw하지 말고 안전한 v2 결과를 반환할 것. */
  judge(text: string): Promise<SpellJudgement>;
  /** 판정기 이름 (AI 문서·디버그 HUD 표기용) */
  readonly name: string;
  /** [디버그] 직전 judge() 호출의 실제 출처 (예: gemini/cache/fallback). HUD 표기용, 선택적. */
  readonly lastSource?: string;
}
