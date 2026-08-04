import { ELEMENTS, FORMS } from './types';
import type { SpellElement, SpellForm, SpellSpec } from './types';
import type { SpellHistory } from './spellHistory';

/**
 * 주문서(Grimoire) — 런 간 유산 (Phase 5).
 *
 * 왜 필요한가: 보스는 런을 거듭하며 플레이어를 학습하는데(runMemory) 플레이어는 매 런
 * 초기화됐다. 반복할수록 일방적으로 불리해지는 비대칭이라 다시 할 이유가 약했다.
 * 주문서는 그 대칭을 만든다 — **보스가 기억하듯 플레이어도 기억한다.**
 *
 * 규칙: 런을 **클리어(승리)** 하면 그 런의 최고 위력 주문이 기록되고(자살 파밍 방지),
 * 다음 런 시작 시 하나를 골라 **유산 각인(Lv1)** 으로 장착하고 출발한다.
 * 보스가 내 화염을 기억해 저항하면, 나는 주문서에서 다른 원소를 꺼내 대응한다.
 *
 * 저장은 runMemory와 같은 패턴 — 버전 접두사 + storage 주입(회귀 가능) + 실패 무시.
 */

const STORAGE_KEY = 'incant:grimoire:v1:entries';
const LAST_LEGACY_STORAGE_KEY = 'incant:grimoire:v1:last-legacy';
/** 원소별 두 유산까지 보관해 한 원소의 고위력 주문 독식을 막는다. */
export const GRIMOIRE_PER_ELEMENT_CAPACITY = 2;
/** 8원소 × 2칸. 다양한 유산을 남기되 무한 누적은 막는다. */
export const GRIMOIRE_CAPACITY = 16;
/** 런 시작 시 제시할 유산 후보 수 */
export const GRIMOIRE_OFFER_COUNT = 3;

