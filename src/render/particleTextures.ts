import Phaser from 'phaser';

/**
 * 파티클 텍스처 — 캔버스 그라데이션으로 굽는다 (총괄 지적: "VFX가 데모 느낌").
 *
 * 기존 'particle'은 하드 엣지 동심원 3개를 겹친 것이라 **계단이 보이고 falloff가 없었다**.
 * 게다가 그 하나로 불꽃·서리·번개·독·연기를 전부 그려서 형태 어휘가 원 하나뿐이었다.
 *
 * Phaser의 Graphics는 그라데이션을 못 그리지만 `textures.createCanvas()`는 실제
 * CanvasRenderingContext2D를 열어주므로 `createRadialGradient`로 **지수에 가까운 감쇠**를
 * 구울 수 있다. 파일이 늘지 않고(런타임 생성), 알파가 정확하며, 해상도를 마음대로 정한다.
 *
 * ⚠️ **전부 흰색·무채색으로 굽는다.** 적 스프라이트(spriteLayers)와 같은 규약이다 —
 * 색은 소비자가 tint로 입히므로 8원소가 텍스처 하나를 공유한다. 원소별로 구우면
 * 관리가 안 되고 메모리만 늘어난다.
 *
 * 밝기는 #220 예산 맥락에서 **기존과 같은 수준으로 맞춘다** — 더 밝아지면 중첩 감쇠를
 * 다시 튜닝해야 한다. 목표는 "더 밝게"가 아니라 "같은 밝기에서 더 곱게"다.
 */

export const PARTICLE_TEXTURES = {
  /** 부드러운 발광 — 기본 파티클. 기존 'particle'의 대체 */
  glow: 'px-glow',
  /** 길쭉한 섬광 — 번개·타격처럼 방향이 있는 것 */
  spark: 'px-spark',
  /** 얇은 고리 — 충격파·확산 */
  ring: 'px-ring',
  /** 각진 파편 — 얼음·대지 */
  shard: 'px-shard',
} as const;

const SIZE = 64;

function canvas(scene: Phaser.Scene, key: string): CanvasRenderingContext2D | null {
  if (scene.textures.exists(key)) return null;
  const texture = scene.textures.createCanvas(key, SIZE, SIZE);
  return texture?.getContext() ?? null;
}

