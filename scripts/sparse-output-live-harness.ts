import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateJudgement } from '../src/spell/validate';

type Phase = 'smoke' | 'quality' | 'latency';
type ExpectedMode = 'sequence' | 'single';

interface TestCase {
  text: string;
  expected: ExpectedMode;
  group: 'smoke' | 'public' | 'heldout' | 'latency';
  explicitComplex?: boolean;
}

interface Arm {
  name: 'baseline' | 'candidate';
  url: string;
}

interface Result {
  trial: string;
  arm: Arm['name'];
  text: string;
  expected: ExpectedMode;
  group: TestCase['group'];
  status: number | null;
  elapsedMs: number;
  responseBytes: number;
  valid: boolean;
  disposition: string | null;
  mode: ExpectedMode | 'other';
  sequences: number;
  behaviors: number;
  effects: string[];
  unauthorizedSupport: string[];
  error?: string;
  raw: string;
}

const phase = (process.env.PHASE || 'smoke') as Phase;
assert(['smoke', 'quality', 'latency'].includes(phase), `알 수 없는 PHASE: ${phase}`);

const GAP_MS = 4300;
const TIMEOUT_MS = 12_000;
const MAX_CALLS = 94;
const ORIGIN = 'https://jaepaly.github.io';

const baseline: Arm = {
  name: 'baseline',
  url: process.env.BASELINE_URL || 'https://incant-judge-proxy.diawodbsdot.workers.dev',
};
const candidate: Arm = {
  name: 'candidate',
  url: process.env.CANDIDATE_URL || 'https://sparse-output-v215-incant-judge-proxy.diawodbsdot.workers.dev',
};

const smokeCases: TestCase[] = [
  { text: '왼쪽으로 피한 뒤 번개를 세 번 내리친다', expected: 'sequence', group: 'smoke', explicitComplex: true },
  { text: '얼음 장벽을 세우면서 번개를 쏜다', expected: 'sequence', group: 'smoke', explicitComplex: true },
  { text: '적에게 파고들어 칼날로 벤다', expected: 'sequence', group: 'smoke', explicitComplex: true },
  { text: '불사조의 낙화', expected: 'sequence', group: 'smoke' },
  { text: '심장이 두 번 뛰는 동안', expected: 'sequence', group: 'smoke' },
  { text: '팔원소 대합창', expected: 'sequence', group: 'smoke' },
  { text: '서리 거울', expected: 'single', group: 'smoke' },
  { text: '파이어볼', expected: 'single', group: 'smoke' },
];

const publicSequence = [
  '도망치는 별', '화산맥의 기상', '천둥새의 비행', '태풍의 회랑', '그림자 바느질',
  '찰나의 전이', '사방의 포화', '유성우를 거슬러', '얼어붙은 추격전', '심장이 두 번 뛰는 동안',
  '별자리를 꿰매는 바늘', '불사조의 낙화', '뇌광의 사냥', '겨울 정원의 폐막', '일식의 왈츠',
  '해일의 역류', '새벽의 순례', '허공답보', '팔원소 대합창',
] as const;
const publicSingle = [
  '적막을 가르는 섬광', '서리 거울', '사슬을 끊는 파도', '백야의 성역', '모래시계의 수호',
  '용이 잠든 산', '무지개를 한 자루 창으로', '최후의 성채', '폭풍의 눈', '심연의 군세', '유리별의 사격',
] as const;
const heldoutSequence = [
  '잿빛 달이 부서진 뒤 파편들이 적을 추격한다',
  '번개 고리를 펼치며 오른쪽으로 도약해 낙뢰를 꽂는다',
  '세 차례 울리는 빙결 종소리',
  '붉은 혜성의 귀환',
  '파도 위를 달리는 검무',
  '어둠이 갈라지고 그 틈에서 별빛이 쏟아진다',
  '모래 폭풍 속을 후퇴하며 불꽃 화살을 난사한다',
  '새벽을 깨우는 천둥의 행진',
] as const;
const heldoutSingle = [
  '한 개의 검은 태양', '고요한 수정 구체', '거대한 화염구', '굳어버린 시간의 방패',
] as const;

const qualityCases: TestCase[] = [
  ...publicSequence.map((text) => ({ text, expected: 'sequence' as const, group: 'public' as const })),
  ...publicSingle.map((text) => ({ text, expected: 'single' as const, group: 'public' as const })),
  ...heldoutSequence.map((text) => ({ text, expected: 'sequence' as const, group: 'heldout' as const })),
  ...heldoutSingle.map((text) => ({ text, expected: 'single' as const, group: 'heldout' as const })),
];

