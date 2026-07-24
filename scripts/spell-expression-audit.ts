/**
 * 자유 영창 표현/전술 충돌 감사 — #170-2 착수 전 실 Gemini 게이트.
 *
 * 같은 의도를 기술명·명령문·서술문·영문으로 바꿔도 같은 기계적 결과가 나오는지,
 * 서로 다른 화염 전술이 현재 DSL에서 실제로 분리되는지 함께 측정한다.
 *
 * 직접 Worker를 호출하므로 브라우저 localStorage 캐시와 MockJudge 폴백이 개입하지 않는다.
 * HTTP 200 + validateJudgement 통과 응답만 live Gemini 표본으로 센다.
 *
 * 실행: npm run audit:expression
 * 환경변수:
 *   PROXY_URL       다른 Worker를 검사할 때
 *   AUDIT_PACING_MS 호출 시작 간격(기본 4500ms, 15 RPM 보호)
 *   AUDIT_REPEATS   표현별 반복 수(기본 2)
 */
import { writeFileSync } from 'node:fs';
import type { SpellBehavior, SpellPlan } from '../src/spell/sequencePlan';
import type { SpellJudgement, SpellSpec } from '../src/spell/types';
import { validateJudgement } from '../src/spell/validate';

const PROXY_URL =
  process.env.PROXY_URL || 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const PACING_MS = Math.max(4100, Number(process.env.AUDIT_PACING_MS) || 4500);
const REPEATS = Math.max(1, Math.min(5, Number(process.env.AUDIT_REPEATS) || 2));
const TIMEOUT_MS = 15_000;
const REPORT_PATH = 'docs/SPELL_EXPRESSION_AUDIT.md';
const RAW_PATH = 'docs/SPELL_EXPRESSION_AUDIT.json';

type Style = '기술명' | '명령문' | '서술문' | '영문';

interface Tactic {
  id: string;
  label: string;
  expressions: Record<Style, string>;
}

const STYLES: Style[] = ['기술명', '명령문', '서술문', '영문'];

const TACTICS: Tactic[] = [
  {
    id: 'fire-ball',
    label: '화염구(직선 투사)',
    expressions: {
      기술명: '파이어볼',
      명령문: '응축한 불덩이를 적에게 곧장 쏴라',
      서술문: '손끝에 모은 불꽃을 구체로 빚어 적을 향해 날린다',
      영문: 'Fireball, launch a ball of fire straight at the enemy',
    },
  },
  {
    id: 'fire-spear',
    label: '화염창(좁은 관통)',
    expressions: {
      기술명: '파이어 스피어',
      명령문: '불꽃을 날카로운 창으로 압축해 적을 꿰뚫어라',
      서술문: '길게 뻗은 불의 창끝이 적을 관통한다',
      영문: 'Flame spear, pierce the enemy with a narrow lance of fire',
    },
  },
  {
    id: 'fire-sword',
    label: '화염검(근접 참격)',
    expressions: {
      기술명: '파이어 소드',
      명령문: '불꽃으로 검을 만들어 눈앞의 적을 베어라',
      서술문: '손에 두른 불길이 칼날이 되어 가까운 적을 가른다',
      영문: 'Flame sword, form a burning blade and slash the nearby enemy',
    },
  },
  {
    id: 'fire-wall',
    label: '화염벽(공간 차단)',
    expressions: {
      기술명: '파이어 월',
      명령문: '적 앞에 불길의 벽을 세워 길을 막아라',
      서술문: '바닥에서 솟은 불의 장벽이 전장을 가로막는다',
      영문: "Firewall, raise a wall of flame across the enemy's path",
    },
  },
  {
    id: 'fire-chain',
    label: '연쇄 화염(다중 도약)',
    expressions: {
      기술명: '체인 플레임',
      명령문: '불꽃이 적들 사이를 연쇄적으로 튀어 옮겨 붙게 해라',
      서술문: '하나의 불씨가 무리 사이를 연달아 도약하며 태운다',
      영문: 'Chain flame, make fire leap from one enemy to the next',
    },
  },
  {
    id: 'fire-rain',
    label: '화염비(상공 광역)',
    expressions: {
      기술명: '파이어 레인',
      명령문: '하늘에서 수많은 불덩이를 적들 위로 쏟아부어라',
      서술문: '타오르는 운석들이 비처럼 전장에 떨어진다',
      영문: 'Fire rain, call burning meteors down over the battlefield',
    },
  },
];

