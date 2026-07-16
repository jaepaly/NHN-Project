# R2 (AI 시스템) 진행 로그 — 임재윤

> INCANT의 **판정(주문 해석) 시스템** 담당 파트 진행 상황.
> 규칙: **푸시할 때마다 이 파일에 "현재 어디까지 했는지"를 갱신해서 함께 커밋한다.**
> (팀 공용 1줄 기록은 [AI_USAGE_LOG.md](AI_USAGE_LOG.md), 이 파일은 R2 상세 로그)

- **담당**: 임재윤 (R2 — 판정 프롬프트·프록시 인프라·캐싱/폴백·보스 기억)
- **최근 갱신**: 2026-07-16
- **현재 페이즈**: **Phase 3 (마감 7/22)** — 기억하는 보스 & 에셋. (Phase 2 조기 완료·머지)

---

## R2 아키텍처 한눈에 (발표·심사용 요약)

```
[플레이어 문장] → ① 판정 → ② 히스토리 → ③ 보스 기억
```

| 상자 | 하는 일 | 핵심 장치 (와 이유) |
|---|---|---|
| **① 판정** | 문장 → `cast/fizzle/blocked` JSON | 프록시 경유(API 키 은닉) · 프롬프트 서버 고정(조작 방지) · 스키마 검증(LLM 불신) · 2.5초 폴백(무중단) · 캐시(속도·할당량) |
| **② 히스토리** | cast+발동 확정 주문만 런 공책에 기록 | 동일 문장 반복 ×0.8 로컬 강제(다양성 유도) · `bossMemory()` 요약 |
| **③ 보스 기억** | 공책·지난 런으로 보스가 대비 | 단기 내성 ×0.3(이번 런 최다) · 장기 부분 내성(최근 5런·최다 1개 — 과잉내성 방지) · 도발 대사(`/boss-line`+템플릿 폴백) |

fizzle/blocked는 마나·쿨다운·기록 모두 노카운트. 판정~대사 전부 "실패해도 게임은 멈추지 않는다" 원칙.

---

## Phase 3 진행 체크리스트 — [PHASE_3.md](PHASE_3.md) §3 R2 (트랙 2: 보스 기억·대사)

| # | 작업 | 상태 |
|---|---|---|
| ① | 내성 프로필 모듈 (`bossMemory`→최다원소 저항 ×0.3·최다폼 카운터, 순수함수+테스트) | ✅ 완료 (`bossMemory.ts`, `test:boss` 4군) |
| ② | 런 간 기억 (localStorage, `incant:runmemory:v1:` 버전 접두사) | ✅ 완료 (`runMemory.ts`, `test:runmemory` 4군) |
| ③ | 보스 대사 생성 (프록시 `/boss-line` + **폴백 템플릿 필수**) | ✅ 완료 ((a)클라이언트·폴백 + (b)프록시 배포·라이브 테스트) |
| ④ | 계약 파일 공개 (총괄 보스코어·R3 UI가 소비) | ✅ 완료 (`bossMemoryContract.ts`) |
| ⑤ | `/evolve-name` 엔드포인트 (Phase 3.5, 후순위) | ⬜ (성장 시스템, 후순위) |

**▶ 현재 위치**: Phase 2 완료·머지(히스토리 통합까지 이도원이 P0-e 연결 완료). Phase 3 착수 — **INCANT 간판 기능 "기억하는 보스"가 R2 몫.**

**▶ 현재 위치**: **R2 Phase 3 핵심(①~④) 전부 완료·검증** — 내성 프로필·런간기억·보스대사(`/boss-line` 배포)·공개 계약. **PR #22**.

**▶ 검증 (2026-07-16)**: 전체 프로덕션 빌드(tsc+vite) ✅ · 팀 회귀 10종 전부 통과(spell·history·run·control·summon·bolt·forms·boss·runmemory·bossline) ✅ · `/boss-line` 라이브 실측 ✅ · 판정(/) 무손상 ✅. **미검증**: 실제 보스전 통합(보스 코어 미구현 → 총괄 통합 시 확인).

