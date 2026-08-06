/**
 * 오버레이 페이드인 예약 — 그리고 **닫힘이 그 예약을 이긴다**는 보장.
 *
 * ## 왜 예약이 두 겹인가
 *
 * 오버레이는 DOM을 붙인 **다음 프레임**에 `active`를 붙여야 페이드인이 보인다. 같은
 * 프레임에 붙이면 브라우저가 시작 상태를 못 그려 그냥 튀어나온다. 그래서 `rAF`를 쓴다.
 *
 * 그런데 **배경 탭에서는 rAF가 멈춘다.** 그러면 오버레이가 영영 안 뜨고, 오버레이가
 * 진행을 붙잡고 있는 종류(보상·첫 안내)라면 게임이 멈춘 것처럼 된다. 그래서
 * `setTimeout` 폴백을 같이 건다.
 *
 * ## 고친 것 — 닫고 나서 다시 열리는 문제
 *
 * ⚠️ 두 예약을 걸어 두기만 하고 **닫을 때 취소하지 않으면**, 뜨기도 전에 닫은 오버레이가
 * 화면에 그대로 남는다. 순서가 이렇게 된다:
 *
 *   1. 오버레이 생성, 60ms 뒤 활성화 예약
 *   2. 그 전에 사용자가 Enter → `finish()`가 리스너를 떼고 `active`를 지우고,
 *      **내용 비우기를 240ms 뒤로** 예약한다
 *   3. 60ms에 예약된 활성화가 돌아 `active`를 **도로 붙인다**
 *   4. 240ms의 정리는 "아직 active네" 하고 그냥 지나간다
 *
 * 남는 건 **닫혔는데 화면을 덮고 있는 전체 화면 모달**이다. 리스너는 이미 떼어졌으니
 * 키로도 못 닫는다. 그 아래에서 게임은 정상적으로 돌아가고 있어서 더 나쁘다 —
 * 플레이어에겐 그냥 멈춘 것으로 보인다.
 *
 * 흔한 상황이다. 카드를 Enter로 고른 직후 Enter를 한 번 더 누르거나, 키를 누르고 있어
 * 키 리피트(≈30~50ms)가 들어오면 바로 이 순서가 된다. 실제로 완주 QA 자동 구동 중
 * 첫 런 안내에서 재현됐다.
 *
 * 그래서 예약을 **취소할 수 있는 형태로** 돌려준다. 닫는 쪽은 `cancel()`만 부르면 된다.
 */

export interface OverlayActivation {
  /**
   * 아직 안 뜬 활성화를 취소한다. 이미 떴으면 아무 일도 하지 않는다.
   * 닫는 경로(`finish`·`cleanup`)에서 **반드시** 부른다.
   */
  cancel(): void;
}

/**
 * 다음 프레임(또는 배경 탭 폴백)에 `activate`를 **한 번만** 실행한다.
 *
 * @param activate `active` 클래스를 붙이는 등 실제로 화면에 띄우는 일
 */
export function scheduleOverlayActivation(activate: () => void): OverlayActivation {
  let settled = false;
  const fire = (): void => {
    if (settled) return;
    settled = true;
    activate();
  };
  const frame = requestAnimationFrame(fire);
  const timer = window.setTimeout(fire, 60);
  return {
    cancel(): void {
      // settled를 먼저 세워, 취소 시점에 이미 큐에 들어간 콜백이 돌아도 막힌다.
      settled = true;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    },
  };
}
