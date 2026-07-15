/**
 * INCANT 주문 판정 프록시 — Cloudflare Worker
 * 역할: ① Gemini API 키 은닉 ② 레이트리밋 ③ CORS ④ 프롬프트 서버측 고정
 *
 * 배포: proxy/README.md 참조 (wrangler + GEMINI_API_KEY 시크릿)
 * 클라이언트는 { text } 만 보내고, 판정 프롬프트·스키마는 여기서 강제한다.
 * (프롬프트를 클라이언트에 두면 조작 가능 — 서버측 고정이 원칙)
 */

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent';

// 간이 레이트리밋 (IP당 분당 요청 수, 인메모리 — 무료 플랜용 최소 구현)
const RATE_LIMIT_PER_MIN = 20;
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
   - cost는 power의 0.5~0.7배이며 1~100이다.

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
    "flavor": "짧은 플레이버 텍스트 (선택)"
  }
}

fizzle 출력: {"schema_version":2,"disposition":"fizzle","reason":"nonsense","message":"마력이 형태를 이루지 못했다"}
blocked 출력: {"schema_version":2,"disposition":"blocked","reason":"unsafe","message":"해당 문장으로는 영창할 수 없습니다"}

플레이어의 주문:`;

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

export default {
  async fetch(request, env) {
    // 허용 오리진: 배포(ALLOWED_ORIGIN) + 로컬 개발(vite dev).
    // 요청 Origin이 허용 목록에 있으면 그대로 반사, 아니면 배포 오리진으로 응답.
    const allowed = [env.ALLOWED_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'];
    const reqOrigin = request.headers.get('Origin');
    const origin = allowed.includes(reqOrigin) ? reqOrigin : (env.ALLOWED_ORIGIN ?? '*');
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: cors });
    }

    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    if (rateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429, headers: cors });
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
          temperature: 0.6,
          // gemini-flash-latest는 thinking 모델 — 추론 토큰이 출력 예산을 함께 먹는다.
          // thinkingBudget:0이 안 먹히는 경우가 있어 출력 예산을 넉넉히 잡아 잘림을 방지.
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 0 },
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