**▶ 총괄 통합 가이드**: `import { computeResistance, longTermResistedElement, loadRunMemory, saveRunMemory, summarizeRun, updateRunMemory, getBossLine } from './spell/bossMemoryContract'`
- 보스방 진입: 초기 저항 = `longTermResistedElement(loadRunMemory())`(장기·부분) + 진행 적응 = `computeResistance(history.bossMemory())`(단기·강)
- 대사: `await getBossLine(runMemory)` (프록시 실패해도 템플릿 폴백)
- 런 종료: `saveRunMemory(updateRunMemory(loadRunMemory(), summarizeRun(history, 'win'|'lose')))`

**▶ 다음 (협업/후순위)**: (1) 총괄이 위 계약으로 보스 코어 구현(협업). (2) ⑤ `/evolve-name`은 Phase 3.5 성장 시스템 후순위.

**경계**: 보스 전투 코어·연출·통합 QA는 **총괄**. R2는 기억·내성·대사 **모듈+계약**까지. `SpellSpec`/`RunContract` 변경 없음 예정.

**밸런스 백로그 (데모 후 튜닝, 총괄 참고)**:
- **투톱 회피**: 원소 2개를 50:50으로 번갈아 쓰면 "최다 1개 저항" 캡을 부분 회피함(하나만 저항받고 나머지 자유).
  보강 옵션: 2위 원소 약한 내성(×0.6) 또는 사용 비율 비례 내성. ※ 1개 캡은 누적 과잉내성(모든 원소 저항) 방지와의 **의도된 트레이드오프** — 조정은 밸런스 튜닝 때.

### ① 내성 프로필 모듈 — ✅ (feat/boss-memory)

- **파일**: `src/spell/bossMemory.ts` — `computeResistance(BossMemoryProfile) → BossResistanceProfile` 순수 함수.
- 로직: 이번 런 최다 원소 → 저항(피해 ×0.3), 최다 폼 → 카운터 전략(원거리 폼 위주 `rush` / 근거리 `ranged`). `minCasts 3` 미만이면 무저항.
- **계약 파일**: `BossResistanceProfile`·`BossCounterStrategy` 타입 공개 → 총괄 보스 코어·R3 UI가 소비.
- 검증: `npm run test:boss` 4군(데이터부족·원소저항·카운터전략·순수성) + tsc 통과.

### ② 런 간 기억 (localStorage) — ✅ (feat/boss-memory)

- **파일**: `src/spell/runMemory.ts`. `RunMemory`(사망·클리어·애용원소·최고피해주문·마지막결과·최근원소) + `summarizeRun`·`updateRunMemory`(순수) + `load/saveRunMemory`(localStorage, storage 주입 가능 → 테스트됨).
- **스키마 버전 접두사** `incant:runmemory:v1:` + 로드 시 정규화(깨진/구버전 → 기본값).
- **누적 밸런스 완화**(당신 지적 반영): `recentDominantElements`를 최근 5런으로 제한 + `longTermResistedElement`가 그중 **최다 1개만** 반환 → "모든 원소 내성" 방지.
- **①↔② 다리**: 총괄 보스 코어는 **초기 저항 = `longTermResistedElement`(장기·부분)** + **진행 중 적응 = `computeResistance`(단기·강)** 을 조합해 쓰면 됨.
- 검증: `npm run test:runmemory` 4군(요약·갱신·누적완화·저장로드) + tsc 통과.

### ③ 보스 대사 생성 — 🔧 (a 완료 / b 진행)

- **(a) 클라이언트 ✅** (`src/spell/bossLine.ts`): `getBossLine(memory)` — 프록시 `/boss-line` 우선, 실패·타임아웃·첫조우엔 **템플릿 폴백**(보스는 반드시 말한다). `sanitizeLine`(공백·길이 80 제한), `templateBossLine`(첫조우/애용주문/원소/사망 상태별). `test:bossline` 5군 통과.
- **(b) 프록시 ✅**: `worker.js`에 `/boss-line` 경로 라우팅 + BOSS_LINE_PROMPT(temperature 0.9) 추가 → 배포·라이브 테스트 완료.
  - 실측: 첫 조우 "아직 잉크조차 마르지 않은 생짜배기라니…", 재도전 "뇌전해일로도 모자라 불꽃을… 두 번의 죽음으로도 부족했나" (최고주문·애용원소·사망 반영). 판정(/) 무손상 확인.
