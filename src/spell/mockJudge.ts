import type { SpellJudge } from './judge';
import type {
  SpellEffect,
  SpellElement,
  SpellForm,
  SpellJudgement,
  SpellSize,
  SpellSpeed,
  SpellSpec,
  SpellStatus,
  SpellTarget,
} from './types';
import { validateSpec } from './validate';
import { FIZZLE_JUDGEMENT } from './types';
import type { SpellPlan } from './sequencePlan';
import { validateSpellPlan } from './spellPlanValidate';

/**
 * 명시적 순차 접속사 — 이게 있을 때만 절을 나눠 시퀀스로 본다.
 * Mock은 폴백이라 Gemini만큼 섬세할 필요 없다: "여러 단계"라는 신호가 뚜렷할 때만 분해해
 * 기존 단일 판정(회귀 코퍼스엔 이 마커가 없다)을 건드리지 않는다.
 */
const SEQUENCE_MARKERS = [
  '그리고 나서', '그런 다음', '그러고 나서', '그다음', '그 다음', '이어서',
  '하고 나서', '한 뒤', '한 후', '고 나서', ' 뒤 ', ' 후 ', ' then ', 'after that',
];

/** 순차 마커로 원문을 절로 나눈다. 마커가 없으면 단일 절. */
function splitSequenceClauses(text: string): string[] {
  const DELIM = " §SEQ§ ";
  let marked = ` ${text} `;
  for (const marker of SEQUENCE_MARKERS) {
    marked = marked.split(marker).join(DELIM);
  }
  return marked.split(DELIM).map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * MockJudge — 키워드 기반 결정론적 판정기.
 * 역할: ① 로컬 개발 시 API 키 없이 즉시 동작 ② LLM 타임아웃·장애 시 폴백 (GDD §3.5)
 * LLM만큼 똑똑하지 않아도 된다. "게임이 절대 멈추지 않는다"가 존재 이유.
 */

// 한글 외래어 표기(콩글리시)는 실제 플레이에서 가장 흔한 입력이다 — "파이어볼", "아쿠아 펀치".
// 이게 빠지면 전부 기본 원소로 떨어져 판정이 무너지므로 영문 원어와 함께 반드시 싣는다.
// (라이브 Gemini는 프롬프트로 외래어를 이해하지만, Mock은 폴백 경로라 자체 사전이 필요)
const ELEMENT_KEYWORDS: Record<SpellElement, string[]> = {
  fire: [
    '불', '화염', '겁화', '태양', '용암', '폭염', '작열',
    // 활용형·의태어 — "활활 태우는"처럼 어간이 '불'과 다른 표현
    '활활', '화르르', '이글거리', '타올라',
    '파이어', '플레임', '블레이즈', '인페르노', '버닝', '이그니스',
    'fire', 'flame', 'burn', 'blaze', 'inferno',
  ],
  water: [
    // '심연'은 물보다 어둠의 은유로 더 자주 쓰여 dark로 옮겼다 (라이브 Gemini도 dark 계열로 판정)
    '물', '해일', '파도', '급류', '바다', '해류', '범람',
    '아쿠아', '워터', '하이드로', '스플래시', '타이달', '웨이브',
    'water', 'wave', 'tide', 'aqua', 'hydro', 'splash',
  ],
  lightning: [
    '번개', '뇌전', '낙뢰', '전격', '천둥', '라이트닝',
    '벼락', '감전', '전류', '방전',
    '썬더', '선더', '볼트', '일렉트릭', '스파크', '플라즈마',
    'lightning', 'thunder', 'volt', 'electric', 'spark', 'plasma',
  ],
  ice: [
    '얼음', '빙결', '서리', '눈보라', '한파', '동결',
    // "얼어붙은/얼려버리는"은 '얼음'과 어간이 달라 별도로 실어야 한다
    '얼어', '얼려', '얼리', '한기', '냉기', '결빙',
    '아이스', '프로스트', '프리즈', '블리자드', '스노우', '글레이셜',
    'ice', 'frost', 'freeze', 'blizzard', 'snow', 'glacial',
  ],
  earth: [
    // '락'(rock)은 "벼락"에 걸려 번개를 대지로 오판시켰다 — 영문 'rock'만 남긴다
    '대지', '바위', '돌', '지진', '암석', '가시', '숲', '나무', '자연',
    '어스', '스톤', '그라운드', '네이처', '포레스트', '퀘이크',
    'earth', 'rock', 'stone', 'forest', 'nature', 'quake', 'ground',
  ],
  wind: [
    '바람', '돌풍', '질풍', '회오리', '폭풍',
    '윈드', '게일', '토네이도', '사이클론', '에어', '스톰',
    'wind', 'gale', 'storm', 'tornado', 'cyclone', 'air',
  ],
  light: [
    '빛', '섬광', '성광', '축복', '신성', '광휘',
    '라이트', '홀리', '샤인', '루멘', '레이디언트', '글로우',
    'light', 'holy', 'radiant', 'shine', 'lumen', 'glow',
  ],
  dark: [
    '어둠', '암흑', '그림자', '저주', '심야', '흑염',
    // 활용형·은유 — "어두운"은 '어둠'과 어간이 다르고, '심연'은 water에서 옮겨왔다
    '어두', '그늘', '심연', '집어삼', '잠식',
    '다크', '섀도우', '섀도', '커스', '보이드', '나이트메어',
    'dark', 'shadow', 'curse', 'void', 'nightmare',
  ],
};

const UNSAFE_PATTERNS = [
  /씨+발/i, /시+발/i, /병신/i, /개새끼/i, /좆/i, /fuck/i, /bitch/i,
];
const KNOWN_NONSENSE = new Set(['ㅁㄴㅇㄹ', 'asdf', 'qwer', 'zxcv', 'ㅋㅋㅋ', 'ㅎㅎㅎ']);
const HEAL_KEYWORDS = [
  '배고프', '허기', '먹고 싶', '회복', '치유', '낫게', '살려', '지쳤', '피곤',
  '힐링', '리커버', '큐어', '리제네',
  'hungry', 'hunger', 'heal', 'cure', 'recover', 'tired', 'regen',
];
const SHIELD_KEYWORDS = [
  '보호', '지켜', '방패', '장벽', '갑옷',
  '실드', '가드', '배리어', '프로텍트', '아머',
  'shield', 'protect', 'guard', 'barrier', 'armor',
];
const BUFF_KEYWORDS = [
  '강화', '힘을', '빠르게', '용기', '가호', '축복',
  // '오라'는 "다크 오라"처럼 공격 주문명에도 흔해 effect 판정을 흐린다 — 제외
  '버프', '헤이스트', '블레스', '파워업',
  'buff', 'strengthen', 'haste', 'bless', 'empower',
  // 자기 강화 확장 — 가속·무적·돌진 (selfBuffConfig가 종류를 가른다)
  '신속', '가속', '질주', '무적', '불멸', '철벽', '돌진', '대시', '쇄도',
  'swift', 'speed', 'invincible', 'immortal', 'dash', 'charge', 'rush',
];
const CONTROL_KEYWORDS = [
  '묶어', '멈춰', '속박', '가둬', '잠재워', '얼려',
  '바인드', '스턴', '슬로우', '홀드', '루트',
  'bind', 'stop', 'trap', 'sleep', 'stun', 'slow', 'hold', 'root',
];
const SUMMON_KEYWORDS = [
  '소환', '불러', '정령', '사역마', '친구',
  // 소환 다양성(#97 ②) — 분신·포탑·군체가 summon으로 판정되게
  '분신', '도플', '복제', '포탑', '포대', '터렛', '군체', '군단', '무리떼',
  'clone', 'turret', 'swarm', 'horde', 'sentry',
  '서먼', '스피릿', '패밀리어', '골렘',
  'summon', 'spirit', 'familiar', 'golem',
];

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function isNonsense(text: string): boolean {
  const compact = text.replace(/\s/g, '');
  if (compact.length === 0 || KNOWN_NONSENSE.has(compact)) return true;
  // 한글 자모·기호·숫자만 반복한 키보드 매시는 의미 있는 영창으로 보지 않는다.
  if (!/[가-힣a-z]/i.test(compact)) return true;
  if (/^(.)\1{2,}$/u.test(compact)) return true;
  return false;
}

/** 명백한 무의미·금칙 입력은 네트워크 전송 전에 차단한다. */
export function precheckText(text: string): SpellJudgement | null {
  const normalized = text.trim().toLowerCase();
  if (isNonsense(normalized)) return FIZZLE_JUDGEMENT;
  if (UNSAFE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      schema_version: 2,
      disposition: 'blocked',
      reason: 'unsafe',
      message: '해당 문장으로는 영창할 수 없습니다',
    };
  }
  return null;
}

