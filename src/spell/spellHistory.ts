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

/**
 * 반복 패널티 규칙 (테스트로 고정).
 *
 * ⚠️ #92 결정 이후 = **당근(다양성 보너스, `spellDiversity`)이 주 신호, 이 스틱은 "최소 마찰"**.
 * 스틱이 당근(+30%)을 압도하지 않도록 완화했다(2026-07-22): 반복은 **살짝** 손해, 다양성이
 * 뚜렷한 이득. 목적은 "한 원소만 파도 플레이는 가능하되 불리"하게 두는 것(마스터 플레이 생존).
 */
export const REPEAT_PENALTY = {
  /** 같은 문장 재사용 1회마다 곱해지는 배수 (명백한 복붙). #92: 살짝만(−10%/회). */
  perReuse: 0.9,
  /**
   * 문장은 다르지만 **판정 결과가 같은 주문** 재사용 1회마다 곱해지는 배수.
   *
   * 문자열 일치만 보면 "파이어볼" → "파이어볼v2" → "파이어 볼"로 패널티를 공짜로 우회할 수
   * 있다(전부 fire/bolt/damage로 판정되는데도). LLM이 이미 분류해 준 스펙으로 재면 표기
   * 장난이 통하지 않는다. **복붙(perReuse)보다 약하게** — 표현을 바꾸면 덜 손해.
   */
  perSimilarReuse: 0.95,
  /** 배수 하한 (아무리 반복해도 이 밑으로는 안 내려감). #92: 최대 −40%로 완화(마스터 플레이 생존). */
  floor: 0.6,
} as const;

/** 문장 정규화 — 양끝 공백 제거 · 소문자화 · 내부 연속 공백 1칸. 반복 판정의 기준. */
export function normalizeSpellText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * 주문의 정체 서명 — `effect:원소:폼`.
 *
 * 이 셋이 같으면 문장이 달라도 게임 안에서는 **같은 마법**이다(같은 이펙트·같은 판정).
 * 보조 원소·크기·속도는 뺐다: 그걸 포함하면 "화염구에 뇌전 한 방울" 식으로 서명만
 * 흔들어 다시 우회할 수 있다.
 */
export function spellSignature(spell: Pick<SpellSpec, 'effect' | 'element_primary' | 'form'>): string {
  return `${spell.effect}:${spell.element_primary}:${spell.form}`;
}

export class SpellHistory {
  private entries: SpellHistoryEntry[] = [];

  /**
   * 검증된 cast 주문을 기록한다. R1이 **마나 지불 후 발동이 확정된 시점**에 호출한다.
   * 반복 패널티는 이 시점의 기존 기록 수 기준으로 계산해 `power`에 반영한다.
   */
  record(input: RecordSpellInput): SpellHistoryEntry {
    const normalized = normalizeSpellText(input.rawText);
    // push 전 = 이번 캐스팅의 배수. 스펙을 함께 넘겨 표기만 바꾼 재사용도 잡는다.
    const multiplier = this.repeatMultiplier(input.rawText, input.spell);
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
   * **문장은 다르지만** 판정 결과가 같은 주문이 기록된 횟수.
   * 같은 문장은 countOf가 이미 세므로 여기서 제외해 이중 계산을 막는다.
   */
  countOfSimilar(rawText: string, spell: Parameters<typeof spellSignature>[0]): number {
    const key = normalizeSpellText(rawText);
    const signature = spellSignature(spell);
    return this.entries.reduce(
      (n, e) => (e.normalized !== key && spellSignature(toSignatureInput(e)) === signature ? n + 1 : n),
      0,
    );
  }

  /**
   * 반복 패널티 배수. 처음이면 1.0.
   *
   * 두 축을 곱한다 — 같은 문장 재사용(0.8^n)과 표기만 바꾼 같은 주문 재사용(0.9^m).
   * `spell`을 넘기지 않으면 문장 축만 적용한다(구 호출부 호환).
   * 엔진(R1)이 이 값을 판정 power에 곱해 실제 효과 수치를 계산한다.
   */
  repeatMultiplier(rawText: string, spell?: Parameters<typeof spellSignature>[0]): number {
    const reuse = this.countOf(rawText); // 기존 기록 수 = 이번이 몇 번째 재사용인지
    const similarReuse = spell ? this.countOfSimilar(rawText, spell) : 0;
    if (reuse === 0 && similarReuse === 0) return 1;
    return Math.max(
      REPEAT_PENALTY.floor,
      REPEAT_PENALTY.perReuse ** reuse * REPEAT_PENALTY.perSimilarReuse ** similarReuse,
    );
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

/** 기록 항목을 서명 계산 입력 형태로 (필드명이 SpellSpec과 달라 변환이 필요하다) */
function toSignatureInput(entry: SpellHistoryEntry): Parameters<typeof spellSignature>[0] {
  return {
    effect: entry.effect,
    element_primary: entry.elementPrimary,
    form: entry.form,
  };
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