- 대사도 검증·길이 제한(sanitize). 개발/테스트는 템플릿 폴백으로 (라이브 최소).

### ④ 계약 파일 공개 — ✅ (feat/boss-memory)

- **파일**: `src/spell/bossMemoryContract.ts` — ①②③의 공개 타입·함수를 한 곳에서 re-export.
- 총괄 보스 코어·R3 UI는 이 파일 하나만 import: `SpellHistory`/`computeResistance`/`BossResistanceProfile`/`RunMemory`/`loadRunMemory`/`longTermResistedElement`/`getBossLine`/`BossLine` 등.
- 사용 흐름 주석 포함(런 도중 기록 → 보스방 내성 → 초기 저항 → 대사 → 런 종료 저장).

### ⑤ `/evolve-name` (Phase 3.5) — ⬜ (후순위, ~7/24 필요)

- **뭘**: 각인 주문 **진화**·정령 **융합** 시 결과물의 **격상 주문명**을 짓는 프록시 엔드포인트 ([PROGRESSION_DESIGN.md](PROGRESSION_DESIGN.md) §5).
- **입력** 원문 or 원소 조합+컨텍스트 → **출력** 주문명 1개 (12자 이내, 입력 언어, 검증).
- **패턴 = `/boss-line`과 동일**: worker.js 라우트+프롬프트 / 클라이언트 **폴백 템플릿 필수**(『{원소} 대격변』류) / sanitize.
- 소비자: 총괄 성장 시스템 ④(진화·융합, ~7/24). 컷 시에도 템플릿 작명만으로 동작해야 함.

---

## Phase 2 진행 체크리스트 — [PHASE_2.md](PHASE_2.md) §3 R2

