import Phaser from 'phaser';
import type { SpellSpec } from '../spell/types';
import { SPELL_DAMAGE_CONFIG } from '../combat-core/combat/combatConfig';
import {
  RAIN_CONFIG,
  ZONE_CONFIG,
  areaTargetPoint,
  rainFallDurationMs,
  rainLaunchDurationSeconds,
  rainOffset,
  zoneDurationSeconds,
} from '../combat-core/combat/areaSpellConfig';
import { ELEMENT_PALETTES, SIZE_SCALE } from './palette';

interface SpellImpactMeta {
  /** Multiplies the power-based damage for this individual impact. */
  damageMultiplier?: number;
  /** Allows a persistent form to hit the same enemy once in each distinct group. */
  hitGroup?: number;
  /** Overrides the default power-based control duration for this form. */
  controlDurationSeconds?: number;
}

export type SpellImpact =
  | ({ kind: 'point'; x: number; y: number } & SpellImpactMeta)
  | ({ kind: 'circle'; x: number; y: number; radius: number } & SpellImpactMeta)
  | ({
    kind: 'line';
    fromX: number;
    fromY: number;
    toX: number;
    toY: number;
    width: number;
  } & SpellImpactMeta);

/**
 * 파츠 조합 이펙트 엔진 (프로토타입) — GDD §6
 * form(궤적) × element(팔레트) × size(스케일) 레이어를 조립한다.
 *
 * Phase 2 구현 범위: bolt / beam / wave / nova / zone / rain 6개 폼 × 8원소 전체.
 * 폼별 로직만 유한하고, 원소·크기는 데이터(팔레트·스케일)라서 공짜로 전 조합 지원.
 */

export interface CastContext {
  scene: Phaser.Scene;
  from: Phaser.Math.Vector2;
  /** 방향성 폼의 목표점 (없으면 위쪽으로 발사) */
  to?: Phaser.Math.Vector2;
  /** 렌더러가 만든 실제 형상의 적중 영역을 전투 씬에 전달 */
  onHit?: (impact: SpellImpact, spec: SpellSpec) => void;
  /** Checks a bolt's latest movement segment against live combat targets. */
  resolveBoltCollision?: (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    projectileRadius: number,
  ) => { x: number; y: number } | null;
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
    case 'beam':
      castBeam(ctx, spec);
      break;
    case 'wave':
      castWave(ctx, spec);
      break;
    case 'nova':
      castNova(ctx, spec);
      break;
    case 'zone':
      castZone(ctx, spec);
      break;
    case 'rain':
      castRain(ctx, spec);
      break;
    case 'bolt':
    default:
      // 미구현 폼은 bolt로 대체 렌더링 (후속 개발에서 12폼 구현)
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

  let previousX = from.x;
  let previousY = from.y;
  let finished = false;
  const finish = (x: number, y: number, emitHit: boolean): void => {
    if (finished) return;
    finished = true;
    body.setPosition(x, y);
    halo.setPosition(x, y);
    impactBurst(scene, x, y, spec);
    if (emitHit) ctx.onHit?.({ kind: 'point', x, y }, spec);
    trail.stop();
    subTrail?.stop();
    scene.time.delayedCall(400, () => {
      body.destroy(); halo.destroy(); trail.destroy(); subTrail?.destroy();
    });
  };

  const resolveCurrentSegment = (x: number, y: number): boolean => {
    const collision = ctx.resolveBoltCollision?.(
      previousX,
      previousY,
      x,
      y,
      8 * scale,
    );
    previousX = x;
    previousY = y;
    if (!collision) return false;
    finish(collision.x, collision.y, true);
    return true;
  };

  scene.tweens.add({
    targets: [body, halo],
    x: to.x,
    y: to.y,
    duration: durationMs,
    ease: 'Linear',
    onUpdate: (tween) => {
      if (finished) return;
      if (resolveCurrentSegment(body.x, body.y)) tween.stop();
    },
    onComplete: () => {
      if (finished) return;
      if (ctx.resolveBoltCollision && resolveCurrentSegment(to.x, to.y)) return;
      finish(to.x, to.y, !ctx.resolveBoltCollision);
    },
  });
}

