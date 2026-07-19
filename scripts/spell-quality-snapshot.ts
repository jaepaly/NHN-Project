/**
 * 5티어 판정 품질 스냅샷 — Phase 2 R2 P1-b.
 * 고정 코퍼스를 실제 프록시(라이브 Gemini)로 판정해 결과·latency·티어 적합 여부를 출력한다.
 *
 * 실행: npm run snapshot:quality  (실제 Gemini 호출 → 할당량 사용. 페이싱으로 RPM 보호)
 * 결과는 콘솔 표로 출력하고, docs/SPELL_QUALITY_SNAPSHOT.md 로 사람이 정리한다.
 */
import { writeFileSync } from 'node:fs';
import { validateJudgement } from '../src/spell/validate';
import type { SpellJudgement } from '../src/spell/types';

const PROXY_URL = 'https://incant-judge-proxy.diawodbsdot.workers.dev';
const PACING_MS = 4500; // RPM 15 여유 (약 13/min)

type Tier = '걸작' | '평범' | '주제밖' | '불발' | '금칙' | '다국어';

interface CorpusItem {
  tier: Tier;
  text: string;
  /** 기대: cast면 power 하한 등 / fizzle / blocked */
  expect: 'high' | 'mid' | 'low-cast' | 'fizzle' | 'blocked';
}

const CORPUS: CorpusItem[] = [
  // 걸작 (구체·창의·서사 → 높은 power 기대)
  { tier: '걸작', text: '태양의 파편을 뜯어낸 겁화', expect: 'high' },
  { tier: '걸작', text: '심연에서 끌어올린 검은 해일', expect: 'high' },
  { tier: '걸작', text: '천 개의 별을 엮어 만든 빛의 창', expect: 'high' },
  { tier: '걸작', text: '얼어붙은 시간을 부수는 서리 폭풍', expect: 'high' },
  { tier: '걸작', text: '대지를 가르며 솟구치는 용암의 아가리', expect: 'high' },
  // 평범 (단순 마법 단어)
  { tier: '평범', text: '불덩이', expect: 'mid' },
  { tier: '평범', text: '얼음 화살', expect: 'mid' },
  { tier: '평범', text: '돌 던지기', expect: 'mid' },
  { tier: '평범', text: '바람 칼날', expect: 'mid' },
  { tier: '평범', text: '번개', expect: 'mid' },
  // 주제 밖 (의미 있는 비마법 → 창의적 cast 기대, 불발 금지)
  { tier: '주제밖', text: '배고프다', expect: 'low-cast' },
  { tier: '주제밖', text: '졸리다', expect: 'low-cast' },
  { tier: '주제밖', text: '숙제하기 싫다', expect: 'low-cast' },
  { tier: '주제밖', text: '나를 지켜줘', expect: 'low-cast' },
  { tier: '주제밖', text: '무서워', expect: 'low-cast' },
  // 불발 (무의미 → fizzle 기대)
  { tier: '불발', text: 'ㅁㄴㅇㄹ', expect: 'fizzle' },
  { tier: '불발', text: 'asdf', expect: 'fizzle' },
  { tier: '불발', text: 'qwerty', expect: 'fizzle' },
  { tier: '불발', text: 'ㅋㅋㅋㅋ', expect: 'fizzle' },
  { tier: '불발', text: '123456', expect: 'fizzle' },
  // 금칙 (부적절 → blocked 기대) — 안전 필터 검증용 (욕설·혐오만)
  { tier: '금칙', text: '씨발', expect: 'blocked' },
  // 공격적 명령형은 blocked가 아니라 공격 주문 cast (팀 결정 2026-07-19) — 전투 게임 컨셉상 타당
  { tier: '평범', text: '죽어버려', expect: 'mid' },
  // 다국어 쌍 (의미 같으면 같은 판정 나오나)
  { tier: '다국어', text: '라이트닝 스톰', expect: 'high' },
  { tier: '다국어', text: 'lightning storm', expect: 'high' },
  { tier: '다국어', text: '숲의 분노', expect: 'high' },
  { tier: '다국어', text: 'forest fury', expect: 'high' },
];

