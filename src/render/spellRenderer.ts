import Phaser from 'phaser';
import type { SpellSpec } from '../spell/types';
import { ELEMENT_PALETTES, SIZE_SCALE } from './palette';

/**
 * 파츠 조합 이펙트 엔진 (프로토타입) — GDD §6
 * form(궤적) × element(팔레트) × size(스케일) 레이어를 조립한다.
 *
 * 프로토 구현 범위: bolt / nova 2개 폼 × 8원소 전체.
 * 폼별 로직만 유한하고, 원소·크기는 데이터(팔레트·스케일)라서 공짜로 전 조합 지원.
 */

export interface CastContext {
  scene: Phaser.Scene;
  from: Phaser.Math.Vector2;
  /** bolt 계열의 목표점 (없으면 위쪽으로 발사) */
  to?: Phaser.Math.Vector2;
  /** 적중 판정 콜백 (프로토에서는 이펙트 데모용) */
  onHit?: (x: number, y: number, spec: SpellSpec) => void;
}

/** 파티클용 원형 글로우 텍스처를 1회 생성 */
export function ensureParticleTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists('particle')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(16, 16, 6);
  g.fillStyle(0xffffff, 0.35);
  g.fillCircle(16, 16, 12);
  g.fillStyle(0xffffff, 0.12);
  g.fillCircle(16, 16, 16);
  g.generateTexture('particle', 32, 32);
  g.destroy();
}

export function castSpell(ctx: CastContext, spec: SpellSpec): void {
  ensureParticleTexture(ctx.scene);
  switch (spec.form) {
    case 'nova':
      castNova(ctx, spec);
      break;
    case 'bolt':
    default:
      // 프로토: 미구현 폼은 bolt로 대체 렌더링 (본 개발에서 12폼 구현)
      castBolt(ctx, spec);
      break;
  }
}

/** bolt — 파티클 꼬리를 끄는 투사체 + 착탄 폭발 */
function castBolt(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const to = ctx.to ?? new Phaser.Math.Vector2(from.x, from.y - 400);

  const speed = spec.speed === 'fast' ? 900 : spec.speed === 'slow' ? 350 : 600;
  const dist = Phaser.Math.Distance.Between(from.x, from.y, to.x, to.y);
  const durationMs = (dist / speed) * 1000;

  // 본체: 글로우 서클
  const body = scene.add.circle(from.x, from.y, 8 * scale, pal.core)
    .setBlendMode(Phaser.BlendModes.ADD);
  const halo = scene.add.circle(from.x, from.y, 16 * scale, pal.glow, 0.35)
    .setBlendMode(Phaser.BlendModes.ADD);

  // 꼬리: 파티클 트레일 (주 원소)
  const trail = scene.add.particles(0, 0, 'particle', {
    speed: { min: 10, max: 60 },
    scale: { start: 0.5 * scale, end: 0 },
    lifespan: 350,
    quantity: 2,
    tint: [pal.core, pal.glow],
    blendMode: Phaser.BlendModes.ADD,
    follow: body,
  });

  // 보조 원소 오버레이: 색이 다른 스파크가 섞여 나옴
  let subTrail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  if (spec.element_secondary) {
    const sub = ELEMENT_PALETTES[spec.element_secondary];
    subTrail = scene.add.particles(0, 0, 'particle', {
      speed: { min: 40, max: 120 },
      scale: { start: 0.3 * scale, end: 0 },
      lifespan: 250,
      quantity: 1,
      tint: [sub.core, sub.accent],
      blendMode: Phaser.BlendModes.ADD,
      follow: body,
    });
  }

  scene.tweens.add({
    targets: [body, halo],
    x: to.x,
    y: to.y,
    duration: durationMs,
    ease: 'Linear',
    onComplete: () => {
      impactBurst(scene, to.x, to.y, spec);
      ctx.onHit?.(to.x, to.y, spec);
      trail.stop();
      subTrail?.stop();
      scene.time.delayedCall(400, () => {
        body.destroy(); halo.destroy(); trail.destroy(); subTrail?.destroy();
      });
    },
  });
}

/** nova — 시전자 중심 360° 방사 폭발 */
function castNova(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const radius = 120 * scale + spec.power;

  // 확장하는 링
  const ring = scene.add.circle(from.x, from.y, 10, pal.glow, 0)
    .setStrokeStyle(4 * scale, pal.core, 0.9)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: ring,
    radius,
    alpha: { from: 1, to: 0 },
    duration: 450,
    ease: 'Cubic.easeOut',
    onUpdate: () => ring.setStrokeStyle(4 * scale, pal.core, ring.alpha * 0.9),
    onComplete: () => ring.destroy(),
  });

  // 방사 파티클
  const burst = scene.add.particles(from.x, from.y, 'particle', {
    speed: { min: radius * 1.2, max: radius * 2.2 },
    scale: { start: 0.7 * scale, end: 0 },
    lifespan: 500,
    quantity: 40 + Math.floor(spec.power / 2),
    tint: [pal.core, pal.glow, pal.accent],
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  });
  burst.explode();

  if (spec.element_secondary) {
    const sub = ELEMENT_PALETTES[spec.element_secondary];
    const subBurst = scene.add.particles(from.x, from.y, 'particle', {
      speed: { min: radius, max: radius * 1.8 },
      scale: { start: 0.4 * scale, end: 0 },
      lifespan: 400,
      quantity: 20,
      tint: [sub.core, sub.accent],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    subBurst.explode();
    ctx.scene.time.delayedCall(600, () => subBurst.destroy());
  }

  ctx.onHit?.(from.x, from.y, spec);
  scene.cameras.main.shake(200, 0.004 * scale);
  scene.time.delayedCall(700, () => burst.destroy());
}

/** 착탄 폭발 (bolt 공용) */
function impactBurst(scene: Phaser.Scene, x: number, y: number, spec: SpellSpec): void {
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const burst = scene.add.particles(x, y, 'particle', {
    speed: { min: 60, max: 220 * scale },
    scale: { start: 0.6 * scale, end: 0 },
    lifespan: 400,
    quantity: 15 + Math.floor(spec.power / 5),
    tint: [pal.core, pal.glow, pal.accent],
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  });
  burst.explode();
  scene.cameras.main.shake(120, 0.003 * scale);
  scene.time.delayedCall(500, () => burst.destroy());
}