/** beam — 목표 방향의 모든 적을 관통하는 순간 직선 광선 */
function castBeam(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const end = endpointInDirection(from, ctx.to, SPELL_DAMAGE_CONFIG.beamRange);
  const width = SPELL_DAMAGE_CONFIG.beamBaseWidth * scale;
  const holdDurationMs = spec.speed === 'fast' ? 200 : spec.speed === 'slow' ? 400 : 300;
  const fadeDurationMs = spec.speed === 'fast' ? 400 : spec.speed === 'slow' ? 650 : 500;

  const beam = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  beam.lineStyle(width * 2.4, pal.glow, 0.18);
  beam.lineBetween(from.x, from.y, end.x, end.y);
  beam.lineStyle(width, pal.core, 0.75);
  beam.lineBetween(from.x, from.y, end.x, end.y);
  beam.lineStyle(Math.max(2, width * 0.22), pal.accent, 1);
  beam.lineBetween(from.x, from.y, end.x, end.y);

  if (spec.element_secondary) {
    const sub = ELEMENT_PALETTES[spec.element_secondary];
    beam.lineStyle(Math.max(1, width * 0.1), sub.accent, 0.9);
    beam.lineBetween(from.x, from.y, end.x, end.y);
  }

  ctx.onHit?.({
    kind: 'line',
    fromX: from.x,
    fromY: from.y,
    toX: end.x,
    toY: end.y,
    width,
  }, spec);
  impactBurst(scene, end.x, end.y, spec);
  scene.cameras.main.shake(100, 0.0025 * scale);
  scene.time.delayedCall(holdDurationMs, () => {
    if (!beam.active) return;
    scene.tweens.add({
      targets: beam,
      alpha: 0,
      duration: fadeDurationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => beam.destroy(),
    });
  });
}

/** wave — 넓은 파면이 전진하며 닿은 적을 각각 한 번 타격 */
function castWave(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const end = endpointInDirection(from, ctx.to, SPELL_DAMAGE_CONFIG.waveRange);
  const angle = Phaser.Math.Angle.Between(from.x, from.y, end.x, end.y);
  const width = SPELL_DAMAGE_CONFIG.waveBaseWidth * scale;
  const depth = SPELL_DAMAGE_CONFIG.waveHitDepth * scale;
  const speed = spec.speed === 'fast' ? 460 : spec.speed === 'slow' ? 220 : 320;
  const durationMs = (SPELL_DAMAGE_CONFIG.waveRange / speed) * 1000;
  const accent = spec.element_secondary
    ? ELEMENT_PALETTES[spec.element_secondary].accent
    : pal.accent;

  const glow = scene.add.rectangle(from.x, from.y, width, depth * 2.2, pal.glow, 0.18)
    .setRotation(angle + Math.PI / 2)
    .setBlendMode(Phaser.BlendModes.ADD);
  const crest = scene.add.rectangle(from.x, from.y, width, depth, pal.core, 0.55)
    .setStrokeStyle(Math.max(2, 3 * scale), accent, 0.9)
    .setRotation(angle + Math.PI / 2)
    .setBlendMode(Phaser.BlendModes.ADD);
  const trail = scene.add.particles(0, 0, 'particle', {
    speed: { min: 20, max: 90 },
    scale: { start: 0.5 * scale, end: 0 },
    lifespan: 420,
    quantity: Math.max(1, Math.round(2 * scale)),
    tint: [pal.core, pal.glow, accent],
    blendMode: Phaser.BlendModes.ADD,
    follow: crest,
  });

  const emitWaveImpact = (): void => {
    const perpendicularX = Math.cos(angle + Math.PI / 2) * width / 2;
    const perpendicularY = Math.sin(angle + Math.PI / 2) * width / 2;
    ctx.onHit?.({
      kind: 'line',
      fromX: crest.x - perpendicularX,
      fromY: crest.y - perpendicularY,
      toX: crest.x + perpendicularX,
      toY: crest.y + perpendicularY,
      width: depth,
    }, spec);
  };
  emitWaveImpact();

  scene.tweens.add({
    targets: [crest, glow],
    x: end.x,
    y: end.y,
    duration: durationMs,
    ease: 'Linear',
    onUpdate: emitWaveImpact,
    onComplete: () => {
      trail.stop();
      scene.time.delayedCall(450, () => {
        crest.destroy();
        glow.destroy();
        trail.destroy();
      });
    },
  });
}

