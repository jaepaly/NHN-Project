import type { SpellElement } from './types';

/**
 * 진화·융합 작명 (Phase 3.5 R2 ⑤).
 * 각인 주문 진화·정령 융합 시 결과물의 격상 주문명을 짓는다.
 * 프록시 `/evolve-name`(라이브 Gemini) 우선, 실패 시 템플릿 폴백 — **작명은 반드시 성공한다**.
 * (PROGRESSION_DESIGN.md §5 — 총괄 성장 시스템 ④ 진화·융합이 소비)
 */

/** 작명 요청 — 각인 진화(evolve)와 정령 융합(fuse)이 공유하는 계약 */
export interface EvolveNameRequest {
  kind: 'evolve' | 'fuse';
  /** 진화: 원래 주문명 (예: "화염구") */
  baseName?: string;
  /** 관련 원소 1~2개 (융합은 2개) */
  elements: SpellElement[];
  /** 진화 단계 (선택) */
  level?: number;
}

const MAX_NAME_LEN = 12;
const DEFAULT_PROXY_URL = 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const EVOLVE_NAME_PATH = '/evolve-name';
const TIMEOUT_MS = 2500;

/** 작명 프롬프트 버전 — worker.js EVOLVE_NAME_PROMPT 변경 시 올려 옛 캐시 무효화 */
export const EVOLVE_NAME_PROMPT_VERSION = 'name-v1.0';
/** 캐시 접두사 (판정 캐시와 같은 버전 접두사 패턴, incant:판정:...와 정렬) */
const CACHE_PREFIX = `incant:evolvename:${EVOLVE_NAME_PROMPT_VERSION}:`;

/** 작명 재료용 원소 별칭 — 대사용(bossLine)과 달리 이름에 어울리는 단어 선택 */
const ELEMENT_NAME_KO: Record<SpellElement, string> = {
  fire: '불꽃', water: '해류', lightning: '뇌전', ice: '서리',
  earth: '대지', wind: '질풍', light: '광휘', dark: '심연',
};

/** 이름 정규화: 공백 정리 · 따옴표/괄호 제거 · 12자 제한. 무효면 null. */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'『「]+|["'』」]+$/g, '');
  if (t.length === 0) return null;
  return t.slice(0, MAX_NAME_LEN);
}

/**
 * 폴백 템플릿 작명 — 프록시 없이도 항상 유효한 이름을 낸다.
 * (설계 문서 §5: 『{원소} 대격변』류)
 */
export function templateEvolvedName(req: EvolveNameRequest): string {
  const [first, second] = req.elements;
  if (req.kind === 'fuse' && first && second) {
    return sanitizeName(`${ELEMENT_NAME_KO[first]}·${ELEMENT_NAME_KO[second]} 융합`) ?? '융합체';
  }
  const element = first ? ELEMENT_NAME_KO[first] : '마력';
  return sanitizeName(`${element} 대격변`) ?? '대격변';
}

/**
 * 캐시 키 — `kind:정렬된원소:baseName`.
 * 원소를 정렬해 `fire+lightning`과 `lightning+fire`가 같은 융합=같은 이름을 얻는다.
 */
export function evolveCacheKey(req: EvolveNameRequest): string {
  const elems = [...req.elements].sort().join(',');
  return `${req.kind}:${elems}:${req.baseName ?? ''}`;
}

/** 캐시 조회 — 저장된 이름을 재검증(sanitize)해 반환. 없거나 localStorage 불가면 null. */
function readNameCache(key: string): string | null {
  try {
    return sanitizeName(localStorage.getItem(CACHE_PREFIX + key));
  } catch {
    return null;
  }
}

/** 캐시 저장 — 유효 이름만. localStorage 가득참·비활성은 조용히 무시(선택적 기능). */
function writeNameCache(key: string, name: string): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, name);
  } catch {
    // 무시
  }
}

/**
 * 격상 주문명 생성. 캐시 조회 → 프록시 `/evolve-name` → 저장 → 실패 시 템플릿 폴백.
 * 동일 요청은 캐시로 같은 이름을 재사용한다(진화 결과 안정성). 항상 유효한 이름 반환(throw 없음).
 */
export async function getEvolvedName(
  req: EvolveNameRequest,
  proxyUrl: string = DEFAULT_PROXY_URL,
): Promise<string> {
  const key = evolveCacheKey(req);

  // 1) 캐시 히트 시 즉시 반환 (프록시 호출 없음 — 같은 진화=같은 이름)
  const cached = readNameCache(key);
  if (cached) return cached;

  // 2) 프록시 요청 (2.5초 타임아웃)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(proxyUrl + EVOLVE_NAME_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (res.ok) {
      const data = (await res.json()) as { name?: unknown };
      const name = sanitizeName(data?.name);
      if (name) {
        // 유효 결과만 캐시 (폴백은 저장 안 함 — 나중에 프록시 살면 진짜 이름 받도록)
        writeNameCache(key, name);
        return name;
      }
    }
  } catch {
    // 네트워크 오류·타임아웃·비정상 응답 — 아래 폴백
  } finally {
    clearTimeout(timer);
  }

  // 3) 폴백 — 무중단 보장 (캐시 저장 안 함)
  return templateEvolvedName(req);
}