/** 주문서 한 줄 — 다음 런에서 각인으로 되살릴 수 있는 최소 정보 */
export interface GrimoireEntry {
  /** 정규화 키 (각인 슬롯 식별에 사용 — spellHistory와 동일 규칙) */
  normalized: string;
  /** 플레이어가 실제로 쓴 원문 */
  rawText: string;
  /** 판정된 주문명 */
  name: string;
  element: SpellElement;
  form: SpellForm;
  /** 판정 원 위력 (패널티 전) — 유산 각인의 기준 위력 */
  power: number;
  /** 기록된 런의 결과 */
  result: 'win' | 'lose';
  recordedAt: number;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * 이번 런의 최고 위력 **공격 주문**을 주문서 항목으로 뽑는다.
 * 각인은 damage 주문만 대상이므로(EngraveManager 규칙) 여기서도 동일하게 거른다.
 * 기록할 게 없으면 null.
 */
export function bestEntryFromRun(
  history: SpellHistory,
  result: 'win' | 'lose',
  now: number = Date.now(),
): GrimoireEntry | null {
  return bestEntriesFromRun(history, result, 1, now)[0] ?? null;
}

/** 승리한 런에서 원소·형태가 다른 고위력 주문을 최대 N개 기록한다. */
export function bestEntriesFromRun(
  history: SpellHistory,
  result: 'win' | 'lose',
  count: number = GRIMOIRE_OFFER_COUNT,
  now: number = Date.now(),
): GrimoireEntry[] {
  const candidates: GrimoireEntry[] = [];
  for (const entry of history.all) {
    if (entry.effect !== 'damage') continue;
    candidates.push({
      normalized: entry.normalized,
      rawText: entry.rawText,
      name: entry.name,
      element: entry.elementPrimary,
      form: entry.form,
      power: entry.basePower,
      result,
      recordedAt: now,
    });
  }
  const selected: GrimoireEntry[] = [];
  const usedSignatures = new Set<string>();
  for (const entry of candidates.sort((a, b) => b.power - a.power)) {
    if (selected.length >= Math.max(1, count)) break;
    const signature = `${entry.element}:${entry.form}`;
    if (usedSignatures.has(signature)) continue;
    selected.push(entry);
    usedSignatures.add(signature);
  }
  return selected;
}

/**
 * 주문서에 항목 추가 — 같은 주문(normalized)은 더 강한 쪽만 남기고,
 * 위력 상위 GRIMOIRE_CAPACITY개로 자른다. (순수 함수)
 */
export function addEntry(
  entries: readonly GrimoireEntry[],
  entry: GrimoireEntry,
): GrimoireEntry[] {
  const merged = entries.filter((e) => e.normalized !== entry.normalized);
  const previous = entries.find((e) => e.normalized === entry.normalized);
  merged.push(previous && previous.power > entry.power ? previous : entry);
  const retained: GrimoireEntry[] = [];
  for (const element of ELEMENTS) {
    const byPower = merged
      .filter((candidate) => candidate.element === element)
      .sort((a, b) => b.power - a.power || b.recordedAt - a.recordedAt);
    const forms = new Set<SpellForm>();
    for (const candidate of byPower) {
      if (retained.filter((item) => item.element === element).length >= GRIMOIRE_PER_ELEMENT_CAPACITY) break;
      if (forms.has(candidate.form)) continue;
      retained.push(candidate);
      forms.add(candidate.form);
    }
    for (const candidate of byPower) {
      if (retained.filter((item) => item.element === element).length >= GRIMOIRE_PER_ELEMENT_CAPACITY) break;
      if (!retained.includes(candidate)) retained.push(candidate);
    }
  }
  return retained.sort((a, b) => b.power - a.power || b.recordedAt - a.recordedAt).slice(0, GRIMOIRE_CAPACITY);
}

/**
 * 런 시작 시 제시할 유산 후보 — 위력 상위권에서 원소가 겹치지 않게 우선 고른다.
 * (같은 원소만 나오면 "보스 저항을 피한다"는 선택의 의미가 사라진다)
 */
export function offerEntries(
  entries: readonly GrimoireEntry[],
  count: number = GRIMOIRE_OFFER_COUNT,
  rand: () => number = Math.random,
  excludedNormalized: string | null = null,
): GrimoireEntry[] {
  const sorted = [...entries].sort((a, b) => b.power - a.power || b.recordedAt - a.recordedAt);
  const pool = sorted.filter((entry) => entry.normalized !== excludedNormalized);
  const selectable = pool.length >= Math.min(count, sorted.length) ? pool : sorted;
  if (selectable.length === 0) return [];

  // 첫 장은 가장 강한 기준점. 나머지는 상위 85% 구간에서 무작위 변주를 제시한다.
  const picked: GrimoireEntry[] = [selectable[0]];
  const usedElements = new Set<SpellElement>([selectable[0].element]);
  const usedForms = new Set<SpellForm>([selectable[0].form]);
  while (picked.length < Math.min(count, selectable.length)) {
    const remaining = selectable.filter((entry) => !picked.includes(entry));
    const differentElement = remaining.filter((entry) => !usedElements.has(entry.element));
    const differentForm = differentElement.filter((entry) => !usedForms.has(entry.form));
    const candidates = (differentForm.length > 0 ? differentForm : differentElement.length > 0 ? differentElement : remaining);
    const ceiling = candidates[0].power;
    const highTier = candidates.filter((entry) => entry.power >= ceiling * 0.85);
    const index = randomIndex(highTier.length, rand);
    const chosen = highTier[index];
    picked.push(chosen);
    usedElements.add(chosen.element);
    usedForms.add(chosen.form);
  }
  return picked;
}

export function loadLastLegacySelection(storage: StorageLike | null = defaultStorage()): string | null {
  try {
    const value = storage?.getItem(LAST_LEGACY_STORAGE_KEY) ?? null;
    return value && value.length <= 200 ? value : null;
  } catch {
    return null;
  }
}

export function saveLastLegacySelection(normalized: string, storage: StorageLike | null = defaultStorage()): void {
  if (!normalized || normalized.length > 200) return;
  try {
    storage?.setItem(LAST_LEGACY_STORAGE_KEY, normalized);
  } catch {
    // 유산 반복 방지는 선택적 편의 기능이다.
  }
}

/** 유산 각인용 SpellSpec 복원 — 각인 슬롯에 Lv1로 장착된다 */
export function specFromEntry(entry: GrimoireEntry): SpellSpec {
  return {
    name: entry.name,
    effect: 'damage',
    target: entry.form === 'zone' || entry.form === 'rain' || entry.form === 'nova'
      ? 'area'
      : 'enemy',
    element_primary: entry.element,
    element_secondary: null,
    form: entry.form,
    size: 'medium',
    speed: 'normal',
    status: [],
    power: entry.power,
    cost: 0,
  };
}

export function loadGrimoire(
  storage: StorageLike | null = defaultStorage(),
): GrimoireEntry[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.flatMap(normalizeEntry) : [];
  } catch {
    return [];
  }
}

export function saveGrimoire(
  entries: readonly GrimoireEntry[],
  storage: StorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // 저장 실패(용량·비활성)는 무시 — 주문서는 선택적 기능, 게임은 계속된다
  }
}

/** 로드값 방어 — 필드 누락·타입 오류는 통째로 버린다 (구스키마 혼입 방지) */
function normalizeEntry(value: unknown): GrimoireEntry[] {
  if (typeof value !== 'object' || value === null) return [];
  const v = value as Record<string, unknown>;
  const power = typeof v.power === 'number' && Number.isFinite(v.power) ? v.power : null;
  const validElement = typeof v.element === 'string'
    && (ELEMENTS as readonly string[]).includes(v.element);
  const validForm = typeof v.form === 'string'
    && (FORMS as readonly string[]).includes(v.form);
  if (
    typeof v.normalized !== 'string' || v.normalized.length === 0 || v.normalized.length > 200
    || typeof v.rawText !== 'string' || v.rawText.length > 500
    || typeof v.name !== 'string' || v.name.length === 0 || v.name.length > 120
    || !validElement
    || !validForm
    || power === null
    || power < 0
    || power > 100
  ) return [];
  return [{
    normalized: v.normalized,
    rawText: v.rawText,
    name: v.name,
    element: v.element as SpellElement,
    form: v.form as SpellForm,
    power: Math.max(0, power),
    result: v.result === 'win' ? 'win' : 'lose',
    recordedAt: typeof v.recordedAt === 'number' ? v.recordedAt : 0,
  }];
}

function randomIndex(length: number, rand: () => number): number {
  const raw = rand();
  const safe = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999, raw)) : 0;
  return Math.floor(safe * length);
}
