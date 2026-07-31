/**
 * 마도서 판의 **계산** — Phaser를 참조하지 않는다.
 *
 * 그리기는 `grimoireFrame.ts`가 한다. 이 프로젝트의 순수 모듈 원칙대로 갈랐다:
 * Phaser를 import하면 회귀가 번들되지 않아(phaser3spectorjs) 검사할 수 없다.
 * 실제로 한 번 걸려서 나눴다.
 */

export const FRAME_CONFIG = {
  /** 변을 흔드는 폭(px). 크면 찢어진 종이가 되고 작으면 직선과 구분이 안 된다 */
  jitter: 2,
  /** 모서리 갈고리 길이 */
  hookLength: 13,
  /** 이중 괘선 간격 */
  ruleGap: 3.5,
} as const;

/**
 * 불규칙한 변의 꼭짓점 — 각 변 중간에 점을 하나 넣고 안팎으로 밀어 종이처럼 만든다.
 *
 * ⚠️ **결정론이어야 한다.** 매 프레임 다시 그리는데 난수를 쓰면 판이 떨린다. 늘 떠
 * 있는 물체라 미세한 떨림도 누적 피로가 된다(#220 광과민성 예산).
 *
 * @returns [x0,y0, x1,y1, ...] 평면 배열 (Phaser Geom에 의존하지 않기 위해)
 */
export function deckledPoints(
  x: number,
  y: number,
  width: number,
  height: number,
  jitter = FRAME_CONFIG.jitter,
): number[] {
  const j = jitter;
  return [
    x + 2, y + j,
    x + width * 0.42, y - j * 0.5,
    x + width - 3, y + j * 0.6,
    x + width - j * 0.4, y + height * 0.38,
    x + width - 2, y + height - j,
    x + width * 0.55, y + height + j * 0.5,
    x + 3, y + height - j * 0.7,
    x + j * 0.5, y + height * 0.45,
  ];
}
