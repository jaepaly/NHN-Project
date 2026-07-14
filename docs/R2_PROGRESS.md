# R2 (AI 시스템) 진행 로그 — 임재윤

> INCANT의 **판정(주문 해석) 시스템** 담당 파트 진행 상황.
> 규칙: **푸시할 때마다 이 파일에 "현재 어디까지 했는지"를 갱신해서 함께 커밋한다.**
> (팀 공용 1줄 기록은 [AI_USAGE_LOG.md](AI_USAGE_LOG.md), 이 파일은 R2 상세 로그)

- **담당**: 임재윤 (R2 — 판정 프롬프트·프록시 인프라·캐싱/폴백·보스 기억)
- **최근 갱신**: 2026-07-14
- **현재 페이즈**: Phase 1 (마감 7/20) — "방 하나를 실제 LLM 판정으로 처음부터 끝까지 플레이"

---

## Phase 1 진행 체크리스트

| # | 작업 | 상태 |
|---|---|---|
| ① | PR #1 리뷰·머지 (5티어 판정 정책) | ✅ 완료 |
| ② | Cloudflare 프록시 배포 (MockJudge→Gemini 연결 인프라) | ✅ 완료 |
| ③ | `GeminiJudge` 구현 (프록시 연결 + 2.5초 폴백 + 캐시) | ✅ 완료 |
| ④ | `.env.example` + README 실행 문서 갱신 | ✅ 완료 |
| ⑤ | 판정 품질 튜닝 (프롬프트·밸런스) | 🔻 데모 후로 연기 (총괄 방향). ⑤-2 안정성(모델 교체) 해결 |

---

## ① PR #1 리뷰·머지 — ✅ 완료

- 총괄(@jaepaly)이 올린 **"판정 정책: 하이브리드 5티어 확정"** PR을 리뷰.
- 리뷰 코멘트: "주제 밖 해석 power 40 상한은 프롬프트로 LLM에 요청하는 값이지 엔진이 강제하는 값이 아님 → ⑤ 품질 테스트에서 실제 준수 여부 검증 필요" (후속 체크 포인트로 기록, 머지는 승인).
- **approve + merge 완료** (커밋 `97a6ac2`). 로컬 main도 fast-forward 동기화.

## ② Cloudflare 프록시 배포 — ✅ 완료

**목표**: GitHub Pages(정적)는 API 키를 숨길 수 없으므로, Gemini 호출을 Cloudflare Worker로 중계. 게임은 `{text}`만 보내고 프롬프트·키는 서버에 고정.

**결과**: `https://incant-judge-proxy.diawodbsdot.workers.dev` 배포 완료. 실제 Gemini 판정 정상 작동 확인.

**검증 (5티어 실측)**:
| 입력 | 판정 | power |
|---|---|---|
| "태양의 파편을 뜯어낸 겁화" | 태양의 겁화 · fire+light · nova · huge | 95 (걸작) |
| "불덩이" | 불덩이 · fire · bolt · medium | 35 (평범) |
| "배고프다" | 굶주린 심연 · dark+earth · zone | 35 (주제 밖 창의 해석) |

→ 키워드 판정(MockJudge)으론 불가능한 "배고프다 → 굶주린 심연" 번역이 실제로 동작. LLM 고유 가치 검증됨.

**배포 과정에서 겪은 함정 & 해결** (팀 참고용):
1. **PowerShell 스크립트 차단** — `npx` 대신 `npx.cmd` 사용.
2. **Cloudflare 이메일 인증 필요** — Workers 사용 전 계정 이메일 인증.
3. **시크릿이 빈 값으로 저장됨** — wrangler의 마스킹 입력창에 붙여넣기가 안 먹음. → `$key | npx.cmd wrangler secret put GEMINI_API_KEY` (파이프 주입)으로 해결.
4. **모델 무료 티어 제한** — `gemini-2.0-flash`는 무료 할당량 0, `gemini-2.5-flash`는 404. → **`gemini-flash-latest`** (현재 gemini-3.5-flash, 무료 20 req/min)로 교체.
5. **thinking 모델 출력 잘림** — flash-latest는 추론 토큰이 출력 예산을 먹어 JSON이 잘림. → `maxOutputTokens: 2048` + `thinkingBudget: 0` + 서버측 JSON 추출(첫 `{`~마지막 `}`) 파싱으로 해결.

