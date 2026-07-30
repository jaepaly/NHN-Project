import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKER_URL = process.env.WORKER_URL
  ?? 'https://incant-judge-proxy.incant-judge-proxy.workers.dev';
const EXPECTATIONS_PATH = resolve(
  process.env.EXPECTATIONS_PATH ?? 'docs/SEQUENCE_JUDGE_HELDOUT_EXPECTATIONS.json',
);
const OUTPUT_PATH = resolve(
  process.env.OUTPUT_PATH ?? 'docs/SEQUENCE_JUDGE_HELDOUT_CANDIDATE_17.json',
);
const GAP_MS = Number.parseInt(process.env.GAP_MS ?? '4300', 10);
const TIMEOUT_MS = Number.parseInt(process.env.TIMEOUT_MS ?? '12000', 10);

interface HeldoutCase {
  id: number;
  input: string;
  visualIntent: string;
}

interface ExpectationsFile {
  cases: HeldoutCase[];
}

interface AuditResult {
  index: number;
  key: string;
  input: string;
  intent: string;
  schemaFocus: string[];
  expected: null;
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
      actual = JSON.parse(raw) as unknown;
    } catch {
      // Preserve invalid upstream output for diagnosis.
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
  const expectations = JSON.parse(
    readFileSync(EXPECTATIONS_PATH, 'utf8'),
  ) as ExpectationsFile;
  const offset = Number.parseInt(process.argv[2] ?? '0', 10);
  const count = Number.parseInt(process.argv[3] ?? String(expectations.cases.length), 10);
  const selected = expectations.cases.slice(offset, offset + count);
  const audit = readExisting();
  const byKey = new Map(audit.results.map((result) => [result.key, result]));

  for (let localIndex = 0; localIndex < selected.length; localIndex += 1) {
    const entry = selected[localIndex];
    const index = offset + localIndex;
    const response = await judge(entry.input);
    const key = `heldout-${String(entry.id).padStart(2, '0')}`;
    byKey.set(key, {
      index: entry.id,
      key,
      input: entry.input,
      intent: entry.visualIntent,
      schemaFocus: ['held-out', 'candidate-17'],
      expected: null,
      ...response,
    });
    console.log(
      `${String(entry.id).padStart(2, '0')}. ${entry.input} `
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
  console.log(`saved ${audit.results.length}/${expectations.cases.length}: ${OUTPUT_PATH}`);
}

void main();
