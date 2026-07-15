import type { SpellJudge } from './judge';
import type {
  SpellEffect, SpellElement, SpellForm, SpellJudgement, SpellStatus, SpellTarget,
} from './types';
import { validateSpec } from './validate';
import { FIZZLE_JUDGEMENT } from './types';

/**
 * MockJudge — 키워드 기반 결정론적 판정기.
 * 역할: ① 로컬 개발 시 API 키 없이 즉시 동작 ② LLM 타임아웃·장애 시 폴백 (GDD §3.5)
 * LLM만큼 똑똑하지 않아도 된다. "게임이 절대 멈추지 않는다"가 존재 이유.
 */

const ELEMENT_KEYWORDS: Record<SpellElement, string[]> = {
  fire: ['불', '화염', '겁화', '태양', '용암', '폭염', '작열', 'fire', 'flame', 'burn'],
  water: ['물', '해일', '파도', '심연', '급류', '바다', 'water', 'wave', 'tide'],
  lightning: ['번개', '뇌전', '낙뢰', '전격', '천둥', '라이트닝', 'lightning', 'thunder', 'volt'],
  ice: ['얼음', '빙결', '서리', '눈보라', '한파', '동결', 'ice', 'frost', 'freeze'],
  earth: ['대지', '바위', '돌', '지진', '암석', '가시', '숲', '나무', '자연', 'earth', 'rock', 'stone', 'forest', 'nature'],
  wind: ['바람', '돌풍', '질풍', '회오리', '폭풍', 'wind', 'gale', 'storm'],
  light: ['빛', '섬광', '성광', '축복', '신성', '광휘', 'light', 'holy', 'radiant'],
  dark: ['어둠', '암흑', '그림자', '저주', '심야', '흑염', 'dark', 'shadow', 'curse'],
};

const UNSAFE_PATTERNS = [
  /씨+발/i, /시+발/i, /병신/i, /개새끼/i, /좆/i, /fuck/i, /bitch/i,
];
const KNOWN_NONSENSE = new Set(['ㅁㄴㅇㄹ', 'asdf', 'qwer', 'zxcv', 'ㅋㅋㅋ', 'ㅎㅎㅎ']);
const HEAL_KEYWORDS = [
  '배고프', '허기', '먹고 싶', '회복', '치유', '낫게', '살려', '지쳤', '피곤',
  'hungry', 'hunger', 'heal', 'cure', 'recover', 'tired',
];
const SHIELD_KEYWORDS = ['보호', '지켜', '방패', '장벽', '갑옷', 'shield', 'protect', 'guard', 'barrier'];
const BUFF_KEYWORDS = ['강화', '힘을', '빠르게', '용기', '가호', '축복', 'buff', 'strengthen', 'haste', 'bless'];
const CONTROL_KEYWORDS = ['묶어', '멈춰', '속박', '가둬', '잠재워', '얼려', 'bind', 'stop', 'trap', 'sleep'];
const SUMMON_KEYWORDS = ['소환', '불러', '정령', '사역마', '친구', 'summon', 'spirit', 'familiar'];

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
  bolt: ['구', '화살', '탄', '창', '투사', 'bolt', 'arrow', 'shot'],
  beam: ['광선', '빔', '레이저', '줄기', 'beam', 'laser', 'ray'],
  wave: ['해일', '파도', '물결', '쓰나미', 'wave', 'tide', 'surge'],
  nova: ['폭발', '방출', '분출', '터', '노바', 'nova', 'burst', 'explosion'],
  rain: ['비', '소나기', '낙하', '유성', '우박', 'rain', 'meteor', 'shower'],
  wall: ['벽', '방벽', '장벽', 'wall', 'barrier'],
  cage: ['감옥', '구속', '결박', '우리', '속박', 'cage', 'prison', 'bind'],
  orbit: ['회전', '선회', '고리', '위성', 'orbit', 'ring'],
  summon: ['소환', '정령', '사역마', 'summon', 'spirit'],
  buff: ['강화', '가호', '축복', '갑옷', 'buff', 'enchant', 'shield'],
  zone: ['장판', '영역', '지대', '늪', 'zone', 'field'],
  chain: ['연쇄', '도약', '전이', 'chain', 'jump'],
};

const STATUS_KEYWORDS: Record<SpellStatus, string[]> = {
  burn: ['불', '화염', '작열', 'burn'],
  freeze: ['얼음', '빙결', '동결', 'freeze'],
  shock: ['번개', '뇌전', '감전', 'shock'],
  slow: ['둔화', '느려', '진흙', 'slow'],
  knockback: ['해일', '돌풍', '밀쳐', '충격', 'knockback'],
  weaken: ['저주', '약화', '쇠약', 'weaken'],
};

function findMatch<K extends string>(
  table: Record<K, string[]>, text: string,
): K | null {
  let best: K | null = null;
  let bestIdx = Number.POSITIVE_INFINITY;
  for (const key of Object.keys(table) as K[]) {
    for (const kw of table[key]) {
      const idx = text.indexOf(kw);
      if (idx !== -1 && idx < bestIdx) {
        best = key;
        bestIdx = idx;
      }
    }
  }
  return best;
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

    // 구체성 보상 흉내: 길이 + 원소 조합 + 상태이상 다양성으로 power 산출
    const h = hash(t);
    const semanticCap = findMatch(ELEMENT_KEYWORDS, t) ? 100 : 40;
    const base = 20 + Math.min(40, t.length * 2);
    const comboBonus = secondary && secondary !== primary ? 15 : 0;
    const statusBonus = status.length * 5;
    const jitter = h % 10;
    const power = Math.min(semanticCap, base + comboBonus + statusBonus + jitter);

    const size = power > 75 ? 'huge' : power > 55 ? 'large' : power > 35 ? 'medium' : 'small';

    const spec = validateSpec({
      // 이름 길이 제한은 모든 판정 결과가 거치는 validateSpec에서 일관되게 적용한다.
      name: text.trim(),
      effect,
      target,
      element_primary: primary,
      element_secondary: secondary === primary ? null : secondary,
      form,
      size,
      speed: form === 'wave' ? 'slow' : 'normal',
      status,
      power,
      cost: Math.max(5, Math.round(power * 0.6)),
    });
    return spec
      ? { schema_version: 2, disposition: 'cast', spell: spec }
      : FIZZLE_JUDGEMENT;
  }
}
