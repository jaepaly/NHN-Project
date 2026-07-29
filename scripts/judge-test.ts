/**
 * 판정 테스트 헬퍼 — curl 인라인 한글 인코딩 트랩 회피용 (2026-07-27, #231 재발 방지).
 *
 * 왜: `curl -d '{"text":"한글"}'`은 Windows Git Bash가 한글 UTF-8을 깨뜨려 **가짜 fizzle**을
 * 만든다(3회 반복된 오진: 07-23 원조 · 이번 세션 · 총괄 #231). Node fetch는 항상 깨끗한
 * UTF-8을 보내고, 입력을 **파일에서 읽으므로**(셸 인자·curl 미경유) 인코딩이 깨질 구간이 없다.
 *
 * 실행: `npm run judge:test`  (scripts/judge-test.txt의 문장들을 라이브 워커로 판정)
 *   - `WORKER_URL=... npm run judge:test` 로 프록시 교체 가능.
 *
 * 격리: 판정 메커니즘(worker.js·geminiJudge·mockJudge·validate)을 **하나도 건드리지 않는다**.
 * scripts/ 전용 외부 호출자라 게임(src/)·빌드·CI와 무관하다. **CI에서 안 돌게 이름은 `judge:*`**
 * (test:* 가 아니라 run-all-tests.mjs가 안 집는다 — 라이브 워커·쿼터 보호).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WORKER_URL =
  process.env.WORKER_URL || 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const ORIGIN = 'https://jaepaly.github.io';
const PACING_MS = 3500; // 워커 15/분 IP 리미터 아래로 (지연 ~1.2s + 3.5s = ~13/분)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** judge-test.txt 를 읽어 문장 목록으로. '#' 줄·빈 줄 무시, 앞뒤 공백 제거. */
function readSentences(): string[] {
  const path = resolve(process.cwd(), 'scripts/judge-test.txt');
  const raw = readFileSync(path, 'utf8');
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

interface JudgeResult { status: number; body: Record<string, unknown>; ms: number; }

async function judge(text: string): Promise<JudgeResult> {
  const started = Date.now();
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ text }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body, ms: Date.now() - started };
}

/** 판정 결과 한 줄 요약 — 사람이 읽기 좋게. */
function describe(r: JudgeResult): string {
  const secs = `${(r.ms / 1000).toFixed(2)}s`;
  if (r.status !== 200) {
    const err = (r.body.error ?? r.body.status ?? 'error') as string;
    return `⚠️  ${err} (HTTP ${r.status}) · ${secs}`;
  }
  const d = r.body.disposition as string | undefined;
  if (d === 'fizzle') return `❌ fizzle (${r.body.reason ?? ''}) · ${secs}`;
  if (d === 'blocked') return `🚫 blocked · ${secs}`;
  if (d === 'cast') {
    const plan = r.body.spell_plan as { name?: string; sequences?: unknown[] } | undefined;
    if (plan) return `✅ cast · SEQ(${plan.sequences?.length ?? '?'}단계) · ${plan.name ?? ''} · ${secs}`;
    const spell = r.body.spell as
      | { name?: string; element_primary?: string; form?: string; power?: number }
      | undefined;
    return `✅ cast · ${spell?.name ?? ''} · ${spell?.element_primary}/${spell?.form} · power ${spell?.power} · ${secs}`;
  }
  return `? ${JSON.stringify(r.body).slice(0, 80)} · ${secs}`;
}

async function main(): Promise<void> {
  const sentences = readSentences();
  if (sentences.length === 0) {
    console.log('scripts/judge-test.txt 에 문장이 없다 — 한 줄에 하나씩 넣고 다시 실행.');
    return;
  }
  console.log(`판정 테스트 — ${WORKER_URL}\n${sentences.length}문장 · ${PACING_MS / 1000}s 간격(15/분 리미터 회피)\n`);
  for (let i = 0; i < sentences.length; i += 1) {
    const text = sentences[i];
    try {
      const r = await judge(text);
      console.log(`${describe(r)}   « ${text}`);
    } catch (err) {
      console.log(`⚠️  예외: ${String(err)}   « ${text}`);
    }
    if (i < sentences.length - 1) await sleep(PACING_MS);
  }
}

await main();
