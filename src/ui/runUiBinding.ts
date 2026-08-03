import type { RewardOption, RunController } from '../run/runContract';
import type { SpellForm } from '../spell/types';
import { showRewardCards } from './rewardCardOverlay';
import { ownedLabelFor, summarizeRunRewards } from '../run/runRewardSummary';
import { playRoomTransition } from './roomTransition';
// ROOM 칩(DOM)은 씬의 우상단 상태 패널로 합쳤다 (총괄 지적: 우상단 창이 너무 많다).
// clearRunHud만 남겨 과거 세션이 남긴 칩을 지운다 — 씬 재진입에서 유령 칩 방지.
import { clearRunHud } from './runHud';

/**
 * R3 런 UI 결합 — RunController 공개 계약(이벤트·chooseReward)만 소비한다.
 * (docs/R3_RUN_UI_CONTRACT.md의 결합 코드. 전투 내부 상태에는 접근하지 않는다)
 *
 * 흐름: room-cleared → 카드 3택 표시 → 선택·즉시 적용 → 다음 방 UI → 전환 연출
 *       room-transition → 페이드 + "ROOM n" 연출 (R1이 준 durationMs 사용)
 *
 * ROOM n/m 표시는 **씬의 우상단 상태 패널**이 그린다 (종전 DOM 칩에서 이관).
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
  /** 보상 적용 뒤, 다음 방 선택 전에 처리할 씬 전용 후속 선택. */
  afterRewardApplied?: (chosen: RewardOption) => Promise<void>;
  /** 위험하지만 유효한 선택을 적용하기 전 최종 확인한다. false면 카드 선택으로 돌아간다. */
  confirmRewardSelection?: (chosen: RewardOption) => Promise<boolean>;
  /**
   * 보상 선택 후 **다음 방으로 넘어가기 전에** 끼어드는 단계 — UI로 다음 방을 고른다 (#214).
   *
   * ⚠️ **`chooseReward()` 뒤에 실행된다.** 종전엔 앞이었다: `chooseReward`가 호출되는
   * 순간 RunController가 전환 타이머를 걸어버리므로, 그 호출을 미루는 것이 방 전환을
   * 멈추는 유일한 방법이라고 봤다.
   *
   * 그런데 `chooseReward`는 **보상 적용도 같이 한다**(`applyReward`). 그래서 카드를
   * 골라도 포탈에 진입할 때까지 최대 체력·마나·친화가 반영되지 않았다 — 총괄 제보:
   * *"보상 선택시 그 즉시 체력 등이 변하지 않고 다음 방으로 가야 변하던데?"*
   * 고른 것이 화면에 안 나타나면 그 선택이 무슨 의미였는지 알 수 없다.
   *
   * 지금은 순서를 바꿨다: 보상은 **즉시** 적용하고, 전환 타이머는 씬이 주입한
   * `scheduleTransition`이 붙잡는다(`ProtoScene`의 `runTransitionGate`). 컨트롤러는
   * 그대로다.
   *
   * 거부(reject)하거나 던지면 선택을 건너뛰고 그대로 진행한다 — 포탈 UI가 깨져도
   * 런이 멈추면 안 된다.
   */
  chooseNextRoom?: () => Promise<void>;
}

export function bindRunUi(controller: RunController, hooks: RunUiHooks = {}): void {
  // 과거 빌드가 남긴 DOM 칩 제거 — 이제 ROOM은 씬 패널이 그린다
  clearRunHud();
  // chooseReward는 room-transition 이벤트도 동기 발화한다. 다음 방 UI가 열릴 때는
  // 전환 연출만 보관했다가 선택 완료 뒤 재생한다 — 보상 적용 시점은 늦추지 않는다.
  let choosingNextRoom = false;
  let queuedTransition: { label: string; durationMs: number } | null = null;

  controller.on('room-cleared', (options) => {
    // 이미 보유 배지 — 이번 런에서 고른 스택형 보상을 카드에 표시 (게임성 ②)
    const ownedAtOffer = controller.state.rewards;
    // 이번 런 누적 — 전투 HUD가 아니라 "무엇을 더할까"를 고르는 이 화면에 붙인다
    const contextLines = [
      summarizeRunRewards(ownedAtOffer),
      ...(hooks.contextLines?.() ?? []),
    ].filter((line) => line.length > 0);
    const chooseReward = async (): Promise<void> => {
      const chosen = await showRewardCards(options, {
        ownedLabelFor: (option) => ownedLabelFor(option, ownedAtOffer),
        formFor: hooks.formFor,
        contextLines,
      });
      if (!(await hooks.confirmRewardSelection?.(chosen) ?? true)) {
        await chooseReward();
        return;
      }
      // **먼저 적용한다** — 고른 것이 즉시 HUD에 나타나야 선택에 의미가 생긴다.
      // 전환 타이머는 씬이 주입한 scheduleTransition이 붙잡으므로 방은 넘어가지 않는다.
      choosingNextRoom = true;
      controller.chooseReward(chosen.id);
      try {
        try {
          await hooks.afterRewardApplied?.(chosen);
        } catch {
          /* 제단 후속 UI가 실패해도 방 전환까지 막으면 런이 고착된다. */
        }
        await hooks.chooseNextRoom?.();
      } catch {
        /* 방 선택 UI가 실패해도 씬의 폴백으로 런은 계속된다 */
      } finally {
        choosingNextRoom = false;
        const transition = queuedTransition;
        queuedTransition = null;
        if (transition) void playRoomTransition(transition.label, transition.durationMs);
      }
    };
    void chooseReward();
  });

  controller.on('room-transition', (state, durationMs) => {
    const transition = { label: `ROOM ${state.roomIndex + 1}`, durationMs };
    if (choosingNextRoom) {
      queuedTransition = transition;
      return;
    }
    void playRoomTransition(transition.label, transition.durationMs);
  });

  controller.on('run-completed', () => {
    void playRoomTransition('RUN COMPLETE', 1000, '모든 방을 정화했다');
  });
}
