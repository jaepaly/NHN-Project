/**
 * 판정 지연·폴백률 실측 — 제출물 ③의 `⟨판정 p50 __초 · 폴백 __/N회⟩` 채우기용.
 *
 * ## 왜 별도 스크립트인가
 *
 * `judge:test`는 문장별 결과를 사람이 읽으라고 한 줄씩 찍을 뿐 통계를 내지 않는다.
 * 제출 문서에 넣을 숫자는 **p50·폴백률**이라 집계가 필요하다.
 *
 * ## 폴백 판정 기준 — 클라이언트와 같게
 *
 * 폴백은 워커가 아니라 **클라이언트**가 정한다(`geminiJudge.ts`):
 *
 *   시도 타임아웃 2500ms · 최대 2회 시도(타임아웃일 때만 재시도)
 *
 * 즉 한 시도가 2.5초를 넘기면 재시도하고, 그것도 넘기면 MockJudge로 떨어진다.
 * 여기서도 **같은 임계로** 세야 문서 숫자가 실제 플레이와 맞는다. 워커 응답이
 * 아무리 빨라도 200이 아니면 그 역시 폴백이다.
 *
 * ## 쿼터
 *
 * 무료 티어 15 RPM 리미터 아래로 3.5초 간격을 둔다(judge-test와 동일). 기본 20문장이면
 * 약 70초·20콜이고, 일일 한도 1,000 RPD 대비 2%다.
 *
 * 실행: `npm run audit:judge-latency`
 *   - `JUDGE_AUDIT_N=30 npm run audit:judge-latency` 로 표본 수 조절
 *   - `WORKER_URL=... ` 로 프록시 교체
 *
 * ⚠️ 게임 코드를 하나도 건드리지 않는 외부 호출자다. 이름이 `audit:*`이라
 * `run-all-tests.mjs`가 집지 않는다(CI에서 라이브 워커를 때리면 안 된다).
 */

const WORKER_URL =
  process.env.WORKER_URL || 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const ORIGIN = 'https://jaepaly.github.io';
const PACING_MS = 3500;

/** 클라이언트와 같은 값 (`geminiJudge.ts`) — 여기가 어긋나면 문서 숫자가 거짓이 된다 */
const ATTEMPT_TIMEOUT_MS = 2500;
const MAX_ATTEMPTS = 2;

/**
 * 실측 코퍼스 — **캐시가 없는 상태의 신규 문장**을 가정한다.
 *
 * 실제 플레이에서는 localStorage 캐시가 반복 문장을 0콜로 만들지만, 문서에 적을
 * 숫자는 "새 문장을 말했을 때 얼마나 기다리나"이므로 캐시 없는 경로를 잰다
 * (더 보수적인 쪽).
 *
 * 길이·추상도를 섞었다 — 짧은 명사구부터 시간 순서가 있는 복합 문장까지.
 * 판정 부하가 문장 복잡도에 따라 달라지므로 한쪽으로 몰면 p50이 왜곡된다.
 */
const CORPUS: readonly string[] = [
  '거대한 화염구를 던진다',
  '얼음 감옥에 가둬라',
  '번개가 적들 사이를 튄다',
  '땅을 갈라 솟구치게 하라',
  '회오리로 전부 날려버려',
  '빛의 창이 꿰뚫는다',
  '그림자가 발목을 붙잡는다',
  '물길을 돌려 밀어낸다',
  '불덩이를 세 번 연달아, 마지막은 크게',
  '얼음 벽을 세우고 그 뒤에서 화살을 쏜다',
  '적을 얼린 다음 부순다',
  '천천히 타오르다 폭발한다',
  '분신을 만들어라',
  '화염 포탑을 세운다',
  '몸을 감싸는 보호막',
  '질풍처럼 빨라져라',
  '독안개가 서서히 퍼진다',
  '별빛이 쏟아져 내린다',
  '수정 구슬',
  '검을 뽑아 벤다',
  '대지의 분노',
  '서리와 번개가 함께 몰아친다',
  '하늘에서 운석이 떨어진다',
  '어둠 속으로 사라졌다 나타난다',
  '치유의 빛으로 상처를 덮는다',
  '바람의 칼날이 사방으로',
  '용암이 바닥을 뒤덮는다',
  '시간을 잠시 멈춘다',
  '모든 것을 태워버리는 불꽃',
  '작은 불씨 하나',
];

interface Attempt {
  ok: boolean;
  status: number;
  ms: number;
  timedOut: boolean;
}