interface AuditCase {
  tacticId: string;
  tacticLabel: string;
  style: Style;
  repeat: number;
  text: string;
}

interface AuditRow extends AuditCase {
  source: 'gemini' | 'error';
  status: number;
  latencyMs: number;
  disposition: string;
  spellName: string;
  candidateSignature: string;
  tacticalFingerprint: string;
  effect: string;
  target: string;
  elements: string;
  form: string;
  size: string;
  speed: string;
  statusEffects: string;
  power: number | null;
  hasPlan: boolean;
  error: string;
}

interface FetchResult {
  status: number;
  latencyMs: number;
  raw: unknown;
  error: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const pct = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
const average = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const escapeCell = (value: unknown) =>
  String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

function elementsOf(spec: SpellSpec): string {
  return spec.element_secondary
    ? `${spec.element_primary}+${spec.element_secondary}`
    : spec.element_primary;
}

function summonBehaviorFingerprint(spec: SpellSpec): string {
  if (!spec.behavior) return '-';
  const steps = spec.behavior.steps
    .map((step) => step.kind)
    .join('>');
  return `${steps || '-'}:${spec.behavior.loop ? 'loop' : 'once'}`;
}

function shapeFingerprint(spec: SpellSpec): string {
  if (!spec.shape) return '-';
  if (spec.shape.kind === 'polygon') return `polygon-${spec.shape.sides}`;
  return spec.shape.kind;
}

/**
 * #170-2의 현재 후보 계약. 이름·위력·크기·속도는 말만 바꿔 우회할 수 있어 제외한다.
 * plan은 실행 순서를 보존하고, 같은 순간의 병렬 behavior 순서는 정렬한다.
 */
function candidateSpecSignature(spec: SpellSpec): string {
  return `${spec.effect}:${spec.element_primary}:${spec.form}`;
}

function tacticalSpecFingerprint(spec: SpellSpec): string {
  const statuses = [...spec.status].sort().join('+') || '-';
  return [
    spec.effect,
    spec.target,
    elementsOf(spec),
    spec.form,
    statuses,
    shapeFingerprint(spec),
    summonBehaviorFingerprint(spec),
  ].join(':');
}

function candidateBehaviorSignature(behavior: SpellBehavior): string {
  if (behavior.type === 'wait') return 'wait';
  if (behavior.type === 'move') return `move:${behavior.element}:${behavior.destination}`;
  return `form:${candidateSpecSignature(behavior.spec)}`;
}

function tacticalBehaviorFingerprint(behavior: SpellBehavior): string {
  if (behavior.type === 'wait') return 'wait';
  if (behavior.type === 'move') return `move:${behavior.element}:${behavior.destination}`;
  return `form:${tacticalSpecFingerprint(behavior.spec)}`;
}

function planFingerprint(
  plan: SpellPlan,
  behaviorFingerprint: (behavior: SpellBehavior) => string,
): string {
  return plan.sequences
    .map((sequence) => sequence.behaviors.map(behaviorFingerprint).sort().join('&'))
    .join('>');
}

function signaturesOf(
  judgement: SpellJudgement,
): { candidate: string; tactical: string } {
  if (judgement.disposition !== 'cast') {
    return {
      candidate: judgement.disposition,
      tactical: judgement.disposition,
    };
  }
  if (judgement.plan) {
    return {
      candidate: `plan:${planFingerprint(judgement.plan, candidateBehaviorSignature)}`,
      tactical: `plan:${planFingerprint(judgement.plan, tacticalBehaviorFingerprint)}`,
    };
  }
  return {
    candidate: `single:${candidateSpecSignature(judgement.spell)}`,
    tactical: `single:${tacticalSpecFingerprint(judgement.spell)}`,
  };
}

function mode(values: string[]): { value: string; count: number } {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  const winner = [...counts.entries()]
    .sort(([aValue, aCount], [bValue, bCount]) =>
      bCount - aCount || aValue.localeCompare(bValue))[0];
  return winner
    ? { value: winner[0], count: winner[1] }
    : { value: '(none)', count: 0 };
}

async function fetchJudgement(text: string): Promise<FetchResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const startedAt = performance.now();
  try {
    const response = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    const latencyMs = Math.round(performance.now() - startedAt);
    const raw = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = raw && typeof raw === 'object'
        ? JSON.stringify(raw).slice(0, 240)
        : `HTTP ${response.status}`;
      return { status: response.status, latencyMs, raw, error: detail };
    }
    return { status: response.status, latencyMs, raw, error: '' };
  } catch (error: unknown) {
    const latencyMs = Math.round(performance.now() - startedAt);
    const named = error as { name?: string; message?: string };
    return {
      status: 0,
      latencyMs,
      raw: null,
      error: named.name === 'AbortError' ? 'timeout' : String(named.message ?? error),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function judgeWithRateLimitRecovery(text: string): Promise<FetchResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await fetchJudgement(text);
    if (result.status !== 429) return result;
    if (attempt === 2) return result;
    console.log('  ↳ Worker 429 감지 — 최근 호출 창이 비도록 31초씩 두 번 대기 후 재시도');
    await sleep(31_000);
    console.log('  ↳ 429 복구 대기 절반 경과');
    await sleep(31_000);
  }
  throw new Error('unreachable');
}