const latencyCases: TestCase[] = [
  smokeCases[0], smokeCases[1], smokeCases[2], smokeCases[3], smokeCases[6], smokeCases[7],
].map((item) => ({ ...item, group: 'latency' }));

let lastRequestStarted = 0;
let callCount = 0;

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

async function pace(): Promise<void> {
  const remaining = GAP_MS - (Date.now() - lastRequestStarted);
  if (remaining > 0) await sleep(remaining);
  lastRequestStarted = Date.now();
}

function listedEffects(raw: unknown): string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  const object = raw as Record<string, any>;
  const effects: string[] = [];
  if (typeof object.spell?.effect === 'string') effects.push(object.spell.effect);
  for (const sequence of object.spell_plan?.sequences ?? []) {
    for (const behavior of sequence?.behaviors ?? []) {
      if (behavior?.type === 'form' && typeof behavior.spec?.effect === 'string') {
        effects.push(behavior.spec.effect);
      }
    }
  }
  return effects;
}

function unauthorizedSupport(text: string, effects: string[]): string[] {
  const intent = {
    heal: /치유|회복|재생|낫게/,
    shield: /방패|보호막|수호|성역|성채|장벽/,
    buff: /강화|가호|축복|고양/,
  } as const;
  return [...new Set(effects.filter((effect) => (
    effect in intent && !intent[effect as keyof typeof intent].test(text)
  )))];
}

async function invoke(arm: Arm, testCase: TestCase, trial: string): Promise<Result> {
  assert(++callCount <= MAX_CALLS, `호출 상한 ${MAX_CALLS}회를 넘었습니다.`);
  await pace();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const started = performance.now();
  let status: number | null = null;
  let raw = '';
  try {
    const response = await fetch(arm.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ text: testCase.text }),
      signal: controller.signal,
    });
    status = response.status;
    raw = await response.text();
    const elapsedMs = Math.round(performance.now() - started);
    if (status === 429) throw new Error('HTTP 429: quota/rate limit — 즉시 중단');
    if (!response.ok) throw new Error(`HTTP ${status}`);

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error('invalid JSON');
    }
    const judgement = validateJudgement(parsed);
    const valid = judgement !== null;
    const disposition = judgement?.disposition ?? null;
    const plan = judgement?.disposition === 'cast' ? judgement.plan : undefined;
    const mode: Result['mode'] = disposition !== 'cast'
      ? 'other'
      : plan ? 'sequence' : 'single';
    const sequences = plan?.sequences.length ?? 0;
    const behaviors = plan?.sequences.reduce((sum, sequence) => sum + sequence.behaviors.length, 0) ?? 0;
    const effects = listedEffects(parsed);
    return {
      trial,
      arm: arm.name,
      text: testCase.text,
      expected: testCase.expected,
      group: testCase.group,
      status,
      elapsedMs,
      responseBytes: Buffer.byteLength(raw),
      valid,
      disposition,
      mode,
      sequences,
      behaviors,
      effects,
      unauthorizedSupport: unauthorizedSupport(testCase.text, effects),
      raw,
    };
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - started);
    const message = error instanceof Error ? error.message : String(error);
    return {
      trial,
      arm: arm.name,
      text: testCase.text,
      expected: testCase.expected,
      group: testCase.group,
      status,
      elapsedMs,
      responseBytes: Buffer.byteLength(raw),
      valid: false,
      disposition: null,
      mode: 'other',
      sequences: 0,
      behaviors: 0,
      effects: [],
      unauthorizedSupport: [],
      error: message,
      raw,
    };
  } finally {
    clearTimeout(timer);
  }
}

function percentile(values: number[], fraction: number): number {
  assert(values.length > 0);
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
}

function summarize(results: Result[]) {
  const arms = [...new Set(results.map((result) => result.arm))];
  return Object.fromEntries(arms.map((arm) => {
    const rows = results.filter((result) => result.arm === arm);
    const expectedSequence = rows.filter((row) => row.expected === 'sequence');
    const expectedSingle = rows.filter((row) => row.expected === 'single');
    return [arm, {
      calls: rows.length,
      valid: rows.filter((row) => row.valid).length,
      sequenceCorrect: `${expectedSequence.filter((row) => row.mode === 'sequence').length}/${expectedSequence.length}`,
      singleCorrect: `${expectedSingle.filter((row) => row.mode === 'single').length}/${expectedSingle.length}`,
      unauthorizedSupport: rows.reduce((sum, row) => sum + row.unauthorizedSupport.length, 0),
      p50Ms: percentile(rows.map((row) => row.elapsedMs), 0.5),
      p90Ms: percentile(rows.map((row) => row.elapsedMs), 0.9),
      medianBytes: percentile(rows.map((row) => row.responseBytes), 0.5),
      over2500Ms: rows.filter((row) => row.elapsedMs > 2500).length,
      over3200Ms: rows.filter((row) => row.elapsedMs > 3200).length,
    }];
  }));
}

