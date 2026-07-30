import type { SpellElement, SpellForm } from '../spell/types';
import { AFFINITY_VFX_CONFIG, flourishFormScale } from './affinityVfx';

/**
 * 원소별 친화 연출 문법 (총괄 지적 2026-07-30).
 *
 * **왜 필요한가**: 친화 연출(playAffinityImpactFlourish)이 8원소 모두 **같은 기하·같은
 * 동작**을 썼다 — 확장 링(동심원), 스파크 버스트, 상승 엠버, 확장 섬광. 원소별로 다른
 * 건 `ELEMENT_PALETTES`의 색 세 개(core·glow·accent)뿐이었다. 그래서 번개 친화를 올리면
 * "파란 원이 더 많아지고", 불 친화를 올리면 "주황 원이 더 많아졌다". 움직임이 같으니
 * 차이가 느껴질 수가 없었다.
 *
 * (게다가 스파크가 `PARTICLE_TEXTURES.spark`로 하드코딩돼 있었다 — 그건 "번개·타격처럼
 * 방향이 있는 것"용 텍스처다. 모든 원소가 번개 파티클을 쓰고 있었으니 번개가 특별해
 * 보일 수 없었다.)
 *
 * **핵심 판단**: 원소의 느낌은 색이 아니라 **움직임의 성격**에서 온다. 기존 연출은 전부
 * "부드럽게 퍼지는 원(easeOut)" — 물·빛의 문법이고, 번개에 가장 안 어울리는 동작이다.
 * 번개의 "찌릿"은 **꺾인 선 + 짧은 지속 + 이징 없음 + 재점멸**에서 나온다. 부드러운 원을
 * 아무리 많이 겹쳐도 안 나온다.
 *
 * ⚠️ **#220 예산 유지**: 추가하는 건 전부 **선(stroke)**이라 채움 면적이 늘지 않고,
 * 고유 연출이 붙는 원소는 링 개수를 `ringScale`로 줄여 총광량을 상쇄한다. 밝기를
 * 늘리는 게 아니라 **형태를 바꾸는** 개편이다.
 */

/** 고유 연출을 가진 원소 — 나머지는 기존 링 문법을 그대로 쓴다 (그것도 각자 어울린다) */
export type FlourishElement = SpellElement;

/**
 * ⚠️ 모든 `max*`는 **강도 상한(intensityCap 8 = 친화 1.2)에서 실제로 도달**해야 한다.
 * 안 닿으면 그 상한은 죽은 설정이고, "친화를 끝까지 올리면 최대 연출"이라는 약속이
 * 깨진다. 회귀가 각 지표의 상한 도달을 확인한다.
 */
