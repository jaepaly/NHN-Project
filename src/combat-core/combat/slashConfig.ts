import type { SpellSize } from '../../spell/types';
import type { FormPoint } from './persistentFormConfig';

/**
 * 참격(slash) 기하 — #188.
 *
 * 왜 필요한가: "칼로 벤다"·"도끼를 휘두른다" 같은 표현이 담길 form이 없어
 * 실측 75%가 `bolt`(원거리 투사체)로 뭉갰다. 벤다고 말했는데 탄환이 나가면
 * "말이 곧 마법"이 깨진다.
 *
 * **왜 시전자 앞이 아니라 적 위치인가** (총괄 설계 결정):
 * 플레이어 앞만 베면 그건 검술이지 마법이 아니다. 이 게임의 주인공은 검사가 아니라
 * **말로 마법을 부리는 사람**이고, 근접 접근 강요는 카이팅 중심 전투 루프와도 어긋난다.
 * 그래서 참격은 **적이 있는 자리에 즉시 그어진다** — 거리를 무시하는 게 마법다움이다.
 *
 * bolt와의 구분(이 폼의 존재 이유):
 *   bolt  = 투사체가 **날아간다** (이동 시간·차폐 있음)
 *   slash = **즉발**로 적 자리에 호가 그어진다. 대신 사거리 상한이 있어 저격이 아니다.
 */
export const SLASH_CONFIG = {
  /** 참격이 닿는 최대 거리 — 즉발이라 무제한이면 저격이 된다. */
  maxRange: 380,
  /** 크기별 벤 자국의 반경(px) — 적을 가로지르는 호의 크기 */
  cutRadius: {
    small: 46,
    medium: 62,
    large: 84,
    huge: 116,
  } satisfies Record<SpellSize, number>,
  /** 위력이 실릴수록 더 크게 벤다 (nova가 반경에 power를 더하는 것과 같은 결) */
  radiusPerPower: 0.35,
  /** 초승달 호가 덮는 각도(도) */
  arcDegrees: 120,
  /** 호를 그릴 선분 수 */
  segments: 14,
  /** 스윕 연출 시간(ms) */
  sweepMs: 190,
  /** 잔상 호가 본 칼날보다 늦게 따라오는 간격(ms) — 휘두른 무게를 만든다 */
  echoDelayMs: 55,
  /** 베는 섬광이 벌어졌다 닫히는 시간(ms) */
  flashMs: 160,
  /** 초승달 최대 두께 비율(반경 대비) — 가운데가 가장 두껍다 */
  bladeThickness: 0.42,
  /** 두께가 얇아지는 기울기. 클수록 끝이 급격히 뾰족해진다 */
  taperExponent: 1.7,
  /** 두께 정점의 위치(-1=시작쪽, 0=중앙, 1=끝쪽) — 살짝 치우쳐야 기계적으로 안 보인다 */
  bulgeBias: -0.18,
  /**
   * 연참 임계 — 위력이 오르면 칼날이 **여러 번 교차**한다.
   * MockJudge 실측: "벤다" 27 · "검으로 적을 벤다" 40 · 공들인 영창 78~84.
   * 그래서 50/80이면 "말을 더 벼릴수록 더 많이 베인다"가 눈에 보인다.
   */
  multiCutThresholds: [50, 80],
  /** 추가 참격이 축에서 벌어지는 각도(도) — 호가 120°라 이보다 크면 서로 안 겹쳐 교차로 안 읽힌다 */
  multiCutSpreadDeg: 34,
  /** 참격 사이 간격(ms) — 붙으면 한 덩어리, 뜨면 따로 논다 */
  multiCutDelayMs: 78,
  /** 절단흔이 남아 스러지는 시간(ms) — 벤 자리가 잠깐 남아야 '베였다'가 읽힌다 */
  scarMs: 420,
  /**
   * 수렴선 시간(ms) — 마력이 벤 자리로 **빨려들며** 그어진다.
   * 칼날과 동시에 간다. 앞에 예비동작을 두면 판정 지연(이미 ~2초) 위에 더 얹혀
   * 손맛이 죽는다 — 대신 "멀리서 발현했다"의 근거를 동시 진행으로 만든다.
   */
  convergeMs: 95,
} as const;

