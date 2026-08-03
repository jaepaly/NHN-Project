import Phaser from 'phaser';
import { ProtoScene } from './scenes/ProtoScene';
import { TitleScene } from './scenes/TitleScene';
import { bindRunUi } from './ui/runUiBinding';

try {
  const fontUrl = `${import.meta.env.BASE_URL}assets/fonts/NotoSerifKR-Variable.woff2`;
  const faces = await Promise.all([
    new FontFace('Noto Serif KR', `url("${fontUrl}") format("woff2")`, {
      weight: '400',
    }).load(),
    new FontFace('Noto Serif KR', `url("${fontUrl}") format("woff2")`, {
      weight: '700',
    }).load(),
  ]);
  for (const face of faces) document.fonts.add(face);
} catch (error) {
  console.warn('[Font] Noto Serif KR preload failed; using system fallback.', error);
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: 960,
  height: 640,
  backgroundColor: '#05060f',
  scene: [TitleScene, ProtoScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
});

// 디버그·QA 스크립트용 (96조합 자동 스크린샷 QA에서 프레임 정지에 사용)
(window as unknown as Record<string, unknown>).__game = game;

/**
 * R3 런 UI 결합 — RunController 공개 계약에만 바인딩 (씬 코드 무접촉).
 *
 * 폴링으로 `isActive('proto')`를 기다리면 백그라운드 탭에서 setTimeout이 초 단위로
 * throttle돼 결합이 늦어지고, 그 사이 발생한 room-cleared를 놓쳐 보상 카드가 뜨지 않는다.
 * 씬 인스턴스는 부팅 직후 존재하므로, CREATE 이벤트를 미리 예약해 create 완료 즉시 결합한다.
 * (HUD는 전투 씬 진입 후 나타나야 하므로 인스턴스 생성 시점이 아니라 CREATE 시점에 붙인다)
 */
// 폼 글리프 해석은 씬만 할 수 있다(spellKey→스펙) — 결합 모듈에 주입해 계약을 지킨다
const hooksFor = (scene: ProtoScene) => ({
  formFor: (option: Parameters<ProtoScene['rewardFormFor']>[0]) => scene.rewardFormFor(option),
  contextLines: () => scene.rewardContextLines(),
  afterRewardApplied: (option: Parameters<ProtoScene['resolveRewardFollowup']>[0]) => scene.resolveRewardFollowup(option),
  // 보상 선택 후 UI에서 다음 방을 고른다 — 씬이 맵 그래프를 진행시킨다 (#214)
  chooseNextRoom: () => scene.chooseRoomDestination(),
});

const bindRunUiWhenSceneReady = (): void => {
  const scene = game.scene.getScene('proto') as ProtoScene | null;
  if (!scene) {
    window.setTimeout(bindRunUiWhenSceneReady, 50);
    return;
  }
  // 이미 create가 끝난 뒤라면(HMR 등) 즉시 결합
  if (game.scene.isActive('proto')) {
    bindRunUi(scene.runController, hooksFor(scene));
    return;
  }
  scene.events.once(Phaser.Scenes.Events.CREATE, () => bindRunUi(scene.runController, hooksFor(scene)));
};
bindRunUiWhenSceneReady();
