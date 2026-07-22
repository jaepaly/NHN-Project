import { validateSummonBehavior } from '../src/spell/summonBehavior';

/**
 * #101 4단계 — 실 Gemini yield 검증 (배포된 프록시 대상).
 *
 * 자유 "소환+움직임" 묘사를 실제 프록시에 던져, 판정이 **유효한 behavior DSL**을
 * 얼마나 내는지 측정한다. 게이트: 유효 산출율 ≥ 70%면 7/28 승격.
 *
 * ⚠️ held-out: 아래 입력은 프롬프트에 박은 예시(지그재그→돌진)와 겹치지 않는
 * 신규 묘사다 (teaching-to-the-test 편향 방지 — Phase 4 A 교훈).
 *
 * 실행: PROXY_URL 환경변수 또는 기본 배포 URL. 레이트리밋(20/분) 회피 위해 간격 둠.
 */

const PROXY = process.env.PROXY_URL || 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const GAP_MS = 3500;   // 20/분 한도 회피
const TIMEOUT_MS = 12000;

// 20개 held-out 소환+움직임 묘사 (다양한 kind·시퀀스·loop 의도)
const INPUTS = [
  '분신을 소환해 적 주위를 빙빙 돌게 하라',
  '화염 포탑을 세워 제자리에서 지키게 하라',
  '얼음 늑대를 불러 적을 끝까지 추격시켜라',
  '그림자 분신이 적에게 곧장 달려들게 하라',
  '번개 정령을 소환해 이리저리 흔들며 다가가게 하라',
  '수호령을 불러 위험하면 뒤로 물러나게 하라',
  '화염 군체를 소환해 적을 둘러싸고 맴돌다 덮치게 하라',
  '돌 골렘을 세워 천천히 쫓다가 가까워지면 돌진시켜라',
  '빛의 검을 소환해 적 주위를 돌며 베게 하라',
  '독구름 포탑을 제자리에 두고 계속 뿜게 하라',
  '얼음 가시를 소환해 물러섰다 다시 돌진하기를 반복시켜라',
  '화염 분신 셋이 각자 흩어져 적을 추격하게 하라',
  '어둠의 하수인을 불러 내 곁을 지키게 하라',
  '천둥 정령이 빠르게 돌진했다가 후퇴하기를 반복하게 하라',
  '대지의 수호자를 세워 꼼짝 않고 버티게 하라',
  '불사조를 소환해 크게 선회하다 급강하시켜라',
  '서리 늑대 무리가 좌우로 흔들며 몰아붙이게 하라',
  '강철 포탑을 배치해 고정 사격하게 하라',
  '환영 기사를 불러 적을 쫓다 물러나기를 반복시켜라',
  '용암 슬라임을 소환해 적을 향해 굴러가게 하라',
];

async function judge(text: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { __error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e: any) {
    return { __error: e?.name === 'AbortError' ? 'timeout' : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log(`\n프록시: ${PROXY}`);
  console.log(`입력 ${INPUTS.length}개 · 간격 ${GAP_MS}ms (레이트리밋 회피)\n`);

  let valid = 0;
  const fails: string[] = [];

  for (let i = 0; i < INPUTS.length; i++) {
    const text = INPUTS[i];
    const r = await judge(text);
    let verdict: string;

    if (r.__error) {
      verdict = `⚠️  오류(${r.__error})`;
      fails.push(`${text} → ${r.__error}`);
    } else {
      const disp = r?.disposition;
      const spell = r?.spell;
      const behavior = validateSummonBehavior(spell?.behavior);
      if (disp !== 'cast') {
        verdict = `❌ ${disp} (cast 아님)`;
        fails.push(`${text} → ${disp}`);
      } else if (spell?.effect !== 'summon') {
        verdict = `❌ effect=${spell?.effect} (summon 아님)`;
        fails.push(`${text} → effect ${spell?.effect}`);
      } else if (!behavior) {
        verdict = `❌ behavior 없음/무효`;
        fails.push(`${text} → behavior 무효 (raw: ${JSON.stringify(spell?.behavior)?.slice(0, 80)})`);
      } else {
        valid++;
        const kinds = behavior.steps.map((s) => s.kind).join('→');
        verdict = `✅ [${kinds}] loop=${behavior.loop}`;
      }
    }
    console.log(`${String(i + 1).padStart(2)}. ${text}`);
    console.log(`    ${verdict}`);
    if (i < INPUTS.length - 1) await sleep(GAP_MS);
  }

  const pct = Math.round((valid / INPUTS.length) * 100);
  console.log(`\n═══ 유효 DSL 산출율: ${valid}/${INPUTS.length} = ${pct}% ═══`);
  console.log(pct >= 70 ? '🟢 게이트 통과 (≥70%) → 7/28 승격 후보' : '🔴 게이트 미달 (<70%) → 프롬프트 개선 or 컷');
  if (fails.length) {
    console.log(`\n실패 상세 (${fails.length}):`);
    fails.forEach((f) => console.log(`  - ${f}`));
  }
}

main();
