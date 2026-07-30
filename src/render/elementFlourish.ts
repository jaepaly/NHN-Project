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
export type FlourishElement = 'lightning' | 'ice';

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
} as const;

export function hasElementFlourish(element: SpellElement): element is FlourishElement {
  return element === 'lightning' || element === 'ice';
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
