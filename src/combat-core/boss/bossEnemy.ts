/** R1 전투 코어: 최종 보스 — 대형 기하 조형물 (GDD §5). 총괄 1차 구현, 보스 PR은 이도원 리뷰. */
import Phaser from 'phaser';
import type { SpellElement } from '../../spell/types';
import type { BossCounterStrategy } from '../../spell/bossMemoryContract';
import { ELEMENT_PALETTES } from '../../render/palette';
import { BOSS_CONFIG } from './bossConfig';
import type { CombatEnemy, EnemyShotRequest } from '../enemies/combatEnemy';
import { createSpriteLayers, addLayersRotation } from '../../render/spriteLayers';

export type BossProfile = 'legacy' | 'stage' | 'memory';

/** AI 스프라이트(코어만). 무채색으로 저장돼 있어 색은 틴트로 입힌다. */
const BOSS_SPRITE_KEY = 'enemy-boss-core';

export const BOSS_CHARGE_SPEED = 720;
export const BOSS_CHARGE_DURATION_SECONDS = 0.35;
export const BOSS_CHARGE_DISTANCE = BOSS_CHARGE_SPEED * BOSS_CHARGE_DURATION_SECONDS;

export class BossEnemy implements CombatEnemy {
  readonly kind = 'boss' as const;
  readonly view: Phaser.GameObjects.Container;
  readonly maxHp: number;
  readonly contactDamage: number = BOSS_CONFIG.contactDamage;
  readonly contactDistance: number = BOSS_CONFIG.contactDistance;
  readonly collisionRadius: number = BOSS_CONFIG.collisionRadius;

  hp: number;
  alive = true;

  private contactDamageCooldownRemaining = 0;
  private volleyCooldownRemaining: number = BOSS_CONFIG.volleyInitialDelaySeconds;
  /** 아직 발동하지 않은 하수인 소환 임계 (내림차순) */
  private pendingMinionThresholds: number[];
  // R2 counterStrategy 적용 결과 (applyCounterStrategy)
  private speedMultiplier = 1;
  private volleyIntervalSeconds: number = BOSS_CONFIG.volleyIntervalSeconds;
  private chargeRemaining = 0;
  private readonly chargeVelocity = new Phaser.Math.Vector2();

  /** 재질+발광 두 겹 — 회전을 함께 받아야 하므로 묶어둔다. */
  private readonly coreLayers: Array<Phaser.GameObjects.Polygon | Phaser.GameObjects.Image>;
  /** 코어 이미지에 건 셰이더 발광 — 페이즈가 오를수록 강해지고 돌진 때 터진다. */
  private glowFx: Phaser.FX.Glow | null = null;
  private glowPulse: Phaser.Tweens.Tween | null = null;
  private lastPhase: 1 | 2 | 3 = 1;

