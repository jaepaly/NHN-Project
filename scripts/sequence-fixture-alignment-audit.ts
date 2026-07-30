import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SEQUENCE_FIXTURE_CATALOG } from '../src/spell/sequenceFixtureCatalog';
import { debugSpellPlan } from '../src/spell/sequencePlan';

const WORKER_URL = process.env.WORKER_URL
  ?? 'https://incant-judge-proxy.incant-judge-proxy.workers.dev';
const GAP_MS = 4300;
const TIMEOUT_MS = 12000;
const OUTPUT_PATH = resolve(
  process.env.OUTPUT_PATH ?? 'docs/SEQUENCE_FIXTURE_ALIGNMENT_BASELINE.json',
);

const SHOWCASE_INPUTS = [
  '적막을 가르는 섬광',
  '도망치는 별',
  '화산맥의 기상',
  '서리 거울',
  '사슬을 끊는 파도',
  '천둥새의 비행',
  '태풍의 회랑',
  '그림자 바느질',
  '백야의 성역',
  '모래시계의 수호',
  '찰나의 전이',
  '사방의 포화',
  '유성우를 거슬러',
  '얼어붙은 추격전',
  '용이 잠든 산',
  '심장이 두 번 뛰는 동안',
  '별자리를 꿰매는 바늘',
  '무지개를 한 자루 창으로',
  '불사조의 낙화',
  '뇌광의 사냥',
  '겨울 정원의 폐막',
  '일식의 왈츠',
  '최후의 성채',
  '해일의 역류',
  '폭풍의 눈',
  '심연의 군세',
  '새벽의 순례',
  '허공답보',
  '유리별의 사격',
  '팔원소 대합창',
] as const;

const SHOWCASE_FIXTURES = SHOWCASE_INPUTS.map((input, index) => {
  const catalog = SEQUENCE_FIXTURE_CATALOG.find((fixture) => fixture.input === input);
  const plan = catalog?.plan ?? debugSpellPlan(input);
  if (!plan) throw new Error(`Missing initial showcase plan: ${input}`);
  return {
    key: catalog?.key ?? `showcase-${String(index + 1).padStart(2, '0')}`,
    input,
    intent: catalog?.intent ?? 'Initial 30-case showcase plan from debugSpellPlan.',
    schemaFocus: catalog?.schemaFocus ?? ['initial showcase'],
    plan,
  };
});

type JsonRecord = Record<string, unknown>;

interface AuditResult {
  index: number;
  key: string;
  input: string;
  intent: string;
  schemaFocus: readonly string[];
  expected: unknown;
  actual: unknown;
  status: number | null;
  elapsedMs: number;
  error?: string;
}

interface AuditFile {
  workerUrl: string;
  generatedAt: string;
  results: AuditResult[];
}

function readExisting(): AuditFile {
  if (!existsSync(OUTPUT_PATH)) {
    return { workerUrl: WORKER_URL, generatedAt: new Date().toISOString(), results: [] };
  }
  return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')) as AuditFile;
}

async function judge(text: string): Promise<{
  actual: unknown;
  status: number | null;
  elapsedMs: number;
  error?: string;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://jaepaly.github.io',
      },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const raw = await response.text();
    let actual: unknown = raw;
    try {
      actual = JSON.parse(raw) as JsonRecord;
    } catch {
      // Preserve a non-JSON upstream response verbatim for diagnosis.
    }
    return {
      actual,
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      ...(!response.ok ? { error: `HTTP ${response.status}` } : {}),
    };
  } catch (error) {
    return {
      actual: null,
      status: null,
      elapsedMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const offset = Number.parseInt(process.argv[2] ?? '0', 10);
  const count = Number.parseInt(process.argv[3] ?? String(SHOWCASE_FIXTURES.length), 10);
  const selected = SHOWCASE_FIXTURES.slice(offset, offset + count);
  const audit = readExisting();
  const byKey = new Map(audit.results.map((result) => [result.key, result]));

  for (let localIndex = 0; localIndex < selected.length; localIndex += 1) {
    const fixture = selected[localIndex];
    const index = offset + localIndex;
    const response = await judge(fixture.input);
    const result: AuditResult = {
      index: index + 1,
      key: fixture.key,
      input: fixture.input,
      intent: fixture.intent,
      schemaFocus: fixture.schemaFocus,
      expected: fixture.plan,
      ...response,
    };
    byKey.set(fixture.key, result);
    console.log(
      `${String(index + 1).padStart(2, '0')}. ${fixture.input} `
      + `${response.status ?? 'ERR'} ${response.elapsedMs}ms`,
    );
    if (localIndex < selected.length - 1) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, GAP_MS));
    }
  }

  audit.workerUrl = WORKER_URL;
  audit.generatedAt = new Date().toISOString();
  audit.results = [...byKey.values()].sort((left, right) => left.index - right.index);
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  console.log(`saved ${audit.results.length}/${SHOWCASE_FIXTURES.length}: ${OUTPUT_PATH}`);
}

void main();
