import type { SpellSize } from '../../spell/types';
import type { FormPoint } from './persistentFormConfig';

/**
 * 근접 참격(slash) 기하 — #188.
 *
 * 왜 필요한가: "칼로 벤다"·"도끼를 휘두른다" 같은 근접 표현이 담길 form이 없어
 * 실측 75%가 `bolt`(원거리 투사체)로 뭉갰다. 플레이어가 벤다고 말했는데 탄환이 나가면
 * "말이 곧 마법"이 깨진다.
 *
 * 범위 고정(총괄 결정, #188): **플레이어 앞 부채꼴 호 스윕 1회**.
 * VFX 폴리싱·히트박스 밸런스 튜닝은 이 항목에 포함하지 않는다(부푸는 경로).
 *
 * 타격 판정은 기존 `circle` impact를 그대로 쓴다 — 새 impact 종류를 만들면
 * onDamageHit·onControlHit 등 모든 소비처를 건드려야 해서 훨씬 큰 변경이 된다.
 * 부채꼴을 **전방 원**으로 근사하면 기존 판정 경로가 전부 공짜로 따라온다.
 */
export const SLASH_CONFIG = {
  /** 크기별 사거리(px) — 근접이므로 짧다. bolt·beam과 확실히 구분되는 스케일. */
  reach: {
    small: 70,
    medium: 96,
    large: 128,
    huge: 168,
  } satisfies Record<SpellSize, number>,
  /** 부채꼴 각도(도) — 한 번의 휘두름이 덮는 폭 */
  arcDegrees: 100,
  /** 호를 그릴 선분 수 (시각용) */
  segments: 14,
  /** 스윕 연출 시간(ms) */
  sweepMs: 190,
  /** 타격 원 중심을 사거리의 몇 배 앞에 둘지 */
  hitCenterRatio: 0.6,
  /** 타격 원 반지름을 사거리의 몇 배로 할지 */
  hitRadiusRatio: 0.55,
} as const;

function aimAngle(from: FormPoint, toward: FormPoint | null): number {
  if (!toward) return 0; // 표적이 없으면 오른쪽(회전 0 기준)
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.atan2(dy, dx);
}

function safeScale(value: number | undefined): number {
  return Number.isFinite(value) && (value as number) > 0 ? (value as number) : 1;
}

/** 크기·배율을 반영한 실제 사거리 */
export function slashReach(size: SpellSize, rangeScale?: number): number {
  return SLASH_CONFIG.reach[size] * safeScale(rangeScale);
}

/**
 * 휘두름 궤적 — 표적 방향을 중심으로 한 부채꼴 호 위의 점들(시각용).
 * 첫 점이 스윙 시작, 마지막 점이 끝. 모두 `from`에서 사거리만큼 떨어져 있다.
 */
export function slashArcPoints(
  from: FormPoint,
  toward: FormPoint | null,
  size: SpellSize,
  rangeScale?: number,
): FormPoint[] {
  const center = aimAngle(from, toward);
  const half = (SLASH_CONFIG.arcDegrees * Math.PI) / 180 / 2;
  const radius = slashReach(size, rangeScale);
  const steps = SLASH_CONFIG.segments;
  const points: FormPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const angle = center - half + (half * 2 * i) / steps;
    points.push({
      x: from.x + Math.cos(angle) * radius,
      y: from.y + Math.sin(angle) * radius,
    });
  }
  return points;
}

/**
 * 타격 판정용 전방 원 — 부채꼴 근사.
 * 플레이어 자신은 원 밖에 있어야 한다(등 뒤가 맞으면 근접의 방향성이 무의미해진다).
 */
export function slashHitCircle(
  from: FormPoint,
  toward: FormPoint | null,
  size: SpellSize,
  rangeScale?: number,
): { x: number; y: number; radius: number } {
  const angle = aimAngle(from, toward);
  const reach = slashReach(size, rangeScale);
  const distance = reach * SLASH_CONFIG.hitCenterRatio;
  return {
    x: from.x + Math.cos(angle) * distance,
    y: from.y + Math.sin(angle) * distance,
    radius: reach * SLASH_CONFIG.hitRadiusRatio,
  };
}
