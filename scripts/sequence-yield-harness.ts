import { validateJudgement } from '../src/spell/validate';
import { validateSpellPlan } from '../src/spell/spellPlanValidate';

/**
 * 영창 시퀀스 2일 게이트 실측 하니스 — 배포된 프록시 대상.
 *
 * 30 입력(명시적 복합 10·추상 10·단일 10)을 실제 프록시에 던져, 게이트 기준을 자동 집계한다.
 * Worker 프롬프트가 spell_plan을 아직 안 내면 복합/단일 모두 plan 없이 v2로 나온다
 * (그 상태의 baseline도 그대로 측정된다 — 배포 후 다시 돌려 비교).
 *
 * 실행: PROXY_URL 환경변수 또는 기본 배포 URL.
 *   node/esbuild 번들로 (Git Bash curl은 한글 UTF-8 깨짐 — 반드시 node fetch).
 *
 * 게이트 기준(총괄·임재윤 합의):
 *   - 유효 JSON ≥ 90%
 *   - 복합 영창 핵심행동 보존 ≥ 80% (복합이 유효 plan·시퀀스 ≥2로 나옴)
 *   - 단일 영창이 불필요하게 복잡해지지 않음 (단일은 plan 없음 또는 1-시퀀스)
 *   - 2.5초 초과율(폴백 위험)이 흐름을 깨지 않음  ← 진짜 pass/fail 1순위
 */

const PROXY = process.env.PROXY_URL || 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const GAP_MS = 4300; // 15 RPM 준수
const TIMEOUT_MS = 12000;
const CLIENT_FALLBACK_MS = 2500; // geminiJudge.ts 폴백 임계

interface Case { text: string; kind: 'complex' | 'abstract' | 'single'; }

const CASES: Case[] = [
  // 명시적 복합 (순차/동시) — 유효 plan·시퀀스≥2가 나와야 보존
  { text: '적에게 파고든 뒤 불꽃으로 폭발한다', kind: 'complex' },
  { text: '먼저 얼음창을 쏘고 그다음 번개로 마무리한다', kind: 'complex' },
  { text: '뒤로 물러난 뒤 화염 파도를 일으킨다', kind: 'complex' },
  { text: '바람으로 띄운 다음 벼락을 내리꽂는다', kind: 'complex' },
  { text: '독안개를 깔고 나서 불을 붙여 폭발시킨다', kind: 'complex' },
  { text: '표식을 남기고 잠시 기다렸다가 추적 화살을 날린다', kind: 'complex' },
  { text: '왼쪽으로 회피하며 얼음과 불을 동시에 쏜다', kind: 'complex' },
  { text: '방패를 세운 뒤 앞으로 돌진해 들이받는다', kind: 'complex' },
  { text: '번개를 세 번 연달아 내리친 다음 바람으로 밀어낸다', kind: 'complex' },
  { text: '적을 얼려 묶고 그 사이 대지 가시로 꿰뚫는다', kind: 'complex' },

  // 추상 — 문장의 이미지를 안무로 번역해야 (plan 유무는 해석에 맡김)
  { text: '꽃잎 댄스', kind: 'abstract' },
  { text: '폭풍전야', kind: 'abstract' },
  { text: '나비의 꿈', kind: 'abstract' },
  { text: '겨울의 왈츠', kind: 'abstract' },
  { text: '분노의 협주곡', kind: 'abstract' },
  { text: '유성우의 밤', kind: 'abstract' },
  { text: '심연의 부름', kind: 'abstract' },
  { text: '태양의 대관식', kind: 'abstract' },
  { text: '메아리치는 정적', kind: 'abstract' },
  { text: '천 개의 칼날', kind: 'abstract' },

  // 단일 — 복잡해지면 안 됨 (plan 없음 또는 1-시퀀스)
  { text: '파이어볼', kind: 'single' },
  { text: '거대한 화염구를 적에게 던진다', kind: 'single' },
  { text: '얼음 가시로 적을 꿰뚫는다', kind: 'single' },
  { text: '번개가 사방으로 퍼져나간다', kind: 'single' },
  { text: '나를 감싸는 빛의 방패', kind: 'single' },
  { text: '치유의 빛', kind: 'single' },
  { text: '독구름을 퍼뜨린다', kind: 'single' },
  { text: '바위를 굴려 적을 짓뭉갠다', kind: 'single' },
  { text: '어둠의 손아귀가 적을 붙잡는다', kind: 'single' },
  { text: '회오리바람을 일으킨다', kind: 'single' },
];

