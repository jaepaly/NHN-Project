import Phaser from 'phaser';

/** 보스의 발화는 전투 정보·일반 시스템 공지와 별도의 화자 카드로 표시한다. */
export interface BossDialogueCopy {
  speaker: string;
  line: string;
  color: number;
  holdMs?: number;
}

const DIALOGUE = {
  maxWidth: 680,
  sideMargin: 72,
  padX: 30,
  padY: 18,
  speakerSize: 14,
  lineSize: 24,
  /** 보스 이름 배너(화면 34%)보다 아래. 전투는 멈추지 않으므로 플레이어 위치를 가리지 않게 얇게 둔다. */
  yRatio: 0.56,
  depth: 123,
} as const;

/**
 * 기억의 주인 발화 전용 오버레이.
 *
 * 일반 공지는 배경판 없는 굵은 텍스트이고, 이 카드는 화자 이름·인장·인용문을 가진다.
 * 즉 전투 진행을 막는 대화창은 아니되, "누가 말했는가"는 분명하게 읽힌다.
 */
export function showBossDialogue(
  scene: Phaser.Scene,
  copy: BossDialogueCopy,
): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const panelWidth = Math.min(DIALOGUE.maxWidth, width - DIALOGUE.sideMargin);
  const color = Phaser.Display.Color.IntegerToColor(copy.color).rgba;

  const speaker = scene.add.text(0, 0, `◆ ${copy.speaker}`, {
    fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
    fontSize: `${DIALOGUE.speakerSize}px`,
    fontStyle: 'bold',
    color,
    letterSpacing: 1.8,
  }).setOrigin(0.5, 0);
  const line = scene.add.text(0, 0, `“${copy.line}”`, {
    fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
    fontSize: `${DIALOGUE.lineSize}px`,
    fontStyle: 'bold',
    color: '#f0ebff',
    align: 'center',
    wordWrap: { width: panelWidth - DIALOGUE.padX * 2, useAdvancedWrap: true },
    lineSpacing: 5,
  }).setOrigin(0.5, 0);

  const contentHeight = speaker.height + 10 + line.height;
  const panelHeight = contentHeight + DIALOGUE.padY * 2;
  const panel = scene.add.rectangle(0, 0, panelWidth, panelHeight, 0x090711, 0.94)
    .setStrokeStyle(1, copy.color, 0.86);
  const innerRule = scene.add.rectangle(0, -panelHeight / 2 + 8, panelWidth - 30, 1, copy.color, 0.52);
  const sigilOuter = scene.add.circle(-panelWidth / 2 + 21, 0, 8, 0x090711, 1)
    .setStrokeStyle(1, copy.color, 0.9);
  const sigilInner = scene.add.circle(-panelWidth / 2 + 21, 0, 3, copy.color, 0.92);

  const top = -panelHeight / 2 + DIALOGUE.padY;
  speaker.setY(top);
  line.setY(top + speaker.height + 10);
  const container = scene.add.container(width / 2, height * DIALOGUE.yRatio, [
    panel, innerRule, sigilOuter, sigilInner, speaker, line,
  ])
    .setScrollFactor(0)
    .setDepth(DIALOGUE.depth)
    .setAlpha(0)
    .setScale(0.97);

  scene.tweens.add({
    targets: container,
    alpha: 1,
    scale: 1,
    duration: 220,
    ease: 'Quad.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        y: container.y - 8,
        delay: copy.holdMs ?? 2300,
        duration: 420,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy(true),
      });
    },
  });
  return container;
}
