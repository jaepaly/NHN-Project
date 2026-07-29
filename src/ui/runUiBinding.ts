import type { RewardOption, RunController } from '../run/runContract';
import type { SpellForm } from '../spell/types';
import { showRewardCards } from './rewardCardOverlay';
import { ownedLabelFor, summarizeRunRewards } from '../run/runRewardSummary';
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
  /** 보상 화면에 함께 띄울 씬 쪽 맥락 (주문서 보유 등 — 컨트롤러가 모르는 것) */
  contextLines?: () => string[];
  /**
   * 보상 선택 후 **다음 방으로 넘어가기 전에** 끼어드는 단계 — 포탈로 다음 방을 고른다 (#214).
   *
   * 왜 여기인가: `chooseReward()`가 호출되는 **그 순간** RunController가 전환 타이머를
   * 걸어버린다(`scheduleTransition`). 그러니 그 호출을 미루는 것이 컨트롤러를 건드리지
   * 않고 방 전환을 멈출 수 있는 유일한 지점이다. 분기 선택은 R3 UI 책임이고
   * RunController는 방 개수·보상만 세므로, 계약을 넘지 않는다.
   *
   * 거부(reject)하거나 던지면 선택을 건너뛰고 그대로 진행한다 — 포탈 UI가 깨져도
   * 런이 멈추면 안 된다.
   */
  beforeAdvance?: () => Promise<void>;
}

export function bindRunUi(controller: RunController, hooks: RunUiHooks = {}): void {
  // 초기 HUD (ROOM 1/n)
  updateRunHud(controller.state);

  controller.on('room-cleared', (options) => {
    // 이미 보유 배지 — 이번 런에서 고른 스택형 보상을 카드에 표시 (게임성 ②)
    const ownedAtOffer = controller.state.rewards;
    // 이번 런 누적 — 전투 HUD가 아니라 "무엇을 더할까"를 고르는 이 화면에 붙인다
    const contextLines = [
      summarizeRunRewards(ownedAtOffer),
      ...(hooks.contextLines?.() ?? []),
    ].filter((line) => line.length > 0);
    void showRewardCards(options, {
      ownedLabelFor: (option) => ownedLabelFor(option, ownedAtOffer),
      formFor: hooks.formFor,
      contextLines,
    }).then(async (chosen) => {
      // 포탈 선택이 끝날 때까지 chooseReward를 미룬다 (전환 타이머가 거기서 걸린다)
      try {
        await hooks.beforeAdvance?.();
      } catch {
        /* 포탈 UI가 실패해도 런은 계속된다 — 여기서 멈추면 방에 갇힌다 */
      }
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