async function judge(text: string): Promise<{ raw: unknown; ms: number; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = performance.now();
  try {
    const res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    const ms = performance.now() - t0;
    if (!res.ok) return { raw: null, ms, error: `HTTP ${res.status}` };
    return { raw: await res.json(), ms };
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string };
    return { raw: null, ms: performance.now() - t0, error: err?.name === 'AbortError' ? 'timeout' : String(err?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

async function main(): Promise<void> {
  console.log(`\n프록시: ${PROXY}\n입력 ${CASES.length}개 · 간격 ${GAP_MS}ms\n`);

  let validJson = 0, over = 0;
  let complexN = 0, complexPreserved = 0;
  let singleN = 0, singleStayedSimple = 0;
  const latencies: number[] = [];
  const fails: string[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const { text, kind } = CASES[i];
    const { raw, ms, error } = await judge(text);
    latencies.push(ms);
    if (ms > CLIENT_FALLBACK_MS) over++;

    let verdict: string;
    if (error) {
      verdict = `⚠️ 오류(${error})`;
      fails.push(`[${kind}] ${text} → ${error}`);
    } else {
      const judgement = validateJudgement(raw);
      if (judgement) validJson++;
      const plan = (raw && typeof raw === 'object')
        ? validateSpellPlan((raw as Record<string, unknown>).spell_plan)
        : null;
      const seqs = plan?.sequences.length ?? 0;
      const disp = judgement?.disposition ?? (raw as { disposition?: string })?.disposition ?? '?';

      if (kind === 'complex') {
        complexN++;
        if (disp === 'cast' && plan && seqs >= 2) { complexPreserved++; verdict = `✅ 복합 보존 (${seqs}seq)`; }
        else { verdict = `❌ 복합 미보존 (disp=${disp}, plan=${plan ? seqs + 'seq' : 'none'})`; fails.push(`[complex] ${text} → plan=${plan ? seqs + 'seq' : 'none'}`); }
      } else if (kind === 'single') {
        singleN++;
        if (disp === 'cast' && seqs <= 1) { singleStayedSimple++; verdict = `✅ 단일 유지 (${plan ? '1seq' : 'no-plan'})`; }
        else { verdict = `❌ 단일이 복잡해짐 (${seqs}seq)`; fails.push(`[single] ${text} → ${seqs}seq`); }
      } else {
        verdict = disp === 'cast' ? `· 추상 cast (plan=${plan ? seqs + 'seq' : 'none'})` : `❌ 추상 ${disp}`;
        if (disp !== 'cast') fails.push(`[abstract] ${text} → ${disp}`);
      }
    }
    console.log(`${String(i + 1).padStart(2)}. [${kind}] ${text}\n    ${Math.round(ms)}ms ${ms > CLIENT_FALLBACK_MS ? '⚠️2.5s초과' : ''} ${verdict}`);
    if (i < CASES.length - 1) await sleep(GAP_MS);
  }

  latencies.sort((a, b) => a - b);
  const p = (q: number) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))]);

  console.log('\n═══════════════ 게이트 집계 ═══════════════');
  console.log(`유효 JSON        ${validJson}/${CASES.length} = ${pct(validJson, CASES.length)}%   (기준 ≥90%)`);
  console.log(`복합 행동 보존   ${complexPreserved}/${complexN} = ${pct(complexPreserved, complexN)}%   (기준 ≥80%)`);
  console.log(`단일 1-시퀀스    ${singleStayedSimple}/${singleN} = ${pct(singleStayedSimple, singleN)}%   (복잡해지면 안 됨)`);
  console.log(`지연             p50=${p(0.5)}ms p90=${p(0.9)}ms max=${p(1)}ms`);
  console.log(`2.5초 초과       ${over}/${CASES.length} = ${pct(over, CASES.length)}%   ← 폴백 위험(진짜 1순위)`);
  const passGate = pct(validJson, CASES.length) >= 90
    && pct(complexPreserved, complexN) >= 80
    && singleStayedSimple === singleN;
  console.log(`\n${passGate ? '🟢 계속 진행 후보 (기준 충족)' : '🔴 기준 미달 → 프롬프트 튜닝 또는 VITE_SEQUENCE_JUDGE=0로 v2 복귀'}`);
  if (fails.length) {
    console.log(`\n실패/미보존 (${fails.length}):`);
    fails.forEach((f) => console.log(`  - ${f}`));
  }
}

void main();