function inferEffect(text: string): SpellEffect {
  if (includesAny(text, HEAL_KEYWORDS)) return 'heal';
  if (includesAny(text, SHIELD_KEYWORDS)) return 'shield';
  if (includesAny(text, SUMMON_KEYWORDS)) return 'summon';
  if (includesAny(text, CONTROL_KEYWORDS)) return 'control';
  if (includesAny(text, BUFF_KEYWORDS)) return 'buff';
  return 'damage';
}

function targetForEffect(effect: SpellEffect, text: string): SpellTarget {
  if (effect === 'heal' || effect === 'shield' || effect === 'buff') return 'self';
  if (effect === 'summon' || effect === 'control' || /폭풍|스톰|숲|storm|forest|모두|주변/i.test(text)) {
    return 'area';
  }
  return 'enemy';
}

const FORM_KEYWORDS: Record<SpellForm, string[]> = {
  // '볼'은 "파이어볼/아이스볼"처럼 외래어 주문명의 사실상 표준 어미다.
  bolt: ['구', '화살', '탄', '창', '투사', '볼', '애로우', '샷', '스피어', 'bolt', 'arrow', 'shot', 'spear'],
  beam: ['광선', '빔', '레이저', '줄기', 'beam', 'laser', 'ray'],
  wave: ['해일', '파도', '물결', '쓰나미', '웨이브', '타이달', 'wave', 'tide', 'surge'],
  nova: ['폭발', '방출', '분출', '터', '노바', '익스플로전', '블라스트', 'nova', 'burst', 'explosion', 'blast'],
  rain: ['비', '소나기', '낙하', '유성', '우박', '레인', '메테오', '샤워', 'rain', 'meteor', 'shower'],
  wall: ['벽', '방벽', '장벽', '월', 'wall', 'barrier'],
  cage: ['감옥', '구속', '결박', '우리', '속박', '케이지', '프리즌', 'cage', 'prison', 'bind'],
  // '링'은 "힐링", '존'은 "존재"에 부분 매칭되므로 넣지 않는다 (부분 문자열 오탐 방지)
  orbit: ['회전', '선회', '고리', '위성', '오빗', 'orbit', 'ring'],
  summon: ['소환', '정령', '사역마', '서먼', 'summon', 'spirit'],
  buff: ['강화', '가호', '축복', '갑옷', '버프', 'buff', 'enchant', 'shield'],
  zone: ['장판', '영역', '지대', '늪', '필드', 'zone', 'field'],
  chain: ['연쇄', '도약', '전이', '체인', 'chain', 'jump'],
};

