/**
 * 소환수 행동 DSL (L3, #101) — LLM이 소환수의 행동 **프로그램**을 설계한다.
 *
 * "분신을 만들어서 지그재그로 돌진시켜라" 같은 자유 행동 묘사를, 판정(LLM/Mock)이
 * **스텝 시퀀스**로 출력하고 엔진(SummonBehaviorRunner)이 해석·실행한다.
 *
 * 안전 원칙: 열거된 이동 원시요소 + 클램프된 수치만 통과한다. LLM이 뭘 뱉어도
 * 검증기(validateSummonBehavior)를 지난 것만 실행되고, 실패 시 null → 기본 행동 폴백.
 * 이 파일이 스키마·한계의 **단일 소스**다 — 프록시 프롬프트(R2)는 여기 어휘를 따른다.
 */

export const SUMMON_MOVE_KINDS = [
  'orbit',   // 플레이어 주위 선회
  'chase',   // 표적 추적
  'dash',    // 표적으로 돌진 (고속 직진)
  'zigzag',  // 표적 방향으로 갈지자 접근
  'hold',    // 제자리 대기
  'retreat', // 표적 반대로 후퇴
] as const;
export type SummonMoveKind = (typeof SUMMON_MOVE_KINDS)[number];

export interface SummonMoveStep {
  kind: SummonMoveKind;
  /** 이 스텝의 지속 시간(초). 클램프: (0, maxStepSeconds] */
  seconds: number;
  /** 이동 속도(px/s). orbit는 원주 속도, hold는 무시. */
  speed?: number;
  /** orbit 전용 반경 */
  radius?: number;
  /** zigzag 전용 진폭 */
  amplitude?: number;
}

export interface SummonBehavior {
  steps: SummonMoveStep[];
  /** true면 시퀀스 반복, false면 마지막 스텝 유지 */
  loop: boolean;
}

export const BEHAVIOR_LIMITS = {
  maxSteps: 6,
  maxStepSeconds: 6,
  maxSpeed: 460,
  maxRadius: 150,
  maxAmplitude: 100,
  defaultSpeed: 240,
  defaultRadius: 56,
  defaultAmplitude: 46,
  defaultSeconds: 2,
} as const;

function clampNumber(value: unknown, fallback: number, max: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(1, Math.min(max, n));
}

/**
 * LLM/Mock 출력 → 안전한 행동 프로그램. 형식이 어긋나면 null(기본 행동 폴백).
 * 스텝별로 kind 화이트리스트 + 수치 클램프. 유효 스텝이 하나도 없으면 null.
 */
export function validateSummonBehavior(value: unknown): SummonBehavior | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.steps)) return null;

  const steps: SummonMoveStep[] = [];
  for (const raw of v.steps.slice(0, BEHAVIOR_LIMITS.maxSteps)) {
    if (typeof raw !== 'object' || raw === null) continue;
    const s = raw as Record<string, unknown>;
    if (!(SUMMON_MOVE_KINDS as readonly string[]).includes(s.kind as string)) continue;
    steps.push({
      kind: s.kind as SummonMoveKind,
      seconds: clampNumber(s.seconds, BEHAVIOR_LIMITS.defaultSeconds, BEHAVIOR_LIMITS.maxStepSeconds),
      speed: clampNumber(s.speed, BEHAVIOR_LIMITS.defaultSpeed, BEHAVIOR_LIMITS.maxSpeed),
      radius: clampNumber(s.radius, BEHAVIOR_LIMITS.defaultRadius, BEHAVIOR_LIMITS.maxRadius),
      amplitude: clampNumber(s.amplitude, BEHAVIOR_LIMITS.defaultAmplitude, BEHAVIOR_LIMITS.maxAmplitude),
    });
  }
  if (steps.length === 0) return null;
  return { steps, loop: v.loop !== false };
}
