/**
 * INCANT 주문 판정 프록시 — Cloudflare Worker
 * 역할: ① Gemini API 키 은닉 ② 레이트리밋 ③ CORS ④ 프롬프트 서버측 고정
 *
 * 배포: proxy/README.md 참조 (wrangler + GEMINI_API_KEY 시크릿)
 * 클라이언트는 { text } 만 보내고, 판정 프롬프트·스키마는 여기서 강제한다.
 * (프롬프트를 클라이언트에 두면 조작 가능 — 서버측 고정이 원칙)
 */

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// 간이 레이트리밋 (IP당 분당 요청 수, 인메모리 — 무료 플랜용 최소 구현)
const RATE_LIMIT_PER_MIN = 20;
const hits = new Map();

const JUDGE_PROMPT = `당신은 마법 주문 판정관이다. 플레이어가 입력한 자유 텍스트 주문을 판정해 JSON만 출력한다.

판정 원칙:
- 구체적이고 창의적이며 서사성 있는 묘사일수록 power가 높다 (0~100)
- 문장의 의미와 element/form이 일치해야 한다
- 의미 없는 입력은 power 5의 불발로 판정한다
- 부적절한 입력(욕설 등)은 wind/bolt/power 5의 안전한 주문으로 변환한다
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
    // ALLOWED_ORIGIN: wrangler.toml vars로 설정 (예: https://jaepaly.github.io)
    const origin = env.ALLOWED_ORIGIN ?? '*';
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

    const geminiRes = await fetch(`${GEMINI_URL}?key=${env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${JUDGE_PROMPT}\n"${text}"` }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: 300,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!geminiRes.ok) {
      return new Response(
        JSON.stringify({ error: 'upstream', status: geminiRes.status }),
        { status: 502, headers: cors },
      );
    }

    const data = await geminiRes.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    // 검증은 클라이언트 validateSpec에서 한 번 더 — 여기서는 JSON 파싱만 확인
    try {
      JSON.parse(raw);
    } catch {
      return new Response(JSON.stringify({ error: 'invalid llm output' }), { status: 502, headers: cors });
    }
    return new Response(raw, { status: 200, headers: cors });
  },
};