/**
 * 크기·빠르기 수식어 — 폴백이 플레이어의 말을 버리지 않게 한다 (#134).
 *
 * 실 Gemini는 이 둘을 이미 정확히 판정한다(R2 실측 40/40). 문제는 **폴백 경로**였다:
 * Mock이 size를 power에서, speed를 form에서만 파생해 `조그만`·`아주 빠른` 같은
 * 수식어를 아예 읽지 않았다. 평상시 폴백은 드물지만(게이트 실측 0/10) **부하가
 * 걸리면 무너진다** — 15 RPM은 프로젝트 전체 한도라 심사위원 여럿이 동시에
 * 플레이하면 폴백 구간이 생긴다(SUBMISSION_PLAN §6-2). 그때 플레이어가
 * "조그만 불씨"라 말하고 중간 크기를 받으면, 안전망이 말을 삼키는 셈이 된다.
 */
const SIZE_KEYWORDS: Record<SpellSize, string[]> = {
  small: ['조그만', '조그마', '작은', '작게', '자그마', '소형', '한 줌', '불씨', '가느다란', 'small', 'tiny'],
  medium: ['적당', '보통', '중형', 'medium'],
  large: ['거대', '커다', '큰', '크게', '대형', '육중', '장대', '길고', '두꺼운', 'large', 'huge'],
  huge: ['하늘을 덮', '전장을 뒤덮', '온 세상', 'massive', '어마어마', '초대형', '천지'],
};

