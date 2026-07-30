import Phaser from 'phaser';
import type { MapNodeKind } from '../run/mapGraphContract';

/**
 * 포탈 (#214) — 방 클리어 후 다음 방 선택지를 월드 오브젝트로 세운다.
 *
 * 카드 UI가 아니라 **걸어 들어가는 마법진**인 이유: 이 게임의 선택 문법이 둘로
 * 갈리면 안 된다 — 카드는 "보상", 몸으로 가는 건 "이동". 포탈에 방 종류 라벨을
 * 달아 분기 선택이 정보 있는 결정이 되게 한다(로그라이크 문법).
 *
 * 씬 통합 전 선행 개발 산출물 — 씬은 spawn 후 update(playerX, playerY)만 부르면
 * 접촉 시 onEnter가 1회 발화한다. R1 그래프가 오면 choices()를 여기에 꽂는다.
 */
import { PORTAL_CONFIG } from '../run/portalConfig';

export { PORTAL_CONFIG };

const KIND_LABEL: Record<MapNodeKind, string> = {
  start: '시작',
  combat: '전투',
  elite: '정예',
  'stage-boss': '수문장',
  'memory-boss': '기억의 주인',
  treasure: '보물',
  altar: '제단',
  trap: '함정',
};

const KIND_COLOR: Record<MapNodeKind, number> = {
  start: 0x8fa4ff,
  combat: 0x8fa4ff,
  elite: 0xffa94d,
  'stage-boss': 0xff5a6e,
  'memory-boss': 0xff5a6e,
  treasure: 0xffd166,
  altar: 0xd0a8ff,
  trap: 0x72f1b8,
};

export interface PortalChoice {
  nodeId: string;
  kind: MapNodeKind;
  /**
   * 배치 좌표 (#245 `layoutRoomExits` 결과). 주면 그대로 세우고, 없으면 앵커 기준
   * 가로 부채꼴로 벌린다(선행 개발 시절의 자체 배치 — DEV 프리뷰가 아직 쓴다).
   *
   * 본 게임은 **반드시 계약값을 준다**: 출구는 오른쪽 가장자리에 목적지 lane 순서로
   * 세로 배치되고, 도착은 항상 왼쪽 중앙이다. 자체 배치를 쓰면 세 번째 포탈이
   * 방 밖(x > width)으로 밀려난다.
   */
  x?: number;
  y?: number;
  /**
   * 보상 크기 한 줄 (roomRewardScale.hint). 방 이름만 보이면 위험한 방을 고를 근거가
   * 없다 — "함정방 vs 보물방"에서 아무도 함정을 안 고르는 이유가 그것이었다(총괄 지적).
   */
  rewardHint?: string;
}

interface PortalView {
  choice: PortalChoice;
  x: number;
  y: number;
  ring: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  hint: Phaser.GameObjects.Text | null;
}

export class PortalField {
  private readonly scene: Phaser.Scene;
  private readonly portals: PortalView[] = [];
  private readonly spawnedAt: number;
  private readonly onEnter: (choice: PortalChoice) => void;
  private entered = false;

  /**
   * @param anchorX/anchorY 배치 기준점(보통 방 중앙) — 선택지를 부채꼴로 벌려 세운다
   */
  constructor(
    scene: Phaser.Scene,
    anchorX: number,
    anchorY: number,
    choices: readonly PortalChoice[],
    onEnter: (choice: PortalChoice) => void,
  ) {
    this.scene = scene;
    this.onEnter = onEnter;
    this.spawnedAt = scene.time.now;

    const count = Math.max(1, choices.length);
    choices.forEach((choice, index) => {
      // 계약값(#245)이 있으면 그대로. 없으면 앵커 기준 가로 부채꼴(DEV 프리뷰 폴백).
      const offsetX = (index - (count - 1) / 2) * 130;
      const x = choice.x ?? anchorX + offsetX;
      const y = choice.y ?? anchorY - 40;
      const color = KIND_COLOR[choice.kind];

      const ring = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
      const label = scene.add.text(x, y + PORTAL_CONFIG.radius + 14, KIND_LABEL[choice.kind], {
        fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
        fontSize: '13px',
        fontStyle: 'bold',
        color: `#${color.toString(16).padStart(6, '0')}`,
        stroke: '#05060f',
        strokeThickness: 3,
      }).setOrigin(0.5).setDepth(5);

      // 보상 힌트 — 방 이름 아래 작게. 없으면 만들지 않는다(빈 줄이 자리를 먹지 않게)
      const hint = choice.rewardHint
        ? scene.add.text(x, y + PORTAL_CONFIG.radius + 32, choice.rewardHint, {
          fontFamily: 'Consolas, monospace',
          fontSize: '11px',
          color: '#c2cbee',
          stroke: '#05060f',
          strokeThickness: 3,
        }).setOrigin(0.5).setDepth(5)
        : null;
      this.portals.push({ choice, x, y, ring, label, hint });
    });
  }

  /** 씬 update에서 호출 — 렌더 갱신 + 접촉 판정. 진입되면 onEnter 1회 발화. */
  update(playerX: number, playerY: number): void {
    if (this.entered) return;
    const armed = this.scene.time.now - this.spawnedAt >= PORTAL_CONFIG.armDelayMs;
    const t = this.scene.time.now;

    for (const portal of this.portals) {
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin((t + portal.x) / 300));
      const color = KIND_COLOR[portal.choice.kind];
      portal.ring.clear();
      portal.ring.lineStyle(2.5, color, (armed ? 0.9 : 0.35) * pulse);
      portal.ring.strokeCircle(portal.x, portal.y, PORTAL_CONFIG.radius);
      portal.ring.lineStyle(1, color, 0.4 * pulse);
      portal.ring.strokeCircle(portal.x, portal.y, PORTAL_CONFIG.radius * (0.55 + 0.2 * pulse));

      if (armed
        && Phaser.Math.Distance.Between(playerX, playerY, portal.x, portal.y)
          <= PORTAL_CONFIG.enterRadius) {
        this.entered = true;
        this.onEnter(portal.choice);
        return;
      }
    }
  }

  destroy(): void {
    for (const portal of this.portals) {
      portal.ring.destroy();
      portal.label.destroy();
      portal.hint?.destroy();
    }
    this.portals.length = 0;
  }
}
