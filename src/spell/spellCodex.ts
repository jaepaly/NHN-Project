import type { SpellElement, SpellForm, SpellSpec } from './types';
import { ELEMENT_LABELS, FORM_LABELS } from '../render/palette';

/**
 * 주문 도감 — 플레이어가 만든 마법의 영구 기록 (게임성 분석 ③: 발견의 축하).
 *
 * 이 게임의 코어 판타지는 "내 문장이 마법이 된다"인데, 지금까지 그 발견을
 * 게임이 기억해주지 않았다 — 실험의 보상이 "그 주문이 쎘다"뿐이었다.
 * 도감은 런과 승패를 넘어 쌓이는 수집축이다: 지든 이기든 내 주문서는 두꺼워진다.
 *
 * 저장은 localStorage(런 기억·유산 각인과 같은 방식), 로직은 순수 함수로 분리해
 * 회귀로 고정한다. 기록 대상은 **수동 영창만** — 내가 "쓴" 마법의 기록이므로
 * 각인 자동 시전·정령 펄스는 세지 않는다.
 */

export interface CodexEntry {
  /** 주문명 (키 — 같은 이름은 한 항목으로 합산) */
  name: string;
  /** 색상용 대표 원소 */
  element: SpellElement;
  /** 이중 원소 부속성 (아이콘 투톤용, 있을 때만) */
  elementSecondary?: SpellElement;
  /** 폼 — 인벤토리 아이콘·정렬용. 시퀀스는 undefined */
  form?: SpellForm;
  /** 크기 — 아이콘 규모·정렬용 */
  size?: SpellSpec['size'];
  /** 사람이 읽는 한 줄 요약 — 기록 시점에 미리 만들어 저장 (UI는 렌더만) */
  summary: string;
  /** 판정 위력 (첫 발견 시점) */
  power: number;
  /** LLM 플레이버 텍스트 (있을 때만) */
  flavor?: string;
  firstCastAt: number;
  lastCastAt: number;
  castCount: number;
}

export const CODEX_CONFIG = {
  storageKey: 'incant:codex:v1',
  /** 저장 상한 — 초과 시 가장 오래 안 쓴 항목부터 밀려난다 */
  maxEntries: 120,
} as const;

const SIZE_LABELS: Record<SpellSpec['size'], string> = {
  small: '소형', medium: '중형', large: '대형', huge: '초대형',
};

const STATUS_LABELS: Record<string, string> = {
  burn: '화상', freeze: '빙결', shock: '감전',
  slow: '둔화', knockback: '넉백', weaken: '약화',
};

/** 단일 주문 → 도감 항목. 요약은 판정 스펙을 한국어로 압축한다. */
export function codexEntryFromSpec(spec: SpellSpec, at: number): CodexEntry {
  const parts = [
    ELEMENT_LABELS[spec.element_primary]
      + (spec.element_secondary ? `+${ELEMENT_LABELS[spec.element_secondary]}` : ''),
    FORM_LABELS[spec.form],
    SIZE_LABELS[spec.size],
    `위력 ${spec.power}`,
  ];
  const statuses = spec.status.map((s) => STATUS_LABELS[s] ?? s);
  if (statuses.length > 0) parts.push(statuses.join('·'));
  if (spec.shape && spec.shape.kind !== 'arc') parts.push('형상 설계');
  if (spec.behavior) parts.push('행동 설계');
  return {
    name: spec.name,
    element: spec.element_primary,
    elementSecondary: spec.element_secondary ?? undefined,
    form: spec.form,
    size: spec.size,
    summary: parts.join(' · '),
    power: spec.power,
    flavor: spec.flavor,
    firstCastAt: at,
    lastCastAt: at,
    castCount: 1,
  };
}

/** 영창 시퀀스 → 도감 항목 (다단계 주문도 "내가 쓴 마법"이다). */
export function codexEntryFromSequence(
  plan: { name: string; power: number; sequences: readonly unknown[] },
  element: SpellElement,
  at: number,
): CodexEntry {
  return {
    name: plan.name,
    element,
    summary: `${plan.sequences.length}단계 영창 시퀀스 · 위력 ${plan.power}`,
    power: plan.power,
    firstCastAt: at,
    lastCastAt: at,
    castCount: 1,
  };
}

