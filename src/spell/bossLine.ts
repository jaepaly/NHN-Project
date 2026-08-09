import type { SpellElement } from './types';
import type { RunMemory } from './runMemory';

/**
 * 보스 대사 생성 (Phase 3 R2, 트랙 2 ③).
 * 런 요약(RunMemory)으로 한 문장짜리 위협 대사를 만든다.
 * 프록시 `/boss-line`(라이브 Gemini)을 우선 쓰되, **실패·타임아웃·첫 조우엔 템플릿 폴백**
 * — 프록시가 죽어도 보스는 반드시 말한다. 대사는 검증·길이 제한한다.
 */

const DEFAULT_PROXY_URL = 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const BOSS_LINE_PATH = '/boss-line';
const TIMEOUT_MS = 2500;
const MIN_LEN = 12;
const MAX_LEN = 52;

/** 보스의 발화가 아니라 시스템 공지처럼 들리는 표현은 클라이언트에서 버린다. */
const BANNED_SYSTEM_TERMS = [
  '보스', '플레이어', '시스템', '알림', '튜토리얼', '내성', '피해', '패턴', '단계', '스킬', '데미지', 'HP',
] as const;

export interface BossLine {
  text: string;
  source: 'gemini' | 'template';
}

export interface BossLineOptions {
  proxyUrl?: string;
  mockForced?: boolean;
}

/** 대사에 쓸 원소 한글 이름 (외부 팔레트 의존 없이 최소 매핑) */
const ELEMENT_KO: Record<SpellElement, string> = {
  fire: '불꽃', water: '물', lightning: '번개', ice: '얼음',
  earth: '대지', wind: '바람', light: '빛', dark: '어둠',
};

/** 프록시에 보낼 런 요약 (프롬프트는 서버가 고정) */
export interface BossLineRequest {
  deaths: number;
  clears: number;
  favoriteElement: SpellElement | null;
  topSpellName: string | null;
  lastResult: 'win' | 'lose' | null;
}

export function toBossLineRequest(memory: RunMemory): BossLineRequest {
  return {
    deaths: memory.deaths,
    clears: memory.clears,
    favoriteElement: memory.favoriteElement,
    topSpellName: memory.topSpellName,
    lastResult: memory.lastResult,
  };
}

/**
 * 대사 정규화·화자성 검증.
 *
 * 프록시가 단순한 상태 공지·해설·여러 문장을 돌려도 그대로 노출하지 않는다. 기억의 주인은
 * 플레이어에게 직접 말하는 한 문장만 허용한다. 어기면 null → 결정론 템플릿으로 폴백한다.
 */
export function sanitizeLine(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”『「]+|["'“”』」]+$/g, '');
  if (t.length < MIN_LEN || t.length > MAX_LEN) return null;
  if (!/(너|네)/.test(t)) return null;
  if (BANNED_SYSTEM_TERMS.some((term) => t.includes(term))) return null;
  // 마침표·물음표·느낌표가 둘 이상이면 "대사 한 줄"이 아니라 안내문처럼 읽힌다.
  if ((t.match(/[.!?。！？]+/g) ?? []).length > 1) return null;
  return t;
}

/**
 * 템플릿 폴백 대사 — 프록시 없이도 기억을 반영해 말한다.
 * 첫 조우 / 애용 주문·원소 언급 / 사망 언급 순으로 결정론적 선택.
 */
export function templateBossLine(memory: RunMemory): BossLine {
  if (memory.deaths === 0 && memory.clears === 0) {
    return { text: '낯선 주문이군, 네 문장은 여기서 끊긴다.', source: 'template' };
  }
  if (memory.topSpellName) {
    return { text: `또 『${memory.topSpellName}』인가, 네 손에서 끝내 주마.`, source: 'template' };
  }
  if (memory.favoriteElement) {
    return { text: `${ELEMENT_KO[memory.favoriteElement]}에 기대는군, 네 발밑부터 무너뜨리겠다.`, source: 'template' };
  }
  return { text: '또 왔군, 네 패배는 여기서 끝나지 않는다.', source: 'template' };
}

/**
 * 보스 대사 생성. 프록시 우선, 실패 시 템플릿 폴백. 항상 유효한 BossLine 반환(throw 없음).
 */
export async function getBossLine(
  memory: RunMemory,
  proxyUrl: string = DEFAULT_PROXY_URL,
): Promise<BossLine> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(proxyUrl + BOSS_LINE_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(toBossLineRequest(memory)),
      signal: ctrl.signal,
    });
    if (!res.ok) return templateBossLine(memory);
    const data = (await res.json()) as { text?: unknown };
    const text = sanitizeLine(data?.text);
    return text ? { text, source: 'gemini' } : templateBossLine(memory);
  } catch {
    return templateBossLine(memory);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 실행 환경에 맞는 보스 대사를 선택한다.
 * Mock 모드에서는 fetch를 전혀 시작하지 않고, 그 외에는 지정 프록시를 우선한다.
 */
export async function resolveBossLine(
  memory: RunMemory,
  options: BossLineOptions = {},
): Promise<BossLine> {
  if (options.mockForced) return templateBossLine(memory);
  return getBossLine(memory, options.proxyUrl);
}