interface Sample {
  text: string;
  attempts: Attempt[];
  /** 클라이언트 기준 최종 결과 — 폴백이면 MockJudge로 떨어진 것 */
  fellBack: boolean;
  /** 성공한 시도의 지연 (폴백이면 null) */
  ms: number | null;
  disposition?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function attempt(text: string): Promise<Attempt & { body?: Record<string, unknown> }> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, ms: Date.now() - started, timedOut: false, body };
  } catch (error) {
    const timedOut = (error as Error)?.name === 'AbortError';
    return { ok: false, status: 0, ms: Date.now() - started, timedOut };
  } finally {
    clearTimeout(timer);
  }
}

/** 클라이언트와 같은 정책: 타임아웃일 때만 1회 재시도, 그 외 실패는 즉시 폴백 */
async function judgeLikeClient(text: string): Promise<Sample> {
  const attempts: Attempt[] = [];
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
    const a = await attempt(text);
    attempts.push({ ok: a.ok, status: a.status, ms: a.ms, timedOut: a.timedOut });
    if (a.ok) {
      return {
        text,
        attempts,
        fellBack: false,
        ms: a.ms,
        disposition: (a as { body?: Record<string, unknown> }).body?.disposition as string,
      };
    }
    if (!a.timedOut) break; // 타임아웃이 아니면 재시도하지 않는다
  }
  return { text, attempts, fellBack: true, ms: null };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

async function main(): Promise<void> {
  const n = Math.min(
    CORPUS.length,
    Math.max(1, Number.parseInt(process.env.JUDGE_AUDIT_N ?? '20', 10)),
  );
  const corpus = CORPUS.slice(0, n);
  const totalCalls = corpus.length;

  console.log(`판정 지연·폴백률 실측 — ${WORKER_URL}`);
  console.log(
    `${corpus.length}문장 · 시도 타임아웃 ${ATTEMPT_TIMEOUT_MS}ms · 최대 ${MAX_ATTEMPTS}시도`
    + ` · ${PACING_MS / 1000}s 간격 (15 RPM 회피)\n`,
  );

  const samples: Sample[] = [];
  for (let i = 0; i < corpus.length; i += 1) {
    const sample = await judgeLikeClient(corpus[i]);
    samples.push(sample);
    const mark = sample.fellBack ? '폴백' : `${(sample.ms! / 1000).toFixed(2)}s`;
    const retry = sample.attempts.length > 1 ? ` (재시도 ${sample.attempts.length - 1})` : '';
    const disp = sample.disposition ? ` ${sample.disposition}` : '';
    console.log(`[${String(i + 1).padStart(2)}/${corpus.length}] ${mark}${retry}${disp}  « ${corpus[i]}`);
    if (i < corpus.length - 1) await sleep(PACING_MS);
  }

  const ok = samples.filter((s) => !s.fellBack);
  const latencies = ok.map((s) => s.ms!).sort((a, b) => a - b);
  const fellBack = samples.length - ok.length;
  const retried = samples.filter((s) => s.attempts.length > 1).length;
  const actualCalls = samples.reduce((sum, s) => sum + s.attempts.length, 0);

  const sec = (ms: number) => `${(ms / 1000).toFixed(2)}초`;

  console.log('\n────────────────────────────────────────');
  console.log(`표본        ${samples.length}문장 · 실제 호출 ${actualCalls}회 (재시도 포함)`);
  console.log(`성공        ${ok.length}/${samples.length}`);
  console.log(`폴백        ${fellBack}/${samples.length}`
    + `  (${((fellBack / samples.length) * 100).toFixed(1)}%)`);
  console.log(`재시도 발생 ${retried}/${samples.length}`);
  if (latencies.length > 0) {
    console.log(`p50         ${sec(percentile(latencies, 50))}`);
    console.log(`p90         ${sec(percentile(latencies, 90))}`);
    console.log(`최소/최대   ${sec(latencies[0])} / ${sec(latencies[latencies.length - 1])}`);
  }
  console.log('────────────────────────────────────────');
  console.log(`문서 기입용: ⟨판정 p50 ${sec(percentile(latencies, 50))}`
    + ` · 폴백 ${fellBack}/${samples.length}회⟩`);
  console.log(`쿼터 소모: ${actualCalls}콜 (무료 일일 1,000 RPD의 `
    + `${((actualCalls / 1000) * 100).toFixed(1)}%)`);
}

await main();
