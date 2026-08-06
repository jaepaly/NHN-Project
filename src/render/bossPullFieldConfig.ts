/**
 * 보스 중력 인력 연출 수치 — **Phaser 없는 순수 설정**.
 *
 * ⚠️ 왜 파일이 갈려 있나: 회귀 하네스(esbuild → node)가 Phaser를 번들하지 못한다
 * (`phaser3spectorjs` 미해결). 그리기 코드와 수치를 한 파일에 두면 회귀가 이 수치를
 * 검사할 수 없다 — 이 저장소에서 여러 번 겪은 함정이라 처음부터 나눠 둔다.
 * 그리기는 `bossPullField.ts`.
 */
export const BOSS_PULL_FX = {
  /** 예고 링이 조여드는 시작 반경 — 인력 사거리를 넘겨 "넓게 모인다"로 읽히게 */
  telegraphStartRadius: 420,
  telegraphEndRadius: 70,
  /** 흡인 선이 생기는 주기(ms) */
  streakIntervalMs: 110,
  /** 한 번에 생기는 선 개수 */
  streakCount: 3,
  /** 선이 시작되는 반경 범위 */
  streakOuterRadius: 340,
  streakInnerRadius: 90,
  streakMs: 320,
  color: 0xb18cff,
} as const;
