import Phaser from 'phaser';
import { UI_HEX } from '../ui/uiTokens';
import { FRAME_CONFIG, deckledPoints } from './grimoireFrameGeometry';

export { FRAME_CONFIG, deckledPoints };

/**
 * 마도서 판 — **항상 떠 있는 화면(HUD·우측 패널)을 위한 Phaser 장식.**
 *
 * 총괄 지시: 자주 보이는 것부터, *"체력 마나 뜨는 좌측 상단이랑, 현재 상태 뜨는
 * 우측 상단이랑 아무튼 다"*.
 *
 * DOM 오버레이는 SVG 장식을 쓸 수 있지만(`grimoireOrnament.ts`) HUD는 Phaser
 * Graphics라 **선을 직접 그어야 한다.** 지금까지는 `fillRoundedRect` + 1px 테두리 —
 * 총괄이 지적한 "상자에 색만 칠한" 그 형태다.
 *
 * ## 오버레이와 다르게 잡은 것
 *
 * HUD는 **작고(300×130) 늘 떠 있다.** 오버레이용 당초무늬를 그대로 넣으면 노이즈가
 * 되고, 무엇보다 **체력을 한눈에 읽는 기능**을 해친다. 그래서 장식을 세 가지로만
 * 줄였다:
 *
 *  1. 모서리 갈고리 — 당초무늬가 아니라 **꺾인 선 두 개**. 작은 판에서 곡선은 뭉갠다
 *  2. 이중 괘선 — 바깥 진한 선 + 안쪽 흐린 선. 1px 단선이 "기본값"으로 읽히는 걸 막는다
 *  3. 불규칙한 변 — 폴리곤으로 그려 각 변을 1~2px 흔든다. `fillRoundedRect`는
 *     항상 매끈한 호라 종이가 되지 않는다
 *
 * ⚠️ **애니메이션도 ADD 블렌드도 없다.** 정지 상태로 계속 떠 있는 물체라 미세한
 * 깜빡임도 누적 피로가 된다(#220 광과민성 예산).
 */

/**
 * 마도서 판을 그린다 — 바탕 + 불규칙한 변 + 이중 괘선 + 모서리 갈고리.
 *
 * @param alpha 바탕 불투명도. 판마다 다르다(HUD 0.9 · 우측 패널 0.86)
 */
export function drawGrimoirePanel(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  alpha = 0.9,
): void {
  const pts = deckledPoints(x, y, width, height);

  // ① 바탕 — 불규칙한 폴리곤. fillRoundedRect는 항상 매끈한 호라 종이가 안 된다
  g.fillStyle(UI_HEX.panel, alpha);
  g.fillPoints(toPointObjects(pts), true);

  // ② 바깥 괘선
  g.lineStyle(1.2, UI_HEX.border, 0.85);
  g.strokePoints(toPointObjects(pts), true);

  // ③ 안쪽 괘선 — 이게 있어야 1px 단선의 "기본값" 인상이 사라진다
  const r = FRAME_CONFIG.ruleGap;
  g.lineStyle(0.7, UI_HEX.accent, 0.22);
  g.strokeRect(x + r, y + r, width - r * 2, height - r * 2);

  // ④ 모서리 갈고리 — 작은 판에서 곡선 당초무늬는 뭉갠다. 꺾인 선 둘로 대신한다
  const h = FRAME_CONFIG.hookLength;
  g.lineStyle(1.6, UI_HEX.accent, 0.55);
  for (const [cx, cy, sx, sy] of [
    [x, y, 1, 1],
    [x + width, y, -1, 1],
    [x, y + height, 1, -1],
    [x + width, y + height, -1, -1],
  ] as const) {
    g.beginPath();
    g.moveTo(cx + sx * h, cy + sy * 1.5);
    g.lineTo(cx + sx * 2, cy + sy * 1.5);
    g.lineTo(cx + sx * 2, cy + sy * h);
    g.strokePath();
  }
}

/**
 * 구획 괘선 — 판 안에서 영역을 나눈다. 여백만으로 나누면 "칸"이 아니라 "간격"이다.
 * 가운데 마름모는 DOM 쪽 `divider()`와 같은 문법이다.
 */
export function drawSectionRule(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
): void {
  const mid = x + width / 2;
  g.lineStyle(0.8, UI_HEX.accent, 0.3);
  g.beginPath();
  g.moveTo(x + 4, y);
  g.lineTo(mid - 7, y);
  g.moveTo(mid + 7, y);
  g.lineTo(x + width - 4, y);
  g.strokePath();
  // 가운데 마름모
  g.fillStyle(UI_HEX.accent, 0.42);
  g.fillPoints(toPointObjects([mid, y - 3.5, mid + 3.5, y, mid, y + 3.5, mid - 3.5, y]), true);
}

function toPointObjects(flat: readonly number[]): Phaser.Geom.Point[] {
  const out: Phaser.Geom.Point[] = [];
  for (let i = 0; i < flat.length; i += 2) {
    out.push(new Phaser.Geom.Point(flat[i], flat[i + 1]));
  }
  return out;
}