  private readonly ring: Phaser.GameObjects.Arc;
  private readonly secondaryResistanceRing: Phaser.GameObjects.Arc;
  private readonly healthFill: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly profile: BossProfile = 'legacy',
  ) {
    this.maxHp = profile === 'stage' ? 520 : profile === 'memory' ? 680 : BOSS_CONFIG.maxHp;
    this.hp = this.maxHp;
    this.pendingMinionThresholds = profile === 'legacy'
      ? [...BOSS_CONFIG.minionThresholds]
      : [];
    const glow = scene.add.circle(0, 0, 58, 0xb44dff, 0.14)
      .setBlendMode(Phaser.BlendModes.ADD);
    // 육각 코어 + 회전 링 — '대형 기하 조형물'
    const hexPoints: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 2;
      hexPoints.push(Math.cos(angle) * 34, Math.sin(angle) * 34);
    }
    // AI 스프라이트는 코어만 잘라 쓴다. 원본에는 글리프 링이 그려져 있지만, 이 보스의
    // ring/secondaryResistanceRing은 **저항 원소를 색으로 알려주는 정보**라 절차적으로
    // 유지해야 한다. 스프라이트 링을 얹으면 그 정보와 겹쳐 읽기 어려워진다.
    this.coreLayers = scene.textures.exists(BOSS_SPRITE_KEY)
      ? createSpriteLayers(scene, BOSS_SPRITE_KEY, 72, 0xb44dff)
      : [scene.add.polygon(0, 0, hexPoints, 0x2a1245, 0.95)
        .setStrokeStyle(3, 0xb44dff, 1)];
    this.ring = scene.add.circle(0, 0, 48, 0x000000, 0)
      .setStrokeStyle(2, 0xd0a8ff, 0.7)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.secondaryResistanceRing = scene.add.circle(0, 0, 41, 0x000000, 0)
      .setStrokeStyle(2, 0xd0a8ff, 0.7)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false);

    const healthBack = scene.add.rectangle(-45, -66, 90, 7, 0x30121c, 0.9)
      .setOrigin(0, 0.5);
    this.healthFill = scene.add.rectangle(-45, -66, 90, 7, 0xff6b86, 1)
      .setOrigin(0, 0.5);

    this.view = scene.add.container(x, y, [
      glow,
      this.ring,
      this.secondaryResistanceRing,
      ...this.coreLayers,
      healthBack,
      this.healthFill,
    ]);

    // 코어 이미지 자체에 셰이더 발광을 건다. preFX는 오브젝트마다 렌더 패스가 붙어
    // 다수 몹에는 부담이지만, 보스는 단일 객체라 문제되지 않는다.
    const [coreSprite] = this.coreLayers;
    this.glowFx = coreSprite.preFX?.addGlow(0xb44dff, 3.5, 0, false) ?? null;
    if (this.glowFx) {
      this.glowPulse = scene.tweens.add({
        targets: this.glowFx,
        outerStrength: { from: 2.6, to: 5.2 },
        yoyo: true,
        repeat: -1,
        duration: 1800,
        ease: 'Sine.easeInOut',
      });
    }
  }

  /** 페이즈가 오를수록 발광을 키운다 — 장식이 아니라 "더 위험해졌다"는 정보다. */
  private applyPhaseGlow(): void {
    if (!this.glowFx || !this.glowPulse) return;
    const peak = this.lastPhase === 3 ? 9.5 : this.lastPhase === 2 ? 7.2 : 5.2;
    this.glowPulse.stop();
    this.glowPulse = this.view.scene.tweens.add({
      targets: this.glowFx,
      outerStrength: { from: peak * 0.5, to: peak },
      yoyo: true,
      repeat: -1,
      duration: this.lastPhase === 3 ? 900 : 1400, // 후반일수록 빨라져 조급해 보인다
      ease: 'Sine.easeInOut',
    });
  }

  /** 돌진 예고 — 위험한 행동이라 이미지가 확 타오르게 한다. */
  private flareGlow(): void {
    if (!this.glowFx) return;
    this.glowPulse?.pause();
    this.view.scene.tweens.add({
      targets: this.glowFx,
      outerStrength: { from: 14, to: 3.2 },
      duration: 520,
      ease: 'Quad.easeOut',
      onComplete: () => this.glowPulse?.resume(),
    });
  }

  get x(): number {
    return this.view.x;
  }

  get y(): number {
    return this.view.y;
  }

  get phase(): 1 | 2 | 3 {
    const ratio = this.hp / this.maxHp;
    if (this.profile === 'stage') return ratio > 0.6 ? 1 : 2;
    if (this.profile === 'memory') return ratio > 0.65 ? 1 : ratio > 0.3 ? 2 : 3;
    return 1;
  }

  get charging(): boolean { return this.chargeRemaining > 0; }

  startCharge(
    targetX: number,
    targetY: number,
    distance = BOSS_CHARGE_DISTANCE,
  ): void {
    const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
    if (direction.lengthSq() === 0) direction.set(0, 1);
    this.chargeVelocity.copy(direction.normalize().scale(BOSS_CHARGE_SPEED));
    const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : BOSS_CHARGE_DISTANCE;
    this.chargeRemaining = safeDistance / BOSS_CHARGE_SPEED;
    this.flareGlow();
  }

  /** 기억 기반 내성 원소를 시각화 (링 색 = 내성 원소 팔레트) — GDD §4.1 "명시적 표시" */
  showResistance(element: SpellElement | null): void {
    this.showResistances(element ? [element] : []);
  }

  /** 활성 내성이 둘이면 바깥·안쪽 링으로 모두 표시한다. */
  showResistances(elements: readonly SpellElement[]): void {
    this.ring.setStrokeStyle(2, 0xd0a8ff, 0.7);
    this.secondaryResistanceRing.setVisible(false);
    const primary = elements[0];
    if (!primary) return;
    this.ring.setStrokeStyle(4, ELEMENT_PALETTES[primary].core, 0.95);
    const secondary = elements[1];
    if (!secondary) return;
    this.secondaryResistanceRing
      .setStrokeStyle(3, ELEMENT_PALETTES[secondary].core, 0.9)
      .setVisible(true);
  }

  /** R2 카운터 전략 적용 — rush: 돌진 가속 / ranged: 볼리 강화 (GDD §4.1 카운터 패턴) */
  applyCounterStrategy(strategy: BossCounterStrategy): void {
    if (strategy === 'rush') {
      this.speedMultiplier = BOSS_CONFIG.rushSpeedMultiplier;
    } else {
      this.volleyIntervalSeconds =
        BOSS_CONFIG.volleyIntervalSeconds * BOSS_CONFIG.rangedVolleyIntervalMultiplier;
    }
  }

  update(
    deltaSeconds: number,
    targetX: number,
    targetY: number,
    movementMultiplier = 1,
  ): EnemyShotRequest[] {
    if (!this.alive) return [];

    this.contactDamageCooldownRemaining = Math.max(
      0,
      this.contactDamageCooldownRemaining - deltaSeconds,
    );
    this.ring.rotation += 0.9 * deltaSeconds;
    this.secondaryResistanceRing.rotation -= 0.7 * deltaSeconds;
    addLayersRotation(this.coreLayers, -0.25 * deltaSeconds);
    if (this.phase !== this.lastPhase) {
      this.lastPhase = this.phase;
      this.applyPhaseGlow();
    }

    if (this.chargeRemaining > 0) {
      const chargeDelta = Math.min(deltaSeconds, this.chargeRemaining);
      this.view.x += this.chargeVelocity.x * chargeDelta;
      this.view.y += this.chargeVelocity.y * chargeDelta;
      this.chargeRemaining = Math.max(0, this.chargeRemaining - deltaSeconds);
      return [];
    }

    // 저속 추격
    const direction = new Phaser.Math.Vector2(targetX - this.x, targetY - this.y);
    if (direction.lengthSq() > 0) {
      direction.normalize();
      const moveScale = safeMovementMultiplier(movementMultiplier);
      const phaseSpeed = this.profile === 'stage' && this.phase === 2 ? 1.45 : 1;
      const speed = BOSS_CONFIG.speed * this.speedMultiplier * phaseSpeed;
      this.view.x += direction.x * speed * deltaSeconds * moveScale;
      this.view.y += direction.y * speed * deltaSeconds * moveScale;
    }

    if (this.profile !== 'legacy') return [];

    // 방사 볼리 패턴 (간격은 counterStrategy 'ranged' 시 단축)
    this.volleyCooldownRemaining -= deltaSeconds;
    if (this.volleyCooldownRemaining > 0) return [];
    this.volleyCooldownRemaining = this.volleyIntervalSeconds;

    const shots: EnemyShotRequest[] = [];
    const offset = Math.random() * Math.PI * 2;
    const projectileCount = BOSS_CONFIG.volleyProjectiles;
    for (let i = 0; i < projectileCount; i++) {
      const angle = offset + (Math.PI * 2 * i) / projectileCount;
      shots.push({ x: this.x, y: this.y, angle });
    }
    return shots;
  }

  get canDealContactDamage(): boolean {
    return this.alive && this.contactDamageCooldownRemaining <= 0;
  }

  startContactDamageCooldown(): void {
    this.contactDamageCooldownRemaining = BOSS_CONFIG.contactDamageCooldownSeconds;
  }

  /** @returns 이 피해로 처치됐으면 true */
  takeDamage(amount: number): boolean {
    if (!this.alive) return false;

    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    this.healthFill.setScale(this.hp / this.maxHp, 1);
    if (this.hp > 0) return false;

    this.alive = false;
    return true;
  }

  /** HP 임계를 갓 통과했으면 true를 1회 반환 — 씬이 하수인 소환에 사용 */
  consumeMinionTrigger(): boolean {
    const ratio = this.hp / this.maxHp;
    if (this.pendingMinionThresholds.length === 0) return false;
    if (ratio > this.pendingMinionThresholds[0]) return false;
    this.pendingMinionThresholds.shift();
    return true;
  }

  destroy(): void {
    this.alive = false;
    this.view.destroy(true);
  }
}

function safeMovementMultiplier(multiplier: number): number {
  return Number.isFinite(multiplier) ? Math.max(0, multiplier) : 1;
}
