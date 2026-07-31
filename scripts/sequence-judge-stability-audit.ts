import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKER_URL = process.env.WORKER_URL
  ?? 'https://incant-judge-proxy.incant-judge-proxy.workers.dev';
const OUTPUT_PATH = resolve(
  process.env.OUTPUT_PATH ?? 'docs/SEQUENCE_JUDGE_STABILITY.json',
);
const GAP_MS = Number.parseInt(process.env.GAP_MS ?? '4300', 10);
const TIMEOUT_MS = Number.parseInt(process.env.TIMEOUT_MS ?? '12000', 10);
const REPEATS = Number.parseInt(process.env.REPEATS ?? '5', 10);

const DEFAULT_INPUTS = [
  '찰나의 전이',
  '심장이 두 번 뛰는 동안',
  '허공답보',
  '팔원소 대합창',
] as const;
const INPUTS: readonly string[] = process.env.INPUTS_JSON
  ? JSON.parse(process.env.INPUTS_JSON) as string[]
  : DEFAULT_INPUTS;

interface Attempt {
  input: string;
  repetition: number;
  status: number | null;
  elapsedMs: number;
  geminiElapsedMs?: number;
  geminiAttempts?: number;
  promptTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  retryReason?: string;
  diagnosticVersion?: number;
  actual: unknown;
  error?: string;
}

interface StabilityFile {
  workerUrl: string;
  generatedAt: string;
  repeats: number;
  attempts: Attempt[];
}

function readExisting(): StabilityFile {
  if (!existsSync(OUTPUT_PATH)) {
    return {
      workerUrl: WORKER_URL,
      generatedAt: new Date().toISOString(),
      repeats: REPEATS,
      attempts: [],
    };
  }
  return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')) as StabilityFile;
}

async function judge(input: string): Promise<Omit<Attempt, 'input' | 'repetition'>> {
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
      body: JSON.stringify({ text: input }),
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
      status: response.status,
      elapsedMs: Math.round(performance.now() - startedAt),
      geminiElapsedMs: Math.round(Number.parseFloat(
        response.headers.get('Server-Timing')?.match(/gemini;dur=([\d.]+)/)?.[1] ?? '0',
      )),
      geminiAttempts: Number.parseInt(
        response.headers.get('X-Incant-Judge-Attempts') ?? '0',
        10,
      ),
      promptTokens: Number.parseInt(
        response.headers.get('X-Incant-Prompt-Tokens') ?? '0',
        10,
      ),
      outputTokens: Number.parseInt(
        response.headers.get('X-Incant-Output-Tokens') ?? '0',
        10,
      ),
      cachedTokens: Number.parseInt(
        response.headers.get('X-Incant-Cached-Tokens') ?? '0',
        10,
      ),
      retryReason: response.headers.get('X-Incant-Judge-Retry') ?? undefined,
      diagnosticVersion: Number.parseInt(
        response.headers.get('X-Incant-Diagnostic-Version') ?? '0',
        10,
      ),
      actual,
      ...(!response.ok ? { error: `HTTP ${response.status}` } : {}),
    };
  } catch (error) {
    return {
      status: null,
      elapsedMs: Math.round(performance.now() - startedAt),
      actual: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const offset = Number.parseInt(process.argv[2] ?? '0', 10);
  const count = Number.parseInt(process.argv[3] ?? String(INPUTS.length), 10);
  const selected = INPUTS.slice(offset, offset + count);
  const output = readExisting();
  const attempts = new Map(
    output.attempts.map((item) => [`${item.input}\u0000${item.repetition}`, item]),
  );
  let callIndex = 0;
  const callTotal = selected.length * REPEATS;

  for (const input of selected) {
    for (let repetition = 1; repetition <= REPEATS; repetition += 1) {
      const response = await judge(input);
      const attempt: Attempt = { input, repetition, ...response };
      attempts.set(`${input}\u0000${repetition}`, attempt);
      callIndex += 1;
      console.log(`${input} #${repetition}: ${response.status ?? 'ERR'} ${response.elapsedMs}ms`);
      if (callIndex < callTotal) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, GAP_MS));
      }
    }
  }

  output.workerUrl = WORKER_URL;
  output.generatedAt = new Date().toISOString();
  output.repeats = REPEATS;
  output.attempts = [...attempts.values()].sort((left, right) => {
    const inputOrder = INPUTS.indexOf(left.input) - INPUTS.indexOf(right.input);
    return inputOrder !== 0 ? inputOrder : left.repetition - right.repetition;
  });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  console.log(`saved ${output.attempts.length}/${INPUTS.length * REPEATS}: ${OUTPUT_PATH}`);
}

void main();
