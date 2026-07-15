import Phaser from 'phaser';
import type { SpellJudge } from '../spell/judge';
import { createJudge } from '../spell/createJudge';
import type { SpellSpec } from '../spell/types';
import { SpellHistory } from '../spell/spellHistory';
import type { JudgeSource } from '../spell/spellHistory';
import { castSpell, ensureParticleTexture } from '../render/spellRenderer';
import type { SpellImpact } from '../render/spellRenderer';
import type { RunController } from '../run/runContract';
import {
  ELEMENT_LABELS,
  ELEMENT_PALETTES,
  paletteColorToCss,
} from '../render/palette';
import {
  PLAYER_COMBAT_CONFIG,
  PlayerCombatState,
} from '../combat-core/player/playerCombatState';
import { ChaserEnemy } from '../combat-core/enemies/chaserEnemy';
import { ShooterEnemy } from '../combat-core/enemies/shooterEnemy';
import { SplitterEnemy } from '../combat-core/enemies/splitterEnemy';
import type {
  CombatEnemy,
  EnemyKind,
  EnemyShotRequest,
} from '../combat-core/enemies/combatEnemy';
import {
  BASIC_ATTACK_CONFIG,
  SHOOTER_CONFIG,
  SPLITTER_CONFIG,
  spellBuffManaFromPower,
  spellDamageFromPower,
  spellHealFromPower,
  spellPowerWithAffinity,
  spellShieldFromPower,
} from '../combat-core/combat/combatConfig';
import {
  WAVE_CONFIG,
  WaveManager,
} from '../combat-core/waves/waveManager';
import type { WaveDefinition } from '../combat-core/waves/waveManager';
import { CombatRunController } from '../combat-core/run/runController';
import { CONTROL_CONFIG } from '../combat-core/control/controlConfig';
import { EnemyControlState } from '../combat-core/control/enemyControlState';
import { SUMMON_CONFIG } from '../combat-core/summons/summonConfig';
import { SummonedOrb } from '../combat-core/summons/summonedOrb';

// 임시값: 카메라 방식과 방 크기를 최종 확정한 뒤 조정한다.
const WORLD_SIZE_MULTIPLIER = 2;
const HUD = {
  x: 18,
  y: 18,
  width: 360,
  height: 186,
  barX: 34,
  barWidth: 270,
  barHeight: 7,
} as const;

interface FriendlyMissile {
  body: Phaser.GameObjects.Arc;
  halo: Phaser.GameObjects.Arc;
  target: CombatEnemy;
  damage: number;
  speed: number;
  hitDistance: number;
}

interface EnemyProjectile {
  body: Phaser.GameObjects.Arc;
  halo: Phaser.GameObjects.Arc;
  velocity: Phaser.Math.Vector2;
  lifetimeRemaining: number;
}

/**
 * 기술검증 프로토타입 씬 — W1 목표 (SUBMISSION_PLAN W1)
 * 검증 대상: 입력 → 판정(SpellJudge) → JSON → 파츠 조합 렌더링 1사이클
 * - Enter: 영창 모드 (슬로모션 + DOM 입력 바)
 * - 더미 타겟(삼각형)이 떠다니며, bolt는 가장 가까운 타겟으로 발사
 */
export class ProtoScene extends Phaser.Scene {
  private judge: SpellJudge = createJudge();
  private player!: Phaser.GameObjects.Container;
  private playerState = new PlayerCombatState();
  private readonly spellHistory = new SpellHistory();
  private readonly combatRunController = new CombatRunController({
    playerState: this.playerState,
  });
  private moveKeys!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private worldBounds = new Phaser.Geom.Rectangle();
  private enemies: CombatEnemy[] = [];
  private enemyProjectiles: EnemyProjectile[] = [];
  private hudGraphics!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private manaText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private attunementText!: Phaser.GameObjects.Text;
  private waveText!: Phaser.GameObjects.Text;
  private waveManager = new WaveManager();
  private incantWrap!: HTMLElement;
  private incantBar!: HTMLInputElement;
  private incantState!: HTMLElement;
  private incantCount!: HTMLElement;
  private incantHint!: HTMLElement;
  private incantChargeLabel!: HTMLElement;
  private incanting = false;
  private casting = false;
  private timeScale = 1;
  private basicAttackCooldownRemaining = 0;
  private friendlyMissiles: FriendlyMissile[] = [];
  private activeSummon: SummonedOrb | null = null;
  private readonly enemyControlState = new EnemyControlState();
  private readonly controlIndicators = new Map<CombatEnemy, Phaser.GameObjects.Arc>();

  constructor() {
    super('proto');
  }

  /** R3는 구체 전투 구현이 아니라 PR #12의 공개 계약만 소비한다. */
  get runController(): RunController {
    return this.combatRunController;
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
    this.createHud(width, height);
    this.setupRunFlow();
    this.startRoom(1);
    this.updateStatusText();

    this.setupIncantBar();
    this.input.keyboard!.on('keydown-ENTER', () => {
      if (!this.incanting && !this.casting) this.tryOpenIncant();
    });
  }

