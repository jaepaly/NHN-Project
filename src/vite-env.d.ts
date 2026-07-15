/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 주문 판정 프록시 URL. 미설정 시 createJudge의 기본 팀 공용 프록시를 사용. */
  readonly VITE_JUDGE_PROXY_URL?: string;
  /** '1'이면 실제 Gemini 대신 MockJudge 강제 (오프라인·할당량 절약용). */
  readonly VITE_JUDGE_MOCK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