function safeScale(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 1;
}

function safePower(power: number | undefined): number {
  return Number.isFinite(power) ? Math.max(0, Math.min(100, power as number)) : 0;
}

/** 벤 자국의 반경 — 크기 + 위력 (강한 참격일수록 크게 벤다) */
export function slashCutRadius(
  size: SpellSize,
  power?: number,
  radiusScale?: number,
): number {
  const base = SLASH_CONFIG.cutRadius[size]
    + safePower(power) * SLASH_CONFIG.radiusPerPower;
  return base * safeScale(radiusScale);
}

/**
 * 참격이 발현할 지점 — **적이 있는 자리**. 사거리를 넘으면 그 방향 최대 거리에서 끊는다.
 * 표적이 없으면 시전자 앞(기본 오른쪽)에 벤다.
 */
export function slashAnchor(
  from: FormPoint,
  toward: FormPoint | null,
  rangeScale?: number,
): FormPoint {
  const max = SLASH_CONFIG.maxRange * safeScale(rangeScale);
  if (!toward) return { x: from.x + max * 0.35, y: from.y };
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: from.x + max * 0.35, y: from.y };
  if (distance <= max) return { x: toward.x, y: toward.y };
  return { x: from.x + (dx / distance) * max, y: from.y + (dy / distance) * max };
}

/**
 * 벤 자국 — 발현 지점을 **가로지르는** 초승달 호.
 * 호의 볼록한 쪽이 시전자 반대(적 너머)를 향해, "적을 훑고 지나간" 궤적으로 읽힌다.
 */
export function slashCutPoints(
  from: FormPoint,
  anchor: FormPoint,
  size: SpellSize,
  power?: number,
  radiusScale?: number,
): FormPoint[] {
  const dx = anchor.x - from.x;
  const dy = anchor.y - from.y;
  // 시전자 → 발현점 축. 겹치면 기본 오른쪽 축을 쓴다.
  const axis = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const radius = slashCutRadius(size, power, radiusScale);
  const half = (SLASH_CONFIG.arcDegrees * Math.PI) / 180 / 2;
  const steps = SLASH_CONFIG.segments;
  // 호의 중심을 시전자 쪽으로 물려, 볼록한 면이 적 너머를 향하게 한다.
  const centerX = anchor.x - Math.cos(axis) * radius * 0.35;
  const centerY = anchor.y - Math.sin(axis) * radius * 0.35;
  const points: FormPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = axis - half + (half * 2 * i) / steps;
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  }
  return points;
}

/**
 * 벤 자국의 **채워진 초승달** 윤곽 — 가운데가 두껍고 양 끝이 바늘처럼 뾰족하다.
 *
 * 폭이 일정한 호를 그으면 '기하 도형'으로 보인다(총괄 지적: "너무 가지런한 호").
 * 실제 참격은 휘두른 속도에 따라 두께가 변하고 끝이 사라지듯 얇아진다.
 * 바깥 호 → 안쪽 호(역순)로 닫아 하나의 채울 수 있는 다각형을 만든다.
 */