export const ELEMENT_FLOURISH = {
  /**
   * 번개 — 갈래 방전. 즉발·각짐·재점멸.
   * `strikeMs`가 짧고 이징이 없어야 "툭" 하고 꽂힌다. 곡선 이징을 쓰면 즉시 물처럼 읽힌다.
   */
  lightning: {
    /** 링을 이 비율로 줄인다 — 선이 늘어난 만큼 면을 뺀다 (#220) */
    ringScale: 0.4,
    branchesBase: 2,
    branchesPerStack: 0.7,
    maxBranches: 7,
    /** 한 갈래의 꺾임 수 — 많을수록 지그재그가 촘촘해진다 */
    segmentsBase: 3,
    segmentsPerStack: 0.5,
    maxSegments: 7,
    /** 꺾임의 횡방향 흔들림(px) — 강도에 비례해 더 거칠어진다 */
    jitterBase: 9,
    jitterPerStack: 2.4,
    /** 갈래 길이(px) */
    reachBase: 58,
    reachPerStack: 11,
    /** 한 점멸의 지속(ms) — 짧아야 잔상이 안 남고 날카롭다 */
    strikeMs: 55,
    /** 점멸 사이 공백(ms) — 1~2프레임. 이게 "찌릿"의 정체다 */
    gapMs: 38,
    /** 기본 점멸 횟수 + 강도당 (상한 4) */
    flickersBase: 2,
    flickersPerStack: 0.25,
    maxFlickers: 4,
  },
  /**
   * 얼음 — 결정이 **단계적으로** 자라고 상한에서 깨진다.
   * 성장이 연속(easeOut)이면 물처럼 보인다. 계단(Stepped)으로 끊어야 결정처럼 읽힌다.
   */
  ice: {
    ringScale: 0.4,
    spikesBase: 3,
    spikesPerStack: 0.65,
    maxSpikes: 8,
    /** 스파이크 길이(px) */
    lengthBase: 32,
    lengthPerStack: 6.5,
    /** 성장 단계 수 — Stepped 이징의 계단 수 */
    growthSteps: 3,
    growMs: 190,
    /** 이 강도부터 파편으로 깨진다 — 마스터리의 표식 (친화 0.75) */
    shatterFromIntensity: 5,
    shardsBase: 5,
    shardsPerStack: 3,
    maxShards: 14,
  },
  /**
   * 불 — 난류 상승. 혀(tongue)가 흔들리며 위로 오른다.
   *
   * 기존 상승 엠버와 다른 점: 엠버는 **직선으로 뜨는 점**이었고, 이건 **좌우로 휘는 선**이다.
   * 불의 정체는 "위로 간다"가 아니라 "위로 가면서 계속 흔들린다"다. 사인 위상을 혀마다
   * 다르게 줘서 전체가 한 몸처럼 흔들리지 않게 한다.
   *
   * ADD를 쓴다 — 불은 실제로 빛을 낸다. 대신 링을 크게 줄여 상쇄한다.
   */
  fire: {
    ringScale: 0.4,
    tonguesBase: 3,
    tonguesPerStack: 0.75,
    maxTongues: 9,
    /** 혀 하나의 높이(px) */
    riseBase: 30,
    risePerStack: 7,
    /** 좌우 휘는 폭(px) — 강도에 비례해 더 거칠게 난류 */
    swayBase: 7,
    swayPerStack: 1.6,
    /** 혀를 몇 점으로 그리나 — 많으면 곡선이 부드럽다 */
    samples: 6,
    riseMs: 420,
  },
  /**
   * 바람 — 나선. **타격 순간이 없다.**
   *
   * 다른 원소는 "터진다"가 핵심이지만 바람은 계속 도는 것이다. 그래서 확장 섬광
   * (flash)을 쓰지 않고, 호(arc)를 여러 겹 돌려 회전만 남긴다. 시작과 끝이 뚜렷하지
   * 않은 게 의도다.
   */
  wind: {
    ringScale: 0.3,
    armsBase: 2,
    armsPerStack: 0.5,
    maxArms: 6,
    /** 한 팔이 감는 회전 수 */
    turnsBase: 0.8,
    turnsPerStack: 0.15,
    maxTurns: 2,
    radiusBase: 26,
    radiusPerStack: 7,
    samples: 14,
    spinMs: 520,
  },
  /**
   * 물 — 파면이 밀려나갔다 **되돌아온다**.
   *
   * 기존 확장 링과 결정적으로 다른 점: 링은 퍼지고 사라졌지만 물은 **질량이 있어 돌아온다**.
   * 밀려나간 뒤 되돌아오는 왕복이 물의 정체다. 그리고 온전한 원이 아니라 호(arc)로 그려
   * "파면"으로 읽히게 한다 — 완전한 원은 파동이 아니라 충격파다.
   */
  water: {
    ringScale: 0.5,
    frontsBase: 2,
    frontsPerStack: 0.5,
    maxFronts: 6,
    radiusBase: 30,
    radiusPerStack: 8,
    /** 되돌아오는 비율 — 최대 반경의 이만큼까지 물러난다 */
    recedeRatio: 0.45,
    /** 호가 덮는 각도(라디안) — 2π면 온전한 원이라 파면이 안 된다 */
    arcSpan: Math.PI * 1.15,
    surgeMs: 460,
  },
  /**
   * 빛 — 직선 광선 방사(sunburst). **꺾이지 않고 떨리지 않는다.**
   *
   * 번개와의 구분이 전부 여기 있다: 번개는 꺾이고 점멸하지만 빛은 **곧고 한 번에 켜져
   * 서서히 사그라든다.** 같은 "방사되는 선"인데 성격이 정반대다.
   */
  light: {
    ringScale: 0.5,
    raysBase: 4,
    raysPerStack: 1,
    maxRays: 12,
    /** 광선 길이 — 다른 원소보다 길다 (빛은 멀리 간다) */
    lengthBase: 70,
    lengthPerStack: 15,
    /** 광선 안쪽 시작 반경 — 중심을 비워 "뻗어나간다"로 읽히게 */
    innerRatio: 0.18,
    shineMs: 400,
  },
  /**
   * 대지 — 덩어리가 솟았다 **떨어진다**.
   *
   * 얼음과의 구분: 얼음은 결정이 바깥으로 자라 깨지지만, 대지는 덩어리가 **포물선으로
   * 솟았다 중력에 떨어진다.** 각진 형태는 같아도 궤적이 다르다 — 대지에는 무게가 있다.
   */
  earth: {
    ringScale: 0.45,
    chunksBase: 3,
    chunksPerStack: 0.7,
    maxChunks: 9,
    /** 수평 이동 거리 */
    spreadBase: 26,
    spreadPerStack: 6,
    /** 솟는 높이 */
    heightBase: 30,
    heightPerStack: 6,
    /** 덩어리 크기(px) */
    sizeBase: 4,
    sizePerStack: 0.5,
    eruptMs: 480,
  },
  /**
   * 암영 — **안으로** 수축한다.
   *
   * 여덟 원소 중 유일하게 방향이 반대다. 다른 모든 원소가 밖으로 퍼지는데 이것만
   * 빨려든다 — 그래서 한눈에 다르다는 게 즉시 읽힌다. 값싸고 강한 정체성이다.
   */
  dark: {
    ringScale: 0.35,
    tendrilsBase: 3,
    tendrilsPerStack: 0.7,
    maxTendrils: 9,
    /** 빨려들기 시작하는 바깥 반경 */
    outerBase: 46,
    outerPerStack: 9,
    /** 휘어짐 — 직선으로 빨려들면 그냥 축소다 */
    curl: 0.55,
    samples: 8,
    drainMs: 480,
  },
} as const;

