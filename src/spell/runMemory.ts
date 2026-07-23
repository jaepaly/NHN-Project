import { ELEMENTS } from './types';
import type { SpellElement } from './types';
import type { SpellHistory } from './spellHistory';

/**
 * 런 간 기억 (Phase 3 R2, 트랙 2 ②).
 * 런이 끝날 때 요약을 localStorage에 누적 → 다음 런 보스의 "또 왔군, 지난번엔 …" 장기 기억.
 *
 * 스키마 버전 접두사로 격리(구버전 무시). **누적 내성 밸런스 함정 방지**:
 * 전체 회차가 아니라 최근 N런(window)만 반영하고, 장기 저항은 그중 최다 1개만.
 */

const STORAGE_KEY = 'incant:runmemory:v1:profile';
/** 장기 기억은 최근 이만큼의 런만 반영 (오래된 취향은 잊음 → 모든 원소 내성 방지) */
const RECENT_WINDOW = 5;

export interface RunMemory {
  deaths: number;
  clears: number;
  /** 최근 런들 통틀어 애용 원소 (장기 저항 후보) */
  favoriteElement: SpellElement | null;
  topSpellName: string | null;
  topSpellPower: number;
  lastResult: 'win' | 'lose' | null;
  /** 최근 런들의 최다 원소 (최신이 뒤, 최대 RECENT_WINDOW) */
  recentDominantElements: SpellElement[];
}

export const EMPTY_RUN_MEMORY: RunMemory = {
  deaths: 0,
  clears: 0,
  favoriteElement: null,
  topSpellName: null,
  topSpellPower: 0,
  lastResult: null,
  recentDominantElements: [],
};

/** 한 런의 결과 요약 (히스토리 + 승패에서 추출) */
export interface RunOutcome {
  result: 'win' | 'lose';
  dominantElement: SpellElement | null;
  topSpellName: string | null;
  topSpellPower: number;
}

/** 이번 런 히스토리에서 요약 추출. 승패는 호출측(런 컨트롤러)이 판단해 전달. */
export function summarizeRun(history: SpellHistory, result: 'win' | 'lose'): RunOutcome {
  let topSpellName: string | null = null;
  let topSpellPower = 0;
  for (const e of history.allCasts) {
    // basePower(판정 원 위력)로 비교한다 — topSpell은 이 런 최고 위력 주문의 **정체성**이라
    // 반복 패널티(e.power)가 반영되면 안 된다. 반영하면 약불30 뒤의 강불90이 '재탕'으로
    // 81 처리돼 기억이 오염된다(#91). 반복/다양성 마찰은 피해 계산 시점에만 쓴다.
    if (e.basePower > topSpellPower) {
      topSpellPower = e.basePower;
      topSpellName = e.name;
    }
  }
  return {
    result,
    dominantElement: history.bossMemory().dominantElement,
    topSpellName,
    topSpellPower,
  };
}

/** 이전 기억 + 이번 런 결과 → 새 기억 (순수 함수) */
export function updateRunMemory(prev: RunMemory, outcome: RunOutcome): RunMemory {
  const recent = outcome.dominantElement
    ? [...prev.recentDominantElements, outcome.dominantElement].slice(-RECENT_WINDOW)
    : prev.recentDominantElements.slice();
  const beatsTop = outcome.topSpellPower > prev.topSpellPower;
  return {
    deaths: prev.deaths + (outcome.result === 'lose' ? 1 : 0),
    clears: prev.clears + (outcome.result === 'win' ? 1 : 0),
    favoriteElement: mode(recent),
    topSpellName: beatsTop ? outcome.topSpellName : prev.topSpellName,
    topSpellPower: beatsTop ? outcome.topSpellPower : prev.topSpellPower,
    lastResult: outcome.result,
    recentDominantElements: recent,
  };
}

/**
 * 장기 기억 기반 "다음 런 보스 초기 저항 원소" — 최근 window의 최다 1개만(부분 내성용).
 * 누적 내성 함정 방지: 전체가 아니라 최근 런들의 최빈 원소 하나.
 */
export function longTermResistedElement(memory: RunMemory): SpellElement | null {
  return mode(memory.recentDominantElements);
}

// ── localStorage I/O (테스트 위해 storage 주입 가능) ──

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadRunMemory(storage: StorageLike | null = defaultStorage()): RunMemory {
  if (!storage) return { ...EMPTY_RUN_MEMORY };
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : { ...EMPTY_RUN_MEMORY };
  } catch {
    return { ...EMPTY_RUN_MEMORY };
  }
}

export function saveRunMemory(memory: RunMemory, storage: StorageLike | null = defaultStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // 저장 실패(용량 초과·비활성)는 무시 — 기억은 선택적 기능
  }
}

/** 로드한 값 방어 — 필드 누락·타입 오류·구스키마 시 기본값으로 정규화 */
function normalize(raw: unknown): RunMemory {
  if (typeof raw !== 'object' || raw === null) return { ...EMPTY_RUN_MEMORY };
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const el = (v: unknown): SpellElement | null =>
    typeof v === 'string' && (ELEMENTS as readonly string[]).includes(v) ? (v as SpellElement) : null;
  const recent = Array.isArray(o.recentDominantElements)
    ? o.recentDominantElements.map(el).filter((x): x is SpellElement => x !== null).slice(-RECENT_WINDOW)
    : [];
  return {
    deaths: num(o.deaths, 0),
    clears: num(o.clears, 0),
    favoriteElement: el(o.favoriteElement),
    topSpellName: typeof o.topSpellName === 'string' ? o.topSpellName.slice(0, 20) : null,
    topSpellPower: num(o.topSpellPower, 0),
    lastResult: o.lastResult === 'win' || o.lastResult === 'lose' ? o.lastResult : null,
    recentDominantElements: recent,
  };
}

/** 최빈값 (동률이면 먼저 최다 도달한 값). 비어 있으면 null. */
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
