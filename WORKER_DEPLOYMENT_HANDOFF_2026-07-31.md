# Gemini 판정 Worker 배포·운영 인수인계서 — 2026-07-31

이 문서는 Cloudflare Worker를 통한 Gemini 영창 판정의 배포, API 키 등록, 로컬 테스트, 장애 진단, placement 검증, 롤백 판단을 다음 세션이 그대로 수행할 수 있게 만든 운영 문서다.

일반 세션 인수인계서의 요약을 대체하지 않으며, Worker 관련 작업은 반드시 이 문서를 우선한다.

## 1. 현재 결론과 상태

- 게임 클라이언트는 Gemini API 키를 직접 사용하지 않는다. 키와 프롬프트는 Cloudflare Worker에만 둔다.
- 기본 게임 Worker URL은 `https://incant-judge-proxy.diawodbsdot.workers.dev`다. `src/spell/createJudge.ts`, `src/spell/bossLine.ts`, `src/spell/evolveName.ts`에 기본값으로 들어 있다.
- `.env.local`의 `VITE_JUDGE_PROXY_URL`이 있으면 기본 URL보다 우선한다.
- 실험용 Worker URL `https://incant-judge-proxy.incant-judge-proxy.workers.dev`도 존재한다. 개인/실험 키와 배포를 가리킬 수 있으므로 기본 Worker의 결과와 절대 섞어 해석하지 않는다.
- 클라이언트는 모든 정상 원격 판정에 6초 timeout을 적용한다. 시간 초과, 네트워크 오류, HTTP 오류, 무효 응답은 MockJudge로 fallback한다.
- Worker 프롬프트/모델은 후보58 기준을 유지한다. 품질을 보존한 유효한 응답시간 최적화는 아직 찾지 못했다.
- PR #313은 기본 Worker에 도쿄 인근 placement를 넣는 작업이다. 현재 이 브랜치의 `proxy/wrangler.toml`에는 아직 placement가 없고, #313이 머지되어야 저장소 설정과 배포 상태가 일치한다.

## 2. 구성 요소와 책임 경계

| 구성 요소 | 위치 | 역할 | 금지 |
|---|---|---|---|
| 게임 클라이언트 | `src/spell/createJudge.ts`, `src/spell/geminiJudge.ts` | 프록시 호출, 6초 timeout, 스키마 재검증, 캐시, fallback | API 키/프롬프트를 클라이언트에 넣기 |
| Cloudflare Worker | `proxy/worker.js` | Gemini 호출, 서버 프롬프트, rate limit, CORS, 보정 재요청, 진단 헤더 | 키를 코드·toml·로그에 남기기 |
| 팀 기본 배포 | `proxy/wrangler.toml` | Worker name, entry, origin, placement | 개인 실험 설정을 무심코 덮어쓰기 |
| 개인/실험 배포 | `proxy/wrangler.local.toml` | 실험 Worker | 기본 Worker와 결과를 혼동하기 |
| 브라우저 override | `.env.local` | Worker URL override, Mock 강제 | API 키를 넣거나 Mock을 데모에 남기기 |

## 3. API 키와 기본 Worker 배포 절차

사전 조건: Cloudflare 로그인 권한, Google AI Studio Gemini API 키, Node/npm, Wrangler. 작업 폴더는 `C:\Users\melsh\OneDrive\문서\GitHub\NHN-Project\proxy`다.

키는 Google AI Studio의 새 프로젝트에서 발급해도 된다. Worker 코드와 호출 계약이 같다면 키가 판정 의미를 바꾸지는 않지만, 프로젝트별 할당량·지역 제한 상태는 다를 수 있다.

