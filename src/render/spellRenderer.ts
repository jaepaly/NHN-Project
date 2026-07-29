import Phaser from 'phaser';
import type { SpellSpec } from '../spell/types';
import { SPELL_DAMAGE_CONFIG } from '../combat-core/combat/combatConfig';
import { CAGE_CONFIG, CHAIN_CONFIG } from '../combat-core/combat/advancedFormConfig';
import {
  NOVA_CONFIG,
  RAIN_CONFIG,
  ZONE_CONFIG,
  areaTargetPoint,
  novaProjectileSpeed,
  rainFallDurationMs,
  rainLaunchDurationSeconds,
  rainOffset,
  zoneDurationSeconds,
} from '../combat-core/combat/areaSpellConfig';
import { ELEMENT_PALETTES, SIZE_SCALE } from './palette';
import {
  SLASH_CONFIG,
  slashAnchor,
  slashCrescentPolygon,
  slashCutAngles,
  slashCutPoints,
  slashCutRadius,
  slashHitCircle,
  rotatePointsAbout,
} from '../combat-core/combat/slashConfig';
import {
  AFFINITY_VFX_CONFIG,
  flourishEmberCount,
  flourishMaxRadius,
  flourishRingCount,
  flourishSparkCount,
} from './affinityVfx';
import {
  VFX_BUDGET_CONFIG,
  decorParticleFrequencyMs,
  persistentFieldAlphaScale,
} from './vfxBudget';
import { requestCameraShake } from './cameraShake';
import {
  PARTICLE_TEXTURES,
  elementParticleKey,
  ensureParticleTextures,
  particleKey,
  playShockRing,
} from './particleTextures';
import type { CameraShakeTier } from '../combat-core/combat/cameraShakeConfig';

interface SpellImpactMeta {
  /** Multiplies the power-based damage for this individual impact. */
  damageMultiplier?: number;
  /** Allows a persistent form to hit the same enemy once in each distinct group. */
  hitGroup?: number;
  /** Overrides the default power-based control duration for this form. */
  controlDurationSeconds?: number;
  /** Chain 경로에서 직접 대응할 대상 인덱스. */
  chainIndex?: number;
  /** Control 폼이 적용할 이동 제어 종류. */
  controlMode?: 'slow' | 'root';
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
  /** 전투 코어가 결정한 chain 대상 좌표. 최초 대상부터 순서대로 전달한다. */
  chainPath?: readonly { x: number; y: number }[];
  /** Automated spirit/engrave casts keep reduced impact VFX but never move the camera. */
  allowCameraShake?: boolean;
  /**
   * 원소 친화 VFX 강도(연속, 0=기본) — 친화를 쌓은 원소일수록 시전 연출이 화려해진다.
   * 판정 영역과 무관한 오버레이만 격상한다(affinityVfx.ts). 위력·적중 불변.
   */
  vfxIntensity?: number;
  /**
   * 지속형 장식 VFX 알파 배율 (#216 P0-1 광과민성 예산) — **명시한 시전만**
   * 중첩 예산에 참여한다(플레이어 수동=1, 자동=autoCastScale). 생략(undefined)은
   * 예산 면제 — 보스 위험구역처럼 "장식이 아니라 정보"인 필드는 항상 최대 밝기.
   */
  decorVfxScale?: number;
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
  /** Prevents delayed projectiles from resolving after their combat room has ended. */
  shouldResolveImpact?: () => boolean;
  /** Optional bounded modifiers used by sequence showcase tuning. */
  damageScale?: number;
  rangeScale?: number;
  radiusScale?: number;
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
  ensureParticleTextures(ctx.scene);
  requestCastCameraShake(ctx, spec);
  const impactCtx = withAffinityImpactFlourish(ctx, spec);
  switch (spec.form) {
    case 'beam':
      castBeam(impactCtx, spec);
      break;
    case 'wave':
      castWave(impactCtx, spec);
      break;
    case 'nova':
      castNova(impactCtx, spec);
      break;
    case 'zone':
      castZone(impactCtx, spec);
      break;
    case 'rain':
      castRain(impactCtx, spec);
      break;
    case 'chain':
      castChain(impactCtx, spec);
      break;
    case 'cage':
      castCage(impactCtx, spec);
      break;
    case 'slash':
      castSlash(impactCtx, spec);
      break;
    case 'bolt':
    default:
      // 미구현 폼은 bolt로 대체 렌더링 (후속 개발에서 12폼 구현)
      castBolt(impactCtx, spec);
      break;
  }
}

