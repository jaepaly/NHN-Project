/**
 * 포탈 설정 (#214) — Phaser 비의존 순수 상수 (회귀가 직접 import).
 * 렌더·접촉 로직은 src/render/portalField.ts.
 */
export const PORTAL_CONFIG = {
  radius: 34,
  /** 접촉 판정 반경 — 시각 링보다 살짝 안쪽 (스치기만 해도 빨려들면 오입력) */
  enterRadius: 26,
  /** 등장 후 이 시간 동안은 진입 무시 — 클리어 직후 서 있던 자리에 포탈이 떠도 안전 */
  armDelayMs: 700,
} as const;
