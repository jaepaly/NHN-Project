import type { SpellEffect, SpellElement, SpellForm, SpellJudgement } from './types';

/**
 * 주문 판정기 인터페이스 — GDD §3.5
 * 구현체: MockJudge(키워드 결정론) / GeminiJudge(프록시 경유) / WebLLMJudge(W4 옵션)
 */
export interface SpellJudge {
  /** 자유 텍스트를 판정한다. 실패 시 throw하지 말고 안전한 v2 결과를 반환할 것. */
  judge(text: string, options?: JudgeOptions): Promise<SpellJudgement>;
  /** 판정기 이름 (AI 문서·디버그 HUD 표기용) */
  readonly name: string;
  /** [디버그] 직전 judge() 호출의 실제 출처 (예: gemini/cache/fallback). HUD 표기용, 선택적. */
  readonly lastSource?: string;
  /** [디버그] fallback일 때 원격 판정이 실패한 이유. 관측 전용, 게임 로직에서 소비하지 않는다. */
  readonly lastFallbackReason?: string;
  /** 런 단위 원격 판정 차단 상태. true면 현재 영창은 로컬 판정을 우선한다. */
  readonly offlineMode?: boolean;
  /** 새 런·재시작에서 런 단위 판정 상태를 초기화한다. */
  resetRun?(): void;
  /** 캐시를 우회해 실제 원격 판정 경로가 회복됐는지 확인한다. */
  probeRemote?(text: string, options?: JudgeOptions): Promise<boolean>;
}

export type CastMode = 'normal' | 'ultimate';
export interface UltimateResonanceContext {
  elements: SpellElement[];
  forms: SpellForm[];
  effects: SpellEffect[];
  recentNames: string[];
}
export interface JudgeOptions {
  castMode?: CastMode;
  resonance?: UltimateResonanceContext;
}
