import Phaser from 'phaser';
import type { GameSettings, SettingKey } from '../run/gameSettings';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  settingDisplay,
  settingRange,
  settingValueFromRatio,
} from '../run/gameSettings';
import { drawGrimoirePanel } from '../render/grimoireFrame';
import { UI_COLOR, UI_FONT } from './uiTokens';

const ROWS: readonly { key: SettingKey; label: string }[] = [
  { key: 'sfxVolume', label: '효과음' },
  { key: 'bgmVolume', label: '배경음악' },
  { key: 'brightness', label: '화면 밝기' },
  { key: 'vfxBrightness', label: '이펙트 밝기' },
];

const DEPTH = 100;

export interface GameSettingsPanelOptions {
  onChange: (settings: GameSettings) => void;
  mute: { get: () => boolean; toggle: () => boolean };
  onClose: () => void;
}

/**
 * 타이틀과 이후 다른 비전투 화면이 공유할 Phaser 설정 패널.
 * DOM 오버레이를 쓰지 않아 게임 UI와 같은 입력·레이어·프레임 규칙을 따른다.
 */
export class GameSettingsPanel {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];

  private readonly interactive: Phaser.GameObjects.Zone[] = [];

  private readonly graphics: Phaser.GameObjects.Graphics;

  private readonly labels: Phaser.GameObjects.Text[] = [];

  private readonly values: Phaser.GameObjects.Text[] = [];

  private readonly sliders: Phaser.GameObjects.Zone[] = [];

  private readonly muteText: Phaser.GameObjects.Text;

  private readonly resetText: Phaser.GameObjects.Text;

  private readonly backdrop: Phaser.GameObjects.Zone;

  private settings: GameSettings = { ...DEFAULT_SETTINGS };

  private visible = false;

  private dragKey: SettingKey | null = null;

  /** 캔버스 밖까지 끌어도 pointermove를 계속 받기 위한 브라우저 포인터 식별자. */
  private capturedPointerId: number | null = null;

  private readonly panelX: number;

  private readonly panelY: number;

  private readonly panelWidth = 650;

  private readonly sliderX: number;

  private readonly sliderWidth: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: GameSettingsPanelOptions,
  ) {
    const { width, height } = scene.scale;
    this.panelX = Math.round((width - this.panelWidth) / 2);
    this.panelY = Math.round((height - 408) / 2);
    this.sliderX = this.panelX + 36;
    this.sliderWidth = this.panelWidth - 72;

    this.backdrop = this.track(scene.add.zone(width / 2, height / 2, width, height)
      .setOrigin(0.5)
      .setDepth(DEPTH)
      .setInteractive({ useHandCursor: false })
      .on('pointerdown', () => this.close()));
    this.graphics = this.track(scene.add.graphics().setDepth(DEPTH + 1));
    this.track(scene.add.text(this.panelX + 34, this.panelY + 28, '설정', {
      fontFamily: UI_FONT.serif,
      fontSize: '26px',
      fontStyle: 'bold',
      color: UI_COLOR.textBright,
    }).setDepth(DEPTH + 2));

    ROWS.forEach((row, index) => {
      const y = this.panelY + 82 + index * 62;
      const label = this.track(scene.add.text(this.sliderX, y, row.label, {
        fontFamily: UI_FONT.serif,
        fontSize: '17px',
        fontStyle: 'bold',
        color: UI_COLOR.text,
      }).setDepth(DEPTH + 2));
      const value = this.track(scene.add.text(this.sliderX + this.sliderWidth, y, '', {
        fontFamily: 'Consolas, monospace',
        fontSize: '15px',
        fontStyle: 'bold',
        color: UI_COLOR.accent,
      }).setOrigin(1, 0).setDepth(DEPTH + 2));
      const slider = this.track(scene.add.zone(
        this.sliderX + this.sliderWidth / 2,
        y + 31,
        this.sliderWidth,
        26,
      ).setOrigin(0.5).setDepth(DEPTH + 3)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', (pointer: Phaser.Input.Pointer) => this.beginDrag(row.key, pointer)));
      this.labels.push(label);
      this.values.push(value);
      this.sliders.push(slider);
    });

    this.muteText = this.track(scene.add.text(this.sliderX, this.panelY + 341, '', {
      fontFamily: UI_FONT.serif,
      fontSize: '15px',
      fontStyle: 'bold',
      color: UI_COLOR.text,
    }).setDepth(DEPTH + 2).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (!this.visible) return;
        this.options.mute.toggle();
        this.render();
      }));
    this.resetText = this.track(scene.add.text(this.sliderX + this.sliderWidth, this.panelY + 341, '기본값으로', {
      fontFamily: UI_FONT.serif,
      fontSize: '15px',
      color: UI_COLOR.textSoft,
    }).setOrigin(1, 0).setDepth(DEPTH + 2).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        if (!this.visible) return;
        this.commit({ ...DEFAULT_SETTINGS });
      }));
    this.track(scene.add.text(this.panelX + this.panelWidth / 2, this.panelY + 378, 'ESC로 돌아가기', {
      fontFamily: UI_FONT.mono,
      fontSize: '12px',
      color: UI_COLOR.textMuted,
    }).setOrigin(0.5).setDepth(DEPTH + 2));

    this.interactive.push(this.backdrop, ...this.sliders);
    this.setVisible(false);

    scene.input.on('pointermove', this.onPointerMove, this);
    scene.input.on('pointerup', this.stopDrag, this);
    scene.input.keyboard?.on('keydown-ESC', this.onEscape, this);
  }

  open(): void {
    this.settings = loadSettings(window.localStorage);
    this.visible = true;
    this.setVisible(true);
    this.render();
  }

  close(): void {
    if (!this.visible) return;
    this.stopDrag();
    this.visible = false;
    this.setVisible(false);
    this.options.onClose();
  }

  destroy(): void {
    this.scene.input.off('pointermove', this.onPointerMove, this);
    this.scene.input.off('pointerup', this.stopDrag, this);
    this.scene.input.keyboard?.off('keydown-ESC', this.onEscape, this);
    this.objects.forEach((object) => object.destroy());
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.objects.push(object);
    return object;
  }

  private setVisible(visible: boolean): void {
    this.objects.forEach((object) => {
      (object as Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible).setVisible(visible);
    });
    this.interactive.forEach((zone) => {
      if (visible) zone.setInteractive({ useHandCursor: zone !== this.backdrop });
      else zone.disableInteractive();
    });
    if (visible) {
      this.muteText.setInteractive({ useHandCursor: true });
      this.resetText.setInteractive({ useHandCursor: true });
    } else {
      this.muteText.disableInteractive();
      this.resetText.disableInteractive();
    }
  }

  private render(): void {
    const g = this.graphics.clear();
    g.fillStyle(0x06050a, 0.82).fillRect(0, 0, this.scene.scale.width, this.scene.scale.height);
    drawGrimoirePanel(g, this.panelX, this.panelY, this.panelWidth, 408, 0.98);
    ROWS.forEach((row, index) => {
      const y = this.panelY + 82 + index * 62;
      const { min, max } = settingRange(row.key);
      const ratio = Phaser.Math.Clamp((this.settings[row.key] - min) / (max - min), 0, 1);
      this.labels[index].setText(row.label);
      this.values[index].setText(settingDisplay(this.settings, row.key));
      g.lineStyle(4, 0x28304f, 1).lineBetween(this.sliderX, y + 31, this.sliderX + this.sliderWidth, y + 31);
      g.lineStyle(4, 0xd8bb72, 0.9).lineBetween(this.sliderX, y + 31, this.sliderX + this.sliderWidth * ratio, y + 31);
      g.fillStyle(0xeadfc8, 1).fillCircle(this.sliderX + this.sliderWidth * ratio, y + 31, 7);
    });
    this.muteText
      .setText(`음소거  [${this.options.mute.get() ? '켜짐' : '꺼짐'}]`)
      .setColor(this.options.mute.get() ? UI_COLOR.accent : UI_COLOR.text);
  }

  private beginDrag(key: SettingKey, pointer: Phaser.Input.Pointer): void {
    if (!this.visible) return;
    this.dragKey = key;
    this.capturePointer(pointer);
    this.setFromPointer(key, pointer.x);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.visible || !this.dragKey || !pointer.isDown) return;
    this.setFromPointer(this.dragKey, pointer.x);
  }

  private stopDrag(): void {
    this.dragKey = null;
    const pointerId = this.capturedPointerId;
    this.capturedPointerId = null;
    if (pointerId === null) return;
    try {
      if (this.scene.game.canvas.hasPointerCapture(pointerId)) {
        this.scene.game.canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // 캔버스가 이미 파괴·분리된 종료 경로에서는 해제할 대상이 없다.
    }
  }

  private capturePointer(pointer: Phaser.Input.Pointer): void {
    const event = pointer.event as PointerEvent | undefined;
    if (typeof event?.pointerId !== 'number') return;
    try {
      this.scene.game.canvas.setPointerCapture(event.pointerId);
      this.capturedPointerId = event.pointerId;
    } catch {
      // 지원하지 않는 입력 환경에서는 캔버스 내부 드래그만 기존처럼 유지한다.
    }
  }

  private onEscape(): void {
    this.close();
  }

  private setFromPointer(key: SettingKey, pointerX: number): void {
    const ratio = Phaser.Math.Clamp((pointerX - this.sliderX) / this.sliderWidth, 0, 1);
    const value = settingValueFromRatio(key, ratio);
    if (Math.abs(this.settings[key] - value) < 0.0001) return;
    this.commit({ ...this.settings, [key]: value });
  }

  private commit(next: GameSettings): void {
    this.settings = next;
    saveSettings(window.localStorage, next);
    this.options.onChange(next);
    this.render();
  }
}
