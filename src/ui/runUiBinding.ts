import type { RewardOption, RunController } from '../run/runContract';
import type { SpellForm } from '../spell/types';
import { showRewardCards } from './rewardCardOverlay';
import { ownedLabelFor } from '../run/runRewardSummary';
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
export interface RunUiHooks {
  /**
   * 보상 카드가 가리키는 주문의 폼 해석기 — 폼 글리프 표시용.
   * 여기서 직접 조회하지 않고 **주입받는다**: 이 모듈은 전투 내부 상태에 접근하지
   * 않는다는 계약(위 주석)을 지켜야 하고, spellKey→스펙은 씬만 안다.
   */
  formFor?: (option: RewardOption) => SpellForm | null;
}

export function bindRunUi(controller: RunController, hooks: RunUiHooks = {}): void {
  // 초기 HUD (ROOM 1/n)
  updateRunHud(controller.state);

  controller.on('room-cleared', (options) => {
    // 이미 보유 배지 — 이번 런에서 고른 스택형 보상을 카드에 표시 (게임성 ②)
    const ownedAtOffer = controller.state.rewards;
    void showRewardCards(options, {
      ownedLabelFor: (option) => ownedLabelFor(option, ownedAtOffer),
      formFor: hooks.formFor,
    }).then((chosen) => {
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