function endpointInDirection(
  from: Phaser.Math.Vector2,
  toward: Phaser.Math.Vector2 | undefined,
  range: number,
): Phaser.Math.Vector2 {
  const direction = toward
    ? toward.clone().subtract(from)
    : new Phaser.Math.Vector2(0, -1);
  if (direction.lengthSq() === 0) direction.set(0, -1);
  return from.clone().add(direction.normalize().scale(range));
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

  ctx.onHit?.({
    kind: 'circle',
    x: from.x,
    y: from.y,
    radius: SPELL_DAMAGE_CONFIG.novaBaseRadius + spec.power,
  }, spec);
  scene.cameras.main.shake(200, 0.004 * scale);
  scene.time.delayedCall(700, () => burst.destroy());
}

/** zone — 제한 사거리 안의 고정된 지면에 남아 주기적으로 범위 타격 */
function castZone(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const center = areaTargetPoint(
    from.x,
    from.y,
    ctx.to?.x,
    ctx.to?.y,
    ZONE_CONFIG.castRange,
  );
  const radius = ZONE_CONFIG.baseRadius * scale;
  const durationMs = zoneDurationSeconds(spec.speed) * 1000;
  const tickIntervalMs = durationMs / ZONE_CONFIG.tickCount;
  const accent = spec.element_secondary
    ? ELEMENT_PALETTES[spec.element_secondary].accent
    : pal.accent;

  const field = scene.add.circle(center.x, center.y, radius, pal.glow, 0.13)
    .setStrokeStyle(Math.max(2, 3 * scale), pal.core, 0.75)
    .setBlendMode(Phaser.BlendModes.ADD);
  const inner = scene.add.circle(center.x, center.y, radius * 0.62, pal.core, 0.07)
    .setStrokeStyle(Math.max(1, 2 * scale), accent, 0.52)
    .setBlendMode(Phaser.BlendModes.ADD);
  const pulse = scene.add.circle(center.x, center.y, radius * 0.3, pal.core, 0)
    .setStrokeStyle(Math.max(2, 3 * scale), accent, 0.85)
    .setBlendMode(Phaser.BlendModes.ADD);
  const particles = scene.add.particles(center.x, center.y, 'particle', {
    speed: { min: radius * 0.15, max: radius * 0.55 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.28 * scale, end: 0 },
    alpha: { start: 0.55, end: 0 },
    lifespan: Math.max(500, tickIntervalMs),
    frequency: 90,
    quantity: 1,
    tint: [pal.core, pal.glow, accent],
    blendMode: Phaser.BlendModes.ADD,
  });

  scene.tweens.add({
    targets: pulse,
    scale: { from: 0.45, to: 1 },
    alpha: { from: 0.9, to: 0 },
    duration: tickIntervalMs,
    repeat: ZONE_CONFIG.tickCount - 1,
    ease: 'Cubic.easeOut',
  });

  const emitZoneImpact = (hitGroup: number, damageMultiplier?: number): void => {
    if (!field.active) return;
    ctx.onHit?.({
      kind: 'circle',
      x: center.x,
      y: center.y,
      radius,
      damageMultiplier,
      hitGroup,
      controlDurationSeconds: ZONE_CONFIG.controlLingerSeconds,
    }, spec);
  };

  for (let tick = 0; tick < ZONE_CONFIG.tickCount; tick += 1) {
    scene.time.delayedCall(tick * tickIntervalMs, () => {
      emitZoneImpact(tick, ZONE_CONFIG.damageMultiplierPerTick);
    });
  }

  scene.time.delayedCall(durationMs, () => {
    particles.stop();
    scene.tweens.add({
      targets: [field, inner, pulse],
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        field.destroy();
        inner.destroy();
        pulse.destroy();
      },
    });
    scene.time.delayedCall(500, () => particles.destroy());
  });
}

