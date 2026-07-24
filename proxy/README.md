# 주문 판정 프록시 (Cloudflare Worker)

GitHub Pages는 정적 호스팅이라 API 키를 숨길 수 없으므로, Gemini 호출은 이 Worker를 경유한다.
프롬프트도 서버측에 고정해 클라이언트 조작을 차단한다.

## 현재 팀 공용 배포

- URL: `https://incant-judge-proxy.diawodbsdot.workers.dev`
- 모델: `gemini-3.5-flash-lite` 명시 핀 (`-latest` 별칭 금지)
- 판정 프롬프트·캐시 버전: `meaning-v2.6-seq`
- 게임은 이 URL을 기본값으로 사용하므로 일반 로컬 실행에는 `.env`가 필요 없다.
- 아래 배포 절차는 Worker 코드·프롬프트·CORS를 바꾸거나 시크릿을 교체할 때만 필요하다.

## 배포 (팀 중 1인이 1회)

1. [Cloudflare 가입](https://dash.cloudflare.com/sign-up) (무료 플랜에서 시작 가능하며 현재 한도는 대시보드에서 확인)
2. [Google AI Studio](https://aistudio.google.com/apikey)에서 Gemini API 키 발급 (무료 티어)
3. 이 폴더에서:

```bash
npx wrangler login
npx wrangler secret put GEMINI_API_KEY   # 프롬프트에 키 붙여넣기
npx wrangler deploy
```

Windows PowerShell에서 스크립트 실행 정책 오류가 나면 `npx` 대신 `npx.cmd`를 사용한다.

4. 새 프록시를 별도로 운영할 때만 출력된 URL(`https://incant-judge-proxy.<계정>.workers.dev`)을 게임 리포의 `.env`에 설정:

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
→ 200 { "schema_version": 2, "disposition": "cast", "spell_plan": { "name": "복합 영창", "sequences": [...] } }
→ 200 { "schema_version": 2, "disposition": "fizzle", "reason": "nonsense", ... }
→ 429 rate limited / 502 upstream 오류
```

추가 엔드포인트는 `POST /boss-line`(기억 기반 보스 대사), `POST /evolve-name`(진화·융합 작명)이다.
클라이언트(`GeminiJudge`)는 응답을 `validateJudgement`로 재검증하고, 실패·타임아웃 시 MockJudge v2로 폴백한다.
현재 캐시는 `incant:judge:v2:meaning-v2.6-seq:` 접두사를 사용해 구형 단일 판정과 분리한다.

## 주의

- `GEMINI_API_KEY`는 절대 리포에 커밋하지 않는다 (wrangler secret으로만)
- Worker 보호막: IP·Worker 인스턴스별 분당 15회 (`worker.js`의 `RATE_LIMIT_PER_MIN`). 인메모리 제한이므로 프로젝트 전체 Gemini 쿼터를 보장하지 않는다.
- Gemini 한도는 API 키가 아니라 프로젝트·사용 티어에 적용되며 바뀔 수 있다. 배포 전 Google AI Studio의 활성 한도를 확인한다.
- Worker가 생성하도록 공개한 시퀀스 이동 목적지는 5종이다. 런타임의 추가 3종(`cast-direction`·`custom-vector`·`random-enemy`)은 로컬 픽스처·쇼케이스용이다.
