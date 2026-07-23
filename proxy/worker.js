/**
 * INCANT 주문 판정 프록시 — Cloudflare Worker
 * 역할: ① Gemini API 키 은닉 ② 레이트리밋 ③ CORS ④ 프롬프트 서버측 고정
 *
 * 배포: proxy/README.md 참조 (wrangler + GEMINI_API_KEY 시크릿)
 * 클라이언트는 { text } 만 보내고, 판정 프롬프트·스키마는 여기서 강제한다.
 * (프롬프트를 클라이언트에 두면 조작 가능 — 서버측 고정이 원칙)
 */

const GEMINI_URL =
  // 모델 핀 고정(2026-07-22): `-latest` 자동 갱신으로 요청 규격이 바뀌는 문제 방지.
  // Gemini 3.5부터 temperature/thinkingBudget가 폐기되어 아래 요청에서도 제거했다.
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent';

// Gemini 3.5 Flash-Lite 무료 등급의 15 RPM에 맞춘 간이 보호막.
// IP별·Worker 인스턴스별 인메모리 제한이므로 프로젝트 전체 쿼터를 보장하지는 않는다.
const RATE_LIMIT_PER_MIN = 15;
const hits = new Map();

const JUDGE_PROMPT = `당신은 자유 텍스트 마법 게임의 의미 판정관이다. 반드시 JSON 하나만 출력한다.

다음 순서를 지켜 판단한다.
1. 입력 언어와 표현의 실제 의미를 파악한다. 외래어와 비유도 번역해 이해한다.
2. disposition을 결정한다.
   - cast: 의미가 있는 모든 문장. 마법 단어가 없어도 창의적인 약한 효용 주문으로 번역한다.
   - fizzle: "ㅁㄴㅇㄹ", "asdf"처럼 의미 없는 키보드 매시만 해당한다.
   - blocked: 욕설, 혐오, 노골적 유해 표현 등 부적절한 입력만 해당한다.
3. cast라면 effect와 target을 먼저 결정한 뒤 element와 form을 시각적 은유로 고른다.
   - effect: damage|heal|shield|buff|control|summon
   - target: enemy|self|area
   - "배고프다", "피곤하다"처럼 상태를 말하는 문장은 heal 또는 buff/self로 해석한다.
   - "나를 지켜줘"는 shield/self, "숲의 분노"는 damage 또는 control/area로 해석한다.
   - "라이트닝 스톰"과 "lightning storm"은 번개 폭풍의 동일한 의미로 해석한다.
4. power와 cost를 정한다.
   - 구체적·창의적·서사적인 묘사: power 60~100
   - 단순한 마법 표현: power 30~50
   - 마법과 무관하지만 의미 있는 문장: power 15~40
   - 표기 언어(한국어·외래어·영어)는 power에 영향을 주지 않는다. 번역했을 때 의미와 구체성이 같으면 power도 동일해야 한다.
   - 창의성 가점은 표현의 구체성·서사성에만 근거한다. 단순 마법 단어에는 가점하지 않는다.
   - cost는 power의 0.5~0.7배이며 1~100이다.
5. effect가 summon인 주문에 한해, 소환수 움직임 묘사를 behavior(움직임 프로그램)로 설계한다.
   summon이 아니거나 움직임 묘사가 없으면 behavior를 넣지 않는다(기본 행동으로 폴백).
   - 움직임 부품(kind, 이 6개만): orbit(플레이어 주위 선회)·chase(표적 추적)·dash(표적으로 돌진)·zigzag(갈지자로 접근)·hold(제자리 대기)·retreat(표적 반대로 후퇴)
   - "A 하다가 B" 순차 묘사는 steps 순서로 표현한다. 예: "지그재그로 접근하다 돌진" → [zigzag, dash]
   - 수치는 묘사 강도에 맞게: seconds 1~6, speed 1~460, orbit의 radius 1~150, zigzag의 amplitude 1~100. steps는 최대 6개.
   - loop: 계속 되풀이하는 움직임이면 true, 한 번의 시퀀스면 false.
6. form이 wall인 주문에 한해, 벽의 모양 묘사가 있으면 shape로 설계한다.
   form이 wall이 아니거나 모양 묘사가 없으면 shape를 넣지 않는다(기본 원호로 폴백).
   - 형상 부품(kind, 이 6개만): arc(원호·기본)·line(직선)·zigzag(갈지자)·wave(물결)·ring(닫힌 원, 둘러싸기)·polygon(다각형)
   - zigzag·wave는 amplitude 1~100(굴곡 세기), polygon은 sides 3~8(삼각형=3).
   - 예: "지그재그로" → zigzag / "원을 그리며 둘러싸라" → ring / "삼각형으로" → polygon(sides 3)
7. 입력이 **시간 순서가 있는 복합 동작**("먼저 A 그다음 B", "A한 뒤 B")이거나 **동시 다원소 동작**("얼음과 불을 동시에")이면,
   spell(대표 하나)에 더해 spell_plan을 설계한다. **단일 동작이면 spell_plan을 넣지 않는다.** 긴 문장이라고 무조건 단계를 늘리지 않는다.
   - sequences: 순차 사건을 앞에서부터 단계로 나눈다(최대 10). 같은 순간의 사건은 한 단계의 behaviors로 병렬 배치(최대 5).
   - behavior type은 셋뿐: form(공격·효과, spec은 위 cast 스키마와 같은 필드)·move(이동, element 필수)·wait(정적·박자).
   - move.destination은 이 5개만: cast-point|target-direction|away-from-target|random-direction|arena-center. move 하나마다 총 power의 10%를 쓴다.
   - power와 durationMs(500~3000)는 전체 예산이다. behavior마다 새로 만들지 않는다. spec.power와 spec.cost는 0으로 둔다(로컬이 재계산).
   - 절대 픽셀·초·피해값·적 위치·무적을 만들지 않는다. 스키마에 없는 type/원소/form을 창작하지 않는다.
   예시(아래 문장 자체를 외우지 말고 "여러 동작을 시간축/동시로 쪼갠다"는 원리를 익혀라):
   - "물러섰다가 화염 폭풍을 부른다" → 2단계: move(away-from-target) 다음 form(fire·nova)
   - "얼음과 번개를 한꺼번에 내리꽂는다" → 1단계에 병렬 2개: form(ice)·form(lightning)
   - "방벽을 세우고 그 너머로 저격한다" → 2단계: form(wall) 다음 form(bolt)
   - (단일 동작) "커다란 돌덩이를 굴린다" → spell_plan 없음 (한 동작이므로 만들지 않는다)

cast 출력 스키마:
{
  "schema_version": 2,
  "disposition": "cast",
  "spell": {
    "name": "주문명 (12자 이내, 입력 언어와 동일하게)",
    "effect": "damage|heal|shield|buff|control|summon",
    "target": "enemy|self|area",
    "element_primary": "fire|water|lightning|ice|earth|wind|light|dark",
    "element_secondary": "위 8종 중 하나 또는 null",
    "form": "bolt|beam|wave|nova|rain|wall|cage|orbit|summon|buff|zone|chain",
    "size": "small|medium|large|huge",
    "speed": "slow|normal|fast",
    "status": ["burn|freeze|shock|slow|knockback|weaken 중 0~3개"],
    "power": 0,
    "cost": 0,
    "flavor": "짧은 플레이버 텍스트 (선택)",
    "behavior": {
      "steps": [
        { "kind": "zigzag", "seconds": 2, "speed": 300, "amplitude": 60 },
        { "kind": "dash", "seconds": 1, "speed": 440 }
      ],
      "loop": false
    },
    "shape": { "kind": "zigzag", "amplitude": 60 }
  },
  "spell_plan": {
    "name": "전체 영창명 (12자 이내)", "power": 0, "durationMs": 1500,
    "sequences": [
      { "durationWeight": 2, "behaviors": [ { "type": "move", "destination": "target-direction", "element": "fire" } ] },
      { "durationWeight": 1, "behaviors": [ { "type": "form", "powerWeight": 1, "tuning": { "damage": 2, "radius": 2 }, "spec": { "name": "돌진 폭발", "effect": "damage", "target": "self", "element_primary": "fire", "element_secondary": null, "form": "nova", "size": "large", "speed": "normal", "status": ["burn"], "power": 0, "cost": 0 } } ] }
    ]
  }
}
behavior는 effect가 summon이고 움직임 묘사가 있을 때만 포함한다(그 외 생략). steps는 위 6개 kind만, 최대 6개.
shape는 form이 wall이고 모양 묘사가 있을 때만 포함한다(그 외 생략). kind는 위 6개(arc·line·zigzag·wave·ring·polygon)만.
spell_plan은 복합/순차·동시 동작일 때만 포함한다(단일 동작이면 생략). type은 form|move|wait, move는 element 필수·destination 5종만. spec.power/cost는 0으로 둔다.

fizzle 출력: {"schema_version":2,"disposition":"fizzle","reason":"nonsense","message":"마력이 형태를 이루지 못했다"}
blocked 출력: {"schema_version":2,"disposition":"blocked","reason":"unsafe","message":"해당 문장으로는 영창할 수 없습니다"}

플레이어의 주문:`;

