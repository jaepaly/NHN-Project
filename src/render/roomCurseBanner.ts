import Phaser from 'phaser';

export interface RoomCurseBannerCopy {
  title: string;
  subtitle: string;
  rule: string;
  color: number;
}

/** 방/웨이브 공지와 경쟁하지 않는 저주 전용 진입 배너. */
export function showRoomCurseBanner(
  scene: Phaser.Scene,
  copy: RoomCurseBannerCopy,
): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const panelWidth = Math.min(620, width - 48);
  const panel = scene.add.rectangle(0, 0, panelWidth, 144, 0x080511, 0.92)
    .setStrokeStyle(1, copy.color, 0.78);
  const accent = scene.add.rectangle(-panelWidth / 2 + 4, 0, 5, 112, copy.color, 0.9);
  const title = scene.add.text(0, -38, copy.title, {
    fontFamily: 'Noto Serif KR, serif',
    fontSize: '25px',
    fontStyle: 'bold',
    color: Phaser.Display.Color.IntegerToColor(copy.color).rgba,
    align: 'center',
  }).setOrigin(0.5);
  const subtitle = scene.add.text(0, 0, copy.subtitle, {
    fontFamily: 'Noto Serif KR, serif',
    fontSize: '16px',
    color: '#d8c8eb',
    align: 'center',
  }).setOrigin(0.5);
  const rule = scene.add.text(0, 34, copy.rule, {
    fontFamily: 'Noto Sans KR, sans-serif',
    fontSize: '14px',
    fontStyle: 'bold',
    color: '#f1e7ff',
    align: 'center',
  }).setOrigin(0.5);

  const container = scene.add.container(width / 2, height * 0.34, [
    panel,
    accent,
    title,
    subtitle,
    rule,
  ]).setScrollFactor(0).setDepth(120).setAlpha(0).setScale(0.96);

  scene.tweens.add({
    targets: container,
    alpha: 1,
    scale: 1,
    duration: 260,
    ease: 'Quad.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        y: container.y - 10,
        delay: 2200,
        duration: 520,
        ease: 'Quad.easeIn',
        onComplete: () => container.destroy(true),
      });
    },
  });
  return container;
}