function percentile(sorted: number[], quantile: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))];
}

function collisionPairs(
  tacticModes: Array<{ tactic: Tactic; signature: string }>,
): string[] {
  const pairs: string[] = [];
  for (let left = 0; left < tacticModes.length; left++) {
    for (let right = left + 1; right < tacticModes.length; right++) {
      if (tacticModes[left].signature === tacticModes[right].signature) {
        pairs.push(`${tacticModes[left].tactic.label} ↔ ${tacticModes[right].tactic.label}`);
      }
    }
  }
  return pairs;
}

const cases: AuditCase[] = TACTICS.flatMap((tactic) =>
  STYLES.flatMap((style) =>
    Array.from({ length: REPEATS }, (_, index) => ({
      tacticId: tactic.id,
      tacticLabel: tactic.label,
      style,
      repeat: index + 1,
      text: tactic.expressions[style],
    }))));

console.log('=== 자유 영창 표현/전술 충돌 감사 ===');
console.log(`프록시: ${PROXY_URL}`);
console.log(`호출: ${cases.length}건 · 시작 간격 ${PACING_MS}ms · 캐시/Mock 없음\n`);

const rows: AuditRow[] = [];
for (let index = 0; index < cases.length; index++) {
  const auditCase = cases[index];
  const startedAt = performance.now();
  const fetched = await judgeWithRateLimitRecovery(auditCase.text);
  const judgement = fetched.status === 200
    ? validateJudgement(fetched.raw)
    : null;
  const cast = judgement?.disposition === 'cast' ? judgement.spell : null;
  const signatures = judgement
    ? signaturesOf(judgement)
    : { candidate: '(invalid)', tactical: '(invalid)' };
  const error = fetched.error || (judgement ? '' : 'validateJudgement 실패');

  rows.push({
    ...auditCase,
    source: judgement ? 'gemini' : 'error',
    status: fetched.status,
    latencyMs: fetched.latencyMs,
    disposition: judgement?.disposition ?? '(오류)',
    spellName: cast?.name ?? '',
    candidateSignature: signatures.candidate,
    tacticalFingerprint: signatures.tactical,
    effect: cast?.effect ?? '',
    target: cast?.target ?? '',
    elements: cast ? elementsOf(cast) : '',
    form: cast?.form ?? '',
    size: cast?.size ?? '',
    speed: cast?.speed ?? '',
    statusEffects: cast?.status.join('+') ?? '',
    power: cast?.power ?? null,
    hasPlan: judgement?.disposition === 'cast' && !!judgement.plan,
    error,
  });

  const resultLabel = judgement
    ? `${signatures.candidate} / ${cast?.power ?? '-'}`
    : `ERROR ${error}`;
  console.log(
    `${String(index + 1).padStart(2, '0')}/${cases.length}`
      + ` [${auditCase.tacticId}/${auditCase.style}/${auditCase.repeat}]`
      + ` ${fetched.latencyMs}ms ${resultLabel}`,
  );

  if (index < cases.length - 1) {
    const elapsed = performance.now() - startedAt;
    await sleep(Math.max(0, PACING_MS - elapsed));
  }
}