const SPEED_KEYWORDS: Record<SpellSpeed, string[]> = {
  slow: ['느릿', '천천히', '서서히', '느리게', '느린', '굼뜨', '유유히', 'slow'],
  normal: ['평범', '보통 속도', 'normal'],
  fast: ['빠르', '빠른', '재빠', '순식간', '번개처럼', '쏜살', '질풍', '삽시간', '신속', 'fast', 'quick'],
};

const STATUS_KEYWORDS: Record<SpellStatus, string[]> = {
  burn: ['불', '화염', '작열', 'burn'],
  freeze: ['얼음', '빙결', '동결', 'freeze'],
  shock: ['번개', '뇌전', '감전', 'shock'],
  slow: ['둔화', '느려', '진흙', 'slow'],
  knockback: ['해일', '돌풍', '밀쳐', '충격', 'knockback'],
  weaken: ['저주', '약화', '쇠약', 'weaken'],
};

/**
 * 가장 앞에 등장한 키워드의 분류를 고른다.
 * 같은 위치에서 겹치면 **더 긴 키워드가 이긴다** — "라이트닝"이 "라이트"(light)에
 * 먹히지 않도록. (키 선언 순서에 의존하던 기존 동작을 명시적 규칙으로 고정)
 */
function findMatch<K extends string>(
  table: Record<K, string[]>, text: string,
): K | null {
  let best: K | null = null;
  let bestIdx = Number.POSITIVE_INFINITY;
  let bestLen = 0;
  for (const key of Object.keys(table) as K[]) {
    for (const kw of table[key]) {
      const idx = text.indexOf(kw);
      if (idx === -1) continue;
      if (idx < bestIdx || (idx === bestIdx && kw.length > bestLen)) {
        best = key;
        bestIdx = idx;
        bestLen = kw.length;
      }
    }
  }
  return best;
}

/**
 * L3(#101) — 문장의 행동 동사를 **등장 순서대로** 스텝 시퀀스로 조합한다.
 * "지그재그로 접근하다가 돌진" → [zigzag, dash]. 동사가 없으면 null(기본 행동).
 * 실제 Gemini는 프록시 프롬프트(R2)가 summonBehavior.ts 스키마로 직접 출력한다.
 */
const MOVE_VERB_KEYWORDS: Record<string, string[]> = {
  dash: ['돌진', '쇄도', '들이받', '박치', '돌격', 'dash', 'charge', 'rush'],
  zigzag: ['지그재그', '갈지자', '지그재로', 'zigzag'],
  orbit: ['맴돌', '선회', '주위를 돌', '빙글', 'circle'],
  hold: ['제자리', '대기', '멈춰 서', '지키게', 'stay', 'hold'],
  retreat: ['후퇴', '물러나', '도망', 'retreat', 'flee'],
  chase: ['쫓아', '추격', '따라가', 'chase', 'pursue'],
};

function composeBehaviorFromText(text: string): unknown {
  const found: { kind: string; index: number }[] = [];
  for (const [kind, keywords] of Object.entries(MOVE_VERB_KEYWORDS)) {
    let best = Number.POSITIVE_INFINITY;
    for (const kw of keywords) {
      const idx = text.indexOf(kw);
      if (idx !== -1 && idx < best) best = idx;
    }
    if (best !== Number.POSITIVE_INFINITY) found.push({ kind, index: best });
  }
  if (found.length === 0) return undefined;
  found.sort((a, b) => a.index - b.index);
  return {
    steps: found.map(({ kind }) => ({ kind, seconds: 2 })),
    loop: true,
  };
}

