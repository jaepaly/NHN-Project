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

{ "text": "번개를 품은 해일" }
→ 200 { "name": "뇌전해일", "element_primary": "water", ... }  (SpellSpec JSON)
→ 429 rate limited / 502 upstream 오류
```

클라이언트(`GeminiJudge`)는 응답을 `validateSpec`으로 재검증하고, 실패·타임아웃 시 MockJudge로 폴백한다.

## 주의

- `GEMINI_API_KEY`는 절대 리포에 커밋하지 않는다 (wrangler secret으로만)
- 레이트리밋: IP당 분당 20회 (worker.js `RATE_LIMIT_PER_MIN`)
