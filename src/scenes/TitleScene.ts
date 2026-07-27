import Phaser from 'phaser';
import { applyWorldFx } from '../render/postFx';
import { loadCodex } from '../spell/spellCodex';
import { showCodexOverlay } from '../ui/codexOverlay';
import { clearRunHud } from '../ui/runHud';
import { showSettingsOverlay } from '../ui/settingsOverlay';
import { loadSettings } from '../run/gameSettings';
import { requestDemoRun } from '../run/demoLoadout';

const TITLE_COLORS = {
  background: 0x05060f,
  deepBlue: 0x111a3d,
  glow: 0x536dff,
  core: 0xaebdff,
  accent: 0xf2e9ff,
  muted: 0x7f8ab8,
} as const;

export class TitleScene extends Phaser.Scene {
  private starting = false;

  /** 도감·설정이 열려 있는 동안 시작 트리거(클릭·Enter)를 막는다 */
  private codexOpen = false;

  /** 밝기 막 — 설정에서 조절하면 타이틀에서도 즉시 반영된다 */
  private brightnessVeil!: Phaser.GameObjects.Graphics;

  constructor() {
    super('title');
  }

  create(): void {
    // Phaser는 씬 인스턴스를 재사용한다 — 런에서 돌아와 create가 다시 돌 때
    // 이전 startGame이 남긴 starting/입력 비활성 상태를 반드시 되돌린다.
    // (안 하면 starting=true·input.enabled=false가 남아 도감·시작 클릭이 먹통)
    this.starting = false;
    this.codexOpen = false;
    this.input.enabled = true;
    // 런 진행 HUD(우상단 ROOM n/m)는 DOM이라 씬을 넘어 잔류한다 — 타이틀에선 지운다.
    clearRunHud();

    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor(TITLE_COLORS.background);
    this.drawBackground(width, height);
    this.createArcaneSeal(width / 2, height * 0.44);
    this.createTitle(width, height);
    this.createStartPrompt(width, height);
    this.createLobbyTabs(width, height);
    this.createDemoTab(width, height);
    // 밝기 막은 탭보다 위에 — 타이틀엔 지켜야 할 HUD가 없다
    this.brightnessVeil = this.add.graphics().setScrollFactor(0).setDepth(50).setVisible(false);
    this.applyBrightness(loadSettings(window.localStorage).brightness);

    // once가 아닌 on — 도감을 열었다 닫아도 시작 트리거가 살아 있어야 한다.
    // 화살표로 감싼다 — startGame을 직접 넘기면 Phaser가 키 이벤트를 첫 인자로 실어
    // demo 플래그가 truthy가 되어 ENTER마다 시연 런으로 들어간다.
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame());
    // 빈 공간 클릭만 시작 — 도감 탭 위 클릭은 currentlyOver에 잡혀 여기서 걸러진다.
    // (이벤트 순서에 기대던 codexOpen 가드가 실플레이에서 어긋나 도감이 안 열리던 버그)
    this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, currentlyOver: unknown[]) => {
      if (currentlyOver.length === 0) this.startGame();
    });

    applyWorldFx(this.cameras.main); // Phase 5 네온 후처리 (블룸+비네트)
  }

  /**
   * 로비 탭 줄 — 주문 도감 · 설정 (총괄: "시작 화면을 로비처럼").
   * 하단은 시연 탭이 이미 쓰고 있어 두 항목을 한 줄에 나란히 놓는다.
   */
  private createLobbyTabs(width: number, height: number): void {
    const makeTab = (x: number, label: string, onPick: () => void): void => {
      const tab = this.add.text(x, height * 0.885, label, {
        fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
        fontSize: '15px',
        color: '#8fa4ff',
        letterSpacing: 2,
      }).setOrigin(0.5).setAlpha(0.75).setInteractive({ useHandCursor: true });
      tab.on('pointerover', () => tab.setAlpha(1).setColor('#c7d0ff'));
      tab.on('pointerout', () => tab.setAlpha(0.75).setColor('#8fa4ff'));
      tab.on('pointerdown', onPick);
    };
    makeTab(width / 2 - 78, '〔 주문 도감 〕', () => { void this.openCodex(); });
    makeTab(width / 2 + 78, '〔 설정 〕', () => { void this.openSettings(); });
  }

  /**
   * 설정 — 전투 중 일시정지 메뉴와 **같은 순수 코어**(gameSettings)를 쓴다.
   * 타이틀엔 오디오가 없어(GameAudio는 ProtoScene 소유) 볼륨은 소리로 확인되지 않고
   * 저장만 된다. 밝기는 여기서도 즉시 반영해 조절이 눈으로 확인되게 한다.
   */
  private async openSettings(): Promise<void> {
    if (this.codexOpen || this.starting) return;
    this.codexOpen = true; // 시작 트리거 차단 — 도감과 같은 가드를 공유한다
    try {
      await showSettingsOverlay({
        audioNote: '소리 크기는 전투에서 적용된다 · 밝기는 지금 바로',
        onChange: (settings) => this.applyBrightness(settings.brightness),
      });
    } finally {
      this.time.delayedCall(50, () => { this.codexOpen = false; });
    }
  }

  /** 타이틀 밝기 막 — 전투 HUD가 없으므로 최상단에 덮어도 가릴 정보가 없다. */
  private applyBrightness(brightness: number): void {
    const { width, height } = this.scale;
    const g = this.brightnessVeil.clear();
    if (Math.abs(brightness - 1) < 0.01) {
      this.brightnessVeil.setVisible(false);
      return;
    }
    if (brightness < 1) g.fillStyle(0x000000, Math.min(0.6, 1 - brightness));
    else g.fillStyle(0xffffff, Math.min(0.22, (brightness - 1) * 0.7));
    g.fillRect(0, 0, width, height);
    this.brightnessVeil.setVisible(true);
  }

  /**
   * 시연 탭 — 후반 성장 상태로 바로 시작한다 (총괄 발안).
   *
   * 이 게임의 자산(진화 각인·정령·친화 격상)은 런을 여러 번 굴려야 나온다. 짧게
   * 만지고 떠나는 사람은 아무것도 못 본다. 처음부터 하는 경로는 그대로 두고,
   * "계속하면 이렇게 된다"를 미리 보여주는 두 번째 문을 낸다.
   *
   * 라벨을 "심사위원용"으로 달지 않는다 — "본 게임은 못 보여주나?"로 읽힌다.
   * 게임 안의 말로 부르고, 의도는 제출 문서에 적는다.
   */
  private createDemoTab(width: number, height: number): void {
    const tab = this.add.text(width / 2, height * 0.935, '〔 각성한 영창가로 시작 〕', {
      fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
      fontSize: '15px',
      color: '#ffd166',
      letterSpacing: 2,
    }).setOrigin(0.5).setAlpha(0.75).setInteractive({ useHandCursor: true });

    const hint = this.add.text(
      width / 2,
      height * 0.968,
      '각인·정령·친화가 쌓인 후반부터 — 무엇을 쳐야 할지는 화면이 알려준다',
      {
        fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
        fontSize: '11px',
        color: '#7a6a45',
        align: 'center',
      },
    ).setOrigin(0.5).setAlpha(0.8);

    tab.on('pointerover', () => { tab.setAlpha(1).setColor('#ffe6a3'); hint.setAlpha(1); });
    tab.on('pointerout', () => { tab.setAlpha(0.75).setColor('#ffd166'); hint.setAlpha(0.8); });
    tab.on('pointerdown', () => this.startGame(true));
  }

  private async openCodex(): Promise<void> {
    if (this.codexOpen || this.starting) return;
    this.codexOpen = true;
    try {
      await showCodexOverlay(loadCodex(window.localStorage));
    } finally {
      // 같은 프레임의 씬 pointerdown이 시작을 못 물게 한 틱 늦게 푼다
      this.time.delayedCall(50, () => { this.codexOpen = false; });
    }
  }

  private drawBackground(width: number, height: number): void {
    const backdrop = this.add.graphics();
    backdrop.fillGradientStyle(
      TITLE_COLORS.background,
      TITLE_COLORS.background,
      TITLE_COLORS.deepBlue,
      TITLE_COLORS.background,
      1,
    );
    backdrop.fillRect(0, 0, width, height);

    const stars = this.add.graphics();
    for (let index = 0; index < 72; index += 1) {
      const x = (index * 173 + 41) % width;
      const y = (index * index * 37 + 53) % height;
      const radius = index % 9 === 0 ? 1.5 : 0.75;
      const alpha = 0.12 + (index % 5) * 0.045;
      stars.fillStyle(index % 7 === 0 ? TITLE_COLORS.core : 0xffffff, alpha);
      stars.fillCircle(x, y, radius);
    }

    const haze = this.add.ellipse(
      width / 2,
      height * 0.47,
      width * 0.86,
      height * 0.7,
      TITLE_COLORS.glow,
      0.035,
    ).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: haze,
      alpha: { from: 0.45, to: 0.85 },
      scaleX: { from: 0.96, to: 1.04 },
      scaleY: { from: 0.96, to: 1.04 },
      duration: 3600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private createArcaneSeal(x: number, y: number): void {
    const outer = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    outer.lineStyle(1.5, TITLE_COLORS.glow, 0.27);
    outer.strokeCircle(0, 0, 190);
    outer.lineStyle(1, TITLE_COLORS.core, 0.15);
    outer.strokeCircle(0, 0, 157);
    outer.strokeCircle(0, 0, 112);
    for (let index = 0; index < 12; index += 1) {
      const angle = (Math.PI * 2 * index) / 12;
      outer.lineBetween(
        Math.cos(angle) * 164,
        Math.sin(angle) * 164,
        Math.cos(angle) * 185,
        Math.sin(angle) * 185,
      );
    }
    outer.setPosition(x, y);

    const inner = this.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    inner.lineStyle(1.2, TITLE_COLORS.core, 0.22);
    const points = Array.from({ length: 6 }, (_, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 6;
      return new Phaser.Geom.Point(Math.cos(angle) * 104, Math.sin(angle) * 104);
    });
    inner.strokePoints([...points, points[0]], true);
    inner.setPosition(x, y);

    this.tweens.add({
      targets: outer,
      angle: 360,
      duration: 42000,
      repeat: -1,
      ease: 'Linear',
    });
    this.tweens.add({
      targets: inner,
      angle: -360,
      duration: 30000,
      repeat: -1,
      ease: 'Linear',
    });
  }

  private createTitle(width: number, height: number): void {
    const eyebrow = this.add.text(width / 2, height * 0.235, 'WORDS BECOME SPELLS', {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '13px',
      color: '#8fa4ff',
      letterSpacing: 6,
    }).setOrigin(0.5).setAlpha(0.82);

    const logoGlow = this.add.text(width / 2, height * 0.39, 'INCANT', {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '104px',
      fontStyle: 'bold',
      color: '#536dff',
      stroke: '#536dff',
      strokeThickness: 10,
      letterSpacing: 13,
    }).setOrigin(0.5).setAlpha(0.16).setBlendMode(Phaser.BlendModes.ADD);

    const logo = this.add.text(width / 2, height * 0.39, 'INCANT', {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '96px',
      fontStyle: 'bold',
      color: '#eef1ff',
      stroke: '#18235a',
      strokeThickness: 3,
      letterSpacing: 13,
      shadow: {
        offsetX: 0,
        offsetY: 0,
        color: '#6f85ff',
        blur: 18,
        fill: true,
      },
    }).setOrigin(0.5);

    const rule = this.add.rectangle(width / 2, height * 0.505, 330, 1, TITLE_COLORS.core, 0.42)
      .setBlendMode(Phaser.BlendModes.ADD);
    const rune = this.add.text(width / 2, height * 0.505, '◇', {
      fontFamily: 'Georgia, serif',
      fontSize: '19px',
      color: '#c7d0ff',
      backgroundColor: '#080b1a',
      padding: { left: 9, right: 9 },
    }).setOrigin(0.5);

    this.add.text(
      width / 2,
      height * 0.56,
      '정해진 스킬은 없다. 당신의 문장이 주문이 된다',
      {
        fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
        fontSize: '19px',
        color: '#c8cee9',
        letterSpacing: 1.2,
      },
    ).setOrigin(0.5);

    this.tweens.add({
      targets: [logoGlow, logo],
      scaleX: { from: 0.995, to: 1.015 },
      scaleY: { from: 0.995, to: 1.015 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: logoGlow,
      alpha: { from: 0.1, to: 0.25 },
      duration: 1800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.tweens.add({
      targets: [eyebrow, rule, rune],
      alpha: { from: 0.55, to: 0.9 },
      duration: 2800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private createStartPrompt(width: number, height: number): void {
    const prompt = this.add.text(width / 2, height * 0.77, 'PRESS ENTER', {
      fontFamily: 'Consolas, monospace',
      fontSize: '15px',
      color: '#aeb9e8',
      letterSpacing: 5,
    }).setOrigin(0.5);

    this.add.text(width / 2, height * 0.82, '또는 화면을 클릭하세요', {
      fontFamily: '"Malgun Gothic", sans-serif',
      fontSize: '12px',
      color: '#58638d',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: { from: 0.28, to: 1 },
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private startGame(demo = false): void {
    if (this.starting || this.codexOpen) return;
    if (demo) requestDemoRun();
    this.starting = true;
    this.input.enabled = false;
    this.cameras.main.fadeOut(420, 5, 6, 15);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('proto');
    });
  }
}
