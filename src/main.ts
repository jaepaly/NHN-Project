import Phaser from 'phaser';
import { ProtoScene } from './scenes/ProtoScene';
import { showRewardCards } from './ui/rewardCardOverlay';
import { playRoomTransition } from './ui/roomTransition';
import { clearRunHud, updateRunHud } from './ui/runHud';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 960,
  height: 640,
  backgroundColor: '#05060f',
  scene: [ProtoScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

// 디버그·QA 스크립트용 (96조합 자동 스크린샷 QA에서 프레임 정지에 사용)
(window as unknown as Record<string, unknown>).__game = game;

// R3 런 UI 데모·QA 훅 — R1 RunController 연결 전까지의 검증용.
// 실제 결합은 docs/R3_RUN_UI_CONTRACT.md의 이벤트 계약을 따른다 (연결 PR에서 이 훅 제거).
(window as unknown as Record<string, unknown>).__r3 = {
  showRewardCards,
  playRoomTransition,
  updateRunHud,
  clearRunHud,
};
