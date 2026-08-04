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
→ 200 { "schema_version": 2, "disposition": "cast", "spell": { "name": "뇌전해일", "effect": "damage", ... } }
→ 200 { "schema_version": 2, "disposition": "fizzle", "reason": "nonsense", ... }
→ 429 rate limited / 502 upstream 오류
```

클라이언트(`GeminiJudge`)는 응답을 `validateJudgement`로 재검증하고, 실패·타임아웃 시 MockJudge v2로 폴백한다.
캐시는 `incant:judge:v2:<promptVersion>:` 접두사를 사용해 구형 판정과 분리한다.

## 주의

- `GEMINI_API_KEY`는 절대 리포에 커밋하지 않는다 (wrangler secret으로만)
- 레이트리밋: IP당 분당 20회 (worker.js `RATE_LIMIT_PER_MIN`)

## 무료 임시 우회: 로컬 프록시 + Quick Tunnel

Gemini 무료 등급이 Cloudflare Worker의 실행 위치를 지역 미지원으로 판정할 때 사용하는 데모·개발 전용 경로다. 기존 `worker.js`를 로컬 Node 서버가 그대로 실행하므로 판정 프롬프트, 응답 계약, CORS, 레이트리밋을 별도로 복사하지 않는다. Gemini 요청은 터널이 아니라 이 PC의 기본 인터넷 회선으로 나간다.

### 1. 개인 키를 로컬 파일에 준비

`proxy/.dev.vars.example`을 `proxy/.dev.vars`로 복사하고 개인 Gemini API 키를 입력한다.

```powershell
Copy-Item proxy/.dev.vars.example proxy/.dev.vars
notepad proxy/.dev.vars
```

`proxy/.dev.vars`는 Git에서 무시된다. 키를 `.env.local`, `VITE_` 변수, 브라우저 코드에는 넣지 않는다.

### 2. cloudflared 설치

Windows에서는 한 번만 설치한다.

```powershell
winget install --id Cloudflare.cloudflared --exact
```

설치 후 새 터미널을 연다.

### 3. 로컬 프록시와 무료 임시 터널 실행

```powershell
npm run judge:tunnel
```

출력된 `https://...trycloudflare.com` 주소를 로컬 게임의 `.env.local`에 설정한다. API 키가 아니라 프록시 공개 주소만 들어간다.

```dotenv
VITE_JUDGE_PROXY_URL=https://...trycloudflare.com
```

Vite는 시작할 때 환경 변수를 읽으므로 게임 서버를 다시 시작한다. 터널 실행 중 출력되는 `/health` 주소에서 `ready: true`도 확인할 수 있다.

### 4. 종료와 원복

- 터널 터미널에서 `Ctrl+C`를 누르면 Quick Tunnel과 로컬 프록시가 함께 종료된다.
- Quick Tunnel 주소는 실행할 때마다 바뀔 수 있으므로 새 주소로 `.env.local`을 갱신한다.
- 원래 공용 Worker로 돌아가려면 `.env.local`의 `VITE_JUDGE_PROXY_URL` 줄을 삭제하고 게임 서버를 다시 시작한다.
- Quick Tunnel은 Cloudflare가 개발·테스트 용도로만 제공하며 SLA가 없다. 최종 상시 서비스용으로 사용하지 않는다.

로컬 프록시만 열어 직접 확인하려면 `npm run judge:local`, 회귀 검증은 `npm run test:judge-local`을 사용한다. Gemini를 호출하지 않고 Quick Tunnel 연결만 확인하려면 `npm run smoke:judge-tunnel`을 사용한다.
