import Phaser from 'phaser';
import type { SpellJudge } from '../spell/judge';
import { MockJudge } from '../spell/mockJudge';
import type { SpellSpec } from '../spell/types';
import { castSpell, ensureParticleTexture } from '../render/spellRenderer';
import { ELEMENT_PALETTES } from '../render/palette';

// 임시값: 카메라 방식과 방 크기를 최종 확정한 뒤 조정한다.
const WORLD_SIZE_MULTIPLIER = 2;

/**
 * 기술검증 프로토타입 씬 — W1 목표 (SUBMISSION_PLAN W1)
 * 검증 대상: 입력 → 판정(SpellJudge) → JSON → 파츠 조합 렌더링 1사이클
 * - Enter: 영창 모드 (슬로모션 + DOM 입력 바)
 * - 더미 타겟(삼각형)이 떠다니며, bolt는 가장 가까운 타겟으로 발사
 */
export class ProtoScene extends Phaser.Scene {
  private judge: SpellJudge = new MockJudge();
  private player!: Phaser.GameObjects.Container;
  private moveKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private worldBounds = new Phaser.Geom.Rectangle();
  private targets: Phaser.GameObjects.Triangle[] = [];
  private incantWrap!: HTMLElement;
  private incantBar!: HTMLInputElement;
  private incanting = false;
  private casting = false;
  private timeScale = 1;

  constructor() {
    super('proto');
  }