/**
 * 이제 **8원소 전부** 고유 연출을 갖는다 (총괄 지적 2026-07-30 2차).
 *
 * 4종만 나눴을 때의 문제: 손댄 원소는 링을 줄이고 엠버를 뺐는데 안 손댄 4종은 Arc 20개를
 * 그대로 써서, **안 손댄 쪽이 화면에서 가장 요란해졌고** 그 넷끼리는 여전히 구분이 안 됐다.
 * "원소는 심사에서 안 나온다"는 예측도 근거가 못 된다 — 원소는 플레이어가 친 문장에서
 * 심판이 정하므로 통제할 수 없다.
 */
export function hasElementFlourish(element: SpellElement): element is FlourishElement {
  return element in ELEMENT_FLOURISH;
}

/**
 * 이 원소가 확장 섬광(flash)을 쓰는가 — **바람만 안 쓴다.**
 * 바람은 타격 순간이 없는 원소라, 확 퍼지는 원이 붙으면 "터졌다"로 읽혀 회전감을 죽인다.
 */
export function usesImpactFlash(element: SpellElement): boolean {
  return element !== 'wind';
}

/** 고유 연출 원소는 링을 줄인다 — 총광량을 늘리지 않기 위한 상쇄 (#220) */
export function flourishRingScaleFor(element: SpellElement): number {
  return hasElementFlourish(element) ? ELEMENT_FLOURISH[element].ringScale : 1;
}

function clampIntensity(intensity: number): number {
  const t = Number.isFinite(intensity) ? intensity : 0;
  return Math.max(0, Math.min(AFFINITY_VFX_CONFIG.intensityCap, t));
}

function scaled(base: number, perStack: number, t: number, max: number, form: SpellForm): number {
  return Math.max(1, Math.min(max, Math.round((base + perStack * t) * flourishFormScale(form))));
}

// ── 번개 ────────────────────────────────────────────────────────────────

export function lightningBranchCount(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.lightning;
  return scaled(c.branchesBase, c.branchesPerStack, clampIntensity(intensity), c.maxBranches, form);
}

/** 꺾임 수 — 폼배율을 적용하지 않는다. 갈래 **개수**는 줄여도 모양은 유지해야 한다. */
export function lightningSegmentCount(intensity: number): number {
  const c = ELEMENT_FLOURISH.lightning;
  const t = clampIntensity(intensity);
  return Math.max(2, Math.min(c.maxSegments, Math.round(c.segmentsBase + c.segmentsPerStack * t)));
}

export function lightningJitter(intensity: number): number {
  const c = ELEMENT_FLOURISH.lightning;
  return c.jitterBase + c.jitterPerStack * clampIntensity(intensity);
}

export function lightningReach(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.lightning;
  return (c.reachBase + c.reachPerStack * clampIntensity(intensity)) * flourishFormScale(form);
}

export function lightningFlickerCount(intensity: number): number {
  const c = ELEMENT_FLOURISH.lightning;
  const t = clampIntensity(intensity);
  return Math.max(1, Math.min(c.maxFlickers, Math.round(c.flickersBase + c.flickersPerStack * t)));
}

// ── 얼음 ────────────────────────────────────────────────────────────────

export function iceSpikeCount(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.ice;
  return scaled(c.spikesBase, c.spikesPerStack, clampIntensity(intensity), c.maxSpikes, form);
}