interface Row {
  tier: Tier;
  text: string;
  ms: number;
  disposition: string;
  name: string;
  effect: string;
  element: string;
  form: string;
  power: number | '';
  fit: string;
  note: string;
}

function fitCheck(item: CorpusItem, j: SpellJudgement | null, httpOk: boolean): string {
  if (!httpOk || j === null) return '⚠️ 검증실패/오류';
  if (item.expect === 'fizzle') return j.disposition === 'fizzle' ? '✅' : `❌ ${j.disposition}`;
  if (item.expect === 'blocked') return j.disposition === 'blocked' ? '✅' : `❌ ${j.disposition}`;
  // cast 기대
  if (j.disposition !== 'cast') return `❌ ${j.disposition}(cast 기대)`;
  const p = j.spell.power;
  if (item.expect === 'high') return p >= 60 ? '✅' : `⚠️ power ${p}(<60)`;
  if (item.expect === 'mid') return p >= 25 && p <= 55 ? '✅' : `⚠️ power ${p}`;
  // low-cast (주제밖): cast면 통과, 상한 40 권장
  return p <= 45 ? '✅' : `⚠️ power ${p}(>45)`;
}

async function judgeOnce(text: string): Promise<{ ms: number; httpOk: boolean; j: SpellJudgement | null }> {
  const t0 = Date.now();
  try {
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) return { ms, httpOk: false, j: null };
    const raw = await res.json();
    return { ms, httpOk: true, j: validateJudgement(raw) };
  } catch {
    return { ms: Date.now() - t0, httpOk: false, j: null };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const rows: Row[] = [];
for (let i = 0; i < CORPUS.length; i++) {
  const item = CORPUS[i];
  const { ms, httpOk, j } = await judgeOnce(item.text);
  const cast = j && j.disposition === 'cast' ? j.spell : null;
  rows.push({
    tier: item.tier,
    text: item.text,
    ms,
    disposition: j?.disposition ?? '(오류)',
    name: cast?.name ?? '',
    effect: cast?.effect ?? '',
    element: cast ? `${cast.element_primary}${cast.element_secondary ? '+' + cast.element_secondary : ''}` : '',
    form: cast?.form ?? '',
    power: cast?.power ?? '',
    fit: fitCheck(item, j, httpOk),
    note: httpOk ? '' : 'HTTP 오류(429?)',
  });
  process.stdout.write(`.${i + 1 === CORPUS.length ? '\n' : ''}`);
  if (i < CORPUS.length - 1) await sleep(PACING_MS);
}

// 표 출력
console.log('\n=== 5티어 판정 품질 스냅샷 ===\n');
console.log('tier\ttext\tdisp\tname\teffect\telement\tform\tpower\tms\tfit');
for (const r of rows) {
  console.log(
    [r.tier, r.text, r.disposition, r.name, r.effect, r.element, r.form, r.power, r.ms, r.fit].join('\t'),
  );
}
console.log('\n--- JSON ---');
console.log(JSON.stringify(rows, null, 2));

const pass = rows.filter((r) => r.fit === '✅').length;
const avg = Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length);
console.log(`\n적합 ${pass}/${rows.length} · 평균 latency ${avg}ms`);

// 마크다운 스냅샷 문서로 저장 (제출물 ④ 소재)
const md = [
  '# 5티어 판정 품질 스냅샷 (R2 P1-b)',
  '',
  `> 생성: \`npm run snapshot:quality\` · 모델 gemini-flash-lite-latest · 자동 적합 **${pass}/${rows.length}** · 평균 latency **${avg}ms**`,
  '> (자동 "적합"은 러프한 휴리스틱 — 티어별 power 대략치. 최종 품질 판단은 사람이 표를 보고 한다.)',
  '',
  '| 티어 | 입력 | disposition | 주문명 | effect | element | form | power | ms | 자동적합 |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...rows.map((r) =>
    `| ${r.tier} | ${r.text} | ${r.disposition} | ${r.name} | ${r.effect} | ${r.element} | ${r.form} | ${r.power} | ${r.ms} | ${r.fit} |`,
  ),
  '',
].join('\n');
writeFileSync('docs/SPELL_QUALITY_SNAPSHOT.md', md, 'utf8');
console.log('→ docs/SPELL_QUALITY_SNAPSHOT.md 저장됨');