**worker.js 변경분** (이 브랜치에 포함):
- 모델 `gemini-2.0-flash` → `gemini-flash-latest`
- `maxOutputTokens` 300 → 2048, `thinkingConfig.thinkingBudget: 0` 추가
- 응답 파싱: 코드펜스·서두 텍스트 방어 (JSON만 추출)
- 진단용 에러 상세화 (`no_api_key_bound`, upstream `detail`, invalid output `raw`)

**할당량 메모**: 무료 티어 20 req/min. 데모(심사위원 몇 명 + 3초 쿨다운)엔 충분. 초과 시 MockJudge 폴백(③) + localStorage 캐시로 무중단 보장. 확장 시 유료 키로 교체만 하면 됨(코드 불변).

---

## ③ GeminiJudge 구현 — ✅ 완료

- `src/spell/geminiJudge.ts` 신규 — 판정 체인: 캐시 조회 → 프록시 fetch(2.5초 타임아웃) → `validateSpec` 재검증 → 실패/타임아웃/무효 시 MockJudge 폴백 → 성공 판정만 localStorage 캐시. 인터페이스 계약대로 throw하지 않음.
- `src/spell/createJudge.ts` 신규 — `VITE_JUDGE_PROXY_URL` 있으면 GeminiJudge, 없으면 MockJudge 자동 선택.
- `src/vite-env.d.ts` 신규 — 환경변수 타입.
- `ProtoScene.ts` — 판정기 `new MockJudge()` → `createJudge()` 교체.
- 검증: tsc 타입체크 통과, vite가 `.env` 주입 확인, 브라우저 CORS(localhost) 반사 확인, 프록시 실측 판정 정상.

## ④ 문서화 — ✅ 완료

- `.env.example` — `VITE_JUDGE_PROXY_URL` 견본.
- `README.md` — 판정기 설정(기본 MockJudge / .env로 GeminiJudge 전환) 실행 문서 갱신.

## ⑤ 판정 품질 — 데모 우선으로 재조정 (2026-07-14 회의)

> **팀 방향(총괄)**: 데모는 완성도보다 **"게임이 일단 굴러가는 것"** 우선.
> 밸런스 패치·추가 이펙트·LLM 프롬프트 설정은 "갈아끼우면 되는" 부분이라 **게임이 돌아간 뒤**로 연기.
> → R2의 ①②③④(실제 LLM 판정 연결)는 이미 완료 = **R2 핵심은 데모 준비됨.**

### 지금 (데모까지 최소한만)

- [x] **⑤-1 [도구] 판정기 출처 HUD** (gemini/cache/fallback 표시) — 완료.
      ※ 데모 빌드에선 이 표기를 숨기는 것 고려(심사자에게 [fallback] 노출 방지).
- [x] **⑤-2 [해결] 게임이 상시 `[fallback]`이던 문제 — 원인 2개 다 잡음** (2026-07-14):
      **① 할당량**: 무료 티어 소진(RPM 5로 낮음 + 개발 폭주). → **새 프로젝트 키로 교체**해 새 할당량 확보.
      **② 레이턴시(진짜 원인)**: `gemini-flash-latest`(=3.5-flash, thinking 모델)가 응답에 **~17초** 걸려
      2.5초 타임아웃에 매번 걸려 폴백됐음. → **모델을 `gemini-flash-lite-latest`(비추론 lite)로 교체**.
      실측: **1.4초 / power 95(걸작 정확)** → 타임아웃 안 걸리고 게임에서 실시간 `[gemini]` 판정 표시됨.
      남은 제약: 무료 RPM 5라 빠른 연타 시 초과분은 폴백(정상 페이스면 대부분 gemini). 근본 완화는 결제(유료).
      모델은 alias라 deprecation 안전(2.5-flash-lite는 "신규 사용자 차단"으로 못 씀 → alias 채택).

### 데모 후로 연기 ("갈아끼우면 되는" 부분 — 총괄 방향)

- ⑤-3 5티어 실측 스냅샷 (제출물 ④ 소재)
- ⑤-4 size/speed 프롬프트 지침 · ⑤-5 status 지침 · ⑤-6 element_secondary 지침 · ⑤-7 form 선택 지침
- ⑤-8 temperature 조정(점수 일관성)
- (팀논의) 근접/물리 form 부재 — 폼·원소 스키마는 R1 계약(임의 변경 금지), 총괄·이도원과 논의

### 참고 (R2 범위 아님)

- "게임이 굴러가게"의 남은 큰 축은 **R1(이도원) 전투 코어**(적·웨이브·HP). R2 판정은 준비됨.
- 렌더링: spellRenderer는 현재 bolt/nova만 구현 → 시각 유사. R1 담당.