  create(): void {
    const { width, height } = this.scale;
    this.worldBounds.setTo(
      0,
      0,
      width * WORLD_SIZE_MULTIPLIER,
      height * WORLD_SIZE_MULTIPLIER,
    );
    const startX = this.worldBounds.centerX;
    const startY = this.worldBounds.centerY;
    ensureParticleTexture(this);

    this.drawBackdrop(this.worldBounds.width, this.worldBounds.height);
    this.createPlayer(startX, startY);
    this.cameras.main
      .setBounds(
        this.worldBounds.x,
        this.worldBounds.y,
        this.worldBounds.width,
        this.worldBounds.height,
      )
      .startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.centerOn(startX, startY);
    this.moveKeys = this.input.keyboard!.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    for (let i = 0; i < 3; i++) this.spawnTarget();

    this.add.text(16, 14,
      '[기술검증 프로토] Enter: 영창  ·  예: "얼음 감옥", "번개를 품은 해일", "어둠의 폭발"',
      { fontSize: '14px', color: '#6b7bd6' })
      .setScrollFactor(0)
      .setDepth(100);

    this.setupIncantBar();
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (!this.incanting && !this.casting) this.openIncant();
    });
  }

  override update(_time: number, delta: number): void {
    // 슬로모션: timeScale을 개체 이동에 직접 곱한다 (프로토 방식)
    const d = (delta / 1000) * this.timeScale;
    this.updatePlayerMovement(delta / 1000);
    for (const t of this.targets) {
      const v = t.getData('vel') as Phaser.Math.Vector2;
      t.x += v.x * d;
      t.y += v.y * d;
      t.rotation += 0.8 * d;
      if (t.x < this.worldBounds.left + 40 || t.x > this.worldBounds.right - 40) v.x *= -1;
      if (t.y < this.worldBounds.top + 40 || t.y > this.worldBounds.bottom - 40) v.y *= -1;
    }
  }

  private updatePlayerMovement(deltaSeconds: number): void {
    if (this.incanting) return;

    const direction = new Phaser.Math.Vector2(
      Number(this.moveKeys.right.isDown) - Number(this.moveKeys.left.isDown),
      Number(this.moveKeys.down.isDown) - Number(this.moveKeys.up.isDown),
    );
    if (direction.lengthSq() === 0) return;

    const speed = 220;
    direction.normalize().scale(speed * deltaSeconds);
    this.player.x = Phaser.Math.Clamp(
      this.player.x + direction.x,
      this.worldBounds.left + 22,
      this.worldBounds.right - 22,
    );
    this.player.y = Phaser.Math.Clamp(
      this.player.y + direction.y,
      this.worldBounds.top + 22,
      this.worldBounds.bottom - 22,
    );
  }

  // ── 배경: 네온 그리드 + 마법진 ───────────────────────────────
  private drawBackdrop(width: number, height: number): void {
    const g = this.add.graphics();
    g.lineStyle(1, 0x1a2350, 0.5);
    for (let x = 0; x <= width; x += 48) g.lineBetween(x, 0, x, height);
    for (let y = 0; y <= height; y += 48) g.lineBetween(0, y, width, y);
  }

  private createPlayer(x: number, y: number): void {
    const magicCircle = this.add.graphics();
    magicCircle.lineStyle(2, 0x4c66ff, 0.25);
    magicCircle.strokeCircle(0, 0, 60);
    magicCircle.strokeCircle(0, 0, 44);
    const body = this.add.circle(0, 0, 14, 0x8fa4ff)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = this.add.circle(0, 0, 22, 0x4c66ff, 0.25)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.player = this.add.container(x, y, [magicCircle, halo, body]);
    this.tweens.add({
      targets: halo, scale: { from: 1, to: 1.25 },
      yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut',
    });
  }

  private spawnTarget(): void {
    const { width, height } = this.scale;
    const x = Phaser.Math.Clamp(
      this.player.x + Phaser.Math.Between(-width * 0.4, width * 0.4),
      this.worldBounds.left + 80,
      this.worldBounds.right - 80,
    );
    const y = Phaser.Math.Clamp(
      this.player.y + Phaser.Math.Between(-height * 0.35, height * 0.1),
      this.worldBounds.top + 80,
      this.worldBounds.bottom - 80,
    );
    const tri = this.add.triangle(x, y, 0, 24, 12, 0, 24, 24, 0xff4d6d)
      .setStrokeStyle(2, 0xff8fa3, 0.9);
    tri.setData('vel', new Phaser.Math.Vector2(
      Phaser.Math.Between(-60, 60), Phaser.Math.Between(-40, 40),
    ));
    this.targets.push(tri);
  }

  // ── 영창 모드 (DOM 입력 바 + 슬로모션) ───────────────────────
  private setupIncantBar(): void {
    this.incantWrap = document.getElementById('incant-wrap')!;
    this.incantBar = document.getElementById('incant-bar') as HTMLInputElement;

    this.incantBar.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 게임 키 입력과 충돌 방지
      if (e.key === 'Enter') {
        const text = this.incantBar.value;
        this.closeIncant();
        if (text.trim()) void this.castFromText(text);
      } else if (e.key === 'Escape') {
        this.closeIncant();
      }
    });
  }

  private openIncant(): void {
    this.incanting = true;
    this.timeScale = 0.1; // 슬로모션
    this.incantWrap.classList.add('active');
    this.incantBar.value = '';
    this.incantBar.focus();
  }

  private closeIncant(): void {
    this.incanting = false;
    this.timeScale = 1;
    this.incantWrap.classList.remove('active');
    this.incantBar.blur();
  }

  // ── 판정 → 렌더링 사이클 ────────────────────────────────────
  private async castFromText(text: string): Promise<void> {
    this.casting = true;
    const spec = await this.judge.judge(text);
    this.announceSpell(spec);

    const from = new Phaser.Math.Vector2(this.player.x, this.player.y - 20);
    const to = this.nearestTargetPos();
    castSpell({
      scene: this,
      from,
      to,
      onHit: (x, y) => this.onSpellHit(x, y, spec),
    }, spec);
    this.casting = false;
  }

  private nearestTargetPos(): Phaser.Math.Vector2 | undefined {
    let best: Phaser.GameObjects.Triangle | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const t of this.targets) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best ? new Phaser.Math.Vector2(best.x, best.y) : undefined;
  }

  private onSpellHit(x: number, y: number, spec: SpellSpec): void {
    // 프로토: 반경 내 타겟 제거 → 리스폰 (전투 로직은 W2)
    const radius = 60 + spec.power;
    this.targets = this.targets.filter((t) => {
      if (Phaser.Math.Distance.Between(x, y, t.x, t.y) <= radius) {
        t.destroy();
        return false;
      }
      return true;
    });
    while (this.targets.length < 3) this.spawnTarget();
  }

  /** 주문명 각인 연출 — "내 문장이 게임이 됐다"는 순간 (GDD §3.1) */
  private announceSpell(spec: SpellSpec): void {
    const { width, height } = this.scale;
    const pal = ELEMENT_PALETTES[spec.element_primary];
    const colorHex = '#' + pal.core.toString(16).padStart(6, '0');

    const label = this.add.text(width / 2, height * 0.32, spec.name, {
      fontSize: '42px',
      fontStyle: 'bold',
      color: colorHex,
      stroke: '#05060f',
      strokeThickness: 6,
    }).setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(100)
      .setBlendMode(Phaser.BlendModes.ADD);

    const meta = this.add.text(width / 2, height * 0.32 + 36,
      `${spec.element_primary}${spec.element_secondary ? '+' + spec.element_secondary : ''}`
      + ` · ${spec.form} · power ${spec.power}`,
      { fontSize: '14px', color: '#8fa4ff' },
    ).setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(100);

    this.tweens.add({
      targets: [label, meta],
      alpha: { from: 0, to: 1 },
      scale: { from: 1.4, to: 1 },
      duration: 250,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: [label, meta],
          alpha: 0,
          delay: 900,
          duration: 400,
          onComplete: () => { label.destroy(); meta.destroy(); },
        });
      },
    });
  }
}
