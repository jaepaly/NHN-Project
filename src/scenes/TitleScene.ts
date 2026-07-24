import Phaser from 'phaser';
import { applyWorldFx } from '../render/postFx';
import { loadCodex } from '../spell/spellCodex';
import { showCodexOverlay } from '../ui/codexOverlay';
import { clearRunHud } from '../ui/runHud';

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

  /** 도감이 열려 있는 동안 시작 트리거(클릭·Enter)를 막는다 */
  private codexOpen = false;

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
    this.createCodexTab(width, height);

    // once가 아닌 on — 도감을 열었다 닫아도 시작 트리거가 살아 있어야 한다.
    this.input.keyboard?.on('keydown-ENTER', this.startGame, this);
    // 빈 공간 클릭만 시작 — 도감 탭 위 클릭은 currentlyOver에 잡혀 여기서 걸러진다.
    // (이벤트 순서에 기대던 codexOpen 가드가 실플레이에서 어긋나 도감이 안 열리던 버그)
    this.input.on('pointerdown', (_pointer: Phaser.Input.Pointer, currentlyOver: unknown[]) => {
      if (currentlyOver.length === 0) this.startGame();
    });

    applyWorldFx(this.cameras.main); // Phase 5 네온 후처리 (블룸+비네트)
  }

  /** 주문 도감 탭 — 런과 승패를 넘어 쌓인 "내가 만든 마법"의 기록 (게임성 분석 ③) */
  private createCodexTab(width: number, height: number): void {
    const tab = this.add.text(width / 2, height * 0.885, '〔 주문 도감 〕', {
      fontFamily: '"Noto Serif KR", "Malgun Gothic", serif',
      fontSize: '15px',
      color: '#8fa4ff',
      letterSpacing: 2,
    }).setOrigin(0.5).setAlpha(0.75).setInteractive({ useHandCursor: true });

    tab.on('pointerover', () => tab.setAlpha(1).setColor('#c7d0ff'));
    tab.on('pointerout', () => tab.setAlpha(0.75).setColor('#8fa4ff'));
    tab.on('pointerdown', () => { void this.openCodex(); });
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

  private startGame(): void {
    if (this.starting || this.codexOpen) return;
    this.starting = true;
    this.input.enabled = false;
    this.cameras.main.fadeOut(420, 5, 6, 15);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start('proto');
    });
  }
}
