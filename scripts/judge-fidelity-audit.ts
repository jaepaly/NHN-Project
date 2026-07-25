import { validateJudgement } from '../src/spell/validate';
import { validateSpellPlan } from '../src/spell/spellPlanValidate';

/**
 * 판정 충실도 오디트 — "심사위원이 실제로 칠 법한 문장"을 라이브 프록시에 던진다.
 *
 * 게이트 하니스(sequence-yield-harness)가 **복합 영창의 구조**를 본다면, 이건
 * **판정이 플레이어의 말을 알아듣는가**를 본다. 이 게임의 유일한 차별점이 여기라,
 * 오판 하나가 심사 3분에서 정체성을 무너뜨린다.
 *
 * 기대는 느슨하게 건다(판정은 원래 애매하다). 자동 실패로 세지 않고 **검토 목록**을 만든다:
 *   - fizzle: 의미 있는 문장이 불발되면 무조건 결함
 *   - element/effect 기대 불일치 → ⚠️ 사람이 판단할 후보
 *
 * 실행: npm run audit:judge   (PROXY_URL로 다른 프록시 지정 가능)
 */

const PROXY = process.env.PROXY_URL || 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const GAP_MS = 4300; // 15 RPM 준수
const TIMEOUT_MS = 12000;

interface Case {
  text: string;
  /** 심사위원이 이 문장에서 기대할 원소 (없으면 자유) */
  element?: string;
  /** 기대 effect (없으면 자유) */
  effect?: string;
  /** 왜 이 문장을 넣었나 */
  note: string;
}