export function slashCrescentPolygon(
  from: FormPoint,
  anchor: FormPoint,
  size: SpellSize,
  power?: number,
  radiusScale?: number,
): FormPoint[] {
  const dx = anchor.x - from.x;
  const dy = anchor.y - from.y;
  const axis = dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
  const radius = slashCutRadius(size, power, radiusScale);
  const half = (SLASH_CONFIG.arcDegrees * Math.PI) / 180 / 2;
  const steps = SLASH_CONFIG.segments;
  const centerX = anchor.x - Math.cos(axis) * radius * 0.35;
  const centerY = anchor.y - Math.sin(axis) * radius * 0.35;
  const maxThickness = radius * SLASH_CONFIG.bladeThickness;

  // u: -1(시작) ~ +1(끝). 두께는 정점에서 최대, 양 끝에서 0 → 뾰족한 팁.
  const bias = Math.max(-0.9, Math.min(0.9, SLASH_CONFIG.bulgeBias));
  const thicknessAt = (u: number): number => {
    // 정점(bias)을 기준으로 **양쪽을 각각** 정규화한다. 한 식으로 밀면 치우친 쪽 끝이
    // 0에 닿지 않아 팁이 뭉툭해진다(실제로 그렇게 만들었다가 회귀로 잡혔다).
    const v = u <= bias ? (u - bias) / (1 + bias) : (u - bias) / (1 - bias);
    const t = 1 - Math.abs(Math.max(-1, Math.min(1, v))) ** SLASH_CONFIG.taperExponent;
    return Math.max(0, t) * maxThickness;
  };

  const outer: FormPoint[] = [];
  const inner: FormPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const u = (i / steps) * 2 - 1;
    const angle = axis + u * half;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    outer.push({ x: centerX + cos * radius, y: centerY + sin * radius });
    const innerRadius = radius - thicknessAt(u);
    inner.push({ x: centerX + cos * innerRadius, y: centerY + sin * innerRadius });
  }
  return [...outer, ...inner.reverse()];
}

/**
 * 연참 횟수 — 위력이 임계를 넘을 때마다 한 번 더 벤다 (1~3).
 *
 * 왜 위력에 묶는가: 이 게임의 보상은 "말을 잘 벼리면 강해진다"인데, 지금 위력이
 * 화면에 드러나는 건 크기와 셰이크뿐이라 차이가 잘 안 읽혔다. 벤 횟수는 세어지는
 * 값이라 한눈에 다르다 — 공들인 영창이 눈에 보이게 갚아진다.
 *
 * ⚠️ 순수 연출이다. 판정 원은 여전히 하나이고 피해량도 그대로 — 화면만 화려해진다.
 */
export function slashCutCount(power?: number): number {
  const p = safePower(power);
  let count = 1;
  for (const threshold of SLASH_CONFIG.multiCutThresholds) {
    if (p >= threshold) count += 1;
  }
  return count;
}

/**
 * 연참 각도 — 접근 축 기준 좌우 대칭 오프셋(도).
 * 1회는 [0], 2회는 벌어져 교차, 3회는 가운데 한 줄이 더해진다.
 */
export function slashCutAngles(power?: number): number[] {
  const count = slashCutCount(power);
  const spread = SLASH_CONFIG.multiCutSpreadDeg;
  if (count <= 1) return [0];
  if (count === 2) return [-spread / 2, spread / 2];
  return [-spread, 0, spread];
}

/** 점들을 중심 기준으로 회전 — 연참이 서로 다른 각도로 그어지게 한다 */
export function rotatePointsAbout(
  points: FormPoint[],
  center: FormPoint,
  degrees: number,
): FormPoint[] {
  if (degrees === 0) return points.map((p) => ({ x: p.x, y: p.y }));
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map((p) => {
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return {
      x: center.x + dx * cos - dy * sin,
      y: center.y + dx * sin + dy * cos,
    };
  });
}

/**
 * 타격 판정 — 발현 지점 중심의 원.
 * 시각(호)과 판정(원)이 **같은 지점에 정렬**된다. 이전 설계는 호를 96px에 그리고
 * 판정은 58px 원으로 잡아 "보이는 곳과 맞는 곳"이 어긋났다.
 */
export function slashHitCircle(
  from: FormPoint,
  toward: FormPoint | null,
  size: SpellSize,
  power?: number,
  rangeScale?: number,
  radiusScale?: number,
): { x: number; y: number; radius: number } {
  const anchor = slashAnchor(from, toward, rangeScale);
  return {
    x: anchor.x,
    y: anchor.y,
    radius: slashCutRadius(size, power, radiusScale),
  };
}