```powershell
cd C:\Users\melsh\OneDrive\문서\GitHub\NHN-Project\proxy
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

- 첫 `deploy`는 Worker가 전혀 배포된 적 없어 secret 수정이 거부되는 경우를 피한다.
- `secret put` 프롬프트에만 키를 붙여 넣는다. 명령줄, `.env.local`, 문서, git에는 키를 넣지 않는다.
- 키 교체도 같은 `npx wrangler secret put GEMINI_API_KEY`로 한다.
- 출력된 `workers.dev` URL은 기록한다. URL은 비밀이 아니다.

## 4. #313 표준 placement와 개인 실험 배포

#313 머지 후 팀 기본 `proxy/wrangler.toml`에는 아래가 있어야 한다.

```toml
[placement]
region = "gcp:asia-northeast1"
```

- 도쿄 인근 egress를 선호하여 Gemini의 지원되지 않는 사용자 위치 오류를 줄이는 목적이다.
- Cloudflare placement는 hint이므로 실제 응답의 `cf-placement`를 확인해야 한다.
- Seoul 사용자 기준 Worker 왕복이 약간 늘 수 있어도, 지역 오류 제거가 우선이다.

개인 실험 Worker만 배포할 때:

```powershell
cd C:\Users\melsh\OneDrive\문서\GitHub\NHN-Project\proxy
npx wrangler deploy --config wrangler.local.toml
npx wrangler secret put GEMINI_API_KEY --config wrangler.local.toml
npx wrangler deploy --config wrangler.local.toml
```

기본/실험 Worker는 이름이 비슷해도 계정·secret·버전·쿼터·placement가 다를 수 있다. 테스트 보고에는 정확한 URL을 반드시 남긴다.

## 5. 로컬 게임에서 어느 Worker를 쓰는가

기본값은 `https://incant-judge-proxy.diawodbsdot.workers.dev`다.

다른 Worker를 명시할 때 프로젝트 루트 `.env.local`:

```dotenv
VITE_JUDGE_PROXY_URL=https://incant-judge-proxy.<계정>.workers.dev
```

- Vite 환경 변수는 개발 서버 시작 시 주입되므로 변경 뒤 개발 서버를 재시작한다.
- `VITE_JUDGE_MOCK=1`이면 실제 Gemini와 원격 보스 대사를 호출하지 않는다. 대량 전투 개발/오프라인에서만 사용하고 실플레이·데모 전에 제거한다.
- 동일 문장은 localStorage 캐시가 우선될 수 있다. 실제 Worker 품질/시간을 볼 때는 InPrivate, 캐시 삭제, 새 입력을 쓴다.
- local fixture와 `#seq` 우회는 제거된 상태가 기준이다. 실제 LLM 품질 테스트에 다시 끼워 넣지 않는다.

## 6. 배포 후 직접 HTTP 검증

UI만 보고 판단하지 말고 Worker를 직접 POST한다.

```powershell
$workerUrl = 'https://incant-judge-proxy.diawodbsdot.workers.dev'
$body = @{ text = '불사조의 낙화' } | ConvertTo-Json -Compress
$response = Invoke-WebRequest -Uri $workerUrl -Method Post -ContentType 'application/json' -Body $body
$response.StatusCode
$response.Headers
$response.Content
```

HTTP 200에서는 다음을 기록한다.

- JSON의 `schema_version`, `disposition`, `spell_plan`
- `Server-Timing: gemini;dur=...`
- `X-Incant-Judge-Attempts`: Gemini 상류 호출 수
- `X-Incant-Judge-Retry`: 보정 재판정 사유
- `X-Incant-Prompt-Tokens`, `X-Incant-Output-Tokens`, `X-Incant-Cached-Tokens`
- `cf-placement`

HTTP 502에서는 body를 반드시 보존한다.

```json
{ "error": "upstream", "status": 400, "detail": "..." }
```

클라이언트의 `http_502_upstream_400`은 Worker가 Gemini 비정상 응답을 502로 감싸고 상류 status를 보존한 결과다. timeout만 보고 원인을 판단하면 안 된다.

## 7. 실제 장애 이력과 확정 원인

### A. 긴 무응답 / fallback