const validRows = rows.filter((row) => row.source === 'gemini');
const castRows = validRows.filter((row) => row.disposition === 'cast');
const validRate = pct(validRows.length, rows.length);
const planLeakRows = castRows.filter((row) => row.hasPlan);
const latencies = validRows.map((row) => row.latencyMs).sort((a, b) => a - b);
const overFallbackBoundary = validRows.filter((row) => row.latencyMs > 2500).length;

const tacticSummaries = TACTICS.map((tactic) => {
  const tacticRows = validRows.filter((row) => row.tacticId === tactic.id);
  const candidateMode = mode(tacticRows.map((row) => row.candidateSignature));
  const tacticalMode = mode(tacticRows.map((row) => row.tacticalFingerprint));
  const powers = tacticRows
    .map((row) => row.power)
    .filter((power): power is number => power !== null);
  return {
    tactic,
    count: tacticRows.length,
    candidateMode: candidateMode.value,
    candidateAgreement: pct(candidateMode.count, tacticRows.length),
    tacticalMode: tacticalMode.value,
    tacticalAgreement: pct(tacticalMode.count, tacticRows.length),
    powers,
    forms: [...new Set(tacticRows.map((row) => row.form).filter(Boolean))],
    planCount: tacticRows.filter((row) => row.hasPlan).length,
  };
});

const sameIntentCandidate = average(
  tacticSummaries.map((summary) => summary.candidateAgreement),
);
const sameIntentTactical = average(
  tacticSummaries.map((summary) => summary.tacticalAgreement),
);
const candidateModes = tacticSummaries
  .filter((summary) => summary.count > 0)
  .map((summary) => ({ tactic: summary.tactic, signature: summary.candidateMode }));
const tacticalModes = tacticSummaries
  .filter((summary) => summary.count > 0)
  .map((summary) => ({ tactic: summary.tactic, signature: summary.tacticalMode }));
const candidateCollisions = collisionPairs(candidateModes);
const tacticalCollisions = collisionPairs(tacticalModes);
const totalTacticPairs = (TACTICS.length * (TACTICS.length - 1)) / 2;
const candidateSeparation = pct(
  totalTacticPairs - candidateCollisions.length,
  totalTacticPairs,
);
const tacticalSeparation = pct(
  totalTacticPairs - tacticalCollisions.length,
  totalTacticPairs,
);

const pairedExpressions = TACTICS.flatMap((tactic) =>
  STYLES.map((style) => {
    const pairRows = validRows
      .filter((row) => row.tacticId === tactic.id && row.style === style)
      .sort((a, b) => a.repeat - b.repeat);
    return {
      tactic,
      style,
      candidateStable: pairRows.length === REPEATS
        && new Set(pairRows.map((row) => row.candidateSignature)).size === 1,
      tacticalStable: pairRows.length === REPEATS
        && new Set(pairRows.map((row) => row.tacticalFingerprint)).size === 1,
    };
  }));
const candidateStablePairs = pairedExpressions.filter((pair) => pair.candidateStable).length;
const tacticalStablePairs = pairedExpressions.filter((pair) => pair.tacticalStable).length;
const candidateRepeatStability = pct(candidateStablePairs, pairedExpressions.length);
const tacticalRepeatStability = pct(tacticalStablePairs, pairedExpressions.length);
const allTacticsMeetSameIntentGate = tacticSummaries.every(
  (summary) => summary.candidateAgreement >= 80,
);
const masteryCoreIds = new Set(['fire-ball', 'fire-spear', 'fire-sword']);
const masteryCoreModes = tacticSummaries
  .filter((summary) => masteryCoreIds.has(summary.tactic.id))
  .map((summary) => summary.candidateMode);
const masteryCoreSeparated = new Set(masteryCoreModes).size === masteryCoreModes.length;

