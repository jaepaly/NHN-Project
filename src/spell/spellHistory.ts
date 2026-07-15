import type {
  SpellSpec,
  SpellElement,
  SpellForm,
  SpellEffect,
  SpellTarget,
} from './types';

/**
 * 런 단위 주문 히스토리 — Phase 2 R2.
 * 검증된 cast 주문만 기록하고, 반복 패널티·보스 기억 요약을 계산한다.
 *
 * 설계 원칙:
 * - 메모리(런 단위) 저장. 파일/네트워크 없음. (런 간 장기기억은 Phase 3에서 localStorage로 확장)
 * - 시각(`castAt`)은 호출측이 주입 → 모듈은 시간을 읽지 않아 단위 테스트가 결정론적.
 * - 반복 패널티는 여기(로컬 코드)에서 계산하고 엔진(R1)이 power에 곱해 적용한다. (프롬프트 아님)
 * - fizzle/blocked는 애초에 기록 대상이 아니다(호출측이 cast만 record 호출).
 */

/** 판정 출처 — GeminiJudge.lastSource(gemini/cache/fallback/local)와 정렬. direct MockJudge용 'mock' 포함. */
export type JudgeSource = 'gemini' | 'cache' | 'fallback' | 'local' | 'mock';

/** 히스토리 한 건 (검증된 cast 주문) */
export interface SpellHistoryEntry {
  /** 정규화 전 원문 입력 */
  rawText: string;
  /** 반복 판정용 정규화 키 */
  normalized: string;
  name: string;
  effect: SpellEffect;
  target: SpellTarget;
  elementPrimary: SpellElement;
  elementSecondary: SpellElement | null;
  form: SpellForm;
  /** 판정 원 power (패널티 적용 전) */
  basePower: number;
  /** 반복 패널티 반영 후 실제 적용 power */
  power: number;
  cost: number;
  source: JudgeSource;
  /** 발동 시각 (ms epoch) — 호출측 주입 */
  castAt: number;
}

/** R1이 record 호출 시 넘기는 입력 */
export interface RecordSpellInput {
  /** 플레이어 원문 입력 */
  rawText: string;
  /** 검증(validateSpec 통과)된 cast 주문 */
  spell: SpellSpec;
  /** 판정 소스 */
  source: JudgeSource;
  /** 발동 확정 시각 (호출측에서 Date.now() 주입) */
  castAt: number;
}

/** 보스 기억 요약 (Phase 3 계약용 초안 — 실제 보스 로직은 여기서 구현하지 않음) */
export interface BossMemoryProfile {
  dominantElement: SpellElement | null;
  dominantForm: SpellForm | null;
  recentSpellNames: string[];
  totalCasts: number;
}

/** 반복 패널티 규칙 (테스트로 고정) */
export const REPEAT_PENALTY = {
  /** 재사용 1회마다 곱해지는 배수 */
  perReuse: 0.8,
  /** 배수 하한 (아무리 반복해도 이 밑으로는 안 내려감) */
  floor: 0.3,
} as const;

/** 문장 정규화 — 양끝 공백 제거 · 소문자화 · 내부 연속 공백 1칸. 반복 판정의 기준. */
export function normalizeSpellText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export class SpellHistory {
  private entries: SpellHistoryEntry[] = [];

  /**
   * 검증된 cast 주문을 기록한다. R1이 **마나 지불 후 발동이 확정된 시점**에 호출한다.
   * 반복 패널티는 이 시점의 기존 기록 수 기준으로 계산해 `power`에 반영한다.
   */
  record(input: RecordSpellInput): SpellHistoryEntry {
    const normalized = normalizeSpellText(input.rawText);
    const multiplier = this.repeatMultiplier(input.rawText); // push 전 = 이번 캐스팅의 배수
    const basePower = input.spell.power;
    const entry: SpellHistoryEntry = {
      rawText: input.rawText,
      normalized,
      name: input.spell.name,
      effect: input.spell.effect,
      target: input.spell.target,
      elementPrimary: input.spell.element_primary,
      elementSecondary: input.spell.element_secondary,
      form: input.spell.form,
      basePower,
      power: Math.round(basePower * multiplier),
      cost: input.spell.cost,
      source: input.source,
      castAt: input.castAt,
    };
    this.entries.push(entry);
    return entry;
  }

  /** 이 문장이 지금까지 기록된 횟수 (정규화 기준) */
  countOf(rawText: string): number {
    const key = normalizeSpellText(rawText);
    return this.entries.reduce((n, e) => (e.normalized === key ? n + 1 : n), 0);
  }

  /**
   * 반복 패널티 배수. 처음(기록 없음)이면 1.0, 재사용부터 `perReuse^재사용횟수` (floor 하한).
   * 엔진(R1)이 이 값을 판정 power에 곱해 실제 효과 수치를 계산한다.
   */
  repeatMultiplier(rawText: string): number {
    const reuse = this.countOf(rawText); // 기존 기록 수 = 이번이 몇 번째 재사용인지
    if (reuse === 0) return 1;
    return Math.max(REPEAT_PENALTY.floor, REPEAT_PENALTY.perReuse ** reuse);
  }

  /** 최근 n건 (최신이 뒤). R3 표시·요약용. */
  recent(n = 5): readonly SpellHistoryEntry[] {
    return this.entries.slice(-Math.max(0, n));
  }

  /** 전체 기록 (읽기 전용) */
  get all(): readonly SpellHistoryEntry[] {
    return this.entries;
  }

  /** 기록 건수 */
  get size(): number {
    return this.entries.length;
  }

  /** 보스 기억 요약 초안 (Phase 3 계약용). 최다 원소·폼과 최근 주문명. */
  bossMemory(recentCount = 5): BossMemoryProfile {
    return {
      dominantElement: mode(this.entries.map((e) => e.elementPrimary)),
      dominantForm: mode(this.entries.map((e) => e.form)),
      recentSpellNames: this.recent(recentCount).map((e) => e.name),
      totalCasts: this.entries.length,
    };
  }

  /** 새 런 시작 시 초기화 */
  reset(): void {
    this.entries = [];
  }
}

/** 최빈값 (동률이면 먼저 최다에 도달한 값). 비어 있으면 null. */
function mode<T>(items: T[]): T | null {
  const counts = new Map<T, number>();
  let best: T | null = null;
  let bestCount = 0;
  for (const item of items) {
    const c = (counts.get(item) ?? 0) + 1;
    counts.set(item, c);
    if (c > bestCount) {
      best = item;
      bestCount = c;
    }
  }
  return best;
}