| # | 작업 | 상태 |
|---|---|---|
| P0-a | 판정 v2 (SpellJudgement 타입·검증·프롬프트·캐시버전·MockJudge v2) | ✅ 총괄 Codex 선구현 → 임재윤 배포·검토 |
| P0-b | 주문 히스토리 모듈 (`spellHistory.ts` — `record()`·조회 API) | ✅ 완료 (PR #13) |
| P0-c | 반복 패널티 (동일 문장 power×0.8, floor 0.3, 로컬 강제) | ✅ 완료 (PR #13) |
| P0-d | 회귀 테스트 (`node:assert`, `npm run test:history`) | ✅ 완료 (7군 통과) |
| P0-e | R1 통합 — `record`/`repeatMultiplier`를 전투 흐름에 연결 | ⬜ 협업 (이도원 몫, 계약 전달) |
| P1-a | 보스 기억 요약 (`BossMemoryProfile` 초안) | ✅ 완료 (PR #13) |
| P1-b | 5티어 품질 스냅샷 (고정 코퍼스 실측 기록) | ✅ 완료 (PR #13, [SPELL_QUALITY_SNAPSHOT.md](SPELL_QUALITY_SNAPSHOT.md)) |

**▶ 현재 위치**: R2 Phase 2 **빌드 작업 전부 완료** (판정 v2 + 히스토리/패널티/요약 + 품질 스냅샷). **PR #13** 리뷰 대기.

**▶ 다음 (협업/이월)**:
1. **PR #13 머지 요청**(총괄) + **이도원에게 계약 전달**(`record`/`repeatMultiplier`) → 전투 통합(P0-e).
2. 스냅샷에서 나온 프롬프트·밸런스 이슈(아래 P1-b 관찰)는 **총괄 방향대로 데모 후 튜닝**.

> 히스토리를 실제로 쓰려면(런 도중 기록·조회) R1이 `SpellHistory` 인스턴스를 런 상태에 두고 호출해야 함. R2는 클래스·API까지 제공 완료.

### P0-a · 판정 v2 — ✅ (총괄 Codex 선구현, 임재윤 배포·검토)

- 판정 계약을 `SpellSpec v1` → `SpellJudgement v2`(구별 유니온)로 전환. `disposition: cast/fizzle/blocked`, cast만 `effect/target`과 전투 자원을 가짐.
- worker.js 프롬프트를 **의미 우선**(의미→disposition→effect/target→element/form→power) 순서로 개편. 캐시 접두사에 스키마·프롬프트 버전 포함(v1 캐시 무시).
- 임재윤이 라이브 프록시에 배포하고 "피곤해서 쉬고 싶다 → heal/self(휴식의 가호)" 실측 확인.

### P0-b · 주문 히스토리 모듈 — ✅ (PR #13)

- **파일**: `src/spell/spellHistory.ts`. 검증된 cast 주문만 런 단위(메모리)로 기록. 파일/네트워크 없음.
- **기록 필드**: 원문·정규화키·주문명·effect·target·주/보조원소·폼·basePower·power(패널티 반영)·cost·source·castAt.
- **API**: `record(input)` · `countOf` · `recent(n)` · `all` · `size` · `reset()`.
- 시각(`castAt`)은 호출측 주입 → 모듈이 시간을 안 읽어 단위 테스트가 결정론적.

### P0-c · 반복 패널티 — ✅ (PR #13)

- `repeatMultiplier(text)` = 동일 정규화 문장의 기존 기록 수 기준 배수. **처음 1.0 → 재사용부터 ×0.8 누적, 하한(floor) 0.3.**
- **로컬 코드가 강제**(프롬프트 아님). 엔진(R1)이 이 배수를 판정 power에 곱해 실제 효과 수치를 낸다.
- 예: "화염구"(power 40) → 1번째 40, 2번째 32, 3번째 26 …

### P0-d · 회귀 테스트 — ✅ (PR #13)

- `scripts/spell-history-regression.ts` + `npm run test:history`. **팀 컨벤션(node:assert, esbuild+node, 의존성 0) 준수** (Vitest 미도입).
- 검증 7군: 정규화 · 기록/size · 패널티 ×0.8/×0.64 · 정규화 반복 · floor 하한 · 보스 요약 · 리셋. **전부 통과.**

### P0-e · R1 통합 — ⬜ (협업, 이도원 몫)

- **계약(R1이 할 일)**: 판정이 `disposition==='cast'`이면 → 데미지 계산 전 `history.repeatMultiplier(text)`를 power에 곱함 → 마나 지불·발동 확정 후 `history.record({ rawText, spell, source, castAt })`.
- `fizzle`/`blocked`는 기록·마나·쿨다운 소비하지 않음(호출측이 cast만 record).
- R2는 클래스·API 제공 완료. R1이 `SpellHistory` 인스턴스를 런 상태에 두고 호출.

### P1-a · 보스 기억 요약 초안 — ✅ (PR #13)

- `bossMemory()` → `BossMemoryProfile { dominantElement, dominantForm, recentSpellNames, totalCasts }`.
- **Phase 3 계약용 초안만.** 실제 보스 전투·대사는 구현하지 않음(스코프 밖).

### P1-b · 5티어 품질 스냅샷 — ✅ (PR #13)

- **산출**: `scripts/spell-quality-snapshot.ts` + `npm run snapshot:quality` → [SPELL_QUALITY_SNAPSHOT.md](SPELL_QUALITY_SNAPSHOT.md) (코퍼스 26개 실측). 페이싱 4.5s로 RPM 보호.
- **결과**: 자동 적합 23/26, 평균 1462ms. 걸작 85~95 · 평범 35~45 · 주제밖 의미대로 heal/shield 판정 우수. 다국어 "숲의 분노=forest fury" 일치.

**관찰·이슈 (총괄 검토용 — 튜닝은 데모 후)**:

1. **"죽어버려" → cast(damage) 수용** (팀 확인). 게임 맥락상 공격 주문으로 봄. "씨발"은 blocked 정상.
2. **한/영 power 불일치**: 라이트닝 스톰 50 vs lightning storm 85 (원소·폼 lightning/rain은 동일). **글자수 문제 아님** — Gemini는 길이 안 셈(그건 MockJudge 방식). 원인은 temperature 0.6 변동 + 언어별 해석 차. 완화: temperature↓ 또는 프롬프트에 "동일 의미 다국어는 같은 power" 명시.
3. **"나를 지켜줘" power 65**: 주제밖 상한 40 초과(shield 자체는 맞음). 상한이 엔진 강제가 아니라 프롬프트 부탁이라 발생.
4. **latency 스파이크**: 대부분 1.3초인데 일부 2.9~4.7초 → **2.5초 초과 시 게임에선 폴백.** 관찰만(모델·타임아웃 조정은 데모 후).

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
- `README.md` — 판정기 설정(기본 GeminiJudge / `VITE_JUDGE_MOCK=1`로 MockJudge) 실행 문서 갱신.
- **판정기 기본값을 GeminiJudge로** (`createJudge.ts`) — 팀 공용 프록시 URL을 코드 기본값으로 두어
  로컬·데모 어디서나 별도 `.env` 없이 실제 Gemini 판정이 동작. (`.env`는 gitignore라 공유 안 됨 → 하드코딩 기본값으로 해결)
  - 배경: PR #4 머지 후 팀원 로컬·데모가 모두 MockJudge만 나옴. 원인은 `.env`(프록시 URL)가 각자에게 없어서.
  - 프록시 URL은 비밀 아님(키는 Cloudflare secret). 모두 이 프록시=임재윤 할당량(3.1-flash-lite RPD 500) 공유.
  - 탈출구: `VITE_JUDGE_MOCK=1` → MockJudge 강제(오프라인·할당량 절약). `VITE_JUDGE_PROXY_URL` → 다른 프록시.

## 판정기 운영·할당량 방침 (2026-07-14 팀 논의)

키·할당량 관련 팀 논의 결론(대화 반영):

- **기본 = 팀 공용 프록시 하나 공유**: 모두 임재윤 Gemini 키/할당량을 프록시 경유로 공유한다.
  현재 모델 `gemini-flash-lite-latest`(= 3.1 Flash Lite), 무료 한도 **RPM 15 / RPD 500**.
  팀원은 **개인 API 키 발급 불필요** — `git pull`만 하면 임재윤 할당량으로 Gemini 동작(설정 0).
  (프록시 URL은 비밀 아님. 실제 키는 Cloudflare secret에만 존재.)
- **개발 중 할당량 절약**: 전투 등 대량 캐스팅 테스트는 `.env`에 `VITE_JUDGE_MOCK=1` → MockJudge(무료·즉시)로 돌려
  공용 할당량을 보존한다. (판정 품질이 필요 없는 개발엔 이걸 권장)
- **할당량 부족 시 처리**: 임재윤이 **새 프로젝트 키 발급 → `$key | npx.cmd wrangler secret put GEMINI_API_KEY`**로
  프록시 키만 교체(2분). 코드·URL 불변, 팀원 무영향. (교체는 Cloudflare 계정 소유자만 가능 →
  다른 사람이 급하면 새 키를 소유자에게 전달하거나, 자기 프록시를 따로 씀)
- **개인 격리가 필요한 경우**: 해당 팀원이 자기 프록시를 별도 배포([proxy/README.md](../proxy/README.md)) 후
  `.env`의 `VITE_JUDGE_PROXY_URL`을 자기 URL로 지정 → 그 사람만 자기 할당량 사용.
- **근본 해결**: 키 교체가 잦아지면 **결제(유료 티어) 등록**으로 한도 대폭 상향(교체 자체가 불필요).
  ※ 다수 프로젝트 키를 돌려막는 방식은 ToS 회색지대라 지양.
- 관련 PR: **#4**(R2 판정 연결), **#7**(판정기 기본값을 GeminiJudge로 — pull만으로 팀 전체 동작).

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
