import Phaser from 'phaser';
import type { SpellJudge } from '../spell/judge';
import { MockJudge } from '../spell/mockJudge';
import type { SpellSpec } from '../spell/types';
import { castSpell, ensureParticleTexture } from '../render/spellRenderer';
import { ELEMENT_PALETTES } from '../render/palette';
import { PlayerCombatState } from '../player/playerCombatState';
import { ChaserEnemy } from '../enemies/chaserEnemy';
import {
  BASIC_ATTACK_CONFIG,
  CHASER_CONFIG,
  SPELL_DAMAGE_CONFIG,
  spellDamageFromPower,
} from '../combat/combatConfig';

// 임시값: 카메라 방식과 방 크기를 최종 확정한 뒤 조정한다.
const WORLD_SIZE_MULTIPLIER = 2;

interface BasicMissile {
  body: Phaser.GameObjects.Arc;
  halo: Phaser.GameObjects.Arc;
  target: ChaserEnemy;
}

/**
 * 기술검증 프로토타입 씬 — W1 목표 (SUBMISSION_PLAN W1)
 * 검증 대상: 입력 → 판정(SpellJudge) → JSON → 파츠 조합 렌더링 1사이클
 * - Enter: 영창 모드 (슬로모션 + DOM 입력 바)
 * - 더미 타겟(삼각형)이 떠다니며, bolt는 가장 가까운 타겟으로 발사
 */
