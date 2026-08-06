import Phaser from 'phaser';

const PANEL_PADDING_X = 10;
const PANEL_PADDING_Y = 7;
const EDGE_PADDING = 8;

/** #345 고정 HUD를 늘리지 않고 보스 아래를 따라다니는 전용 정보판. */
export class BossCombatInfoHud {
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly text: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    this.plate = scene.add.graphics().setDepth(58).setVisible(false);
    this.text = scene.add.text(0, 0, '', {
      fontFamily: '"Noto Serif KR", Consolas, monospace',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#e8dcf5',
      stroke: '#090711',
      strokeThickness: 2,
      align: 'center',
      lineSpacing: 2,
    }).setOrigin(0.5, 0).setDepth(59).setVisible(false);
  }

  update(x: number, y: number, lines: readonly string[]): void {
    if (lines.length === 0) {
      this.hide();
      return;
    }
    this.text.setText([...lines]).setVisible(true);
    const camera = this.scene.cameras.main;
    const halfWidth = this.text.width / 2 + PANEL_PADDING_X;
    const panelHeight = this.text.height + PANEL_PADDING_Y * 2;
    const safeX = Phaser.Math.Clamp(
      x,
      camera.worldView.left + halfWidth + EDGE_PADDING,
      camera.worldView.right - halfWidth - EDGE_PADDING,
    );
    const safeY = Phaser.Math.Clamp(
      y,
      camera.worldView.top + EDGE_PADDING,
      camera.worldView.bottom - panelHeight - EDGE_PADDING,
    );
    this.text.setPosition(safeX, safeY + PANEL_PADDING_Y);
    this.plate.clear()
      .fillStyle(0x0b0914, 0.84)
      .fillRoundedRect(
        safeX - halfWidth,
        safeY,
        halfWidth * 2,
        panelHeight,
        6,
      )
      .lineStyle(1, 0x8d73b5, 0.72)
      .strokeRoundedRect(
        safeX - halfWidth,
        safeY,
        halfWidth * 2,
        panelHeight,
        6,
      )
      .setVisible(true);
  }

  hide(): void {
    this.plate.setVisible(false);
    this.text.setVisible(false);
  }
}
