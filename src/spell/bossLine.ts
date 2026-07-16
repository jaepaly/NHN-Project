import type { SpellElement } from './types';
import type { RunMemory } from './runMemory';

/**
 * 보스 대사 생성 (Phase 3 R2, 트랙 2 ③).
 * 런 요약(RunMemory)으로 1~2문장 위협 대사를 만든다.
 * 프록시 `/boss-line`(라이브 Gemini)을 우선 쓰되, **실패·타임아웃·첫 조우엔 템플릿 폴백**
 * — 프록시가 죽어도 보스는 반드시 말한다. 대사는 검증·길이 제한한다.
 */

const DEFAULT_PROXY_URL = 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const BOSS_LINE_PATH = '/boss-line';
const TIMEOUT_MS = 2500;
const MAX_LEN = 80;

export interface BossLine {
  text: string;
  source: 'gemini' | 'template';
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

/** 대사 정규화: 공백 정리·길이 제한. 유효하지 않으면 null. */
export function sanitizeLine(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length === 0) return null;
  return t.slice(0, MAX_LEN);
}

/**
 * 템플릿 폴백 대사 — 프록시 없이도 기억을 반영해 말한다.
 * 첫 조우 / 애용 주문·원소 언급 / 사망 언급 순으로 결정론적 선택.
 */
export function templateBossLine(memory: RunMemory): BossLine {
  if (memory.deaths === 0 && memory.clears === 0) {
    return { text: '낯선 얼굴이군. 네 마법이 얼마나 버티는지 보자.', source: 'template' };
  }
  if (memory.topSpellName) {
    return { text: `또 왔군. 지난번 '${memory.topSpellName}'은 이제 통하지 않는다.`, source: 'template' };
  }
  if (memory.favoriteElement) {
    return { text: `${ELEMENT_KO[memory.favoriteElement]}에 기대는 버릇, 여전하군.`, source: 'template' };
  }
  return { text: `${memory.deaths}번이나 쓰러지고도 또 기어왔나.`, source: 'template' };
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
