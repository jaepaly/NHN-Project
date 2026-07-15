/**
 * 주문 판정 스키마 — GDD §3.2
 * LLM(또는 MockJudge)의 출력은 반드시 이 스키마를 통과해야 렌더러에 도달한다.
 */

export const ELEMENTS = [
  'fire', 'water', 'lightning', 'ice', 'earth', 'wind', 'light', 'dark',
] as const;
export type SpellElement = (typeof ELEMENTS)[number];

export const FORMS = [
  'bolt',   // 단일 투사체
  'beam',   // 직선 광선
  'wave',   // 전진하는 파도
  'nova',   // 자기 중심 방사
  'rain',   // 상공 낙하
  'wall',   // 지형 벽
  'cage',   // 대상 구속
  'orbit',  // 주위 회전체
  'summon', // 소환수
  'buff',   // 자기 강화
  'zone',   // 장판
  'chain',  // 연쇄 도약
] as const;
export type SpellForm = (typeof FORMS)[number];

export const SIZES = ['small', 'medium', 'large', 'huge'] as const;
export type SpellSize = (typeof SIZES)[number];

export const SPEEDS = ['slow', 'normal', 'fast'] as const;
export type SpellSpeed = (typeof SPEEDS)[number];

export const STATUSES = ['burn', 'freeze', 'shock', 'slow', 'knockback', 'weaken'] as const;
export type SpellStatus = (typeof STATUSES)[number];

export const EFFECTS = ['damage', 'heal', 'shield', 'buff', 'control', 'summon'] as const;
export type SpellEffect = (typeof EFFECTS)[number];

export const TARGETS = ['enemy', 'self', 'area'] as const;
export type SpellTarget = (typeof TARGETS)[number];

export interface SpellSpec {
  /** LLM이 지은 주문명 — 화면에 각인된다 */
  name: string;
  /** 게임 엔진이 적용할 효과 의도. 실제 수치는 power에서 결정론적으로 계산한다. */
  effect: SpellEffect;
  target: SpellTarget;
  element_primary: SpellElement;
  element_secondary: SpellElement | null;
  form: SpellForm;
  size: SpellSize;
  speed: SpellSpeed;
  status: SpellStatus[];
  /** 0~100. 창의성·구체성 판정 점수 (스테이지 캡으로 클램프됨) */
  power: number;
  /** 마나 비용 */
  cost: number;
  /** 짧은 플레이버 텍스트 (옵션) */
  flavor?: string;
}

export type SpellRejectionReason = 'nonsense' | 'unsafe';

/** 자유 텍스트 판정의 v2 구별 유니온. cast만 전투 자원을 소비한다. */
export type SpellJudgement =
  | {
      schema_version: 2;
      disposition: 'cast';
      spell: SpellSpec;
    }
  | {
      schema_version: 2;
      disposition: 'fizzle' | 'blocked';
      reason: SpellRejectionReason;
      message: string;
    };

/** 판정 실패·타임아웃 시의 폴백 주문 */
export const FALLBACK_SPELL: SpellSpec = {
  name: '불발',
  effect: 'damage',
  target: 'enemy',
  element_primary: 'wind',
  element_secondary: null,
  form: 'bolt',
  size: 'small',
  speed: 'normal',
  status: [],
  power: 5,
  cost: 5,
  flavor: '마력이 흩어졌다…',
};

export const FIZZLE_JUDGEMENT: SpellJudgement = {
  schema_version: 2,
  disposition: 'fizzle',
  reason: 'nonsense',
  message: '마력이 형태를 이루지 못했다',
};
