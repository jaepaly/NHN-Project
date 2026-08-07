import Phaser from 'phaser';
import { drawGrimoirePanel } from '../render/grimoireFrame';
import { ELEMENT_PALETTES } from '../render/palette';
import { drawBossElementIcon } from './bossElementIcon';
import { bossHealthBarReadout, type BossHealthBarInput } from './bossHealthBarModel';
import { hex, UI_COLOR, UI_HEX, UI_SEMANTIC } from './uiTokens';

const WIDTH = 360;
const BASE_HEIGHT = 56;
const RESISTANCE_ROW_HEIGHT = 24;
const RESISTANCE_ENTRY_WIDTH = 54;

/** Boss name, phase, HP and compact elemental resistance share one fixed visual anchor. */
export class BossHealthBarHud {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hp: Phaser.GameObjects.Text;
  private readonly resistanceValues: Phaser.GameObjects.Text[] = [];

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
    const resistances = input.resistances ?? [];
    const height = BASE_HEIGHT + (resistances.length > 0 ? RESISTANCE_ROW_HEIGHT : 0);
    const readout = bossHealthBarReadout(input);
    this.title.setText(readout.title).setPosition(x, y + 6).setVisible(true);
    this.hp.setText(readout.hpLabel).setPosition(x + WIDTH / 2 - 12, y + 36).setVisible(true);
    const g = this.graphics.clear();
    drawGrimoirePanel(g, x - WIDTH / 2, y, WIDTH, height, 0.88);
    const barX = x - WIDTH / 2 + 14;
    const barY = y + 33;
    const barW = WIDTH - 102;
    g.fillStyle(UI_HEX.track, 1);
    g.fillRoundedRect(barX, barY, barW, 7, 4);
    g.fillStyle(hex(UI_SEMANTIC.hp), 1);
    g.fillRoundedRect(barX, barY, barW * readout.ratio, 7, 4);

    const totalResistanceWidth = resistances.length * RESISTANCE_ENTRY_WIDTH;
    resistances.forEach((resistance, index) => {
      const entryLeft = x - totalResistanceWidth / 2 + index * RESISTANCE_ENTRY_WIDTH;
      const iconX = entryLeft + 12;
      const iconY = y + BASE_HEIGHT + 8;
      drawBossElementIcon(g, resistance.element, iconX, iconY, ELEMENT_PALETTES[resistance.element].core);
      if (resistance.negated) {
        // 원소 아이콘 자체는 남겨 "어떤 저항"인지 보이고, 금색 사선으로 제거 상태를
        // 전달한다. 저항 아이콘을 통째로 숨기면 마스터리 보상이 지속 UI에서 사라진다.
        g.lineStyle(2, UI_HEX.accent, 0.95);
        g.lineBetween(iconX - 7, iconY + 7, iconX + 7, iconY - 7);
      }
      this.resistanceValueAt(index)
        .setText(resistance.negated ? '0%' : `−${resistance.reductionPercent}%`)
        .setColor(resistance.negated ? UI_COLOR.accent : '#f3d8d8')
        .setPosition(iconX + 13, iconY)
        .setVisible(true);
    });
    for (let i = resistances.length; i < this.resistanceValues.length; i += 1) {
      this.resistanceValues[i].setVisible(false);
    }
    g.setVisible(true);
  }

  hide(): void {
    this.graphics.setVisible(false);
    this.title.setVisible(false);
    this.hp.setVisible(false);
    this.resistanceValues.forEach((label) => label.setVisible(false));
  }

  private resistanceValueAt(index: number): Phaser.GameObjects.Text {
    const existing = this.resistanceValues[index];
    if (existing) return existing;
    const label = this.scene.add.text(0, 0, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '10px',
      fontStyle: 'bold',
      color: '#f3d8d8',
      stroke: '#090711',
      strokeThickness: 2,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(100).setVisible(false);
    this.resistanceValues.push(label);
    return label;
  }
}