function printResult(result: Result): void {
  console.log(
    `${result.trial.padEnd(5)} ${result.arm.padEnd(9)} ${result.elapsedMs}ms `
    + `${result.responseBytes}B ${result.mode}(${result.sequences}) ${result.text}`,
  );
}

function immediateFailure(result: Result, testCase: TestCase): string | null {
  if (result.arm !== 'candidate') return null;
  if (!result.valid) return `${testCase.text}: ${result.error ?? 'validator 실패'}`;
  if (testCase.explicitComplex && result.mode !== 'sequence') {
    return `명시 복합이 single: ${testCase.text}`;
  }
  if (testCase.expected === 'single' && result.mode !== 'single') {
    return `단일이 sequence: ${testCase.text}`;
  }
  return null;
}

async function runSmoke(): Promise<{ results: Result[]; fatal?: string }> {
  const results: Result[] = [];
  for (let index = 0; index < smokeCases.length; index++) {
    const testCase = smokeCases[index];
    const arms = index % 2 === 0 ? [baseline, candidate] : [candidate, baseline];
    for (const arm of arms) {
      const result = await invoke(arm, testCase, `S${index + 1}`);
      results.push(result);
      printResult(result);
      if (result.status === 429) return { results, fatal: result.error };
      const failure = immediateFailure(result, testCase);
      if (failure) return { results, fatal: failure };
    }
    const pair = results.filter((row) => row.trial === `S${index + 1}`);
    const baselineRow = pair.find((row) => row.arm === 'baseline');
    const candidateRow = pair.find((row) => row.arm === 'candidate');
    assert(baselineRow && candidateRow);
    if (candidateRow.unauthorizedSupport.length > baselineRow.unauthorizedSupport.length) {
      return {
        results,
        fatal: `무단 지원 효과 증가: baseline ${baselineRow.unauthorizedSupport.length}`
          + ` → candidate ${candidateRow.unauthorizedSupport.length} (${testCase.text})`,
      };
    }
  }

  const baselineRows = results.filter((row) => row.arm === 'baseline');
  const candidateRows = results.filter((row) => row.arm === 'candidate');
  const baselineCorrect = baselineRows.filter((row) => row.mode === row.expected).length;
  const candidateCorrect = candidateRows.filter((row) => row.mode === row.expected).length;
  const candidateAbstract = candidateRows.slice(3, 6).filter((row) => row.mode === 'sequence').length;
  if (candidateAbstract < 2) return { results, fatal: `추상·수사 sequence ${candidateAbstract}/3 < 2/3` };
  if (candidateCorrect < baselineCorrect) {
    return { results, fatal: `candidate mode 정답 ${candidateCorrect}/8 < baseline ${baselineCorrect}/8` };
  }
  return { results };
}

async function runQuality(): Promise<{ results: Result[]; fatal?: string }> {
  const results: Result[] = [];
  for (let index = 0; index < qualityCases.length; index++) {
    const testCase = qualityCases[index];
    const result = await invoke(candidate, testCase, `Q${index + 1}`);
    results.push(result);
    printResult(result);
    if (result.status === 429) return { results, fatal: result.error };
  }

  const publicSeq = results.slice(0, 19);
  const publicSingleRows = results.slice(19, 30);
  const heldSeq = results.slice(30, 38);
  const heldSingleRows = results.slice(38, 42);
  const checks = [
    { label: 'valid', actual: results.filter((row) => row.valid).length, minimum: 42 },
    { label: 'public sequence', actual: publicSeq.filter((row) => row.mode === 'sequence').length, minimum: 16 },
    { label: 'public single', actual: publicSingleRows.filter((row) => row.mode === 'single').length, minimum: 10 },
    { label: 'heldout sequence', actual: heldSeq.filter((row) => row.mode === 'sequence').length, minimum: 6 },
    { label: 'heldout single', actual: heldSingleRows.filter((row) => row.mode === 'single').length, minimum: 4 },
  ];
  const failed = checks.find((check) => check.actual < check.minimum);
  if (failed) return { results, fatal: `${failed.label} ${failed.actual} < ${failed.minimum}` };
  const unauthorized = results.reduce((sum, row) => sum + row.unauthorizedSupport.length, 0);
  if (unauthorized > 0) return { results, fatal: `무단 지원 효과 ${unauthorized}건` };
  return { results };
}

