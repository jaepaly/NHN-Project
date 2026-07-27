/**
 * 일시정지 설정 슬라이더 기하 (순수) — 렌더(게이지)와 히트 테스트(드래그 존)가
 * **같은 좌표**를 써야 손과 눈이 어긋나지 않는다. 그래서 좌표 계산을 여기 한 곳에
 * 모으고 회귀로 고정한다 (minimapLayout ↔ minimapHud 분리와 같은 구조).
 *
 * Phaser에 의존하지 않으므로 node에서 그대로 검증된다.
 */

export const PAUSE_LAYOUT = { titleY: 186, firstY: 252, rowGap: 42 } as const;

/** 게이지 — hitHeight는 손이 세로로 미끄러져도 잡히도록 바보다 두껍다. */
export const PAUSE_BAR = { width: 170, height: 6, hitHeight: 22, knob: 7 } as const;

export interface BarRect {
  /** 바 왼쪽 끝 x */
  x: number;
  /** 바 위쪽 y */
  y: number;
  /** 바 길이 */
  w: number;
}

/** 행 인덱스 → 게이지 바 사각형 (화면 폭 기준 중앙 정렬). */
export function pauseBarRect(screenWidth: number, rowIndex: number): BarRect {
  return {
    x: screenWidth / 2 - PAUSE_BAR.width / 2,
    y: PAUSE_LAYOUT.firstY + rowIndex * PAUSE_LAYOUT.rowGap + 14,
    w: PAUSE_BAR.width,
  };
}

/** 드래그 존 — 바를 감싸되 손잡이 반경만큼 좌우로 넓힌다(양 끝을 잡기 쉽게). */
export function pauseSliderHitArea(
  screenWidth: number,
  rowIndex: number,
): { centerX: number; centerY: number; width: number; height: number } {
  const bar = pauseBarRect(screenWidth, rowIndex);
  return {
    centerX: bar.x + bar.w / 2,
    centerY: bar.y + PAUSE_BAR.height / 2,
    width: bar.w + PAUSE_BAR.knob * 2,
    height: PAUSE_BAR.hitHeight,
  };
}

/**
 * 포인터 x → 바 안의 비율 0~1. 바 밖으로 나가도 끝에 붙는다(클램프) —
 * 드래그 중 손이 벗어나도 슬라이더가 튀지 않아야 한다.
 */
export function pauseSliderRatio(bar: BarRect, pointerX: number): number {
  if (!Number.isFinite(pointerX) || bar.w <= 0) return 0;
  const raw = (pointerX - bar.x) / bar.w;
  return Math.min(1, Math.max(0, raw));
}
