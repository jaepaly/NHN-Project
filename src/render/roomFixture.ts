import Phaser from 'phaser';
import {
  ROOM_FIXTURE_CONFIG,
  ROOM_FIXTURE_LABEL,
  isWithinFixtureReach,
} from '../run/roomFixtureConfig';
import type { RoomFixtureKind } from '../run/roomFixtureConfig';

/**
 * 방 설치물 (#214) — 보물상자·제단. 다가가면 1회 발화한다.
 *
 * 포탈(PortalField)과 같은 문법을 쓴다: **몸으로 다가가는 것**이 상호작용이다.
 * 새 키를 배정하지 않는 이유는 이 게임의 조작 어휘를 늘리지 않기 위해서다 —
 * WASD·ENTER·ESC 셋이면 충분하고, 포탈이 이미 "다가가면 발동"을 가르쳤다.
 *
 * ⚠️ 발광(ADD)을 절제한다 — 설치물은 방에 오래 서 있으므로(전투방의 순간 연출과 다르다)
 * 밝은 가산 발광을 상시 켜두면 #220 예산을 깬다. 알파 사인 진폭도 0.2~0.4 규율을 지킨다.
 */

const KIND_COLOR: Record<RoomFixtureKind, number> = {
  treasure: 0xffd166,
  altar: 0xd0a8ff,
};

export class RoomFixture {
  private readonly scene: Phaser.Scene;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly spawnedAt: number;
  private readonly onInteract: () => void;
  private fired = false;

  constructor(
    scene: Phaser.Scene,
    readonly x: number,
    readonly y: number,
    readonly kind: RoomFixtureKind,
    onInteract: () => void,
  ) {
    this.scene = scene;
    this.onInteract = onInteract;
    this.spawnedAt = scene.time.now;
    const color = KIND_COLOR[kind];

    this.graphics = scene.add.graphics().setDepth(4);
    this.label = scene.add.text(x, y - ROOM_FIXTURE_CONFIG.radius - 18, ROOM_FIXTURE_LABEL[kind], {
      fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: `#${color.toString(16).padStart(6, '0')}`,
      stroke: '#05060f',
      strokeThickness: 4,
    }).setOrigin(0.5).setDepth(5);
    // 근접 안내 — 사거리에 들었을 때만 켠다 (상시 켜두면 잔소리가 된다)
    this.hint = scene.add.text(x, y + ROOM_FIXTURE_CONFIG.radius + 14, '다가가면 열린다', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#c2cbee',
      stroke: '#05060f',
      strokeThickness: 3,
    }).setOrigin(0.5).setDepth(5).setVisible(false);
  }

  /** 씬 update에서 호출 — 렌더 갱신 + 근접 판정. 사거리에 들면 onInteract 1회 발화. */
  update(playerX: number, playerY: number): void {
    if (this.fired) return;
    const armed = this.scene.time.now - this.spawnedAt >= ROOM_FIXTURE_CONFIG.armDelayMs;
    const t = this.scene.time.now;
    const color = KIND_COLOR[this.kind];
    // 진폭 0.2~0.4 (#220 규율) — 상시 서 있는 물체라 강한 점멸을 쓰지 않는다
    const pulse = 0.7 + 0.3 * Math.sin(t / 380);
    const near = isWithinFixtureReach(
      playerX, playerY, this.x, this.y, ROOM_FIXTURE_CONFIG.hintRadius,
    );
    this.hint.setVisible(near && armed);

    const g = this.graphics.clear();
    const r = ROOM_FIXTURE_CONFIG.radius;
    // 바닥 표식 — 여기 무언가 있다는 것을 멀리서도 읽히게
    g.lineStyle(1.5, color, 0.28 * pulse);
    g.strokeCircle(this.x, this.y, r + 14);
    if (this.kind === 'treasure') {
      // 상자 — 각진 몸통 + 뚜껑선. 원이면 상자로 안 읽힌다.
      g.fillStyle(0x2a2412, 0.9);
      g.fillRoundedRect(this.x - r, this.y - r * 0.62, r * 2, r * 1.24, 5);
      g.lineStyle(2.2, color, 0.85 * pulse);
      g.strokeRoundedRect(this.x - r, this.y - r * 0.62, r * 2, r * 1.24, 5);
      g.lineStyle(1.6, color, 0.7 * pulse);
      g.beginPath();
      g.moveTo(this.x - r, this.y - r * 0.16);
      g.lineTo(this.x + r, this.y - r * 0.16);
      g.strokePath();
      // 자물쇠
      g.fillStyle(color, 0.8 * pulse);
      g.fillRect(this.x - 3, this.y - r * 0.16, 6, 9);
    } else {
      // 제단 — 받침 위의 기둥. 위로 솟은 형태라 "바치는 곳"으로 읽힌다.
      g.fillStyle(0x1a1230, 0.9);
      g.fillRoundedRect(this.x - r, this.y + r * 0.2, r * 2, r * 0.5, 3);
      g.lineStyle(2, color, 0.8 * pulse);
      g.strokeRoundedRect(this.x - r, this.y + r * 0.2, r * 2, r * 0.5, 3);
      g.fillStyle(0x241844, 0.9);
      g.fillRoundedRect(this.x - r * 0.42, this.y - r * 0.75, r * 0.84, r * 0.95, 3);
      g.lineStyle(2, color, 0.85 * pulse);
      g.strokeRoundedRect(this.x - r * 0.42, this.y - r * 0.75, r * 0.84, r * 0.95, 3);
      // 위로 뻗는 세 줄기 — 대가를 받아 가는 방향
      for (let i = -1; i <= 1; i += 1) {
        g.lineStyle(1.4, color, (0.5 + i * 0.06) * pulse);
        g.beginPath();
        g.moveTo(this.x + i * 8, this.y - r * 0.8);
        g.lineTo(this.x + i * 11, this.y - r * 1.35);
        g.strokePath();
      }
    }

    if (armed && isWithinFixtureReach(playerX, playerY, this.x, this.y)) {
      this.fired = true;
      this.hint.setVisible(false);
      this.onInteract();
    }
  }

  destroy(): void {
    this.graphics.destroy();
    this.label.destroy();
    this.hint.destroy();
  }
}