/** 문자열 해시 (결정론적 변주용) */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class MockJudge implements SpellJudge {
  readonly name = 'MockJudge(meaning-v2)';

  async judge(text: string): Promise<SpellJudgement> {
    const t = text.trim().toLowerCase();
    const prechecked = precheckText(t);
    if (prechecked) return prechecked;

    const spec = this.buildSpec(text, t);
    if (!spec) return FIZZLE_JUDGEMENT;
    // 명시적 순차 마커가 있으면 복합 영창 plan을 함께 싣는다. spec은 폴백·기록용 대표.
    const plan = this.buildSequencePlan(text);
    return plan
      ? { schema_version: 2, disposition: 'cast', spell: spec, plan }
      : { schema_version: 2, disposition: 'cast', spell: spec };
  }

  /**
   * 폴백용 시퀀스 산출 — 명시적 순차 마커가 있을 때만 절별 form 시퀀스 plan을 만든다.
   * Gemini(R2 프롬프트)가 담당할 섬세한 move/wait 해석은 하지 않는다. 오프라인·폴백에서도
   * 복합 영창이 "여러 단계로 실행"되게 하는 최소 근사다. 마커가 없으면 null(단일 주문).
   */
  private buildSequencePlan(text: string): SpellPlan | null {
    const clauses = splitSequenceClauses(text);
    if (clauses.length < 2) return null;
    const specs = clauses
      .map((clause) => this.buildSpec(clause, clause.trim().toLowerCase()))
      .filter((s): s is SpellSpec => s !== null);
    if (specs.length < 2) return null;
    return validateSpellPlan({
      name: text.trim(),
      power: Math.min(100, Math.max(...specs.map((s) => s.power))),
      durationMs: 500 * specs.length,
      sequences: specs.map((spec) => ({
        durationWeight: 1,
        behaviors: [{ type: 'form', spec, powerWeight: 1 }],
      })),
    });
  }

  /** 자유 텍스트 한 절 → 단일 SpellSpec (기존 v2 판정 로직). 검증 실패 시 null. */
  private buildSpec(text: string, t: string): SpellSpec | null {
    const effect = inferEffect(t);
    const target = targetForEffect(effect, t);
    const primary = findMatch(ELEMENT_KEYWORDS, t)
      ?? (effect === 'heal' ? (includesAny(t, ['배고프', '허기', 'hungry', 'hunger']) ? 'dark' : 'light')
        : effect === 'shield' ? 'earth'
          : effect === 'buff' ? 'light'
            : effect === 'summon' ? 'wind'
              : 'wind');

    // 보조 원소: 첫 매치를 제거한 나머지 텍스트에서 다른 원소 탐색
    const stripped = ELEMENT_KEYWORDS[primary].reduce(
      (s, kw) => s.replace(kw, ''), t,
    );
    const secondary = findMatch(ELEMENT_KEYWORDS, stripped);

    const form = findMatch(FORM_KEYWORDS, t)
      ?? (effect === 'heal' || effect === 'buff' ? 'buff'
        : effect === 'shield' ? 'wall'
          : effect === 'summon' ? 'summon'
            : effect === 'control' ? 'cage'
              : target === 'area' ? 'zone'
                : 'bolt');
    const status = (Object.keys(STATUS_KEYWORDS) as SpellStatus[])
      .filter((s) => STATUS_KEYWORDS[s].some((kw) => t.includes(kw)))
      .slice(0, 2);

    // L3(#101) 흉내: 소환 주문이면 문장의 행동 동사를 등장 순서대로 스텝 시퀀스로 조합.
    // 실제 Gemini는 프록시 프롬프트(R2)가 같은 스키마로 출력한다.
    const behavior = effect === 'summon' ? composeBehaviorFromText(t) : undefined;

    // 구체성 보상 흉내: 길이 + 원소 조합 + 상태이상 다양성으로 power 산출
    const h = hash(t);
    const semanticCap = findMatch(ELEMENT_KEYWORDS, t) ? 100 : 40;
    const base = 20 + Math.min(40, t.length * 2);
    const comboBonus = secondary && secondary !== primary ? 15 : 0;
    const statusBonus = status.length * 5;
    const jitter = h % 10;
    const power = Math.min(semanticCap, base + comboBonus + statusBonus + jitter);

    // 수식어가 있으면 그 말을 따르고, 없을 때만 power에서 파생한다 (#134)
    const size = findMatch(SIZE_KEYWORDS, t)
      ?? (power > 75 ? 'huge' : power > 55 ? 'large' : power > 35 ? 'medium' : 'small');
    const speed = findMatch(SPEED_KEYWORDS, t)
      ?? (form === 'wave' ? 'slow' : 'normal');

    const spec = validateSpec({
      behavior,
      // 이름 길이 제한은 모든 판정 결과가 거치는 validateSpec에서 일관되게 적용한다.
      name: text.trim(),
      effect,
      target,
      element_primary: primary,
      element_secondary: secondary === primary ? null : secondary,
      form,
      size,
      speed,
      status,
      power,
      cost: Math.max(5, Math.round(power * 0.6)),
    });
    return spec;
  }
}