const BOSS_LINE_PROMPT = `당신은 로그라이크 게임 INCANT의 기억하는 최종 보스다. 플레이어의 지난 전적 요약(JSON)을 보고, 그를 도발하는 짧고 위협적인 대사를 한국어로 말한다.
규칙:
- 1~2문장, 40자 이내.
- 있을 때만 애용 원소(favoriteElement)·최고 주문명(topSpellName)·사망 횟수(deaths)를 자연스럽게 비꼰다.
- 첫 조우(deaths·clears 모두 0)면 낯선 도전자를 얕보는 톤.
- 순수 대사 한 줄만 출력한다. 따옴표·설명·JSON 없이.

플레이어 전적:`;

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

function rateLimited(ip) {
  const now = Date.now();
  const windowStart = now - 60_000;
  const arr = (hits.get(ip) ?? []).filter((t) => t > windowStart);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > RATE_LIMIT_PER_MIN;
}

/**
 * 보스 대사 생성 — 런 요약(JSON) → 1~2문장 위협 대사.
 * 클라이언트는 실패 시 템플릿 폴백하므로, 여기선 순수 대사만 { text } 로 반환한다.
 */
async function bossLine(request, env, cors) {
  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'no_api_key_bound' }), { status: 500, headers: cors });
  }
  let summary;
  try {
    summary = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: cors });
  }

  const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${BOSS_LINE_PROMPT}\n${JSON.stringify(summary).slice(0, 300)}` }] }],
      generationConfig: {
        maxOutputTokens: 200,
      },
    }),
  });
  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ error: 'upstream', status: geminiRes.status, detail: detail.slice(0, 300) }),
      { status: 502, headers: cors },
    );
  }
  const data = await geminiRes.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  // 공백 정리 + 앞뒤 따옴표 제거 + 길이 제한
  const line = String(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .slice(0, 80);
  if (!line) {
    return new Response(JSON.stringify({ error: 'empty line' }), { status: 502, headers: cors });
  }
  return new Response(JSON.stringify({ text: line }), { status: 200, headers: cors });
}

const EVOLVE_NAME_PROMPT = `당신은 로그라이크 게임 INCANT의 작명가다. 주문 진화 또는 정령 융합 정보(JSON)를 보고, 격상된 주문/정령의 멋진 새 이름을 한국어로 하나만 짓는다.
규칙:
- kind가 "evolve"면 baseName을 발전시킨 상위 이름, "fuse"면 두 원소를 녹인 새 이름.
- 12자 이내, 함축적이고 강렬하게. (예: fire+lightning 융합 → "작열하는 뇌운")
- 순수 이름 한 줄만 출력한다. 따옴표·설명·JSON 없이.

