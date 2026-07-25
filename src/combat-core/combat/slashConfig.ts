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
