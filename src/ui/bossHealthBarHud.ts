import Phaser from 'phaser';
import { drawGrimoirePanel } from '../render/grimoireFrame';
import { bossHealthBarReadout, type BossHealthBarInput } from './bossHealthBarModel';
import { hex, UI_COLOR, UI_HEX, UI_SEMANTIC } from './uiTokens';

const WIDTH = 360;
const HEIGHT = 56;

/** #345 보스전에서만 상단 중앙에 고정되는 체력바. */
export class BossHealthBarHud {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hp: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(99).setVisible(false);
    this.title = scene.add.text(0, 0, '', {
      fontFamily: '"Noto Serif KR", Consolas, monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: UI_COLOR.textBright,
      align: 'center',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100).setVisible(false);
    this.hp = scene.add.text(0, 0, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      fontStyle: 'bold',
      color: UI_SEMANTIC.hp,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(100).setVisible(false);
  }

  update(input: BossHealthBarInput): void {
    const { width } = this.scene.scale;
    const x = width / 2;
    const y = 35;
    const readout = bossHealthBarReadout(input);
    this.title.setText(readout.title).setPosition(x, y + 6).setVisible(true);
    this.hp.setText(readout.hpLabel).setPosition(x + WIDTH / 2 - 12, y + 36).setVisible(true);
    const g = this.graphics.clear();
    drawGrimoirePanel(g, x - WIDTH / 2, y, WIDTH, HEIGHT, 0.88);
    const barX = x - WIDTH / 2 + 14;
    const barY = y + 33;
    const barW = WIDTH - 102;
    g.fillStyle(UI_HEX.track, 1);
    g.fillRoundedRect(barX, barY, barW, 7, 4);
    g.fillStyle(hex(UI_SEMANTIC.hp), 1);
    g.fillRoundedRect(barX, barY, barW * readout.ratio, 7, 4);
    g.setVisible(true);
  }

  hide(): void {
    this.graphics.setVisible(false);
    this.title.setVisible(false);
    this.hp.setVisible(false);
  }
}