async function runLatency(): Promise<{ results: Result[]; fatal?: string }> {
  const results: Result[] = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    for (let index = 0; index < latencyCases.length; index++) {
      const testCase = latencyCases[index];
      const arms = (repeat + index) % 2 === 0 ? [baseline, candidate] : [candidate, baseline];
      for (const arm of arms) {
        const result = await invoke(arm, testCase, `L${repeat + 1}-${index + 1}`);
        results.push(result);
        printResult(result);
        if (!result.valid) return { results, fatal: `${arm.name} invalid: ${testCase.text} (${result.error ?? 'validator'})` };
      }
    }
  }

  const baselineRows = results.filter((row) => row.arm === 'baseline');
  const candidateRows = results.filter((row) => row.arm === 'candidate');
  const differences = baselineRows.map((baselineRow) => {
    const candidateRow = candidateRows.find((row) => row.trial === baselineRow.trial);
    assert(candidateRow);
    return baselineRow.elapsedMs - candidateRow.elapsedMs;
  });
  const pairedMedianMs = percentile(differences, 0.5);
  const baselineMedian = percentile(baselineRows.map((row) => row.elapsedMs), 0.5);
  const candidateMedian = percentile(candidateRows.map((row) => row.elapsedMs), 0.5);
  const improvementRatio = (baselineMedian - candidateMedian) / baselineMedian;
  const baselineP90 = percentile(baselineRows.map((row) => row.elapsedMs), 0.9);
  const candidateP90 = percentile(candidateRows.map((row) => row.elapsedMs), 0.9);
  const baselineBytes = percentile(baselineRows.map((row) => row.responseBytes), 0.5);
  const candidateBytes = percentile(candidateRows.map((row) => row.responseBytes), 0.5);
  const byteReduction = 1 - candidateBytes / baselineBytes;
  const baselineOver2500 = baselineRows.filter((row) => row.elapsedMs > 2500).length;
  const candidateOver2500 = candidateRows.filter((row) => row.elapsedMs > 2500).length;
  const baselineOver3200 = baselineRows.filter((row) => row.elapsedMs > 3200).length;
  const candidateOver3200 = candidateRows.filter((row) => row.elapsedMs > 3200).length;

  console.log(JSON.stringify({
    pairedMedianMs,
    baselineMedian,
    candidateMedian,
    improvementRatio,
    baselineP90,
    candidateP90,
    baselineBytes,
    candidateBytes,
    byteReduction,
    baselineOver2500,
    candidateOver2500,
    baselineOver3200,
    candidateOver3200,
  }, null, 2));

  if (pairedMedianMs < 150 || improvementRatio < 0.10) {
    return { results, fatal: `지연 단축 부족: paired ${pairedMedianMs}ms, ratio ${(improvementRatio * 100).toFixed(1)}%` };
  }
  if (candidateP90 > baselineP90) return { results, fatal: `p90 악화: ${baselineP90}→${candidateP90}ms` };
  if (candidateOver2500 > baselineOver2500 || candidateOver3200 > baselineOver3200) {
    return { results, fatal: 'client deadline 초과 건수 악화' };
  }
  if (byteReduction < 0.15) return { results, fatal: `응답 절감률 ${(byteReduction * 100).toFixed(1)}% < 15%` };
  return { results };
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const outcome = phase === 'smoke'
    ? await runSmoke()
    : phase === 'quality'
      ? await runQuality()
      : await runLatency();
  const report = {
    phase,
    startedAt,
    finishedAt: new Date().toISOString(),
    gapMs: GAP_MS,
    callCount,
    urls: { baseline: baseline.url, candidate: candidate.url },
    fatal: outcome.fatal,
    summary: outcome.results.length > 0 ? summarize(outcome.results) : {},
    results: outcome.results,
  };
  const defaultPath = resolve(
    process.cwd(),
    'docs',
    `SPARSE_OUTPUT_${phase.toUpperCase()}_${startedAt.replace(/[:.]/g, '-')}.json`,
  );
  const outputPath = resolve(process.env.RESULT_PATH || defaultPath);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`\n결과: ${outputPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
  if (outcome.fatal) throw new Error(outcome.fatal);
}

void main();
