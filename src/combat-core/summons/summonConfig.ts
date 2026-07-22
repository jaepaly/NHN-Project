import type { SpellElement } from '../../spell/types';

export const SUMMON_CONFIG = {
  minimumDurationSeconds: 5,
  maximumDurationSeconds: 10,
  baseDurationSeconds: 4,
  durationSecondsPerPower: 0.06,
  damagePowerMultiplier: 0.3,
  attackIntervalSeconds: 1.2,
  attackRange: 400,
  projectileSpeed: 500,
  projectileHitDistance: 16,
  orbitRadius: 48,
  orbitAngularSpeed: 1.8,
} as const;

export interface SummonStats {
  durationSeconds: number;
  damage: number;
}

/**
 * 소환 종류 (에픽 #97 ②) — "분신 소환" 같은 표현을 실제 변형으로.
 * 유저 주문명·원소로 가른다(자기 강화와 동일 패턴).
 */
export type SummonKind = 'orb' | 'clone' | 'swarm' | 'turret';

export interface SummonGroupPlan {
  kind: SummonKind;
  /** 소환체 수 */
  count: number;
  /** true면 시전 위치에 고정(포탑), false면 플레이어를 따라 궤도(분신·군체·오브) */
  stationary: boolean;
  orbitRadius: number;
  /** 공격 간격 배율 (분신은 빠르게) */
  attackIntervalScale: number;
  /** 한 기당 피해 배율 (군체는 분할) */
  damageScale: number;
  label: string;
}

const SUMMON_PLANS: Record<SummonKind, Omit<SummonGroupPlan, 'kind'>> = {
  clone: { count: 1, stationary: false, orbitRadius: 40, attackIntervalScale: 0.6, damageScale: 1, label: '분신' },
  swarm: { count: 3, stationary: false, orbitRadius: 56, attackIntervalScale: 1, damageScale: 0.5, label: '군체' },
  turret: { count: 1, stationary: true, orbitRadius: 0, attackIntervalScale: 1, damageScale: 1.3, label: '포탑' },
  orb: { count: 1, stationary: false, orbitRadius: SUMMON_CONFIG.orbitRadius, attackIntervalScale: 1, damageScale: 1, label: '소환' },
};

const CLONE_RE = /분신|도플|복제|clone|mirror|double|copy/i;
const TURRET_RE = /포탑|포대|터렛|터릿|망루|초소|turret|tower|sentry|cannon/i;
const SWARM_RE = /군체|무리|떼|군단|군세|벌떼|swarm|horde|army|legion|flock/i;

/** 주문명·원소 → 소환 종류. 주문명 키워드 우선, 없으면 원소(암영=군체) 기본. */
export function resolveSummonKind(element: SpellElement, name: string): SummonKind {
  const n = name ?? '';
  if (CLONE_RE.test(n)) return 'clone';
  if (TURRET_RE.test(n)) return 'turret';
  if (SWARM_RE.test(n)) return 'swarm';
  if (element === 'dark') return 'swarm';
  return 'orb';
}

export function summonGroupPlan(element: SpellElement, name: string): SummonGroupPlan {
  const kind = resolveSummonKind(element, name);
  return { kind, ...SUMMON_PLANS[kind] };
}

/** Phase 2 임시 공식: 최종 power를 소환 지속시간과 자동 공격 피해로 변환한다. */
export function summonStatsFromPower(power: number): SummonStats {
  const safePower = Number.isFinite(power) ? Math.max(0, power) : 0;
  const durationSeconds = Math.min(
    SUMMON_CONFIG.maximumDurationSeconds,
    Math.max(
      SUMMON_CONFIG.minimumDurationSeconds,
      SUMMON_CONFIG.baseDurationSeconds
        + safePower * SUMMON_CONFIG.durationSecondsPerPower,
    ),
  );
  return {
    durationSeconds,
    damage: Math.max(1, Math.round(safePower * SUMMON_CONFIG.damagePowerMultiplier)),
  };
}