  override update(_time: number, delta: number): void {
    if (this.isCombatActive()) {
      // 슬로모션: timeScale을 개체 이동에 직접 곱한다 (프로토 방식)
      const d = (delta / 1000) * this.timeScale;
      this.playerState.update(d);
      this.basicAttackCooldownRemaining = Math.max(0, this.basicAttackCooldownRemaining - d);
      this.updatePlayerMovement(delta / 1000);
      this.updateEnemyControls(d);
      this.updateEnemies(d);
      this.updateEnemyProjectiles(d);
      this.updateBasicAttack();
      this.updateSummon(d);
      this.updateFriendlyMissiles(d);
      this.updateWaveFlow(d);
    }
    this.updateStatusText();
  }

  private isCombatActive(): boolean {
    return this.combatRunController.state.phase === 'combat';
  }

  private setupRunFlow(): void {
    this.combatRunController.on('room-cleared', (options, state) => {
      this.deferTransientCombatCleanup();
      this.stopCastingForRunPause();
      this.announceSystemMessage(`방 ${state.roomIndex} 클리어`, '#72f1b8');
      console.info('[Run] reward-ready', options, state);
    });
    this.combatRunController.on('reward-applied', (chosen, state) => {
      this.announceSystemMessage(chosen.title, '#ffd166');
      console.info('[Run] reward-applied', chosen, state);
    });
    this.combatRunController.on('room-transition', (state, durationMs) => {
      console.info('[Run] room-transition', { state, durationMs });
    });
    this.combatRunController.on('room-started', (state) => {
      this.startRoom(state.roomIndex);
      console.info('[Run] room-started', state);
    });
    this.combatRunController.on('run-completed', (state) => {
      this.deferTransientCombatCleanup();
      this.stopCastingForRunPause();
      this.announceSystemMessage('런 완료', '#72f1b8');
      console.info('[Run] completed', state);
    });
  }

  private startRoom(roomIndex: number): void {
    this.clearCombatRoom();
    this.waveManager = new WaveManager();
    this.basicAttackCooldownRemaining = 0;
    this.player.setPosition(this.worldBounds.centerX, this.worldBounds.centerY);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.spawnWave(this.waveManager.start());
    this.announceSystemMessage(`방 ${roomIndex}`, '#8fa4ff');
  }

  private clearCombatRoom(): void {
    this.clearEnemyControls();
    for (const enemy of this.enemies) enemy.destroy();
    this.enemies = [];
    this.clearTransientCombatObjects();
  }

  private clearTransientCombatObjects(): void {
    this.clearEnemyProjectiles();
    this.clearFriendlyMissiles();
    this.clearSummon();
  }

  /** 투사체 update 순회가 끝난 다음 tick에 안전하게 일괄 제거한다. */
  private deferTransientCombatCleanup(): void {
    this.time.delayedCall(0, () => this.clearTransientCombatObjects());
  }

  private stopCastingForRunPause(): void {
    if (this.incanting) this.closeIncant();
    if (this.casting) this.finishCastingUx();
  }

