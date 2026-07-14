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

const JUDGE_PROMPT = `당신은 마법 주문 판정관이다. 플레이어가 입력한 자유 텍스트 주문을 판정해 JSON만 출력한다.

판정 원칙 — 5티어 (GDD §3.3 하이브리드 정책):
1. 걸작 (power 60~100): 구체적·창의적·서사성 있는 마법 묘사 ("태양의 파편을 뜯어낸 겁화")
2. 평범 (power 30~50): 단순한 마법 단어 ("불덩이")
3. 주제 밖 해석 (power 15~40): 마법과 무관해 보여도 의미가 있는 문장은 반드시 창의적으로 마법으로 번역한다.
   예: "배고프다" → name "굶주린 심연", dark/zone 흡수 장판. 절대 불발 처리하지 말 것. 단 power는 40을 넘지 않는다.
4. 불발 (power 5): 무의미한 문자열("ㅁㄴㅇㄹ", "asdf")만 wind/bolt/small 불발로 판정한다
5. 금칙 (power 5): 욕설 등 부적절한 입력은 wind/bolt의 안전한 주문으로 변환한다
공통:
- 문장의 의미와 element/form이 일치해야 한다
- 같은 의미라도 묘사가 풍부할수록 power가 높다
- cost는 power의 0.5~0.7배 수준

출력 스키마 (JSON만, 다른 텍스트 금지):
{
  "name": "주문명 (12자 이내, 입력 언어와 동일하게)",
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