/**
 * 항목 병합 (순수) — 같은 이름은 시전 횟수만 쌓고 **첫 발견 기록을 보존**한다.
 * 도감은 발견의 기록이므로, 같은 이름이 나중에 다르게 판정돼도 처음 모습을 지킨다.
 * 새 이름은 맨 앞에 붙고, 상한 초과 시 가장 오래 안 쓴 항목부터 밀려난다.
 */
export function mergeCodexEntry(
  entries: readonly CodexEntry[],
  entry: CodexEntry,
  maxEntries = CODEX_CONFIG.maxEntries,
): CodexEntry[] {
  const existing = entries.find((e) => e.name === entry.name);
  if (existing) {
    return entries.map((e) => (e.name === entry.name
      ? { ...e, castCount: e.castCount + 1, lastCastAt: Math.max(e.lastCastAt, entry.lastCastAt) }
      : e));
  }
  const next = [entry, ...entries];
  if (next.length <= maxEntries) return next;
  const evict = next.reduce((a, b) => (a.lastCastAt <= b.lastCastAt ? a : b));
  return next.filter((e) => e !== evict);
}

/** 최신 사용순 정렬 (UI 표시용, 원본 불변) */
export function sortCodexForDisplay(entries: readonly CodexEntry[]): CodexEntry[] {
  return [...entries].sort((a, b) => b.lastCastAt - a.lastCastAt);
}

export type CodexSortMode = 'recent' | 'discovered' | 'power' | 'element' | 'form';

/** 원소·폼 정렬을 위한 고정 순서 (팔레트/스키마 순 — 같은 계열끼리 모이게) */
const ELEMENT_ORDER: SpellElement[] = [
  'fire', 'water', 'lightning', 'ice', 'earth', 'wind', 'light', 'dark',
];
const FORM_ORDER: SpellForm[] = [
  'bolt', 'beam', 'wave', 'nova', 'rain', 'wall', 'cage', 'orbit', 'summon', 'buff', 'zone', 'chain',
];

/**
 * 인벤토리 정렬 (순수, 원본 불변). 동점 시 위력 내림차순 → 이름으로 안정화한다.
 * 폼이 없는 항목(시퀀스)은 폼 정렬에서 맨 뒤로 모은다.
 */
export function sortCodex(entries: readonly CodexEntry[], mode: CodexSortMode): CodexEntry[] {
  const byName = (a: CodexEntry, b: CodexEntry): number => a.name.localeCompare(b.name);
  const byPowerThenName = (a: CodexEntry, b: CodexEntry): number => (
    b.power - a.power || byName(a, b)
  );
  const rank = <T>(order: readonly T[], v: T | undefined): number => {
    const i = v === undefined ? -1 : order.indexOf(v);
    return i < 0 ? order.length : i;
  };
  const copy = [...entries];
  switch (mode) {
    case 'power':
      return copy.sort(byPowerThenName);
    case 'discovered':
      return copy.sort((a, b) => a.firstCastAt - b.firstCastAt || byName(a, b));
    case 'element':
      return copy.sort((a, b) => (
        rank(ELEMENT_ORDER, a.element) - rank(ELEMENT_ORDER, b.element) || byPowerThenName(a, b)
      ));
    case 'form':
      return copy.sort((a, b) => (
        rank(FORM_ORDER, a.form) - rank(FORM_ORDER, b.form) || byPowerThenName(a, b)
      ));
    case 'recent':
    default:
      return copy.sort((a, b) => b.lastCastAt - a.lastCastAt || byName(a, b));
  }
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 손상된 저장분은 빈 도감으로 — 도감 때문에 게임이 멈추면 안 된다. */
export function loadCodex(storage: StorageLike): CodexEntry[] {
  try {
    const raw = storage.getItem(CODEX_CONFIG.storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e): e is CodexEntry => (
      typeof e === 'object' && e !== null
      && typeof (e as CodexEntry).name === 'string'
      && typeof (e as CodexEntry).summary === 'string'
      && typeof (e as CodexEntry).castCount === 'number'
    ));
  } catch {
    return [];
  }
}

export function saveCodex(storage: StorageLike, entries: readonly CodexEntry[]): void {
  try {
    storage.setItem(CODEX_CONFIG.storageKey, JSON.stringify(entries));
  } catch {
    // 저장 실패(용량 등)는 조용히 무시 — 도감은 부가 기록이다
  }
}

/** 기록 원샷 헬퍼 — 씬에서 이것만 부른다. */
export function recordCodexEntry(storage: StorageLike, entry: CodexEntry): void {
  saveCodex(storage, mergeCodexEntry(loadCodex(storage), entry));
}
