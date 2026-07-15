import Phaser from 'phaser';
import { ProtoScene } from './scenes/ProtoScene';
import { bindRunUi } from './ui/runUiBinding';

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

// R3 런 UI 결합 — 씬 부트 완료 후 RunController 공개 계약에 바인딩 (씬 코드 무접촉)
const bindRunUiWhenReady = (): void => {
  const scene = game.scene.getScene('proto') as ProtoScene | null;
  if (scene?.runController) {
    bindRunUi(scene.runController);
    return;
  }
  window.setTimeout(bindRunUiWhenReady, 50);
};
bindRunUiWhenReady();
