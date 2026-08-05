import Phaser from 'phaser';
import {
  activeSpellCastLogs,
  appendSpellCastLog,
  spellCastLogAlpha,
  type SpellCastLogEntry,
  type SpellCastLogInput,
} from './spellCastLogModel';
import { UI_COLOR } from './uiTokens';

const X = 18;
const BOTTOM = 118;
const ROW_GAP = 17;

const KIND_LABEL = {
  manual: '영창',
  auto: '자동',
  chorus: '합주',
} as const;

/**
 * Combat log that remains absent while empty. It reports only cast-level events,
 * not every hit or damage tick.
 */
export class SpellCastLogHud {
  private readonly title: Phaser.GameObjects.Text;
  private readonly rows: Phaser.GameObjects.Text[];
  private entries: SpellCastLogEntry[] = [];
  private enabled = true;

  constructor(private readonly scene: Phaser.Scene) {
    const { height } = scene.scale;
    const top = height - BOTTOM;
    this.title = scene.add.text(X, top, '✦ 마도 기록', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      fontStyle: 'bold',
      color: UI_COLOR.textMuted,
      letterSpacing: 1,
    }).setScrollFactor(0).setDepth(100).setVisible(false);
    this.rows = Array.from({ length: 3 }, (_, index) => scene.add.text(
      X,
      top + 17 + index * ROW_GAP,
      '',
      {
        fontFamily: '"Noto Serif KR", Consolas, monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        stroke: UI_COLOR.ink,
        strokeThickness: 3,
      },
    ).setScrollFactor(0).setDepth(100).setVisible(false));
  }

  push(input: SpellCastLogInput): void {
    this.entries = appendSpellCastLog(this.entries, input);
    this.render(input.now);
  }

  update(now: number): void {
    this.entries = activeSpellCastLogs(this.entries, now);
    this.render(now);
  }

  clear(): void {
    this.entries = [];
    this.render(0);
  }

  setVisible(visible: boolean): void {
    this.enabled = visible;
    this.render(this.scene.time.now);
  }

  private render(now: number): void {
    const visibleEntries = this.enabled ? activeSpellCastLogs(this.entries, now) : [];
    this.title.setVisible(visibleEntries.length > 0);
    visibleEntries.forEach((entry, index) => {
      const count = entry.count > 1 ? ` ×${entry.count}` : '';
      this.rows[index]
        .setText(`${KIND_LABEL[entry.kind]}  ${entry.label}${count}`)
        .setColor(entry.color)
        .setAlpha(spellCastLogAlpha(entry, now))
        .setVisible(true);
    });
    for (let index = visibleEntries.length; index < this.rows.length; index += 1) {
      this.rows[index].setVisible(false);
    }
  }
}