/** rain — 고정된 목표 영역에 순차 낙하하는 다중 범위 타격 */
function castRain(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const center = areaTargetPoint(
    from.x,
    from.y,
    ctx.to?.x,
    ctx.to?.y,
    RAIN_CONFIG.castRange,
  );
  const areaRadius = RAIN_CONFIG.baseAreaRadius * scale;
  const strikeRadius = RAIN_CONFIG.baseStrikeRadius * scale;
  const launchDurationMs = rainLaunchDurationSeconds(spec.speed) * 1000;
  const launchIntervalMs = launchDurationMs / RAIN_CONFIG.strikeCount;
  const fallDurationMs = rainFallDurationMs(spec.speed);
  const accent = spec.element_secondary
    ? ELEMENT_PALETTES[spec.element_secondary].accent
    : pal.accent;
  const field = scene.add.circle(center.x, center.y, areaRadius, pal.glow, 0.045)
    .setStrokeStyle(Math.max(1, 2 * scale), pal.core, 0.34)
    .setBlendMode(Phaser.BlendModes.ADD);

  for (let strike = 0; strike < RAIN_CONFIG.strikeCount; strike += 1) {
    const offset = rainOffset(strike, areaRadius);
    const landingX = center.x + offset.x;
    const landingY = center.y + offset.y;
    const telegraph = scene.add.circle(landingX, landingY, strikeRadius, pal.glow, 0.09)
      .setStrokeStyle(Math.max(1, 2 * scale), accent, 0.48)
      .setBlendMode(Phaser.BlendModes.ADD);

    scene.time.delayedCall(strike * launchIntervalMs, () => {
      if (!field.active) return;
      const startY = landingY - RAIN_CONFIG.fallHeight * scale;
      const drop = scene.add.circle(landingX, startY, 6 * scale, pal.core)
        .setStrokeStyle(Math.max(1, 2 * scale), accent, 0.85)
        .setBlendMode(Phaser.BlendModes.ADD);
      const halo = scene.add.circle(landingX, startY, 13 * scale, pal.glow, 0.3)
        .setBlendMode(Phaser.BlendModes.ADD);
      const trail = scene.add.rectangle(
        landingX,
        startY - 22 * scale,
        4 * scale,
        52 * scale,
        pal.core,
        0.35,
      ).setBlendMode(Phaser.BlendModes.ADD);

      scene.tweens.add({
        targets: [drop, halo, trail],
        y: landingY,
        duration: fallDurationMs,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          drop.destroy();
          halo.destroy();
          trail.destroy();
          telegraph.destroy();
          areaImpactBurst(scene, landingX, landingY, spec);
          ctx.onHit?.({
            kind: 'circle',
            x: landingX,
            y: landingY,
            radius: strikeRadius,
            damageMultiplier: RAIN_CONFIG.damageMultiplierPerStrike,
            hitGroup: strike,
          }, spec);
        },
      });
    });
  }

  const cleanupDelayMs = (RAIN_CONFIG.strikeCount - 1) * launchIntervalMs
    + fallDurationMs + 220;
  scene.time.delayedCall(cleanupDelayMs, () => {
    scene.tweens.add({
      targets: field,
      alpha: 0,
      duration: 180,
      onComplete: () => field.destroy(),
    });
  });
}

function areaImpactBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  spec: SpellSpec,
): void {
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const accent = spec.element_secondary
    ? ELEMENT_PALETTES[spec.element_secondary].accent
    : pal.accent;
  const burst = scene.add.particles(x, y, 'particle', {
    speed: { min: 45, max: 150 * scale },
    scale: { start: 0.42 * scale, end: 0 },
    lifespan: 330,
    quantity: 10 + Math.floor(spec.power / 12),
    tint: [pal.core, pal.glow, accent],
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  });
  burst.explode();
  scene.time.delayedCall(420, () => burst.destroy());
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