export function iceSpikeLength(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.ice;
  return (c.lengthBase + c.lengthPerStack * clampIntensity(intensity)) * flourishFormScale(form);
}

/** 파편 수 — 임계 미만이면 0 (깨짐은 마스터리의 표식이라 얕은 투자에선 안 나온다) */
export function iceShardCount(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.ice;
  const t = clampIntensity(intensity);
  if (t < c.shatterFromIntensity) return 0;
  return scaled(c.shardsBase, c.shardsPerStack, t - c.shatterFromIntensity, c.maxShards, form);
}

// ── 불 ─────────────────────────────────────────────────────────────────

export function fireTongueCount(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.fire;
  return scaled(c.tonguesBase, c.tonguesPerStack, clampIntensity(intensity), c.maxTongues, form);
}

export function fireRise(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.fire;
  return (c.riseBase + c.risePerStack * clampIntensity(intensity)) * flourishFormScale(form);
}

export function fireSway(intensity: number): number {
  const c = ELEMENT_FLOURISH.fire;
  return c.swayBase + c.swayPerStack * clampIntensity(intensity);
}

/**
 * 불 혀 하나의 점열 (순수) — 위로 오르며 좌우로 휜다.
 * `phase`가 혀마다 달라야 전체가 한 몸처럼 흔들리지 않는다.
 */
export function tonguePolyline(
  rise: number,
  sway: number,
  phase: number,
  samples: number,
): Array<{ x: number; y: number }> {
  const count = Math.max(2, Math.floor(samples));
  const safeRise = Number.isFinite(rise) ? Math.max(0, rise) : 0;
  const safeSway = Number.isFinite(sway) ? Math.max(0, sway) : 0;
  const safePhase = Number.isFinite(phase) ? phase : 0;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    // 위로 갈수록 흔들림이 커진다 — 뿌리는 붙어 있고 끝이 날린다
    const amplitude = safeSway * t;
    points.push({
      x: Math.sin(safePhase + t * Math.PI * 2.2) * amplitude,
      y: -safeRise * t,
    });
  }
  return points;
}

// ── 바람 ───────────────────────────────────────────────────────────────

export function windArmCount(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.wind;
  return scaled(c.armsBase, c.armsPerStack, clampIntensity(intensity), c.maxArms, form);
}

export function windTurns(intensity: number): number {
  const c = ELEMENT_FLOURISH.wind;
  return Math.min(c.maxTurns, c.turnsBase + c.turnsPerStack * clampIntensity(intensity));
}

export function windRadius(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.wind;
  return (c.radiusBase + c.radiusPerStack * clampIntensity(intensity)) * flourishFormScale(form);
}

/**
 * 나선 팔 하나의 점열 (순수) — 중심에서 밖으로 감긴다.
 * 반경이 t에 비례하고 각도가 t×회전수로 도니 아르키메데스 나선이 된다.
 */
export function spiralPolyline(
  startAngle: number,
  radius: number,
  turns: number,
  samples: number,
): Array<{ x: number; y: number }> {
  const count = Math.max(2, Math.floor(samples));
  const safeRadius = Number.isFinite(radius) ? Math.max(0, radius) : 0;
  const safeTurns = Number.isFinite(turns) ? Math.max(0, turns) : 0;
  const safeStart = Number.isFinite(startAngle) ? startAngle : 0;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const angle = safeStart + t * Math.PI * 2 * safeTurns;
    const r = safeRadius * t;
    points.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
  }
  return points;
}

// ── 물 ─────────────────────────────────────────────────────────────────

export function waterFrontCount(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.water;
  return scaled(c.frontsBase, c.frontsPerStack, clampIntensity(intensity), c.maxFronts, form);
}

export function waterRadius(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.water;
  return (c.radiusBase + c.radiusPerStack * clampIntensity(intensity)) * flourishFormScale(form);
}

/**
 * 파면 반경의 시간 곡선 (순수) — 밀려나갔다 **되돌아온다**.
 *
 * t=0 → 0, 중간에 최대, t=1 → 최대 × recedeRatio. 마지막이 0이 아닌 게 핵심이다:
 * 물은 사라지는 게 아니라 물러난다. 0으로 끝나면 그냥 사라지는 링과 같아진다.
 */
export function waterFrontRadius(t: number, maxRadius: number): number {
  const p = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const r = Number.isFinite(maxRadius) ? Math.max(0, maxRadius) : 0;
  const { recedeRatio } = ELEMENT_FLOURISH.water;
  // 앞의 60%에서 밀려나가고 뒤 40%에서 물러난다
  if (p <= 0.6) return r * (p / 0.6);
  const back = (p - 0.6) / 0.4;
  return r * (1 - (1 - recedeRatio) * back);
}