function commit(scene: Phaser.Scene, key: string): void {
  (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

/**
 * 발광 — 중심에서 지수적으로 감쇠한다. 정지(stop)를 촘촘히 둬서 선형 그라데이션의
 * "테두리가 보이는" 느낌을 없앤다.
 */
function bakeGlow(scene: Phaser.Scene): void {
  const ctx = canvas(scene, PARTICLE_TEXTURES.glow);
  if (!ctx) return;
  const c = SIZE / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  // alpha = (1-t)^3 근사 — 중심은 단단하고 가장자리는 길게 사라진다
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    grad.addColorStop(t, `rgba(255,255,255,${((1 - t) ** 3).toFixed(4)})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  commit(scene, PARTICLE_TEXTURES.glow);
}

/** 섬광 — 가로로 늘어난 코어 + 좌우로 길게 빠지는 꼬리. 방향감이 생긴다. */
function bakeSpark(scene: Phaser.Scene): void {
  const ctx = canvas(scene, PARTICLE_TEXTURES.spark);
  if (!ctx) return;
  const c = SIZE / 2;
  // 가로로 눌러 타원형 발광을 만든다
  ctx.save();
  ctx.translate(c, c);
  ctx.scale(1, 0.22);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, c);
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    grad.addColorStop(t, `rgba(255,255,255,${((1 - t) ** 2.2).toFixed(4)})`);
  }
  ctx.fillStyle = grad;
  ctx.fillRect(-c, -c, SIZE, SIZE);
  ctx.restore();
  // 중심 코어 — 작고 단단하게
  const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.22);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, SIZE, SIZE);
  commit(scene, PARTICLE_TEXTURES.spark);
}

/** 고리 — 안팎으로 감쇠하는 얇은 링. 확산 연출에서 "면"이 아니라 "파면"으로 읽힌다. */
function bakeRing(scene: Phaser.Scene): void {
  const ctx = canvas(scene, PARTICLE_TEXTURES.ring);
  if (!ctx) return;
  const c = SIZE / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0)');
  grad.addColorStop(0.78, 'rgba(255,255,255,1)');
  grad.addColorStop(0.92, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, SIZE, SIZE);
  commit(scene, PARTICLE_TEXTURES.ring);
}

/** 파편 — 각진 마름모에 옅은 발광. 얼음·대지처럼 "깨지는" 원소용. */
function bakeShard(scene: Phaser.Scene): void {
  const ctx = canvas(scene, PARTICLE_TEXTURES.shard);
  if (!ctx) return;
  const c = SIZE / 2;
  // 옅은 후광 — 파편만 있으면 너무 날카롭다
  const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
  halo.addColorStop(0, 'rgba(255,255,255,0.5)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, SIZE, SIZE);
  // 마름모 본체 — 세로로 긴 결정
  ctx.beginPath();
  ctx.moveTo(c, c - c * 0.86);
  ctx.lineTo(c + c * 0.34, c);
  ctx.lineTo(c, c + c * 0.86);
  ctx.lineTo(c - c * 0.34, c);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  commit(scene, PARTICLE_TEXTURES.shard);
}

/**
 * 전부 굽는다 (한 번만 — 이미 있으면 건너뛴다).
 * 캔버스 텍스처를 못 만드는 렌더러에서는 조용히 넘어가고, 소비자는 기존 'particle'로
 * 폴백한다 — VFX 때문에 게임이 죽으면 안 된다.
 */
export function ensureParticleTextures(scene: Phaser.Scene): void {
  try {
    bakeGlow(scene);
    bakeSpark(scene);
    bakeRing(scene);
    bakeShard(scene);
  } catch {
    // 캔버스 텍스처 실패 — 호출측이 particleKey()로 폴백한다
  }
}

/** 있으면 새 텍스처, 없으면 기존 'particle'. 배선이 실패해도 화면이 비지 않는다. */
export function particleKey(scene: Phaser.Scene, key: string): string {
  return scene.textures.exists(key) ? key : 'particle';
}

/**
 * 원소에 맞는 파티클 — 같은 폭발이라도 얼음은 파편이 튀고 번개는 섬광이 갈라진다.
 * 원소별 텍스처를 따로 굽지 않고 **네 종류를 나눠 쓰는** 방식이라 메모리가 안 는다.
 */
export function elementParticleKey(scene: Phaser.Scene, element: string): string {
  if (element === 'ice' || element === 'earth') {
    return particleKey(scene, PARTICLE_TEXTURES.shard);
  }
  if (element === 'lightning') return particleKey(scene, PARTICLE_TEXTURES.spark);
  return particleKey(scene, PARTICLE_TEXTURES.glow);
}

/**
 * 충격파 링 — 확산의 앞머리. 링 텍스처는 안팎으로 감쇠하므로 Arc 스트로크의
 * 균일한 테두리와 달리 "퍼지는 파면"으로 읽힌다.
 */
export function playShockRing(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number,
  radius: number,
  durationMs = 380,
): void {
  const key = particleKey(scene, PARTICLE_TEXTURES.ring);
  if (key !== PARTICLE_TEXTURES.ring) return; // 링 텍스처가 없으면 조용히 생략
  const ring = scene.add.image(x, y, key)
    .setTint(color)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setAlpha(0.75)
    .setDisplaySize(radius * 0.7, radius * 0.7);
  scene.tweens.add({
    targets: ring,
    displayWidth: radius * 2.2,
    displayHeight: radius * 2.2,
    alpha: 0,
    duration: durationMs,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}
