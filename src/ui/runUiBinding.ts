import type { RunController } from '../run/runContract';
import { showRewardCards } from './rewardCardOverlay';
import { playRoomTransition } from './roomTransition';
import { updateRunHud } from './runHud';

/**
 * R3 런 UI 결합 — RunController 공개 계약(이벤트·chooseReward)만 소비한다.
 * (docs/R3_RUN_UI_CONTRACT.md의 결합 코드. 전투 내부 상태에는 접근하지 않는다)
 *
 * 흐름: room-cleared → 카드 3택 표시 → 선택 → chooseReward
 *       reward-applied/room-started → HUD 즉시 갱신
 *       room-transition → 페이드 + "ROOM n" 연출 (R1이 준 durationMs 사용)
 *       run-completed → 완주 연출
 */
export function bindRunUi(controller: RunController): void {
  // 초기 HUD (ROOM 1/n)
  updateRunHud(controller.state);

  controller.on('room-cleared', (options) => {
    void showRewardCards(options).then((chosen) => {
      controller.chooseReward(chosen.id);
    });
  });

  controller.on('reward-applied', (_chosen, state) => {
    updateRunHud(state);
  });

  controller.on('room-transition', (state, durationMs) => {
    void playRoomTransition(`ROOM ${state.roomIndex + 1}`, durationMs);
  });

  controller.on('room-started', (state) => {
    updateRunHud(state);
  });

  controller.on('run-completed', (state) => {
    updateRunHud(state);
    void playRoomTransition('RUN COMPLETE', 1000, '모든 방을 정화했다');
  });
}
