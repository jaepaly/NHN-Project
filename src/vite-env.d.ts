/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 주문 판정 프록시 URL (proxy/README.md 참조). 없으면 MockJudge로 로컬 개발. */
  readonly VITE_JUDGE_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
