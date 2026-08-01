const workerUrl = process.env.WORKER_URL
  ?? 'https://incant-judge-proxy.incant-judge-proxy.workers.dev';
const gapMs = Number.parseInt(process.env.GAP_MS ?? '4300', 10);
const castMode = process.env.CAST_MODE === 'ultimate' ? 'ultimate' : 'normal';
const resonance = process.env.RESONANCE ? JSON.parse(process.env.RESONANCE) : undefined;

const defaultCases = [
  '꽃의 왈츠',
  '달을 삼킨 파도',
  '일식의 왈츠',
  '천둥새의 비행',
  '새벽의 순례',
  '황혼이 갈라진다',
  '심장이 두 번 뛰는 동안',
  '빛과 어둠이 동시에 교차해 폭발한다',
  '뇌광탄을 세 번 연사한다',
  '파고들어 베고 빠져나온다',
  '파이어볼',
  '최후의 성채',
  '유리별의 장례',
  '겨울 정원의 폐막',
  '폭풍의 눈',
  '검은 태양의 개화',
  '별이 두 번 숨을 쉰다',
  '바다 밑에서 울리는 종소리',
  '꿈을 꿰매는 은빛 바늘',
  '얼음 속에서 피어난 불꽃',
  '새벽을 부르는 합창',
  '무너진 왕관의 귀환',
  '천 개의 칼날이 한 송이로 피어난다',
  '긴 침묵 뒤에 천둥이 깨어난다',
  '그림자 나비 떼가 밤을 덮는다',
  '유성이 비처럼 쏟아진다',
  '시간을 얼린 호수',
  '붉은 달이 세 조각으로 갈라진다',
  '심연의 군세',
  '바람이 꽃잎을 세 번 흔든다',
];
const cases = process.env.CASES
  ? process.env.CASES.split('|').map((text) => text.trim()).filter(Boolean)
  : defaultCases;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const supportedElements = new Set(['fire', 'water', 'lightning', 'ice', 'earth', 'wind', 'light', 'dark']);

for (let index = 0; index < cases.length; index += 1) {
  const text = cases[index];
  const startedAt = performance.now();
  const response = await fetch(workerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, castMode, ...(castMode === 'ultimate' && resonance ? { resonance } : {}) }),
  });
  const elapsedMs = Math.round(performance.now() - startedAt);
  const actual = await response.json().catch(() => null);
  const sequences = actual?.spell_plan?.sequences ?? [];
  const behaviors = sequences.flatMap((sequence) => sequence?.behaviors ?? []);
  const uniqueElements = [...new Set(behaviors
    .filter((behavior) => behavior?.type === 'form')
    .flatMap((behavior) => [behavior?.spec?.element_primary, behavior?.spec?.element_secondary])
    .filter(Boolean))];
  const validForms = behaviors.filter((behavior) => (
    behavior?.type === 'form'
    && supportedElements.has(behavior?.spec?.element_primary)
    && (!behavior?.spec?.element_secondary || supportedElements.has(behavior.spec.element_secondary))
  ));
  const ultimateContractValid = castMode !== 'ultimate' || (
    sequences.length >= 4
    && sequences.length <= 8
    && validForms.length >= 6
    && validForms.length <= 12
    && sequences.some((sequence) => (
      (sequence?.behaviors ?? []).filter((behavior) => behavior?.type === 'form').length >= 2
    ))
    && (sequences.at(-1)?.behaviors ?? []).some((behavior) => behavior?.type === 'form')
  );
  const summary = {
    index: index + 1,
    text,
    status: response.status,
    elapsedMs,
    attempts: response.headers.get('x-incant-judge-attempts'),
    retry: response.headers.get('x-incant-judge-retry'),
    disposition: actual?.disposition,
    power: actual?.spell_plan?.power,
    uniqueElements,
    sequenceCount: sequences.length,
    behaviorTypes: behaviors.map((behavior) => behavior?.type),
    formCount: behaviors.filter((behavior) => behavior?.type === 'form').length,
    validFormCount: validForms.length,
    ultimateContractValid,
    hasInterpretation: typeof actual?.spell_plan?.interpretation === 'string',
    waitCount: behaviors.filter((behavior) => behavior?.type === 'wait').length,
    moveCount: behaviors.filter((behavior) => behavior?.type === 'move').length,
    parallelCounts: sequences.map((sequence) => (
      (sequence?.behaviors ?? []).filter((behavior) => behavior?.type === 'form').length
    )),
    forms: behaviors
      .filter((behavior) => behavior?.type === 'form')
      .map((behavior) => `${behavior?.spec?.element_primary}:${behavior?.spec?.form}`),
    effects: behaviors
      .filter((behavior) => behavior?.type === 'form')
      .map((behavior) => behavior?.spec?.effect),
    ...(response.ok ? {} : { errorBody: actual }),
  };
  console.log(JSON.stringify(summary));
  if (index < cases.length - 1) await sleep(gapMs);
}