// ── 빛 ─────────────────────────────────────────────────────────────────

export function lightRayCount(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.light;
  return scaled(c.raysBase, c.raysPerStack, clampIntensity(intensity), c.maxRays, form);
}

export function lightRayLength(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.light;
  return (c.lengthBase + c.lengthPerStack * clampIntensity(intensity)) * flourishFormScale(form);
}

// ── 대지 ───────────────────────────────────────────────────────────────

export function earthChunkCount(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.earth;
  return scaled(c.chunksBase, c.chunksPerStack, clampIntensity(intensity), c.maxChunks, form);
}

export function earthChunkSize(intensity: number): number {
  const c = ELEMENT_FLOURISH.earth;
  return c.sizeBase + c.sizePerStack * clampIntensity(intensity);
}

/**
 * 덩어리 하나의 포물선 위치 (순수) — 솟았다 **떨어진다**.
 *
 * y가 `-sin(πt)`라 t=0과 t=1에서 모두 지면 높이다. 이 왕복이 대지의 무게를 만든다 —
 * 단조 상승이면 불꽃처럼 떠오르는 것이 된다.
 */
export function earthChunkAt(
  angle: number,
  spread: number,
  height: number,
  t: number,
): { x: number; y: number } {
  const p = Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  const s = Number.isFinite(spread) ? Math.max(0, spread) : 0;
  const h = Number.isFinite(height) ? Math.max(0, height) : 0;
  const a = Number.isFinite(angle) ? angle : 0;
  return { x: Math.cos(a) * s * p, y: Math.sin(a) * s * p * 0.35 - h * Math.sin(Math.PI * p) };
}

// ── 암영 ───────────────────────────────────────────────────────────────

export function darkTendrilCount(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.dark;
  return scaled(c.tendrilsBase, c.tendrilsPerStack, clampIntensity(intensity), c.maxTendrils, form);
}

export function darkOuterRadius(intensity: number, form: SpellForm): number {
  const c = ELEMENT_FLOURISH.dark;
  return (c.outerBase + c.outerPerStack * clampIntensity(intensity)) * flourishFormScale(form);
}

/**
 * 촉수 하나의 점열 (순수) — 바깥에서 중심으로 **빨려든다**.
 *
 * 다른 모든 원소가 원점에서 시작하는데 이것만 **바깥에서 시작해 원점으로 끝난다.**
 * 방향이 반대라는 것 자체가 암영의 정체성이다. 휘어짐(curl)이 없으면 그냥 축소로 보인다.
 */
export function tendrilPolyline(
  angle: number,
  outer: number,
  curl: number,
  samples: number,
): Array<{ x: number; y: number }> {
  const count = Math.max(2, Math.floor(samples));
  const r0 = Number.isFinite(outer) ? Math.max(0, outer) : 0;
  const c = Number.isFinite(curl) ? curl : 0;
  const a0 = Number.isFinite(angle) ? angle : 0;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    // 반경은 바깥(t=0)에서 중심(t=1)으로 줄고, 각도는 감기며 들어간다
    const r = r0 * (1 - t);
    const a = a0 + c * t * Math.PI;
    points.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return points;
}

/**
 * 갈래 하나의 꺾인 점열 (순수) — 원점에서 각도 방향으로 뻗으며 횡으로 흔들린다.
 *
 * `rand`를 주입받는 이유: 회귀에서 결정론적으로 검증해야 하고, 렌더러는 Math.random을
 * 넘긴다. 첫 점은 항상 원점, 마지막 점은 항상 `reach` 거리 — 그 사이만 흔들린다.
 */
export function boltPolyline(
  angle: number,
  reach: number,
  segments: number,
  jitter: number,
  rand: () => number,
): Array<{ x: number; y: number }> {
  const count = Math.max(2, Math.floor(segments));
  const safeReach = Number.isFinite(reach) ? Math.max(0, reach) : 0;
  const safeJitter = Number.isFinite(jitter) ? Math.max(0, jitter) : 0;
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  // 법선 — 이 방향으로만 흔든다 (진행 방향으로 흔들면 길이가 들쭉날쭉해진다)
  const px = -ny;
  const py = nx;
  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    const along = safeReach * t;
    // 양 끝은 고정 — 시작점이 흔들리면 여러 갈래가 원점에서 흩어져 보인다
    const edge = i === 0 || i === count ? 0 : (rand() * 2 - 1) * safeJitter;
    points.push({ x: nx * along + px * edge, y: ny * along + py * edge });
  }
  return points;
}