- 특정 영창이나 캐시 문제가 아니라 Worker가 15초 안에 응답하지 않는 사례가 있었다.
- 후보58의 정상 Worker 버전으로 롤백해도 동일했다.
- 장시간 직접 호출과 Wrangler tail에서 Gemini 첫 생성 한 번이 35.793초, 그중 Gemini 시간이 35.464초로 관측됐다.
- 결론: Worker 진입·JSON 파싱보다 Gemini upstream tail latency/프로젝트·지역·쿼터 경로 문제일 수 있다. 6초 timeout 확대만으로 실용적으로 해결되지 않는다.

### B. 새 API 키 뒤 빠른 502

- 기본 Worker에 `파이어볼` 직접 요청 시 약 0.7~1.0초 뒤 502.
- Worker body의 Gemini 상류 status는 400 `FAILED_PRECONDITION`.
- detail: `User location is not supported for the API use.`
- 결론: 키 문법이나 후보58 프롬프트가 아니라 Cloudflare→Gemini egress 지역이 차단 원인.

### C. #311 / #313 placement 시정

- 원인: 기본 `wrangler.toml`에는 placement가 없고 도쿄 설정은 개인 `wrangler.local.toml`에만 있었다.
- 변경: #313이 기본 toml에 `gcp:asia-northeast1`을 추가. 프롬프트·키·모델·스키마·Worker 본체는 변경하지 않는다.
- 배포 Worker version: `b7b45c1c-768d-42f5-bc2a-93cd9bbf6351`.
- `불사조의 낙화` 5회: HTTP 200 5/5, 502 0/5, 2.86~3.95초, 모두 `cf-placement: remote-NRT`.
- 보정 재시도로 요청당 Gemini 2회, 총 10회 외부 AI 호출.
- 이는 1차 성공이지 영구 보장이 아니다.

## 8. 장애 판단표

| 증상 | 우선 확인 | 분류 | 조치 |
|---|---|---|---|
| 게임 fallback, HTTP 직접 호출 200 | `.env.local`, `VITE_JUDGE_MOCK`, 캐시, 실제 URL | client override/cache/Mock | Vite 재시작, InPrivate, URL 통일 |
| 502 + upstream 400 + 지역 오류 | body detail, `cf-placement`, toml | placement/egress | #313 설정 확인, 재배포, placement 기록 |
| 502 + upstream 429 | body, Gemini 프로젝트 쿼터 | quota/rate limit | 빈도 완화, 키/프로젝트 쿼터 확인 |
| 6초 fallback인데 HTTP는 나중에 200 | Server-Timing, attempts/retry | upstream tail/retry | 6초 정책 유지, 사유/빈도 계측 |
| 500 `no_api_key_bound` | body | secret 없음/다른 Worker | 정확한 config 대상으로 secret put |
| `Secret edit failed ... latest version ... isn't currently deployed` | 배포 이력 | 최초 배포 없음 | 먼저 `npx wrangler deploy`, 다음 secret put |
| Cloudflare 10013 unknown error | Wrangler/계정 상태 | API/권한 장애 | 키 재노출 없이 재시도, 대시보드·권한 확인 |
| 로컬만/데모만 실패 | 기본/override URL, ALLOWED_ORIGIN | Worker 또는 origin 불일치 | URL·origin 비교, 필요 시 ALLOWED_ORIGIN 수정 후 재배포 |

## 9. 재시도, 비용, 지연 해석

Worker는 JSON 문법 오류, unsupported form, move-only, wait-only, 의미 있는 입력의 fizzle 등에 대해 같은 요청 안에서 보정 재판정을 할 수 있다.

