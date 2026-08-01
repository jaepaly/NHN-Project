import Phaser from 'phaser';

/**
 * 주요 공지 배너 — 판·강조선을 갖춘 중요 문구 채널 (총괄 지적: "가장 중요한 문구인데
 * 눈에 잘 안 들어온다").
 *
 * 왜 필요한가: 기존 `announceSystemMessage`는 배경판 없는 맨 텍스트(24px + 외곽선 4)라,
 * VFX가 난무하는 전투 화면 위에서 묻힌다. 진화·각성·보스 등장처럼 **판을 바꾸는 사건**이
 * 방 클리어와 똑같은 무게로 지나가면 플레이어가 놓친다. 저주 배너(roomCurseBanner)가
 * 이미 판+강조선+위계로 잘 읽히므로, 그 시각 언어를 일반화해 재사용한다.
 *
 * **정렬 규칙** (총괄 지적: "중앙 정렬 탓에 각 줄 시작점이 달라 정돈돼 보이지 않는다):
 *   - 제목은 한 줄이므로 중앙 정렬
 *   - **본문·목록은 왼쪽 정렬** — 블록 자체는 화면 중앙에 놓되 글자는 한 축에서 시작한다.
 *     목록을 중앙 정렬하면 눈이 매 줄 새 시작점을 찾아야 해서 읽는 비용이 커진다.
 */

export interface SystemBannerCopy {
  title: string;
  /** 본문·목록 — **왼쪽 정렬**로 쌓인다. 없으면 제목만 있는 얇은 배너가 된다. */
  lines?: readonly string[];
  color: number;
  /** 표시 유지 시간(ms). 목록이 길면 읽을 시간을 더 준다. */
  holdMs?: number;
  /** 방을 벗어나면 즉시 폐기해야 하는 입장 안내인지 여부. */
  scope?: 'room';
}

const BANNER = {
  maxWidth: 620,
  sideMargin: 48,
  padY: 22,
  titleSize: 25,
  lineSize: 15,
  lineGap: 24,
  /** 저주 배너(120)보다 위 — 주요 공지가 방 진입 연출에 가리면 안 된다 */
  depth: 122,
} as const;

/**
 * 주요 공지를 띄운다. 컨테이너를 돌려주므로 호출측이 큐를 관리할 수 있다.
 * 저주 배너와 같은 등장·퇴장 곡선을 써서 두 배너가 한 어휘로 읽힌다.
 */
export function showSystemBanner(
  scene: Phaser.Scene,
  copy: SystemBannerCopy,
): Phaser.GameObjects.Container {
  const { width, height } = scene.scale;
  const panelWidth = Math.min(BANNER.maxWidth, width - BANNER.sideMargin);
  const lines = copy.lines?.filter((l) => l.length > 0) ?? [];
  const rgba = Phaser.Display.Color.IntegerToColor(copy.color).rgba;

  const title = scene.add.text(0, 0, copy.title, {
    fontFamily: '"Noto Serif KR", serif',
    fontSize: `${BANNER.titleSize}px`,
    fontStyle: 'bold',
    color: rgba,
    align: 'center',
  }).setOrigin(0.5, 0);

  // 본문은 왼쪽 정렬 — origin(0, 0)이라 블록의 왼쪽 모서리가 기준이 된다.
  const body = lines.length > 0
    ? scene.add.text(0, 0, lines.join('\n'), {
      fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
      fontSize: `${BANNER.lineSize}px`,
      color: '#dfe6ff',
      align: 'left',
      lineSpacing: BANNER.lineGap - BANNER.lineSize,
      wordWrap: { width: panelWidth - 56, useAdvancedWrap: true },
    }).setOrigin(0, 0)
    : null;

  const bodyHeight = body ? body.height : 0;
  const gap = body ? 14 : 0;
  const contentHeight = title.height + gap + bodyHeight;
  const panelHeight = contentHeight + BANNER.padY * 2;

  const panel = scene.add.rectangle(0, 0, panelWidth, panelHeight, 0x080511, 0.92)
    .setStrokeStyle(1, copy.color, 0.78);
  const accent = scene.add.rectangle(
    -panelWidth / 2 + 4, 0, 5, panelHeight - 32, copy.color, 0.9,
  );

  // 제목·본문을 판 안에서 위에서부터 쌓는다
  const top = -panelHeight / 2 + BANNER.padY;
  title.setY(top);
  // 본문 블록은 왼쪽 정렬이되, 블록 전체는 판 안에서 가운데로 놓는다
  if (body) body.setPosition(-body.width / 2, top + title.height + gap);

  const children: Phaser.GameObjects.GameObject[] = [panel, accent, title];
  if (body) children.push(body);

  const container = scene.add.container(width / 2, height * 0.34, children)
    .setScrollFactor(0)
    .setDepth(BANNER.depth)
    .setAlpha(0)
    .setScale(0.96);

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
        delay: copy.holdMs ?? 2200,
        duration: 520,
        ease: 'Quad.easeIn',
        onComplete: () => container.destroy(true),
      });
    },
  });
  return container;
}