/** 친화 연출은 지속/연쇄 타격마다 반복하지 않고 영창의 첫 적중·전개 지점에서 한 번만 재생한다. */
function withAffinityImpactFlourish(ctx: CastContext, spec: SpellSpec): CastContext {
  const intensity = Math.max(0, ctx.vfxIntensity ?? 0);
  // Beam/wave affinities are emitted per enemy after ProtoScene confirms real damage.
  if (intensity < AFFINITY_VFX_CONFIG.minIntensity
    || !ctx.onHit || spec.form === 'beam' || spec.form === 'wave') return ctx;

  const onHit = ctx.onHit;
  let played = false;
  return {
    ...ctx,
    onHit: (impact, spec) => {
      if (!played) {
        played = true;
        const point = impact.kind === 'line'
          ? { x: impact.toX, y: impact.toY }
          : { x: impact.x, y: impact.y };
        playAffinityImpactFlourish(ctx.scene, point.x, point.y, spec, intensity);
      }
      onHit(impact, spec);
    },
  };
}

function requestCastCameraShake(ctx: CastContext, spec: SpellSpec): void {
  // Projectile forms shake on impact rather than when they launch.
  if (ctx.allowCameraShake === false || spec.form === 'bolt' || spec.form === 'nova') return;
  let tier: CameraShakeTier | null = null;
  let intensityScale = 1.25;
  switch (spec.form) {
    case 'beam':
      tier = 'strong';
      intensityScale = 1.2;
      break;
    case 'wave':
    case 'rain':
      tier = 'medium';
      break;
    case 'zone':
    case 'cage':
      tier = 'weak';
      break;
    case 'chain':
      tier = (ctx.chainPath?.length ?? 0) > 0 ? 'medium' : null;
      break;
    default:
      break;
  }
  if (!tier) return;
  if ((spec.size === 'huge' || spec.power >= 80) && tier !== 'strong') {
    tier = tier === 'weak' ? 'medium' : 'strong';
  }
  requestCameraShake(ctx.scene, tier, intensityScale);
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
  const trail = scene.add.particles(0, 0, elementParticleKey(scene, spec.element_primary), {
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
    subTrail = scene.add.particles(0, 0, particleKey(scene, PARTICLE_TEXTURES.spark), {
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
    if (emitHit && ctx.allowCameraShake !== false) {
      const tier: CameraShakeTier = spec.size === 'huge' || spec.power >= 80
        ? 'medium'
        : 'weak';
      requestCameraShake(scene, tier, 1.25);
    }
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

/** chain — 최초 적중 후 가까운 미적중 대상으로 최대 3회 연쇄 */
function castChain(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const path = ctx.chainPath ?? [];
  if (path.length === 0) {
    const miss = ctx.to ?? new Phaser.Math.Vector2(from.x, from.y - 120);
    drawChainSegment(scene, from.x, from.y, miss.x, miss.y, pal.core, pal.glow, scale);
    return;
  }

  path.forEach((point, index) => {
    scene.time.delayedCall(index * CHAIN_CONFIG.segmentDelayMs, () => {
      const previous = index === 0 ? from : path[index - 1];
      drawChainSegment(
        scene,
        previous.x,
        previous.y,
        point.x,
        point.y,
        pal.core,
        pal.glow,
        scale,
      );
      impactBurst(scene, point.x, point.y, spec);
      ctx.onHit?.({
        kind: 'point',
        x: point.x,
        y: point.y,
        chainIndex: index,
        damageMultiplier: CHAIN_CONFIG.damageMultipliers[index] ?? 0,
      }, spec);
    });
  });
}

function drawChainSegment(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  coreColor: number,
  glowColor: number,
  scale: number,
): void {
  const segment = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  segment.lineStyle(10 * scale, glowColor, 0.2);
  segment.lineBetween(fromX, fromY, toX, toY);
  segment.lineStyle(Math.max(2, 3 * scale), coreColor, 0.95);
  segment.lineBetween(fromX, fromY, toX, toY);
  scene.tweens.add({
    targets: segment,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.easeOut',
    onComplete: () => segment.destroy(),
  });
}

/** cage — 대상의 이동만 완전히 봉쇄하는 짧은 감금 활성화 연출 */
function castCage(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const center = ctx.to ?? from;
  const radius = CAGE_CONFIG.baseRadius * scale;
  const ring = scene.add.circle(center.x, center.y, radius, pal.glow, 0.1)
    .setStrokeStyle(Math.max(2, 3 * scale), pal.core, 0.95)
    .setBlendMode(Phaser.BlendModes.ADD);
  const inner = scene.add.circle(center.x, center.y, radius * 0.65, pal.core, 0)
    .setStrokeStyle(Math.max(1, 2 * scale), pal.accent, 0.8)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: [ring, inner],
    scale: { from: 1.35, to: 1 },
    alpha: { from: 1, to: 0 },
    duration: 520,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      ring.destroy();
      inner.destroy();
    },
  });
  ctx.onHit?.({
    kind: 'point',
    x: center.x,
    y: center.y,
    controlDurationSeconds: CAGE_CONFIG.rootDurationSeconds,
    controlMode: 'root',
  }, spec);
}

/** beam — 목표 방향의 모든 적을 관통하는 순간 직선 광선 */
function castBeam(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const range = SPELL_DAMAGE_CONFIG.beamRange * (ctx.rangeScale ?? 1);
  const end = endpointInDirection(from, ctx.to, range);
  const width = SPELL_DAMAGE_CONFIG.beamBaseWidth * scale;
  const holdDurationMs = spec.speed === 'fast' ? 200 : spec.speed === 'slow' ? 400 : 300;
  const fadeDurationMs = spec.speed === 'fast' ? 400 : spec.speed === 'slow' ? 650 : 500;

  // 시작부 테이퍼 (#216 항목6) — 원점~taperLen 구간은 원점에서 수렴하는 삼각형으로
  // 그려, 플레이어 쪽이 풀폭으로 뚝 끊겨 보이던 것을 잇는다. 판정 라인은 불변.
  const dir = new Phaser.Math.Vector2(end.x - from.x, end.y - from.y).normalize();
  const taperLen = Math.min(70 * scale, range * 0.12);
  const tx = from.x + dir.x * taperLen;
  const ty = from.y + dir.y * taperLen;
  const perpX = -dir.y;
  const perpY = dir.x;

  const beam = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
  const drawLayer = (layerWidth: number, color: number, alpha: number): void => {
    beam.fillStyle(color, alpha);
    beam.fillTriangle(
      from.x, from.y,
      tx + perpX * layerWidth / 2, ty + perpY * layerWidth / 2,
      tx - perpX * layerWidth / 2, ty - perpY * layerWidth / 2,
    );
    beam.lineStyle(layerWidth, color, alpha);
    beam.lineBetween(tx, ty, end.x, end.y);
  };
  drawLayer(width * 2.4, pal.glow, 0.18);
  drawLayer(width, pal.core, 0.75);
  drawLayer(Math.max(2, width * 0.22), pal.accent, 1);

  if (spec.element_secondary) {
    const sub = ELEMENT_PALETTES[spec.element_secondary];
    drawLayer(Math.max(1, width * 0.1), sub.accent, 0.9);
  }

  // 발사 원점 코어 — 손에서 나간다는 근거. 방출 순간 블룸(작게→제 크기 팝)이
  // "충전→방출"의 연결을 한 호흡으로 읽게 한다.
  const muzzleHalo = scene.add.circle(from.x, from.y, width * 1.7, pal.glow, 0.34)
    .setBlendMode(Phaser.BlendModes.ADD);
  const muzzleCore = scene.add.circle(from.x, from.y, width * 0.75, pal.core, 0.95)
    .setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({
    targets: [muzzleHalo, muzzleCore],
    scale: { from: 0.5, to: 1 },
    duration: 130,
    ease: 'Back.easeOut',
  });
  // 방출 스파크 — 빔 방향 ±부채꼴로 짧게 튄다
  const beamAngleDeg = Phaser.Math.RadToDeg(Math.atan2(dir.y, dir.x));
  const muzzleSparks = scene.add.particles(from.x, from.y, particleKey(scene, PARTICLE_TEXTURES.spark), {
    speed: { min: 90, max: 190 },
    angle: { min: beamAngleDeg - 24, max: beamAngleDeg + 24 },
    scale: { start: 0.4 * scale, end: 0 },
    lifespan: 300,
    quantity: Math.round(6 + 4 * scale),
    tint: [pal.core, pal.accent],
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  });
  muzzleSparks.explode(Math.round(6 + 4 * scale));
  scene.time.delayedCall(420, () => muzzleSparks.destroy());

  ctx.onHit?.({
    kind: 'line',
    fromX: from.x,
    fromY: from.y,
    toX: end.x,
    toY: end.y,
    width,
    damageMultiplier: ctx.damageScale ?? 1,
  }, spec);
  impactBurst(scene, end.x, end.y, spec);
  scene.time.delayedCall(holdDurationMs, () => {
    if (!beam.active) return;
    scene.tweens.add({
      targets: [beam, muzzleHalo, muzzleCore],
      alpha: 0,
      duration: fadeDurationMs,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        beam.destroy();
        muzzleHalo.destroy();
        muzzleCore.destroy();
      },
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
  const trail = scene.add.particles(0, 0, elementParticleKey(scene, spec.element_primary), {
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

/** nova — 지정 지점까지 핵을 보내 도착 시 360° 방사 폭발 */
/**
 * 참격 — **적이 있는 자리**에 즉시 그어지는 초승달 호 (#188).
 *
 * 시전자 앞을 휘두르면 그건 검술이지 마법이 아니다(총괄 설계 결정). 참격은 거리를
 * 무시하고 적 자리에 발현한다 — 그게 '말이 곧 마법'에 맞고, 근접 접근을 강요하지 않아
 * 카이팅 중심 전투 루프와도 어울린다.
 *
 * bolt와의 구분: bolt는 투사체가 **날아가고**, slash는 **즉발**로 그어진다.
 * 대신 사거리 상한(SLASH_CONFIG.maxRange)이 있어 저격이 되지 않는다.
 *
 * 시각(호)과 판정(원)이 **같은 지점**에 정렬된다 — 보이는 곳과 맞는 곳이 어긋나지 않게.
 * 새 impact 종류를 만들지 않는 이유: onDamageHit·onControlHit 등 소비처를 전부
 * 건드려야 해서 훨씬 큰 변경이 된다. 원 근사로 기존 판정이 그대로 따라온다.
 */
export function castSlash(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const toward = ctx.to ? { x: ctx.to.x, y: ctx.to.y } : null;
  const anchor = slashAnchor(from, toward, ctx.rangeScale);
  const cutRadius = slashCutRadius(spec.size, spec.power, ctx.radiusScale);
  // 기준 형상 — 연참은 이걸 앵커 기준으로 회전시켜 재사용한다(매번 다시 생성 안 함).
  const basePoints = slashCutPoints(from, anchor, spec.size, spec.power, ctx.radiusScale);
  const baseCrescent = slashCrescentPolygon(
    from, anchor, spec.size, spec.power, ctx.radiusScale,
  );
  // 접근 축 — 스파크·수렴선은 이 축의 **수직**(= 벤 자국을 따라)으로 움직인다.
  const axisDeg = Phaser.Math.RadToDeg(Math.atan2(anchor.y - from.y, anchor.x - from.x));
  const sparkTints = spec.element_secondary
    ? [pal.core, pal.accent, ELEMENT_PALETTES[spec.element_secondary].core]
    : [pal.core, pal.glow, pal.accent];
  // 씬이 내려간 뒤 지연 콜백이 살아나 죽은 객체를 건드리는 걸 막는다(#184와 같은 결).
  const alive = (): boolean => Boolean(scene.sys?.isActive?.());

  /** 한 번의 참격 — 칼날·잔상·섬광·절단흔·스파크. i가 커질수록 옅어진다. */
  const runCut = (offsetDeg: number, index: number): void => {
    if (!alive()) return;
    const lead = index === 0;
    // 뒤따르는 참격은 조금씩 옅게 — 첫 획이 주인공이고 나머지는 따라붙는 결이다.
    const weight = lead ? 1 : 0.72 - index * 0.08;
    const crescent = rotatePointsAbout(baseCrescent, anchor, offsetDeg)
      .map((point) => new Phaser.Math.Vector2(point.x, point.y));
    const vectors = rotatePointsAbout(basePoints, anchor, offsetDeg)
      .map((point) => new Phaser.Math.Vector2(point.x, point.y));
    const cutDeg = axisDeg + offsetDeg;

    // ① 칼날 — 초승달을 채워 그린다. 스윕 진행도만큼 열려 '베고 지나간' 순간이 읽힌다.
    const blade = scene.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    // ② 잔상 — 살짝 늦게 따라오는 얇은 호. 한 줄만으로는 휘두른 무게가 안 실린다.
    const echo = scene.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    const sweep = { progress: 0, echo: 0 };
    const half = crescent.length / 2;
    const drawBlade = (progress: number, alpha: number): void => {
      blade.clear();
      if (progress <= 0 || alpha <= 0) return;
      // 바깥·안쪽 호를 같은 비율로 잘라 닫힌 도형을 유지한다.
      const count = Math.max(2, Math.round(half * progress));
      const outer = crescent.slice(0, count);
      const inner = crescent.slice(crescent.length - count);
      const shape = [...outer, ...inner];
      blade.fillStyle(pal.glow, 0.28 * alpha).fillPoints(shape, true);
      blade.fillStyle(pal.core, 0.8 * alpha).fillPoints(shape, true);
      // 바깥 날만 가늘게 강조 — 베인 단면이 빛나는 느낌
      blade.lineStyle(1.6, pal.accent, alpha).strokePoints(outer, false);
    };
    const drawEcho = (progress: number, alpha: number): void => {
      echo.clear();
      if (progress <= 0 || alpha <= 0) return;
      const count = Math.max(2, Math.round(vectors.length * progress));
      echo.lineStyle(3 * scale, pal.glow, 0.45 * alpha).strokePoints(vectors.slice(0, count), false);
    };
    scene.tweens.add({
      targets: sweep,
      progress: 1,
      duration: SLASH_CONFIG.sweepMs,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        drawBlade(sweep.progress, (1 - sweep.progress * 0.25) * weight);
        drawEcho(sweep.echo, (1 - sweep.echo) * weight);
      },
      onComplete: () => {
        scene.tweens.add({
          targets: [blade, echo],
          alpha: 0,
          duration: 130,
          onComplete: () => { blade.destroy(); echo.destroy(); },
        });
      },
    });
    scene.tweens.add({
      targets: sweep,
      echo: 1,
      duration: SLASH_CONFIG.sweepMs,
      delay: SLASH_CONFIG.echoDelayMs,
      ease: 'Cubic.easeOut',
    });

    // ③ 절단흔 — 벤 자리가 잠깐 남아 스러진다. 전부 0.3초 안에 사라지면
    // "번쩍했다"로만 남고 "베였다"가 안 읽힌다. 남는 흔적이 그 차이를 만든다.
    const scar = scene.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    scar.lineStyle(1.4, pal.accent, 0.75 * weight).strokePoints(vectors, false);
    scene.tweens.add({
      targets: scar,
      alpha: 0,
      duration: SLASH_CONFIG.scarMs,
      delay: SLASH_CONFIG.sweepMs,
      ease: 'Quad.easeIn',
      onComplete: () => scar.destroy(),
    });

    // ④ 베는 섬광 — 잘린 자리가 순간 하얗게 벌어졌다 닫힌다. 참격의 '한 방'을 만든다.
    const flash = scene.add
      .rectangle(anchor.x, anchor.y, cutRadius * 1.5, 3 * scale, pal.accent)
      .setRotation(Phaser.Math.DegToRad(cutDeg + 90))
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD);
    scene.tweens.add({
      targets: flash,
      scaleY: { from: 1, to: 4 },
      alpha: { from: weight, to: 0 },
      duration: SLASH_CONFIG.flashMs,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });

    // ⑤ 수렴선 — 마력이 벤 자리로 빨려든다. 멀리서 발현하는 근거를 화면에 만든다.
    // 첫 획에서만. 매 획마다 하면 화면이 지저분해진다.
    if (lead) {
      const converge = scene.add.graphics().setDepth(6)
        .setBlendMode(Phaser.BlendModes.ADD);
      const pull = { t: 0 };
      scene.tweens.add({
        targets: pull,
        t: 1,
        duration: SLASH_CONFIG.convergeMs,
        ease: 'Quad.easeIn',
        onUpdate: () => {
          converge.clear();
          const reach = cutRadius * (2.4 - pull.t * 2.1);
          const inner = cutRadius * 0.9;
          converge.lineStyle(2 * scale, pal.accent, 0.85 * (1 - pull.t));
          for (const deg of [cutDeg + 90, cutDeg - 90]) {
            const rad = Phaser.Math.DegToRad(deg);
            converge.lineBetween(
              anchor.x + Math.cos(rad) * reach, anchor.y + Math.sin(rad) * reach,
              anchor.x + Math.cos(rad) * inner, anchor.y + Math.sin(rad) * inner,
            );
          }
        },
        onComplete: () => converge.destroy(),
      });
    }

    // ⑥ 절단면 스파크 — 벤 선을 따라 양쪽으로 튄다. 원형 폭발과 구분되는 결.
    const emitters = [cutDeg + 90, cutDeg - 90].map((direction) => {
      const sparks = scene.add.particles(anchor.x, anchor.y, particleKey(scene, PARTICLE_TEXTURES.spark), {
        speed: { min: cutRadius * 1.4, max: cutRadius * 3 },
        angle: { min: direction - 18, max: direction + 18 },
        scale: { start: 0.5 * scale * weight, end: 0 },
        lifespan: 320,
        quantity: Math.max(4, Math.round((10 + spec.power / 6) * weight)),
        tint: sparkTints,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      });
      sparks.explode();
      return sparks;
    });
    scene.time.delayedCall(500, () => emitters.forEach((e) => e.destroy()));

    if (ctx.allowCameraShake !== false) {
      // 위력이 실린 참격은 화면이 더 크게 흔들린다. 연참은 획마다 — 게이트가
      // 과도한 연타를 알아서 걸러낸다(requestCameraShake의 rate limit).
      requestCameraShake(scene, spec.power >= 70 && lead ? 'medium' : 'weak', 1.1 * weight);
    }
  };

  // 연참 — 위력이 높을수록 여러 번 교차한다. 판정은 그대로 하나(순수 연출).
  slashCutAngles(spec.power).forEach((offsetDeg, index) => {
    if (index === 0) runCut(offsetDeg, 0);
    else scene.time.delayedCall(index * SLASH_CONFIG.multiCutDelayMs, () => runCut(offsetDeg, index));
  });

  const hit = slashHitCircle(
    from, toward, spec.size, spec.power, ctx.rangeScale, ctx.radiusScale,
  );
  if (ctx.shouldResolveImpact?.() === false) return;
  ctx.onHit?.({ kind: 'circle', x: hit.x, y: hit.y, radius: hit.radius }, spec);
}

function castNova(ctx: CastContext, spec: SpellSpec): void {
  const { scene, from } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const target = areaTargetPoint(
    from.x,
    from.y,
    ctx.to?.x,
    ctx.to?.y,
    NOVA_CONFIG.castRange,
  );
  const distance = Phaser.Math.Distance.Between(from.x, from.y, target.x, target.y);

  if (distance <= NOVA_CONFIG.instantDistance) {
    explodeNova(ctx, spec, target.x, target.y);
    return;
  }

  const body = scene.add.circle(from.x, from.y, 9 * scale, pal.core)
    .setBlendMode(Phaser.BlendModes.ADD);
  const halo = scene.add.circle(from.x, from.y, 18 * scale, pal.glow, 0.38)
    .setBlendMode(Phaser.BlendModes.ADD);
  const trail = scene.add.particles(0, 0, elementParticleKey(scene, spec.element_primary), {
    speed: { min: 20, max: 85 },
    scale: { start: 0.55 * scale, end: 0 },
    lifespan: 360,
    quantity: 2,
    tint: [pal.core, pal.glow, pal.accent],
    blendMode: Phaser.BlendModes.ADD,
    follow: body,
  });
  let subTrail: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  if (spec.element_secondary) {
    const sub = ELEMENT_PALETTES[spec.element_secondary];
    subTrail = scene.add.particles(0, 0, elementParticleKey(scene, spec.element_secondary!), {
      speed: { min: 30, max: 100 },
      scale: { start: 0.32 * scale, end: 0 },
      lifespan: 300,
      quantity: 1,
      tint: [sub.core, sub.accent],
      blendMode: Phaser.BlendModes.ADD,
      follow: body,
    });
  }

  scene.tweens.add({
    targets: [body, halo],
    x: target.x,
    y: target.y,
    duration: distance / novaProjectileSpeed(spec.speed) * 1000,
    ease: 'Linear',
    onComplete: () => {
      trail.stop();
      subTrail?.stop();
      body.destroy();
      halo.destroy();
      explodeNova(ctx, spec, target.x, target.y);
      scene.time.delayedCall(400, () => {
        trail.destroy();
        subTrail?.destroy();
      });
    },
  });
}

function explodeNova(ctx: CastContext, spec: SpellSpec, x: number, y: number): void {
  if (ctx.shouldResolveImpact?.() === false) return;
  const { scene } = ctx;
  const pal = ELEMENT_PALETTES[spec.element_primary];
  const scale = SIZE_SCALE[spec.size];
  const radiusScale = ctx.radiusScale ?? 1;
  const radius = (120 * scale + spec.power) * radiusScale;

  if (ctx.allowCameraShake !== false) {
    requestCameraShake(scene, 'strong', 1.45);
  }

  // 부드러운 충격파가 먼저 퍼지고 그 위에 또렷한 스트로크 링이 따라간다 —
  // 링 텍스처는 안팎으로 감쇠해서 '두께 있는 파면'으로 읽힌다.
  playShockRing(scene, x, y, pal.core, radius * 0.55, 460);
  // 확장하는 링
  const ring = scene.add.circle(x, y, 10, pal.glow, 0)
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
  const burst = scene.add.particles(x, y, elementParticleKey(scene, spec.element_primary), {
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
    const subBurst = scene.add.particles(x, y, elementParticleKey(scene, spec.element_secondary!), {
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
    x,
    y,
    radius: (SPELL_DAMAGE_CONFIG.novaBaseRadius + spec.power) * radiusScale,
    damageMultiplier: ctx.damageScale ?? 1,
  }, spec);
  scene.time.delayedCall(700, () => burst.destroy());
}

/**
 * 활성 zone 장식 핸들 — 씬별로 모아 중첩 수에 따라 알파를 재분배한다 (#216 P0-1).
 * pulse(틱 예고)는 제외 — 순간 연출이고 "언제 아픈가"라는 정보라 예산 밖이다.
 */
interface ZoneDecorHandle {
  field: Phaser.GameObjects.Arc;
  inner: Phaser.GameObjects.Arc;
  particles: Phaser.GameObjects.Particles.ParticleEmitter;
  /** 시전별 기본 배율 (자동 시전 감쇠 등) — 예산 배율에 곱해진다 */
  decorScale: number;
}

const activeZoneDecor = new Map<Phaser.Scene, Set<ZoneDecorHandle>>();

function zoneDecorSet(scene: Phaser.Scene): Set<ZoneDecorHandle> {
  let set = activeZoneDecor.get(scene);
  if (!set) {
    set = new Set();
    activeZoneDecor.set(scene, set);
    // 씬 재시작 시 파괴된 핸들이 남지 않게 — 존은 Phaser가 함께 파괴한다
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => activeZoneDecor.delete(scene));
  }
  return set;
}

/** 예산 참여 존 전체의 알파·파티클 빈도를 현재 중첩 수 기준으로 재분배한다. */
function rebalanceZoneDecor(scene: Phaser.Scene): void {
  const set = zoneDecorSet(scene);
  for (const handle of set) {
    if (!handle.field.active) set.delete(handle); // 방 전환 등으로 먼저 파괴된 존 정리
  }
  const budget = persistentFieldAlphaScale(set.size);
  for (const handle of set) {
    const scale = budget * handle.decorScale;
    handle.field.setAlpha(scale);
    handle.inner.setAlpha(scale);
    handle.particles.frequency = decorParticleFrequencyMs(
      VFX_BUDGET_CONFIG.particleBaseFrequencyMs,
      scale,
    );
  }
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
  const particles = scene.add.particles(center.x, center.y, particleKey(scene, PARTICLE_TEXTURES.glow), {
    speed: { min: radius * 0.15, max: radius * 0.55 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.28 * scale, end: 0 },
    alpha: { start: 0.55, end: 0 },
    lifespan: Math.max(500, tickIntervalMs),
    frequency: VFX_BUDGET_CONFIG.particleBaseFrequencyMs,
    quantity: 1,
    tint: [pal.core, pal.glow, accent],
    blendMode: Phaser.BlendModes.ADD,
  });

  // 장식 예산 등록 (#216 P0-1) — decorVfxScale을 명시한 시전(플레이어)만.
  // 보스 위험구역(undefined)은 면제: 장식이 아니라 정보라 항상 최대 밝기.
  const decorHandle: ZoneDecorHandle | null = ctx.decorVfxScale !== undefined
    ? { field, inner, particles, decorScale: ctx.decorVfxScale }
    : null;
  if (decorHandle) {
    zoneDecorSet(scene).add(decorHandle);
    rebalanceZoneDecor(scene);
  }

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
    // 소멸 시작 = 예산 반납 — 남은 존들이 즉시 밝기를 돌려받는다.
    // 페이드 트윈과 rebalance가 알파를 두고 다투지 않게 set에서 먼저 뺀다.
    if (decorHandle) {
      zoneDecorSet(scene).delete(decorHandle);
      rebalanceZoneDecor(scene);
    }
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
  const burst = scene.add.particles(x, y, elementParticleKey(scene, spec.element_primary), {
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
  // 충격파 링이 먼저 퍼지고 그 위로 파편이 튄다 — 순서가 있어야 '터졌다'로 읽힌다
  playShockRing(scene, x, y, pal.core, 26 * scale);
  const burst = scene.add.particles(x, y, elementParticleKey(scene, spec.element_primary), {
    speed: { min: 60, max: 220 * scale },
    scale: { start: 0.6 * scale, end: 0 },
    lifespan: 400,
    quantity: 15 + Math.floor(spec.power / 5),
    tint: [pal.core, pal.glow, pal.accent],
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  });
  burst.explode();
  scene.time.delayedCall(500, () => burst.destroy());
}

/**
 * 친화 격상 플러리시 — 첫 적중·전개 지점에서 원소색 링·스파크·엠버가 티어만큼 쌓인다.
 * 순수 오버레이(짧은 수명, 판정 무관). 티어 0이면 아무것도 하지 않는다.
 */
export function playAffinityImpactFlourish(
  scene: Phaser.Scene,
  x: number,
  y: number,
  spec: SpellSpec,
  intensity: number,
): void {
  const cfg = AFFINITY_VFX_CONFIG;
  const t = Math.max(0, Math.min(cfg.intensityCap, intensity));
  if (t < cfg.minIntensity) return;
  const pal = ELEMENT_PALETTES[spec.element_primary];

  // 확장 링 — 개수·반경·스파크·엠버는 순수 함수(affinityVfx.ts)가 결정한다.
  // nova는 폼배율(#216 항목7)로 축소 — 조준점 폭발이 적 무리를 덮지 않게.
  const rings = flourishRingCount(t, spec.form);
  const maxRadius = flourishMaxRadius(t, spec.form);
  for (let i = 0; i < rings; i += 1) {
    const ring = scene.add.circle(x, y, 10, 0x000000, 0)
      .setStrokeStyle(5 - i * 0.5, i === 0 ? pal.core : i === 1 ? pal.glow : pal.accent, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(7);
    scene.tweens.add({
      targets: ring,
      radius: maxRadius * (1 + i * 0.35),
      alpha: 0,
      delay: i * 80,
      duration: 560,
      ease: 'Cubic.easeOut',
      onUpdate: () => ring.setRadius(ring.radius),
      onComplete: () => ring.destroy(),
    });
  }

  // 스파크 버스트 — 양·속도가 강도에 연속 비례 (매 시전의 작은 성장도 보인다)
  const sparkCount = flourishSparkCount(t, spec.form);
  const sparks = scene.add.particles(x, y, particleKey(scene, PARTICLE_TEXTURES.spark), {
    speed: { min: 60, max: 150 + t * 30 },
    scale: { start: 0.5 + t * 0.05, end: 0 },
    lifespan: 500,
    quantity: sparkCount,
    tint: [pal.core, pal.accent],
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  }).setDepth(7);
  sparks.explode(sparkCount);
  scene.time.delayedCall(620, () => sparks.destroy());

  // 엠버 잔광 — 강도 3(친화 0.45)부터, 강도에 비례해 더 많이 (마스터리의 표식)
  const embers = flourishEmberCount(t, spec.form);
  if (embers > 0) {
    for (let i = 0; i < embers; i += 1) {
      const angle = (Math.PI * 2 * i) / embers;
      const ember = scene.add.circle(
        x + Math.cos(angle) * 26,
        y + Math.sin(angle) * 26,
        2.5,
        pal.accent,
        0.9,
      ).setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
      scene.tweens.add({
        targets: ember,
        y: ember.y - 34 - Math.random() * 18,
        alpha: 0,
        duration: 520 + Math.random() * 200,
        ease: 'Sine.easeOut',
        onComplete: () => ember.destroy(),
      });
    }
  }

  // 마스터리 섬광 — 강도 5(친화 0.75)부터, 원소색 밝은 원이 확 퍼진다 (깊은 특화의 위엄)
  if (t >= cfg.flashFromIntensity) {
    const flash = scene.add.circle(x, y, 14, pal.glow, 0.5)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(7);
    scene.tweens.add({
      targets: flash,
      radius: maxRadius * 1.5,
      alpha: 0,
      duration: 340,
      ease: 'Quart.easeOut',
      onUpdate: () => flash.setRadius(flash.radius),
      onComplete: () => flash.destroy(),
    });
  }
}
