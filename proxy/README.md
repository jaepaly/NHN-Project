# 주문 판정 프록시 (Cloudflare Worker)

GitHub Pages는 정적 호스팅이라 API 키를 숨길 수 없으므로, Gemini 호출은 이 Worker를 경유한다.
프롬프트도 서버측에 고정해 클라이언트 조작을 차단한다.

## 배포 (팀 중 1인이 1회)

1. [Cloudflare 가입](https://dash.cloudflare.com/sign-up) (무료 플랜으로 충분 — 일 10만 요청)
2. [Google AI Studio](https://aistudio.google.com/apikey)에서 Gemini API 키 발급 (무료 티어)
3. 이 폴더에서:

```bash
npm install -g wrangler        # 또는 npx wrangler
wrangler login
wrangler secret put GEMINI_API_KEY   # 프롬프트에 키 붙여넣기
wrangler deploy
```

4. 출력된 URL(`https://incant-judge-proxy.<계정>.workers.dev`)을 게임 리포의 `.env`에 설정:

```
VITE_JUDGE_PROXY_URL=https://incant-judge-proxy.<계정>.workers.dev
```

5. `wrangler.toml`의 `ALLOWED_ORIGIN`을 실제 Pages 오리진으로 갱신 후 재배포

## API

```
POST /
Content-Type: application/json

{ "text": "번개를 품은 해일", "requestId": "선택적 client UUID" }
→ 200 { "schema_version": 2, "disposition": "cast", "spell": { "name": "뇌전해일", "effect": "damage", ... } }
→ 200 { "schema_version": 2, "disposition": "fizzle", "reason": "nonsense", ... }
→ 429 rate limited / 502 upstream 오류
```

클라이언트(`GeminiJudge`)는 응답을 `validateJudgement`로 재검증하고, 실패·타임아웃 시 MockJudge v2로 폴백한다.
캐시는 `incant:judge:v2:<promptVersion>:` 접두사를 사용해 구형 판정과 분리한다.

## 판정 timing 로그

주문 판정 요청은 client↔Worker 공통 `requestId`와 다음 구간을 구조화 JSON으로 기록한다.

- `workerPreMs`: Worker가 요청을 읽고 Gemini 호출을 시작하기 전까지
- `geminiMs`: Gemini fetch와 응답 본문 수신
- `workerPostMs`: Gemini 응답을 정규화하고 최종 응답을 만드는 구간
- `workerTotalMs`: Worker 전체 처리 시간

입력 원문은 서버 로그에 남기지 않고 `inputChars`만 기록한다. `wrangler.toml`의
`observability` 설정으로 Workers Logs에 저장되며 Cloudflare 대시보드의
Worker → Observability에서 `event = judge_timing` 또는 `requestId`로 찾는다.
성공 응답은 같은 수치를 `Server-Timing`과 `X-Incant-Request-Id` 헤더로도 돌려준다.

## 주의

- `GEMINI_API_KEY`는 절대 리포에 커밋하지 않는다 (wrangler secret으로만)
- 레이트리밋: IP당 분당 15회 (worker.js `RATE_LIMIT_PER_MIN`)