- 1회 영창이 Gemini 상류 요청 2회 이상을 쓸 수 있다.
- 느린 응답은 `X-Incant-Judge-Attempts`와 `X-Incant-Judge-Retry`를 함께 봐야 한다.
- 추상·복합 30종 원격 표본은 평균 1.511초, 중앙값 1.442초, p95 2.109초, 최대 2.604초, 3초 초과 0이었다.
- 실제 플레이에서 느낀 4~5초는 상시 평균이 아니라 변동/tail 또는 재판정 가능성이 있다.
- 후보59~62의 structured output/프롬프트 분리/부분 재판정 최적화는 품질·안정성 기준 미달로 되돌렸다. 새 최적화는 후보58 품질 A/B 검증 전에는 적용하지 않는다.

## 10. Worker 변경·배포 안전 절차

1. 프롬프트 품질, placement, timeout, 진단, CORS, 키 교체를 한 PR/배포에 섞지 않는다.
2. `worker.js` 변경 전 `geminiJudge.ts`의 validator/fallback 계약을 같이 확인한다.
3. 실험 Worker에서 30종 baseline과 held-out 또는 수동 시각 평가를 수행한다.
4. URL, commit, Worker version, API 호출 수, 성공/실패, 측정 조건을 기록한다.
5. 기본 배포 전 `wrangler.toml`의 `ALLOWED_ORIGIN`, placement를 확인한다.
6. 배포 후 직접 POST 5회 이상과 게임 InPrivate 테스트를 분리한다.
7. 장애 시 프롬프트 전체를 동시에 바꾸지 않는다. 정상 commit/version으로 되돌리고 response body를 보존한다.

## 11. 새 세션 시작 체크리스트

```powershell
cd C:\Users\melsh\OneDrive\문서\GitHub\NHN-Project
git status --short --branch
git log -5 --oneline --decorate
gh pr view 313 --comments
Get-Content proxy/wrangler.toml -Encoding utf8
Get-Content proxy/wrangler.local.toml -Encoding utf8
Get-Content .env.local -ErrorAction SilentlyContinue
```

아래 여섯 가지를 답할 수 있어야 Worker 작업을 시작한다.

1. 지금 테스트 URL은 기본 Worker인가 실험 Worker인가?
2. `VITE_JUDGE_MOCK=1`이 꺼져 있는가?
3. 캐시가 아닌 실제 원격 요청인가?
4. 기본 toml에 placement가 있는가?
5. 실패 시 body의 upstream status/detail과 `cf-placement`를 확보했는가?
6. 느릴 때 attempts와 retry reason을 확인했는가?

## 12. 관련 파일과 절대 금지

- `proxy/worker.js`: Gemini URL, 서버 프롬프트, 재판정, CORS, 진단 헤더.
- `proxy/wrangler.toml`: 팀 기본 배포 설정. #313 머지 후 placement 포함.
- `proxy/wrangler.local.toml`: 개인/실험 배포 설정.
- `proxy/README.md`: 간단 배포 문서. 이 문서보다 간략하다.
- `src/spell/createJudge.ts`: 기본 URL, 환경 override, Mock 선택.
- `src/spell/geminiJudge.ts`: 6초 timeout, fallback reason, cache.
- `logs/play.jsonl`: DEV 전용 로그이며 production에는 저장되지 않는다.
- `docs/R2_PROGRESS.md`: 후보58 이후 시간 실험/롤백/지역 오류의 상세 이력.
- Issue #311, PR #313: placement 공식 기록.

절대 하지 말 것:

- API 키를 git, 채팅, `.env.local`, client bundle, Worker 응답 body에 넣지 않는다.
- 기본/실험 Worker의 응답·키·placement·version을 합쳐서 보고하지 않는다.
- 502를 모두 6초 timeout 문제라고 단정하지 않는다.
- 지역 오류를 프롬프트·모델·스키마 수정으로 해결하려 하지 않는다.
- 품질 검증 없이 timeout을 너무 짧게 하거나 프롬프트를 과도하게 축약하지 않는다.
- placement 검증 없이 “도쿄 설정 적용”이라고 말하지 않는다.
- Mock 상태 결과를 실제 Gemini 품질 결과로 보고하지 않는다.