export class ProtoScene extends Phaser.Scene {
  private judge: SpellJudge = new MockJudge();
  private player!: Phaser.GameObjects.Container;
  private playerState = new PlayerCombatState();
  private moveKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private worldBounds = new Phaser.Geom.Rectangle();
  private enemies: ChaserEnemy[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private incantWrap!: HTMLElement;
  private incantBar!: HTMLInputElement;
  private incanting = false;
  private casting = false;
  private timeScale = 1;
  private basicAttackCooldownRemaining = 0;
  private basicMissiles: BasicMissile[] = [];
  private testCleared = false;

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
    for (let i = 0; i < CHASER_CONFIG.testSpawnCount; i++) {
      this.spawnChaser(i, CHASER_CONFIG.testSpawnCount);
    }

    this.add.text(16, 14,
      '[기술검증 프로토] Enter: 영창  ·  예: "얼음 감옥", "번개를 품은 해일", "어둠의 폭발"',
      { fontSize: '14px', color: '#6b7bd6' })
      .setScrollFactor(0)
      .setDepth(100);
    this.statusText = this.add.text(16, 38, '', {
      fontSize: '15px',
      color: '#b8c2ff',
    }).setScrollFactor(0).setDepth(100);
    this.updateStatusText();

    this.setupIncantBar();
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (!this.incanting && !this.casting) this.tryOpenIncant();
    });
  }

  override update(_time: number, delta: number): void {
    // 슬로모션: timeScale을 개체 이동에 직접 곱한다 (프로토 방식)
    const d = (delta / 1000) * this.timeScale;
    this.playerState.update(d);
    this.basicAttackCooldownRemaining = Math.max(0, this.basicAttackCooldownRemaining - d);
    this.updatePlayerMovement(delta / 1000);
    this.updateEnemies(d);
    this.updateBasicAttack();
    this.updateBasicMissiles(d);
    this.updateStatusText();
  }

  private updatePlayerMovement(deltaSeconds: number): void {
    if (this.incanting || !this.playerState.alive) return;

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

  private spawnChaser(index: number, total: number): void {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / total;
    const x = Phaser.Math.Clamp(
      this.player.x + Math.cos(angle) * CHASER_CONFIG.testSpawnDistance,
      this.worldBounds.left + 80,
      this.worldBounds.right - 80,
    );
    const y = Phaser.Math.Clamp(
      this.player.y + Math.sin(angle) * CHASER_CONFIG.testSpawnDistance,
      this.worldBounds.top + 80,
      this.worldBounds.bottom - 80,
    );
    this.enemies.push(new ChaserEnemy(this, x, y));
  }

  private updateEnemies(deltaSeconds: number): void {
    if (!this.playerState.alive) return;

    for (const enemy of this.enemies) {
      enemy.update(deltaSeconds, this.player.x, this.player.y);
    }

    let totalDamage = 0;
    for (const enemy of this.enemies) {
      const touching = Phaser.Math.Distance.Between(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
      ) <= CHASER_CONFIG.contactDistance;
      if (!touching || !enemy.canDealContactDamage) continue;

      this.playerState.takeDamage(CHASER_CONFIG.contactDamage);
      enemy.startContactDamageCooldown();
      totalDamage += CHASER_CONFIG.contactDamage;
      if (!this.playerState.alive) break;
    }
    if (totalDamage === 0) return;

    this.announceSystemMessage(`-${totalDamage} HP`);

    if (!this.playerState.alive) {
      if (this.incanting) this.closeIncant();
      this.announceSystemMessage('사망');
    }
  }

  private updateBasicAttack(): void {
    if (!this.playerState.alive || this.basicAttackCooldownRemaining > 0) return;

    const target = this.nearestEnemy(BASIC_ATTACK_CONFIG.range);
    if (!target) return;

    this.basicAttackCooldownRemaining = BASIC_ATTACK_CONFIG.intervalSeconds;
    this.fireBasicMissile(target);
  }

  private fireBasicMissile(target: ChaserEnemy): void {
    const fromX = this.player.x;
    const fromY = this.player.y - 14;
    const body = this.add.circle(fromX, fromY, 5, 0xc8d3ff)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = this.add.circle(fromX, fromY, 10, 0x6b7cff, 0.3)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.basicMissiles.push({ body, halo, target });
  }

  private updateBasicMissiles(deltaSeconds: number): void {
    const active: BasicMissile[] = [];
    for (const missile of this.basicMissiles) {
      if (!this.playerState.alive || !missile.target.alive) {
        this.destroyBasicMissile(missile);
        continue;
      }

      const direction = new Phaser.Math.Vector2(
        missile.target.x - missile.body.x,
        missile.target.y - missile.body.y,
      );
      const distance = direction.length();
      const travelDistance = BASIC_ATTACK_CONFIG.projectileSpeed * deltaSeconds;
      if (distance <= BASIC_ATTACK_CONFIG.hitDistance + travelDistance) {
        this.destroyBasicMissile(missile);
        this.damageEnemy(missile.target, BASIC_ATTACK_CONFIG.damage);
        continue;
      }

      direction.normalize().scale(travelDistance);
      missile.body.x += direction.x;
      missile.body.y += direction.y;
      missile.halo.setPosition(missile.body.x, missile.body.y);
      active.push(missile);
    }
    this.basicMissiles = active;
  }

  private destroyBasicMissile(missile: BasicMissile): void {
    missile.body.destroy();
    missile.halo.destroy();
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

  private tryOpenIncant(): void {
    if (!this.playerState.alive) {
      this.announceSystemMessage('행동 불가');
      return;
    }
    if (this.playerState.cooldownRemaining > 0) {
      this.announceSystemMessage(
        `쿨다운 ${this.playerState.cooldownRemaining.toFixed(1)}초`,
      );
      return;
    }
    this.openIncant();
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
    try {
      const spec = await this.judge.judge(text);
      if (!this.playerState.alive) {
        this.announceSystemMessage('행동 불가');
        return;
      }
      if (!this.playerState.trySpendMana(spec.cost)) {
        this.announceSystemMessage('마나 부족');
        return;
      }

      this.playerState.startGlobalCooldown();
      this.announceSpell(spec);

      const from = new Phaser.Math.Vector2(this.player.x, this.player.y - 20);
      const target = this.nearestEnemy();
      const to = target ? new Phaser.Math.Vector2(target.x, target.y) : undefined;
      castSpell({
        scene: this,
        from,
        to,
        onHit: (x, y) => this.onSpellHit(x, y, spec, target),
      }, spec);
    } finally {
      this.casting = false;
    }
  }

  private updateStatusText(): void {
    const hp = Math.ceil(this.playerState.hp);
    const mana = Math.floor(this.playerState.mana);
    let actionState = 'READY';
    if (!this.playerState.alive) actionState = 'DEAD';
    else if (this.testCleared) actionState = 'TEST CLEAR';
    else if (this.casting) actionState = 'JUDGING';
    else if (this.incanting) actionState = 'INCANTING';
    else if (this.playerState.cooldownRemaining > 0) {
      actionState = `COOLDOWN ${this.playerState.cooldownRemaining.toFixed(1)}s`;
    }

    this.statusText.setText(
      `HP ${hp}/${this.playerState.maxHp}`
      + `  ·  MANA ${mana}/${this.playerState.maxMana}`
      + `  ·  ${actionState}`,
    );
  }

  private announceSystemMessage(message: string): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height * 0.42, message, {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ff8fa3',
      stroke: '#05060f',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100);

    this.tweens.add({
      targets: label,
      alpha: 0,
      y: label.y - 18,
      duration: 700,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private nearestEnemy(maxDistance = Number.POSITIVE_INFINITY): ChaserEnemy | null {
    let best: ChaserEnemy | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (d < bestD) { bestD = d; best = enemy; }
    }
    return bestD <= maxDistance ? best : null;
  }

  private onSpellHit(
    x: number,
    y: number,
    spec: SpellSpec,
    lockedTarget: ChaserEnemy | null,
  ): void {
    const damage = spellDamageFromPower(spec.power);
    if (spec.form === 'nova') {
      const radius = SPELL_DAMAGE_CONFIG.novaBaseRadius + spec.power;
      for (const enemy of [...this.enemies]) {
        if (Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= radius) {
          this.damageEnemy(enemy, damage);
        }
      }
      return;
    }

    if (lockedTarget?.alive) this.damageEnemy(lockedTarget, damage);
  }

  private damageEnemy(enemy: ChaserEnemy, damage: number): void {
    if (!enemy.takeDamage(damage)) return;

    enemy.destroy();
    this.enemies = this.enemies.filter((candidate) => candidate !== enemy);
    if (this.enemies.length === 0 && !this.testCleared) {
      this.testCleared = true;
      this.announceSystemMessage('테스트 전투 완료');
    }
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