const gates = {
  valid: validRate === 100,
  sameIntent: allTacticsMeetSameIntentGate,
  separation: candidateSeparation >= 75,
  masteryCore: masteryCoreSeparated,
  repeat: candidateRepeatStability >= 80,
  single: planLeakRows.length === 0,
};
const allGatesPass = Object.values(gates).every(Boolean);

const generatedAt = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'long',
  timeStyle: 'medium',
  timeZone: 'Asia/Seoul',
}).format(new Date());

const md = [
  '# 자유 영창 표현·전술 충돌 감사',
  '',
  `> 생성: ${generatedAt} · \`npm run audit:expression\``,
  `> Worker 직접 호출 ${rows.length}건, 시작 간격 ${PACING_MS}ms, 표현별 N=${REPEATS}.`,
  '> HTTP 200 응답을 로컬 `validateJudgement`로 다시 검증했다. 브라우저 캐시와 MockJudge 폴백은 개입하지 않는다.',
  '',
  '## 결론',
  '',
  `**게이트: ${allGatesPass ? '통과' : '보류'}** — ${
    allGatesPass
      ? '#170-2 pattern 계약 구현으로 진행할 수 있다.'
      : '현재 DSL/판정의 표현 안정성 또는 전술 분리 문제를 먼저 다뤄야 한다.'
  }`,
  '',
  '| 지표 | 결과 | 기준 | 판정 |',
  '|---|---:|---:|---|',
  `| 유효 live Gemini | ${validRows.length}/${rows.length} (${validRate}%) | 100% | ${gates.valid ? '✅' : '❌'} |`,
  `| 같은 의도 후보 signature 평균 | ${sameIntentCandidate.toFixed(1)}% | 관찰 | — |`,
  `| 전술별 후보 signature 일치 | 최저 ${Math.min(...tacticSummaries.map((summary) => summary.candidateAgreement))}% | 각 ≥80% | ${gates.sameIntent ? '✅' : '❌'} |`,
  `| 같은 의도 전술 fingerprint 일치 | ${sameIntentTactical.toFixed(1)}% | 관찰 | — |`,
  `| 다른 전술 후보 signature 분리 | ${candidateSeparation}% | ≥75% | ${gates.separation ? '✅' : '❌'} |`,
  `| 다른 전술 전술 fingerprint 분리 | ${tacticalSeparation}% | 관찰 | — |`,
  `| 화염구·화염창·화염검 분리 | ${new Set(masteryCoreModes).size}/${masteryCoreModes.length} signature | 전부 분리 | ${gates.masteryCore ? '✅' : '❌'} |`,
  `| 동일 문구 후보 signature 반복 안정성 | ${candidateStablePairs}/${pairedExpressions.length} (${candidateRepeatStability}%) | ≥80% | ${gates.repeat ? '✅' : '❌'} |`,
  `| 동일 문구 전술 fingerprint 반복 안정성 | ${tacticalStablePairs}/${pairedExpressions.length} (${tacticalRepeatStability}%) | 관찰 | — |`,
  `| 단일 전술의 plan 오탐 | ${planLeakRows.length}/${castRows.length} | 0 | ${gates.single ? '✅' : '❌'} |`,
  `| 2.5초 초과 | ${overFallbackBoundary}/${validRows.length} (${pct(overFallbackBoundary, validRows.length)}%) | 관찰 | — |`,
  `| 지연 | p50 ${percentile(latencies, 0.5)}ms · p90 ${percentile(latencies, 0.9)}ms · max ${percentile(latencies, 1)}ms | 관찰 | — |`,
  '',
  '## 전술별 요약',
  '',
  '| 전술 | 후보 signature 최빈값 | 후보 일치 | 전술 일치 | form 관측 | power 범위 | plan |',
  '|---|---|---:|---:|---|---:|---:|',
  ...tacticSummaries.map((summary) => {
    const powerRange = summary.powers.length > 0
      ? `${Math.min(...summary.powers)}~${Math.max(...summary.powers)}`
      : '-';
    return `| ${summary.tactic.label} | \`${escapeCell(summary.candidateMode)}\``
      + ` | ${summary.candidateAgreement}% | ${summary.tacticalAgreement}%`
      + ` | ${summary.forms.join(', ') || '-'} | ${powerRange} | ${summary.planCount}/${summary.count} |`;
  }),
  '',
  '## 최빈 signature 충돌',
  '',
  `- 후보 계약 충돌: ${candidateCollisions.length > 0 ? candidateCollisions.join(' / ') : '없음'}`,
  `- 상세 전술 충돌: ${tacticalCollisions.length > 0 ? tacticalCollisions.join(' / ') : '없음'}`,
  '',
  '## 해석 기준',
  '',
  '- **후보 signature**는 현재 #170-2 초안인 `effect:element_primary:form`이며 이름·power·size·speed는 제외한다.',
  '- **전술 fingerprint**는 target·보조 원소·status·shape·summon behavior와 plan 실행 순서까지 포함한다.',
  '- 같은 의도가 표현 방식에 따라 갈라지면 프롬프트 안정성 문제다.',
  '- 서로 다른 의도가 같은 fingerprint로 합쳐지면 DSL/엔진 표현력 문제다.',
  '- power·size·speed 차이는 이름 변주로 반복을 우회하게 만들 수 있어 pattern 식별자에는 바로 넣지 않고 별도 관찰한다.',
  '',
  '## 전체 표본',
  '',
  '| # | 전술 | 표현 | N | 입력 | 결과명 | candidate | tactical | size/speed/status | power | plan | ms | 출처/오류 |',
  '|---:|---|---|---:|---|---|---|---|---|---:|---:|---:|---|',
  ...rows.map((row, index) =>
    `| ${index + 1} | ${escapeCell(row.tacticLabel)} | ${row.style} | ${row.repeat}`
    + ` | ${escapeCell(row.text)} | ${escapeCell(row.spellName)}`
    + ` | \`${escapeCell(row.candidateSignature)}\``
    + ` | \`${escapeCell(row.tacticalFingerprint)}\``
    + ` | ${escapeCell([row.size, row.speed, row.statusEffects || '-'].filter(Boolean).join('/'))}`
    + ` | ${row.power ?? '-'} | ${row.hasPlan ? 'Y' : 'N'} | ${row.latencyMs}`
    + ` | ${row.source}${row.error ? ` — ${escapeCell(row.error)}` : ''} |`),
  '',
].join('\n');