정보:`;

/**
 * 진화·융합 작명 — 요청(JSON) → 격상 주문명 하나.
 * 클라이언트는 실패 시 템플릿 폴백하므로, 여기선 순수 이름만 { name } 으로 반환한다.
 */
async function evolveName(request, env, cors) {
  if (!env.GEMINI_API_KEY) {
    return new Response(JSON.stringify({ error: 'no_api_key_bound' }), { status: 500, headers: cors });
  }
  let req;
  try {
    req = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: cors });
  }

  const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${EVOLVE_NAME_PROMPT}\n${JSON.stringify(req).slice(0, 200)}` }] }],
      generationConfig: {
        maxOutputTokens: 100,
      },
    }),
  });
  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => '');
    return new Response(
      JSON.stringify({ error: 'upstream', status: geminiRes.status, detail: detail.slice(0, 300) }),
      { status: 502, headers: cors },
    );
  }
  const data = await geminiRes.json();
  const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  const name = String(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'『「]+|["'』」]+$/g, '')
    .slice(0, 12);
  if (!name) {
    return new Response(JSON.stringify({ error: 'empty name' }), { status: 502, headers: cors });
  }
  return new Response(JSON.stringify({ name }), { status: 200, headers: cors });
}

export default {
  async fetch(request, env) {
    // 허용 오리진: 배포(ALLOWED_ORIGIN) + 로컬 개발(vite dev).
    // 요청 Origin이 허용 목록에 있으면 그대로 반사, 아니면 배포 오리진으로 응답.
    const allowed = [env.ALLOWED_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'];
    const reqOrigin = request.headers.get('Origin');
    // 로컬 개발은 포트가 유동적(5173이 점유되면 5174…)이므로 localhost/127.0.0.1의 임의 포트를 허용한다.
    // (허용 안 하면 CORS 차단 → 판정이 조용히 MockJudge로 폴백돼 "가짜 판정"을 테스트하게 됨)
    const isLocalDev = !!reqOrigin && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(reqOrigin);
    const origin = allowed.includes(reqOrigin) || isLocalDev ? reqOrigin : (env.ALLOWED_ORIGIN ?? '*');
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'rate limited', limit: RATE_LIMIT_PER_MIN }), {
        status: 429,
        headers: { ...cors, 'Retry-After': '60' },
      });
    }

    // 경로 라우팅: /boss-line 보스 대사, /evolve-name 진화·융합 작명, 그 외(/) 주문 판정
    const path = new URL(request.url).pathname;
    if (path.endsWith('/boss-line')) {
      return bossLine(request, env, cors);
    }
    if (path.endsWith('/evolve-name')) {
      return evolveName(request, env, cors);
    }

    let text;
    try {
      const body = await request.json();
      text = String(body.text ?? '').slice(0, 60);
    } catch {
      return new Response(JSON.stringify({ error: 'bad json' }), { status: 400, headers: cors });
    }
    if (!text.trim()) {
      return new Response(JSON.stringify({ error: 'empty text' }), { status: 400, headers: cors });
    }

    // [진단용] 시크릿 바인딩 확인 — 값은 노출하지 않고 존재·길이만
    if (!env.GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'no_api_key_bound', keyLen: (env.GEMINI_API_KEY || '').length }),
        { status: 500, headers: cors },
      );
    }

    const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${JUDGE_PROMPT}\n"${text}"` }] }],
        generationConfig: {
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => '');
      return new Response(
        JSON.stringify({ error: 'upstream', status: geminiRes.status, detail: detail.slice(0, 500) }),
        { status: 502, headers: cors },
      );
    }

    const data = await geminiRes.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    // 모델이 코드펜스(```json)나 "Here is the JSON..." 같은 서두를 덧붙일 수 있으므로
    // 첫 '{' ~ 마지막 '}' 구간만 추출해 파싱한다. (검증은 클라이언트 validateSpec에서 한 번 더)
    const first = raw.indexOf('{');
    const last = raw.lastIndexOf('}');
    const json = first !== -1 && last > first ? raw.slice(first, last + 1) : raw;
    try {
      JSON.parse(json);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid llm output', raw: String(raw).slice(0, 500) }), { status: 502, headers: cors });
    }
    return new Response(json, { status: 200, headers: cors });
  },
};