  private createHud(width: number, height: number): void {
    this.hudGraphics = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(99);

    this.statusText = this.add.text(34, 29, 'READY', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#72f1b8',
    }).setScrollFactor(0).setDepth(100);
    this.hpText = this.add.text(34, 54, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#ff91ad',
    }).setScrollFactor(0).setDepth(100);
    this.manaText = this.add.text(34, 88, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#91b7ff',
    }).setScrollFactor(0).setDepth(100);
    this.shieldText = this.add.text(34, 122, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#72d8ff',
    }).setScrollFactor(0).setDepth(100);
    this.attunementText = this.add.text(34, 160, 'ARCANE // UNBOUND', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      color: '#8fa4ff',
    }).setScrollFactor(0).setDepth(100);

    this.waveText = this.add.text(width - 34, 29, '', {
      fontFamily: 'Consolas, monospace',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#72f1b8',
      align: 'right',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(100);

    this.add.text(20, height - 28, 'WASD 이동  ·  ENTER 영창', {
      fontFamily: 'Consolas, monospace',
      fontSize: '12px',
      color: '#59679d',
    }).setScrollFactor(0).setDepth(100);
  }

  private updatePlayerMovement(deltaSeconds: number): void {
    if (this.incanting || this.casting || !this.playerState.alive) return;

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

  private spawnWave(definition: WaveDefinition): void {
    const sequence: EnemyKind[] = [
      ...Array<EnemyKind>(definition.chaserCount).fill('chaser'),
      ...Array<EnemyKind>(definition.shooterCount).fill('shooter'),
      ...Array<EnemyKind>(definition.splitterCount).fill('splitter'),
    ];
    sequence.forEach((kind, index) => {
      const position = this.waveSpawnPosition(index, sequence.length);
      this.spawnEnemy(kind, position.x, position.y);
    });
    this.announceSystemMessage(`웨이브 ${this.waveManager.currentWaveNumber}`);
  }

  private waveSpawnPosition(index: number, total: number): Phaser.Math.Vector2 {
    const angleOffset = this.waveManager.currentWaveNumber * (Math.PI / 7);
    const angle = angleOffset - Math.PI / 2 + (Math.PI * 2 * index) / total;
    const x = Phaser.Math.Clamp(
      this.player.x + Math.cos(angle) * WAVE_CONFIG.spawnDistance,
      this.worldBounds.left + 80,
      this.worldBounds.right - 80,
    );
    const y = Phaser.Math.Clamp(
      this.player.y + Math.sin(angle) * WAVE_CONFIG.spawnDistance,
      this.worldBounds.top + 80,
      this.worldBounds.bottom - 80,
    );
    return new Phaser.Math.Vector2(x, y);
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number): void {
    switch (kind) {
      case 'shooter':
        this.enemies.push(new ShooterEnemy(this, x, y));
        break;
      case 'splitter':
        this.enemies.push(new SplitterEnemy(this, x, y));
        break;
      case 'small-splitter':
        this.enemies.push(new SplitterEnemy(this, x, y, true));
        break;
      case 'chaser':
      default:
        this.enemies.push(new ChaserEnemy(this, x, y));
        break;
    }
  }

  private updateWaveFlow(deltaSeconds: number): void {
    if (!this.playerState.alive) return;

    const nextWave = this.waveManager.update(deltaSeconds);
    if (nextWave) this.spawnWave(nextWave);
  }

  private updateEnemies(deltaSeconds: number): void {
    if (!this.playerState.alive) return;

    for (const enemy of this.enemies) {
      const shots = enemy.update(
        deltaSeconds,
        this.player.x,
        this.player.y,
        this.enemyControlState.movementMultiplierFor(enemy),
      );
      enemy.view.x = Phaser.Math.Clamp(
        enemy.view.x,
        this.worldBounds.left + 22,
        this.worldBounds.right - 22,
      );
      enemy.view.y = Phaser.Math.Clamp(
        enemy.view.y,
        this.worldBounds.top + 22,
        this.worldBounds.bottom - 22,
      );
      for (const shot of shots) this.spawnEnemyProjectile(shot);
    }

    let totalHpDamage = 0;
    let totalShieldDamage = 0;
    for (const enemy of this.enemies) {
      const touching = Phaser.Math.Distance.Between(
        enemy.x,
        enemy.y,
        this.player.x,
        this.player.y,
      ) <= enemy.contactDistance;
      if (!touching || !enemy.canDealContactDamage) continue;

      const applied = this.playerState.takeDamage(enemy.contactDamage);
      enemy.startContactDamageCooldown();
      totalHpDamage += applied.hpDamage;
      totalShieldDamage += applied.shieldDamage;
      if (!this.playerState.alive) break;
    }
    if (totalHpDamage === 0 && totalShieldDamage === 0) return;

    this.announceIncomingDamage(totalHpDamage, totalShieldDamage);

    if (!this.playerState.alive) {
      if (this.incanting) this.closeIncant();
      this.announceSystemMessage('사망');
    }
  }

  private spawnEnemyProjectile(request: EnemyShotRequest): void {
    const body = this.add.circle(request.x, request.y, 5, 0xff6b4a)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = this.add.circle(request.x, request.y, 9, 0xff9a62, 0.28)
      .setBlendMode(Phaser.BlendModes.ADD);
    const velocity = new Phaser.Math.Vector2(
      Math.cos(request.angle),
      Math.sin(request.angle),
    ).scale(SHOOTER_CONFIG.bulletSpeed);

    this.enemyProjectiles.push({
      body,
      halo,
      velocity,
      lifetimeRemaining: SHOOTER_CONFIG.bulletLifetimeSeconds,
    });
  }

  private updateEnemyProjectiles(deltaSeconds: number): void {
    const active: EnemyProjectile[] = [];
    let totalHpDamage = 0;
    let totalShieldDamage = 0;

    for (const projectile of this.enemyProjectiles) {
      if (!this.playerState.alive) {
        this.destroyEnemyProjectile(projectile);
        continue;
      }

      projectile.lifetimeRemaining -= deltaSeconds;
      projectile.body.x += projectile.velocity.x * deltaSeconds;
      projectile.body.y += projectile.velocity.y * deltaSeconds;
      projectile.halo.setPosition(projectile.body.x, projectile.body.y);

      const expired = projectile.lifetimeRemaining <= 0;
      const outsideWorld = !this.worldBounds.contains(projectile.body.x, projectile.body.y);
      if (expired || outsideWorld) {
        this.destroyEnemyProjectile(projectile);
        continue;
      }

      const hitPlayer = Phaser.Math.Distance.Between(
        projectile.body.x,
        projectile.body.y,
        this.player.x,
        this.player.y,
      ) <= SHOOTER_CONFIG.bulletHitDistance;
      if (hitPlayer) {
        const applied = this.playerState.takeDamage(SHOOTER_CONFIG.bulletDamage);
        totalHpDamage += applied.hpDamage;
        totalShieldDamage += applied.shieldDamage;
        this.destroyEnemyProjectile(projectile);
        continue;
      }

      active.push(projectile);
    }

    this.enemyProjectiles = active;
    if (totalHpDamage === 0 && totalShieldDamage === 0) return;

    this.announceIncomingDamage(totalHpDamage, totalShieldDamage);
    if (!this.playerState.alive) {
      if (this.incanting) this.closeIncant();
      this.clearEnemyProjectiles();
      this.announceSystemMessage('사망');
    }
  }

  private destroyEnemyProjectile(projectile: EnemyProjectile): void {
    projectile.body.destroy();
    projectile.halo.destroy();
  }

  private clearEnemyProjectiles(): void {
    for (const projectile of this.enemyProjectiles) {
      this.destroyEnemyProjectile(projectile);
    }
    this.enemyProjectiles = [];
  }

  private updateBasicAttack(): void {
    if (!this.playerState.alive || this.basicAttackCooldownRemaining > 0) return;

    const target = this.nearestEnemy(BASIC_ATTACK_CONFIG.range);
    if (!target) return;

    this.basicAttackCooldownRemaining = BASIC_ATTACK_CONFIG.intervalSeconds;
    this.fireBasicMissile(target);
  }

  private fireBasicMissile(target: CombatEnemy): void {
    const fromX = this.player.x;
    const fromY = this.player.y - 14;
    this.fireFriendlyMissile({
      fromX,
      fromY,
      target,
      damage: BASIC_ATTACK_CONFIG.damage,
      speed: BASIC_ATTACK_CONFIG.projectileSpeed,
      hitDistance: BASIC_ATTACK_CONFIG.hitDistance,
      coreColor: 0xc8d3ff,
      glowColor: 0x6b7cff,
    });
  }

  private fireFriendlyMissile(options: {
    fromX: number;
    fromY: number;
    target: CombatEnemy;
    damage: number;
    speed: number;
    hitDistance: number;
    coreColor: number;
    glowColor: number;
  }): void {
    const body = this.add.circle(options.fromX, options.fromY, 5, options.coreColor)
      .setBlendMode(Phaser.BlendModes.ADD);
    const halo = this.add.circle(options.fromX, options.fromY, 10, options.glowColor, 0.3)
      .setBlendMode(Phaser.BlendModes.ADD);

    this.friendlyMissiles.push({
      body,
      halo,
      target: options.target,
      damage: options.damage,
      speed: options.speed,
      hitDistance: options.hitDistance,
    });
  }

  private updateFriendlyMissiles(deltaSeconds: number): void {
    const active: FriendlyMissile[] = [];
    for (const missile of this.friendlyMissiles) {
      if (!this.playerState.alive || !missile.target.alive) {
        this.destroyFriendlyMissile(missile);
        continue;
      }

      const direction = new Phaser.Math.Vector2(
        missile.target.x - missile.body.x,
        missile.target.y - missile.body.y,
      );
      const distance = direction.length();
      const travelDistance = missile.speed * deltaSeconds;
      if (distance <= missile.hitDistance + travelDistance) {
        this.destroyFriendlyMissile(missile);
        this.damageEnemy(missile.target, missile.damage);
        continue;
      }

      direction.normalize().scale(travelDistance);
      missile.body.x += direction.x;
      missile.body.y += direction.y;
      missile.halo.setPosition(missile.body.x, missile.body.y);
      active.push(missile);
    }
    this.friendlyMissiles = active;
  }

  private destroyFriendlyMissile(missile: FriendlyMissile): void {
    missile.body.destroy();
    missile.halo.destroy();
  }

  private clearFriendlyMissiles(): void {
    for (const missile of this.friendlyMissiles) {
      this.destroyFriendlyMissile(missile);
    }
    this.friendlyMissiles = [];
  }

  // ── 영창 모드 (DOM 입력 바 + 슬로모션) ───────────────────────
  private setupIncantBar(): void {
    this.incantWrap = document.getElementById('incant-wrap')!;
    this.incantBar = document.getElementById('incant-bar') as HTMLInputElement;
    this.incantState = document.getElementById('incant-state')!;
    this.incantCount = document.getElementById('incant-count')!;
    this.incantHint = document.getElementById('incant-hint')!;
    this.incantChargeLabel = document.getElementById('incant-charge-label')!;

    this.incantBar.addEventListener('input', () => this.updateIncantCharge());

    this.incantBar.addEventListener('keydown', (e) => {
      e.stopPropagation(); // 게임 키 입력과 충돌 방지
      if (e.key === 'Enter') {
        const text = this.incantBar.value.trim();
        if (!text) {
          this.closeIncant();
          return;
        }
        this.beginJudging();
        void this.castFromText(text);
      } else if (e.key === 'Escape') {
        this.closeIncant();
      }
    });
  }

  private tryOpenIncant(): void {
    if (!this.isCombatActive()) {
      this.announceSystemMessage('전투 대기');
      return;
    }
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
    this.input.keyboard!.disableGlobalCapture();
    this.incantWrap.classList.add('active');
    this.incantWrap.classList.remove('judging');
    this.incantWrap.setAttribute('aria-hidden', 'false');
    this.incantBar.disabled = false;
    this.incantBar.value = '';
    this.incantState.textContent = '시간 흐름 10%';
    this.incantHint.textContent = 'Enter 발동 · Esc 취소';
    this.updateIncantCharge();
    this.focusIncantBar();
  }

  /** Enter의 keyup과 캔버스 포커스 복구가 끝날 때까지 입력 포커스를 짧게 재확인한다. */
  private focusIncantBar(attempt = 0): void {
    if (!this.incanting) return;
    this.incantBar.focus({ preventScroll: true });
    if (attempt >= 7) return;
    requestAnimationFrame(() => this.focusIncantBar(attempt + 1));
  }

  private closeIncant(): void {
    this.incanting = false;
    this.timeScale = 1;
    this.input.keyboard!.enableGlobalCapture();
    this.incantWrap.classList.remove('active', 'judging');
    this.incantWrap.setAttribute('aria-hidden', 'true');
    this.incantBar.disabled = false;
    this.incantBar.blur();
  }

  private updateIncantCharge(): void {
    const length = Array.from(this.incantBar.value).length;
    const percent = Math.min(100, Math.round((length / 24) * 100));
    this.incantWrap.style.setProperty('--charge', `${percent}%`);
    this.incantCount.textContent = `${length}/60`;
    this.incantChargeLabel.textContent = length === 0
      ? '공명 대기'
      : percent < 45
        ? '문장 공명 중'
        : percent < 100
          ? '공명 상승'
          : '최대 공명';
  }

  private beginJudging(): void {
    this.incanting = false;
    this.casting = true;
    this.timeScale = 0.15;
    this.input.keyboard!.enableGlobalCapture();
    this.incantWrap.classList.add('active', 'judging');
    this.incantBar.disabled = true;
    this.incantState.textContent = '마법 해석 중';
    this.incantHint.textContent = '문장의 의미를 현실에 연결합니다';
    this.incantChargeLabel.textContent = 'SPELL JUDGING';
    this.incantBar.blur();
  }

  private finishCastingUx(): void {
    this.casting = false;
    this.timeScale = 1;
    this.input.keyboard!.enableGlobalCapture();
    this.incantWrap.classList.remove('active', 'judging');
    this.incantWrap.setAttribute('aria-hidden', 'true');
    this.incantBar.disabled = false;
  }

  // ── 판정 → 렌더링 사이클 ────────────────────────────────────
  private async castFromText(text: string): Promise<void> {
    this.casting = true;
    try {
      const judgement = await this.judge.judge(text);
      if (!this.playerState.alive || !this.isCombatActive()) {
        this.announceSystemMessage('행동 불가');
        return;
      }
      if (judgement.disposition !== 'cast') {
        const prefix = judgement.disposition === 'fizzle' ? '불발' : '영창 차단';
        const color = judgement.disposition === 'fizzle' ? '#ffd166' : '#ff6b86';
        this.announceSystemMessage(`${prefix} · ${judgement.message}`, color);
        return;
      }

      const spec = judgement.spell;
      if (!this.playerState.trySpendMana(spec.cost)) {
        this.announceSystemMessage('마나 부족');
        return;
      }

      const historyEntry = this.spellHistory.record({
        rawText: text,
        spell: spec,
        source: this.currentJudgeSource(),
        castAt: Date.now(),
      });
      const affinityBonus = this.combatRunController.state
        .elementalAffinity[spec.element_primary] ?? 0;
      const effectiveSpec: SpellSpec = {
        ...spec,
        power: spellPowerWithAffinity(historyEntry.power, affinityBonus),
      };
      if (historyEntry.power < historyEntry.basePower) {
        console.info('[SpellHistory] repeat-penalty', {
          rawText: text,
          basePower: historyEntry.basePower,
          power: historyEntry.power,
        });
      }

      this.playerState.startGlobalCooldown();
      this.applySpellPalette(effectiveSpec);
      this.announceSpell(effectiveSpec);
      this.applySpellEffect(effectiveSpec);
    } finally {
      this.finishCastingUx();
    }
  }

  private applySpellEffect(spec: SpellSpec): void {
    const from = new Phaser.Math.Vector2(this.player.x, this.player.y - 20);
    if (spec.effect === 'heal') {
      const healed = this.playerState.heal(spellHealFromPower(spec.power));
      this.announceSystemMessage(`회복 +${Math.round(healed)} HP`, '#72f1a8');
      return;
    }
    if (spec.effect === 'shield') {
      const shielded = this.playerState.addShield(spellShieldFromPower(spec.power));
      this.announceSystemMessage(`보호막 +${Math.round(shielded)}`, '#72d8ff');
      return;
    }
    if (spec.effect === 'buff') {
      const restored = this.playerState.restoreMana(spellBuffManaFromPower(spec.power));
      this.announceSystemMessage(`강화 · MANA +${Math.round(restored)}`, '#c7a6ff');
      return;
    }
    if (spec.effect === 'control') {
      this.castControlSpell(from, spec);
      return;
    }
    if (spec.effect === 'summon') {
      this.createSummon(spec);
      return;
    }

    const target = this.nearestEnemy();
    const to = target ? new Phaser.Math.Vector2(target.x, target.y) : undefined;
    const hitEnemies = new Set<CombatEnemy>();
    const castRoomIndex = this.combatRunController.state.roomIndex;
    castSpell({
      scene: this,
      from,
      to,
      onHit: (impact) => {
        const currentRunState = this.combatRunController.state;
        if (currentRunState.phase !== 'combat'
          || currentRunState.roomIndex !== castRoomIndex) return;
        this.onSpellHit(impact, spec, target, hitEnemies);
      },
    }, spec);
  }

  private currentJudgeSource(): JudgeSource {
    switch (this.judge.lastSource) {
      case 'gemini':
      case 'cache':
      case 'fallback':
      case 'local':
        return this.judge.lastSource;
      default:
        return this.judge.name.startsWith('MockJudge') ? 'mock' : 'local';
    }
  }

  private updateStatusText(): void {
    const hp = Math.ceil(this.playerState.hp);
    const mana = Math.floor(this.playerState.mana);
    const shield = Math.ceil(this.playerState.shield);
    const runState = this.combatRunController.state;
    let actionState = 'READY';
    if (!this.playerState.alive) actionState = 'DEAD';
    else if (runState.phase === 'run-over') actionState = 'RUN COMPLETE';
    else if (runState.phase === 'reward-select') actionState = 'REWARD SELECT';
    else if (runState.phase === 'room-transition') actionState = 'NEXT ROOM';
    else if (this.casting) actionState = 'JUDGING';
    else if (this.incanting) actionState = 'INCANTING';
    else if (this.playerState.cooldownRemaining > 0) {
      actionState = `COOLDOWN ${this.playerState.cooldownRemaining.toFixed(1)}s`;
    }

    const statusColor = !this.playerState.alive
      ? '#ff5c7a'
      : this.casting
        ? '#ffd166'
        : this.incanting
          ? '#8fa4ff'
          : this.playerState.cooldownRemaining > 0
            ? '#ffb86b'
            : '#72f1b8';
    this.statusText.setText(`● ${actionState}`).setColor(statusColor);
    this.hpText.setText(`HP    ${hp.toString().padStart(3)} / ${this.playerState.maxHp}`);
    this.manaText.setText(`MANA  ${mana.toString().padStart(3)} / ${this.playerState.maxMana}`);
    this.shieldText.setText(`SHIELD ${shield.toString().padStart(3)} / ${this.playerState.maxHp}`);
    this.drawHudBars();

    if (runState.phase === 'run-over') {
      this.waveText.setText('RUN COMPLETE');
    } else if (runState.phase === 'reward-select') {
      this.waveText.setText(`ROOM ${runState.roomIndex}/${runState.maxRooms} CLEAR`);
    } else if (runState.phase === 'room-transition') {
      this.waveText.setText(`NEXT ROOM ${runState.roomIndex + 1}/${runState.maxRooms}`);
    } else if (this.waveManager.phase === 'waiting') {
      this.waveText.setText(
        `NEXT WAVE ${this.waveManager.delayRemaining.toFixed(1)}s`,
      );
    } else {
      this.waveText.setText(
        `WAVE ${this.waveManager.currentWaveNumber}/${this.waveManager.totalWaves}`
        + `  ·  ENEMIES ${this.enemies.length}`,
      );
    }
  }

  private drawHudBars(): void {
    const hpRatio = Phaser.Math.Clamp(this.playerState.hp / this.playerState.maxHp, 0, 1);
    const manaRatio = Phaser.Math.Clamp(this.playerState.mana / this.playerState.maxMana, 0, 1);
    const shieldRatio = Phaser.Math.Clamp(this.playerState.shield / this.playerState.maxHp, 0, 1);
    const cooldownRatio = Phaser.Math.Clamp(
      this.playerState.cooldownRemaining / PLAYER_COMBAT_CONFIG.globalCooldownSeconds,
      0,
      1,
    );
    const g = this.hudGraphics.clear();

    g.fillStyle(0x080b1c, 0.9);
    g.fillRoundedRect(HUD.x, HUD.y, HUD.width, HUD.height, 12);
    g.lineStyle(1, 0x33447f, 0.72);
    g.strokeRoundedRect(HUD.x, HUD.y, HUD.width, HUD.height, 12);

    g.fillStyle(0x141a35, 1);
    g.fillRoundedRect(HUD.barX, 73, HUD.barWidth, HUD.barHeight, 4);
    g.fillRoundedRect(HUD.barX, 107, HUD.barWidth, HUD.barHeight, 4);
    g.fillRoundedRect(HUD.barX, 141, HUD.barWidth, HUD.barHeight, 4);
    g.fillStyle(0xff5c82, 1);
    g.fillRoundedRect(HUD.barX, 73, HUD.barWidth * hpRatio, HUD.barHeight, 4);
    g.fillStyle(0x5b8cff, 1);
    g.fillRoundedRect(HUD.barX, 107, HUD.barWidth * manaRatio, HUD.barHeight, 4);
    g.fillStyle(0x48c9ff, 1);
    g.fillRoundedRect(HUD.barX, 141, HUD.barWidth * shieldRatio, HUD.barHeight, 4);

    g.fillStyle(0x1d2445, 1);
    g.fillRoundedRect(HUD.x + 8, HUD.y + HUD.height - 5, HUD.width - 16, 3, 2);
    g.fillStyle(cooldownRatio > 0 ? 0xffb86b : 0x72f1b8, 1);
    g.fillRoundedRect(
      HUD.x + 8,
      HUD.y + HUD.height - 5,
      (HUD.width - 16) * (cooldownRatio > 0 ? 1 - cooldownRatio : 1),
      3,
      2,
    );

    const { width } = this.scale;
    g.fillStyle(0x080b1c, 0.86);
    g.fillRoundedRect(width - 306, 18, 288, 72, 12);
    g.lineStyle(1, 0x2a735c, 0.62);
    g.strokeRoundedRect(width - 306, 18, 288, 72, 12);
  }

  private applySpellPalette(spec: SpellSpec): void {
    const palette = ELEMENT_PALETTES[spec.element_primary];
    this.incantWrap.style.setProperty('--spell-core', paletteColorToCss(palette.core));
    this.incantWrap.style.setProperty('--spell-glow', paletteColorToCss(palette.glow));
    this.incantWrap.style.setProperty('--spell-accent', paletteColorToCss(palette.accent));

    const secondary = spec.element_secondary
      ? ` + ${ELEMENT_LABELS[spec.element_secondary]}`
      : '';
    const source = this.judge.lastSource ?? this.judge.name;
    this.attunementText
      .setText(`${ELEMENT_LABELS[spec.element_primary]}${secondary} // ${source.toUpperCase()}`)
      .setColor(paletteColorToCss(palette.core));
  }

  private announceSystemMessage(message: string, color = '#ff8fa3'): void {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height * 0.42, message, {
      fontSize: '24px',
      fontStyle: 'bold',
      color,
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

  private announceIncomingDamage(hpDamage: number, shieldDamage: number): void {
    const shieldPart = shieldDamage > 0 ? `보호막 -${Math.round(shieldDamage)}` : '';
    const hpPart = hpDamage > 0 ? `HP -${Math.round(hpDamage)}` : '';
    const separator = shieldPart && hpPart ? ' · ' : '';
    this.announceSystemMessage(
      `${shieldPart}${separator}${hpPart}`,
      hpDamage > 0 ? '#ff8fa3' : '#72d8ff',
    );
  }

  private nearestEnemy(maxDistance = Number.POSITIVE_INFINITY): CombatEnemy | null {
    return this.nearestEnemyFrom(this.player.x, this.player.y, maxDistance);
  }

  private nearestEnemyFrom(
    fromX: number,
    fromY: number,
    maxDistance = Number.POSITIVE_INFINITY,
  ): CombatEnemy | null {
    let best: CombatEnemy | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      const d = Phaser.Math.Distance.Between(fromX, fromY, enemy.x, enemy.y);
      if (d < bestD) { bestD = d; best = enemy; }
    }
    return bestD <= maxDistance ? best : null;
  }

  private onSpellHit(
    impact: SpellImpact,
    spec: SpellSpec,
    lockedTarget: CombatEnemy | null,
    hitEnemies: Set<CombatEnemy>,
  ): void {
    const damage = Math.max(1, spellDamageFromPower(spec.power));
    if (impact.kind === 'point') {
      if (lockedTarget?.alive) this.damageEnemy(lockedTarget, damage);
      return;
    }

    for (const enemy of [...this.enemies]) {
      if (!enemy.alive || hitEnemies.has(enemy)) continue;

      const isHit = impact.kind === 'circle'
        ? Phaser.Math.Distance.Between(impact.x, impact.y, enemy.x, enemy.y)
          <= impact.radius
        : this.pointToSegmentDistance(
          enemy.x,
          enemy.y,
          impact.fromX,
          impact.fromY,
          impact.toX,
          impact.toY,
        ) <= impact.width / 2;
      if (!isHit) continue;

      hitEnemies.add(enemy);
      this.damageEnemy(enemy, damage);
    }
  }

  private createSummon(spec: SpellSpec): void {
    this.clearSummon();
    this.activeSummon = new SummonedOrb(
      this,
      this.player.x,
      this.player.y,
      spec.element_primary,
      spec.power,
    );
    this.announceSystemMessage(
      `소환 · ${this.activeSummon.state.durationSeconds.toFixed(1)}초`,
      paletteColorToCss(ELEMENT_PALETTES[spec.element_primary].core),
    );
  }

  private updateSummon(deltaSeconds: number): void {
    const summon = this.activeSummon;
    if (!summon) return;
    if (!this.playerState.alive) {
      this.clearSummon();
      return;
    }

    summon.updatePosition(this.player.x, this.player.y, deltaSeconds);
    const target = this.nearestEnemyFrom(summon.x, summon.y, SUMMON_CONFIG.attackRange);
    const tick = summon.state.update(deltaSeconds, target !== null);
    if (tick.expired) {
      this.clearSummon();
      return;
    }
    if (!tick.shouldAttack || !target) return;

    const palette = ELEMENT_PALETTES[summon.element];
    this.fireFriendlyMissile({
      fromX: summon.x,
      fromY: summon.y,
      target,
      damage: summon.state.damage,
      speed: SUMMON_CONFIG.projectileSpeed,
      hitDistance: SUMMON_CONFIG.projectileHitDistance,
      coreColor: palette.core,
      glowColor: palette.glow,
    });
  }

  private clearSummon(): void {
    this.activeSummon?.destroy();
    this.activeSummon = null;
  }

  private castControlSpell(from: Phaser.Math.Vector2, spec: SpellSpec): void {
    const target = this.nearestEnemy();
    const to = target ? new Phaser.Math.Vector2(target.x, target.y) : undefined;
    const affectedEnemies = new Set<CombatEnemy>();
    const castRoomIndex = this.combatRunController.state.roomIndex;
    castSpell({
      scene: this,
      from,
      to,
      onHit: (impact) => {
        const currentRunState = this.combatRunController.state;
        if (currentRunState.phase !== 'combat'
          || currentRunState.roomIndex !== castRoomIndex) return;
        this.onControlHit(impact, spec, target, affectedEnemies);
      },
    }, spec);
  }

  private onControlHit(
    impact: SpellImpact,
    spec: SpellSpec,
    lockedTarget: CombatEnemy | null,
    affectedEnemies: Set<CombatEnemy>,
  ): void {
    if (impact.kind === 'point') {
      if (lockedTarget?.alive) this.applySlow(lockedTarget, spec.power);
      return;
    }

    for (const enemy of this.enemies) {
      if (!enemy.alive || affectedEnemies.has(enemy)) continue;
      const isHit = impact.kind === 'circle'
        ? Phaser.Math.Distance.Between(impact.x, impact.y, enemy.x, enemy.y)
          <= impact.radius
        : this.pointToSegmentDistance(
          enemy.x,
          enemy.y,
          impact.fromX,
          impact.fromY,
          impact.toX,
          impact.toY,
        ) <= impact.width / 2;
      if (!isHit) continue;

      affectedEnemies.add(enemy);
      this.applySlow(enemy, spec.power);
    }
  }

  private applySlow(enemy: CombatEnemy, power: number): void {
    const remaining = this.enemyControlState.applySlow(enemy, power);
    if (!this.controlIndicators.has(enemy)) {
      const indicator = this.add.circle(
        0,
        0,
        CONTROL_CONFIG.indicatorRadius,
        CONTROL_CONFIG.indicatorColor,
        0.08,
      ).setStrokeStyle(2, CONTROL_CONFIG.indicatorColor, 0.85)
        .setBlendMode(Phaser.BlendModes.ADD);
      enemy.view.addAt(indicator, 0);
      this.controlIndicators.set(enemy, indicator);
    }
    console.info('[Control] slow-applied', {
      enemy: enemy.kind,
      durationSeconds: remaining,
      movementMultiplier: CONTROL_CONFIG.slowMovementMultiplier,
    });
  }

  private updateEnemyControls(deltaSeconds: number): void {
    for (const enemy of this.enemyControlState.update(deltaSeconds)) {
      this.removeControlIndicator(enemy);
    }
  }

  private removeEnemyControl(enemy: CombatEnemy): void {
    this.enemyControlState.remove(enemy);
    this.removeControlIndicator(enemy);
  }

  private clearEnemyControls(): void {
    for (const enemy of this.enemyControlState.clear()) {
      this.removeControlIndicator(enemy);
    }
    for (const enemy of [...this.controlIndicators.keys()]) {
      this.removeControlIndicator(enemy);
    }
  }

  private removeControlIndicator(enemy: CombatEnemy): void {
    const indicator = this.controlIndicators.get(enemy);
    if (!indicator) return;
    if (indicator.active) indicator.destroy();
    this.controlIndicators.delete(enemy);
  }

  private pointToSegmentDistance(
    pointX: number,
    pointY: number,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ): number {
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const lengthSquared = segmentX * segmentX + segmentY * segmentY;
    if (lengthSquared === 0) {
      return Phaser.Math.Distance.Between(pointX, pointY, startX, startY);
    }

    const projection = Phaser.Math.Clamp(
      ((pointX - startX) * segmentX + (pointY - startY) * segmentY) / lengthSquared,
      0,
      1,
    );
    const nearestX = startX + projection * segmentX;
    const nearestY = startY + projection * segmentY;
    return Phaser.Math.Distance.Between(pointX, pointY, nearestX, nearestY);
  }

  private damageEnemy(enemy: CombatEnemy, damage: number): void {
    if (!enemy.takeDamage(damage)) return;

    const splitX = enemy.x;
    const splitY = enemy.y;
    const shouldSplit = enemy instanceof SplitterEnemy && enemy.canSplit;
    this.removeEnemyControl(enemy);
    enemy.destroy();
    this.enemies = this.enemies.filter((candidate) => candidate !== enemy);
    if (shouldSplit) {
      for (let i = 0; i < SPLITTER_CONFIG.splitCount; i++) {
        const angle = (Math.PI * 2 * i) / SPLITTER_CONFIG.splitCount;
        const x = Phaser.Math.Clamp(
          splitX + Math.cos(angle) * SPLITTER_CONFIG.splitOffset,
          this.worldBounds.left + 22,
          this.worldBounds.right - 22,
        );
        const y = Phaser.Math.Clamp(
          splitY + Math.sin(angle) * SPLITTER_CONFIG.splitOffset,
          this.worldBounds.top + 22,
          this.worldBounds.bottom - 22,
        );
        this.spawnEnemy('small-splitter', x, y);
      }
    }
    if (this.enemies.length > 0) return;

    this.clearEnemyProjectiles();
    const completedWave = this.waveManager.currentWaveNumber;
    this.waveManager.notifyEnemiesCleared();
    if (this.waveManager.phase === 'room-clear') {
      this.combatRunController.notifyRoomCleared();
    } else {
      this.announceSystemMessage(`웨이브 ${completedWave} 완료`);
    }
  }

  /** 주문명 각인 연출 — "내 문장이 게임이 됐다"는 순간 (GDD §3.1) */
  private announceSpell(spec: SpellSpec): void {
    const { width, height } = this.scale;
    const pal = ELEMENT_PALETTES[spec.element_primary];
    const colorHex = paletteColorToCss(pal.core);

    const label = this.add.text(width / 2, height * 0.32, spec.name, {
      fontSize: '42px',
      fontStyle: 'bold',
      color: colorHex,
      stroke: '#05060f',
      strokeThickness: 6,
      align: 'center',
      wordWrap: { width: width - 80, useAdvancedWrap: true },
    }).setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(100)
      .setBlendMode(Phaser.BlendModes.ADD);

    // [디버그] 판정 출처: GeminiJudge면 gemini/cache/fallback, 없으면 판정기 이름
    const source = this.judge.lastSource ?? this.judge.name;
    const meta = this.add.text(width / 2, height * 0.32 + 36,
      `${spec.element_primary}${spec.element_secondary ? '+' + spec.element_secondary : ''}`
      + ` · ${spec.effect}/${spec.target} · ${spec.form} · power ${spec.power} · [${source}]`,
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