const CASES: Case[] = [
  // ── 직관적 공격 — 가장 먼저 쳐볼 문장들
  { text: '불덩이를 던진다', element: 'fire', effect: 'damage', note: '가장 기본' },
  { text: '번개로 지져버려', element: 'lightning', effect: 'damage', note: '구어체 명령' },
  { text: '거대한 바위를 떨어뜨린다', element: 'earth', effect: 'damage', note: '크기 수식어' },
  { text: '칼바람이 몰아친다', element: 'wind', effect: 'damage', note: '은유 표현' },

  // ── 방어·회복 — effect/target 축이 헷갈리기 쉬운 곳
  { text: '나를 지켜줘', effect: 'shield', note: '보호 요청' },
  { text: '상처를 치료한다', effect: 'heal', note: '회복 의도' },
  { text: '화염벽을 세운다', element: 'fire', note: '⚠️ 전장 장애물 wall vs self shield (R2 제보)' },
  { text: '얼음 장벽으로 길을 막는다', element: 'ice', note: '⚠️ 같은 축 — 막는 벽' },

  // ── 제어
  { text: '적을 얼려서 못 움직이게 해', element: 'ice', effect: 'control', note: '제어 의도 명시' },
  { text: '발밑을 늪으로 만든다', note: '지형 제어' },

  // ── 소환 (킬러 데모)
  { text: '불의 정령을 소환해 적을 쫓게 한다', element: 'fire', effect: 'summon', note: '소환+행동' },
  { text: '분신을 만들어 지그재그로 돌진시켜라', effect: 'summon', note: '킬러 데모 원문' },

  // ── 복합 (시퀀스)
  { text: '뒤로 물러난 뒤 화염 폭풍을 부른다', element: 'fire', note: '이동→공격' },
  { text: '얼음벽을 세우고 그다음 번개를 내리친다', note: '벽→공격 2단계' },

  // ── 추상·재미 — 심사위원이 장난으로 쳐볼 것들
  { text: '용의 숨결', element: 'fire', note: '짧은 기술명' },
  { text: '개미가 지나간다', note: '⚠️ 의미는 있으나 약해야 함 — fizzle이면 안 됨' },
  { text: '배고프다', effect: 'heal', note: '상태 서술 → 회복 해석' },
  { text: '심심하다', note: '⚠️ 의미 있는 문장 — fizzle 금지' },
  { text: '사랑해', note: '⚠️ 무해한 문장 — blocked 금지' },

  // ── 영어·혼용
  { text: 'fireball', element: 'fire', note: '영어 단어' },
  { text: 'ice storm', element: 'ice', note: '영어 2단어' },
  { text: '메가 프로스트 노바', element: 'ice', note: '외래어 조합' },

  // ── 오타·구어 (실제 입력 현실)
  { text: '불덩어리 던져줘', element: 'fire', note: '구어 + 변형' },
  { text: '번게 내려쳐', element: 'lightning', note: '⚠️ 오타 내성' },
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
    return {
      raw: null,
      ms: performance.now() - t0,
      error: err?.name === 'AbortError' ? 'timeout' : String(err?.message ?? e),
    };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  console.log(`\n판정 충실도 오디트 — ${PROXY}`);
  console.log(`입력 ${CASES.length}개 · 간격 ${GAP_MS}ms\n`);

  const defects: string[] = [];   // 명백한 결함 (fizzle/blocked/오류)
  const review: string[] = [];    // 사람이 볼 후보 (기대 불일치)
  const latencies: number[] = [];

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    const { raw, ms, error } = await judge(c.text);
    latencies.push(ms);

    let line: string;
    if (error) {
      line = `⚠️ 오류(${error})`;
      defects.push(`[오류] "${c.text}" → ${error}`);
    } else {
      const j = validateJudgement(raw);
      const o = raw as Record<string, unknown>;
      const plan = validateSpellPlan(o?.spell_plan ?? o?.plan);
      const disp = j?.disposition ?? (o?.disposition as string) ?? '?';

      if (disp !== 'cast') {
        line = `❌ ${disp}`;
        defects.push(`[${disp}] "${c.text}" — ${c.note}`);
      } else {
        const s = j && j.disposition === 'cast' ? j.spell : null;
        const el = s?.element_primary ?? '?';
        const ef = s?.effect ?? '?';
        const tg = s?.target ?? '?';
        const fm = s?.form ?? '?';
        const pw = s?.power ?? 0;
        const seq = plan ? ` · ${plan.sequences.length}seq` : '';
        line = `✅ ${el}/${ef}/${tg}/${fm} p${pw}${seq}`;

        const miss: string[] = [];
        if (c.element && el !== c.element) miss.push(`원소 기대 ${c.element} → ${el}`);
        if (c.effect && ef !== c.effect) miss.push(`효과 기대 ${c.effect} → ${ef}`);
        if (miss.length) {
          line += `  ⚠️ ${miss.join(' / ')}`;
          review.push(`"${c.text}" → ${el}/${ef}/${tg}/${fm} — ${miss.join(' / ')} (${c.note})`);
        }
      }
    }
    console.log(`${String(i + 1).padStart(2)}. ${c.text}`);
    console.log(`    ${Math.round(ms)}ms  ${line}`);
    if (i < CASES.length - 1) await sleep(GAP_MS);
  }

  latencies.sort((a, b) => a - b);
  const q = (p: number) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))]);

  console.log('\n═══════════ 요약 ═══════════');
  console.log(`입력 ${CASES.length} · 명백한 결함 ${defects.length} · 검토 후보 ${review.length}`);
  console.log(`지연 p50=${q(0.5)}ms p90=${q(0.9)}ms max=${q(1)}ms`);

  if (defects.length) {
    console.log(`\n🔴 결함 (의미 있는 입력이 발동 실패) — ${defects.length}`);
    defects.forEach((d) => console.log(`  - ${d}`));
  }
  if (review.length) {
    console.log(`\n🟡 검토 후보 (기대와 다른 해석) — ${review.length}`);
    review.forEach((r) => console.log(`  - ${r}`));
  }
  if (!defects.length && !review.length) console.log('\n🟢 전부 기대대로');
}

void main();