writeFileSync(REPORT_PATH, md, 'utf8');
writeFileSync(RAW_PATH, `${JSON.stringify({
  generatedAt,
  proxyUrl: PROXY_URL,
  pacingMs: PACING_MS,
  repeats: REPEATS,
  metrics: {
    validRate,
    sameIntentCandidate,
    sameIntentTactical,
    candidateSeparation,
    tacticalSeparation,
    candidateRepeatStability,
    tacticalRepeatStability,
    planLeakCount: planLeakRows.length,
    overFallbackBoundary,
    latencyP50: percentile(latencies, 0.5),
    latencyP90: percentile(latencies, 0.9),
    latencyMax: percentile(latencies, 1),
  },
  gates,
  candidateCollisions,
  tacticalCollisions,
  rows,
}, null, 2)}\n`, 'utf8');

console.log('\n=== 감사 요약 ===');
console.log(`유효 Gemini ${validRows.length}/${rows.length} (${validRate}%)`);
console.log(`같은 의도 candidate ${sameIntentCandidate.toFixed(1)}% / tactical ${sameIntentTactical.toFixed(1)}%`);
console.log(`다른 전술 분리 candidate ${candidateSeparation}% / tactical ${tacticalSeparation}%`);
console.log(`화염구·화염창·화염검 분리 ${new Set(masteryCoreModes).size}/${masteryCoreModes.length}`);
console.log(`동일 문구 반복 candidate ${candidateRepeatStability}% / tactical ${tacticalRepeatStability}%`);
console.log(`plan 오탐 ${planLeakRows.length}`);
console.log(`지연 p50 ${percentile(latencies, 0.5)}ms / p90 ${percentile(latencies, 0.9)}ms / max ${percentile(latencies, 1)}ms`);
console.log(`게이트 ${allGatesPass ? '통과' : '보류'}`);
console.log(`→ ${REPORT_PATH}`);
console.log(`→ ${RAW_PATH}`);
