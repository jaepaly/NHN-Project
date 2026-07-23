# R2 (AI 시스템) 진행 로그 — 임재윤

> INCANT의 **판정(주문 해석) 시스템** 담당 파트 진행 상황.
> 규칙: **푸시할 때마다 이 파일에 "현재 어디까지 했는지"를 갱신해서 함께 커밋한다.**
> (팀 공용 1줄 기록은 [AI_USAGE_LOG.md](AI_USAGE_LOG.md), 이 파일은 R2 상세 로그)

- **담당**: 임재윤 (R2 — 판정 프롬프트·프록시 인프라·캐싱/폴백·보스 기억)
- **최근 갱신**: 2026-07-23
- **현재 상태**: **판정 코어 + 표현력 DSL(#101 소환 behavior·#133 형상 shape) 전부 완료·배포·머지.** #134 size·speed는 **팬텀**(실 Gemini 40/40 정확)으로 종결, 진짜 결함이던 Mock 수식어 맹인은 총괄 #138로 수정. **제출물 ④ AI 활용 기술 문서·PDF 둘 다 머지·git 공유 완료**(PR #130·#142). → **남은 것 = 자투리(실뎀 검증·#67 §5·#112)뿐.**

> **▶ 2026-07-23 판정기 안정화 확정 (curl 오진 규명)**: "lite 신형이 짧은 입력을 fizzle" 위기(#110)는 **판정기가 아니라 R2의 curl 테스트가 한글을 깨뜨린 것**이 원인이었음(Windows Git Bash 인코딩). 게임(브라우저)은 처음부터 정상. **Node/정상UTF-8 실측**으로 `gemini-3.5-flash-lite`(main 현재) 판정 품질·behavior DSL·난타 fizzle 전부 정상 확인. `gemini-2.5-flash-lite` 폐기(404)로 **모델 명시 핀(3.5)이 필수**·`-latest` 금지. 교훈: HTTP 판정 검증은 curl 인라인 말고 Node로. 총괄 #111(클라 원격 fizzle 비신뢰·Mock 복구) 머지됨.

## ▶ 다음 할 일 (2026-07-23 · **총괄 우선순위 — 07:40 정정**)

> **⚠️ 정정 이력**: 이 블록의 초판은 총괄이 배정한 *"#134 size·speed 지침(1순위) → #133 형상"* 이었으나,
> **R2 실측이 그 전제를 반증**했고 총괄이 재현·수용했다. 아래는 정정 후 순서다.
>
> - 총괄 초판 주장: *"프롬프트에 매핑 규칙이 없어 size·speed가 절반만 맞는다"*
> - **R2 반박(옳음)**: 실 Gemini는 **40/40 정확**. ❌ 사례는 전부 **MockJudge 폴백**이었다.
> - **총괄 재현 확인**: 캐시 제거 + `lastSource` 확인 재측정에서 `아주 빠른 얼음 화살`→small/fast,
>   `조그만 불씨`→small (출처 `gemini`). 오측정 7건을 Mock 공식(size=power파생/speed=form파생)에
>   대입하니 ❌ 4건 전부 일치·✅ 3건 전부 불일치 — **총괄 측정이 폴백을 Gemini로 오인**한 것.
> - 결과: **프롬프트 지침 PR #137 닫음**(R2 판단) · **폴백 품질은 총괄이 클라에서 해결**(#138 머지).
> - 교훈: 판정 측정은 **반드시 `lastSource` 기록** + 캐시 제거. 배치 페이싱이 15 RPM을 넘으면
>   폴백이 섞여 프롬프트 문제로 오인된다.
>
> _(참고 — 이도원: #125 저주방 답변(병목) → #72 stage2 배경 → #128 기본탄)_

**✅ 완료 — #133 형상(shape) DSL 2단계** ([PR #139](https://github.com/jaepaly/NHN-Project/pull/139) 총괄 머지, 07-23)
- [x] 프롬프트 6항 추가(`form=wall` + 모양 묘사 → shape) + 출력 스키마 shape 필드 노출. `spellShape.ts` 단일 소스와 정합(arc/line/zigzag/wave/ring/polygon, amplitude 1~100, sides 3~8). `JUDGE_PROMPT_VERSION` v2.4→v2.5, 버전핀 3곳.
- [x] Cloudflare 배포(349d207f) → **소스=배포 정합**.
- [x] 라이브 실측(Node 직접 호출 — Mock 오염 없음, #134 교훈 적용): **shape 수율 10/10**(zigzag·ring·polygon·wave·line 정확) · **오탐 0/6**(모양 묘사 없거나 wall 아니면 미출력→arc 폴백) · 전체 회귀 35/35.
- [x] 벽 렌더 기하 검증(실 브라우저 클라 코드): 6종 뚜렷이 구별 + **정면폭 불변식**(열린 형상 정면폭 고정 — 모양은 표현, 세기 영향 없음).

**~~#134 size·speed 프롬프트 지침~~ — 불필요 확정 (작업 없음)**
- [x] 실 Gemini 40/40 정확 (R2 실측, N=3·N=2 반복). 프롬프트 규칙 불필요 — 있어도 무해한 모델 이식성 보험 정도.
- [x] 진짜 결함이던 **MockJudge 수식어 맹인**은 총괄이 클라에서 해결 (#138 머지: `SIZE_KEYWORDS`·`SPEED_KEYWORDS`, 수식어 없으면 기존 파생 유지).

**🎯 남은 것 (active)**
- [ ] 실뎀 로깅 검증 — "같은 속성 뎀감 과한가", 로깅 diff 백업(`scratchpad/protoscene-dmg-logging.diff`) 새 ProtoScene 재적용 후 플레이(저우선, 심사 후 가능). **← R2 실작업으로 남은 유일한 항목(플레이 필요).**

**✅ 완료 (이번 국면 — 지우지 말고 아래 누적)**
- [x] **제출물 ④ PDF 제출·git 공유** — `docs/AI_USAGE_TECH.pdf` ([PR #142](https://github.com/jaepaly/NHN-Project/pull/142) 머지). 마크다운→HTML→Chrome headless 인쇄(10p, 한글·표·코드블록 정상). 팀원 `git pull`로 수령 가능. 문서 정확성도 함께: 프롬프트 버전 v2.4→v2.5(#133 정합), 1.5에 형상 DSL 서브섹션 추가.
- [x] **제출물 ④ 문서** — 초안 1~3부·**총괄 리뷰 통과·머지**([PR #130](https://github.com/jaepaly/NHN-Project/pull/130)). 총괄이 코드와 한 글자까지 대조 확인.
- [x] **#133 형상 shape DSL** — 배포·실측(shape 10/10·오탐 0·기하 6종)·머지(#139). *(상세 ↑ 완료 블록)*
- [x] **#134 size·speed 팬텀 규명** — 실 Gemini 40/40 정확, 진짜 결함 Mock은 총괄 #138로 수정. *(상세 ↑ 완료 블록)*
- [x] **§6 API 재점검** — 마나 환류(#121) 반영 (PR #127).
- [x] **#112 계약 무결성 검증** — 이도원 저주방 PR이 #77 계약을 소비하나 코드 추적. **발견**: tier는 계약(`runEscalationProfile().tier`)에서 잘 받으나, 게이트를 `gimmicksUnlocked`(계약이 저주방용으로 노출한 필드) 대신 `ROOM_CURSE_CONFIG.unlockTier:3`으로 **중복 정의** → `gimmicksUnlocked`가 **죽은 필드**·값 드리프트 위험. **기능은 정상**(둘 다 3). 비차단 리뷰 코멘트로 "게이트에 `gimmicksUnlocked` 소비" 제안([PR #112 comment](https://github.com/jaepaly/NHN-Project/pull/112#issuecomment-5057596217)).
- [x] **#67 §5 주문 판정 계약 검증** — 능동 마나 정식화 중 R2 몫. ① API 빈도: `SUBMISSION_PLAN §6`에 반영 완료(감쇠 #122는 호출↑ 아님·호출당 효율↑, 진짜 리스크=동시접속→유료전환). ② `spec.cost` 계약: `degradedCastPlan(spec.cost)`→`trySpendMana(spend)`+`ratio`를 위력에 곱함(ProtoScene:2462·2498) 정합 확인, 죽은 필드·이중카운트 없음. 수치 밸런스는 총괄 플레이테스트 몫. [#67 comment](https://github.com/jaepaly/NHN-Project/issues/67#issuecomment-5057681332).

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

## Phase 5 진행 체크리스트 — [PHASE_5.md](PHASE_5.md) R2 (트랙 B 연구·게이트 + 판정·도구 유지보수)

> Phase 5 = 프레젠테이션 집중·밸런스 마감. R2는 **Track B 실험(게이트, 컷 가능)** + 판정/도구 유지보수. 핵심 시스템 변경은 총괄+이도원 승인.

| # | 작업 | 상태 |
|---|---|---|
| B ①53 | 시전 경제 프로토타입 (위력 비례 쿨다운) | ✅ 종결 — **팀 C안(능동형 마나) 채택**, 내 쿨다운 PR #60 CLOSED (근거 기여) |
| B ②56 | 조준 타겟팅 (해석 불일치 UX) | ✅ R2 리뷰 완료 (총괄 프로토타입 PR #55) |
| B ③77 | 런 반복 격상 — 회차 쌓일수록 "지난 답 안 통하게" | ✅ 완료 — 코어 PR #84 머지 + 총괄 #87 개선 + 이도원 #90 이중저항 소비 |
| B ④반복 | 반복 억제 리프레임 — 페널티(power) → 다양성 보너스(당근) | ✅ 머지 (PR #94 + #99 완화 — 당근이 주 신호) |
| B ⑤101 | 소환 behavior DSL — LLM이 소환수 움직임 설계 | ✅ 머지·검증 (PR #106, 3.5에서 behavior 6종·시퀀스 실측) |
| C-API | 능동형 마나(#53-5): 시전 경제 → API 호출빈도·비용 영향 | ✅ 초판 완료 (§6, #53-5). ⚠️ **#121 영창환류로 경제 진화 → §6 재점검 진행** |
| 도구 | 플레이 판정 로거(`logs/play.jsonl`) · README 판정 안내(실제 Gemini 기본) | ✅ 머지 (PR #41·#61) |
| 인프라 | 프록시 CORS localhost 임의 포트 (Mock 조용한 폴백 방지) | ✅ 머지 (PR #40) |

**▶ ①53 시전 경제 종결 (2026-07-21)**: A(위력쿨다운, 내 PR #60)·B(마나 심화)·C(능동형 마나 회복, 이도원 #66) 3안 논의 → **총괄 C안 채택**(#66 main 병합). 내 쿨다운은 미채택이나, "현행 마나=vestigial(3초 쿨다운이 버스트 죽임)" 진단을 실측으로 확인시켜 **C 채택의 발판**이 됨(총괄 명시). 정식화(#67)는 이도원 담당. **R2 잔여 = #53-5 (쿨다운 변화의 API/비용 영향 확인)뿐.**

**▶ ③77 런 반복 격상 (완료)**: `runEscalation.ts` 순수 로직(회차→격상 프로필: 과의존 원소 약화·기믹/이중저항 티어) + ProtoScene 훅 → **PR #84 머지**. 총괄이 후속 개선(#87: 프로필 런-시작 캐시·약화 안내 방마다 1회) + 이도원이 `bossDualResistance` 소비(#90 티어4 보스 이중저항). 계약대로 소비까지 확정 — 죽은 코드 아님.

**▶ ④ 반복 억제 리프레임 (신규, 나 할당) — 2026-07-22**:
- **발단**: #85(반복 페널티를 판정 요소 기반으로 일반화)를 이슈로 다듬음 → 총괄이 #88로 구현했으나 **시그니처(effect:원소:폼)가 위력을 안 봐서** 약불(30)→강불(90) 강화를 "재탕"으로 오인 → `runMemory.topSpellPower` 오염 → `test:runmemory` red(#91, main gate).
- **진단 교정(정직 기록)**: 나는 "페널티가 power에 박혀 층이 잘못"이라 봤으나, **총괄이 더 정확**했다 — `spellHistory`엔 이미 `basePower`(순수)/`power`(패널티후)가 분리돼 있었고, **`runMemory.summarizeRun`이 `power`를 읽은 한 줄**이 진짜 원인. 진화·주문서는 이미 `basePower`를 읽어 무오염. → 총괄이 `basePower` 읽기로 게이트 즉시 해소(#93). **내 B(시그니처 위력반영)·리팩터 제안은 과했다.**
- **방향 결정(#92)**: 반복 억제 3중 장치(반복페널티·보스단기내성·#77) 중 **런 내는 "벌"이 아니라 "다양성 보상(당근)"**으로. 총괄 통찰 — **#77 격상은 메타(회차) 축의 채찍**이라 런 내까지 채찍이면 이중 처벌 → 런 내는 당근이 균형. **HP 인플레는 보류**(당근을 채찍으로 바꿈), 가산 보너스 먼저.
- **구현**: `spellDiversity.ts` — `diversityBonus(이번, 최근N)`→배율(≥1.0). 최근 window(3)와 다른 원소(0.6)·폼(0.4)일수록↑, 상한 **+30%(보수적)**. `basePower` 불변, ProtoScene 피해계산 시 `×escalationWeaken×diversity`로 곱함 + `COMBO +X%` 안내. `test:diversity` 9군. **밸런스 원칙 명문화: 세면 상한을 낮춘다, HP는 안 늘린다.** → **PR #94 (총괄 머지)**.
- **후속 밸런스 (총괄 #94 리뷰 지적, B 채택)**: `historyEntry.power`엔 기존 반복 페널티가 이미 곱해져 있어 **스틱(floor 0.3=−70%)이 당근(+30%)을 압도** → "당근 not 스틱"(#92) 실효 미달, 특히 **한 원소 마스터 플레이가 −70%로 죽음**. 총괄 의도="한 원소만 파도 플레이는 가능하되 불리". → `REPEAT_PENALTY` 완화: `perReuse 0.8→0.9`, `perSimilarReuse 0.9→0.95`, `floor 0.3→0.6`(최대 −40%). 반복=살짝 손해, 다양성=주 신호. `test:history` 리터럴을 심볼릭으로 교체(상수 따라감). 정확한 손맛은 R1 튜닝.

**▶ ⑤ 소환 행동 DSL 프롬프트 (신규, 나 할당 #101) — 2026-07-22 착수, 게이트 7/28**:
- 배경: 총괄 엔진(#104)이 `summonBehavior.ts`(DSL 스키마·검증·클램프)·`behaviorRunner`·`validate.ts` 소비까지 다 깔았고, **판정(프롬프트)만 behavior를 안 만들고 있음** = 생산자 부재. R2가 그 생산자.
- **1·2단계 (이 커밋)**: 프록시 프롬프트(`worker.js`)에 판단 5단계 + `behavior` 스키마 추가 — summon 주문에서만 스텝 시퀀스(orbit/chase/dash/zigzag/hold/retreat, steps≤6, 수치 클램프) 출력. 어휘·한계는 `summonBehavior.ts` 단일 소스에 정확히 일치. 순차 예시(zigzag→dash)로 L3 핵심(시퀀스) 못박음. `JUDGE_PROMPT_VERSION meaning-v2.2→v2.3`(캐시 무효화)·버전핀 테스트 갱신. 전체 회귀 30/30.
- **남은 것**: 3단계 프록시 배포(임재윤 Cloudflare) → 4단계 실 Gemini yield 검증(자유 행동 묘사 ~20개, 유효 DSL ≥70%면 7/28 승격, 아니면 컷).
- 사슬 연결 확인(죽은 코드 아님): 프롬프트 생산 → `validate.ts:69 validateSummonBehavior` → `behaviorRunner` 실행.

**▶ C-API 확인 (#53-5)**: C안이 글로벌 쿨다운을 바꿔 시전 케이던스가 빨라지면 → Gemini 호출 빈도↑ 가능. 캐시·프록시 RPM(20/min)·무료 RPD(1000)와의 상호작용 실측 → SUBMISSION_PLAN §6 갱신. **C안이 이미 main이라 실시간 리스크 → 우선 처리.**

**▶ ②56 조준 리뷰 현황**: "어디=조준 / 무엇=LLM" 설계 의도가 코드에 준수됨(판정 불침해) 확인. nova(자기중심 변위)·chain(타겟 덮어씀) 우려 2건 → **코드추적 + 라이브 실플레이로 둘 다 문제없음 확정**. 비차단 코멘트만(기본 ON 의도 확인·매직넘버 800).

**▶ 판정·도구 유지보수**: 프롬프트 v2.2 유지(Phase 4 A). 잔여 영어 표현 ~10 편차는 모델 특성으로 보류(팀 결정 ~10 허용). 브라우저 localStorage를 외부에서 못 읽는 문제 → dev 로거로 `logs/play.jsonl` 남겨 피드백 루프 확보.

**▶ 교훈(오늘)**: 푸시 전 예행연습(fetch+로컬머지+전체회귀)로 버전 불일치·브랜치 꼬임 사전 차단. subset 테스트 금지, 검증은 held-out으로.

---

## Phase 4 진행 체크리스트 — [PHASE_4.md](PHASE_4.md) §3 R2 (트랙 2: 성장 시스템 지원·폴리싱)

> 기간: ~2026-07-26 프리즈. R2는 **판정 품질 튜닝 + evolve-name 캐시 + 할당량 정책**이 몫. 성장 시스템 본체(각인·정령·진화)는 총괄, chain·cage 폼은 R1.

| # | 작업 | 상태 |
|---|---|---|
| A | **판정 품질 튜닝** — 교차언어 일관성 규칙+창의성 기준 프롬프트(v2.1)·`promptVersion`↑·재배포. **N=4 정량 검증**: 판정기 거의 결정론적(편차 0), 교차언어 격차 ~2.5 | ✅ 완료 (제출물 ④ 사례 확보) |
| B | **`/evolve-name` 클라이언트 캐시** — 총괄 ④ 소비 확정(런당 진화·융합 각 1~2회). localStorage 키 `kind+정렬elements+baseName`, 버전 접두사 `incant:evolvename:name-v1.0:` | ✅ 완료 (`evolveName.ts` 캐시, `test:evolvename` 5군. 브라우저 실측은 ④ 결합 시) |
| C | **심사 기간 할당량 정책 초안** — 실측 한도(무료 15RPM/1000RPD)·호출 프로필·대응 4단·비용($0.00014/콜) → SUBMISSION_PLAN §6 | ✅ 완료 (실제 사실 조회: RPD는 500이 아닌 1000, 모델 2.0 종료→별칭 승계 발견) |
| D | 여유 시: 보스 대사·작명 다양화 | ✅ 확인 완료 — **작업 불필요** (temp 0.9로 이미 충분히 다양, 실측) |

**▶ 현재 위치**: Phase 4 R2 트랙 **A·B·C·D 전부 완료** (`feat/phase4-r2`, PR #31). 성장 시스템 본체(총괄)·chain·cage 폼(R1)은 진행 중 — R2는 지원 완료. 대사·작명 다양성(D)은 temp 0.9로 이미 충족돼 실측 후 작업 불필요로 종결.

**▶ 캐시 주의**: 프롬프트 버전이 클라(`EVOLVE_NAME_PROMPT_VERSION`)·서버(`worker.js EVOLVE_NAME_PROMPT`) 양쪽 → 서버 프롬프트 변경 시(D) 클라 버전도 올려 옛 캐시 무효화. 판정 캐시(`JUDGE_PROMPT_VERSION`)와 동일 패턴.

**▶ 발견성 구멍 수정**: `getEvolvedName`이 공개 계약(`bossMemoryContract`)에 **누락**돼 있었음(총괄이 "계약 파일 하나"에서 import한다는 전제 위반) → 노출 + 계약표면 회귀 추가 + PR #31 코멘트로 소비 가이드·의도확인 질문 2개 전달. **진짜 소비자는 아직 0개** — 통합 정합성은 총괄 진화 코드 작성 시 확정.

**▶ A 판정 품질 검증 (제출물 ④ 사례 — 정직한 프로세스 기록)**:
- 프롬프트 개선: 교차언어 동일 power 규칙 일반화("숲의 분노"="forest fury") + 창의성 가점을 구체성·서사성에만 한정. `JUDGE_PROMPT_VERSION` meaning-v2.0→v2.1(캐시 무효화)·재배포.
- **N=1 스냅샷의 함정**: 단일 실행 전/후는 23→24였으나 +1은 전부 코퍼스 수정("죽어버려" 공격주문 cast, 팀 결정)이었고 교차언어 격차는 그대로 보임. → 성급한 결론 2개(가짜 개선/가짜 노이즈) 발생.
- **N=4 정량 재검증**: 판정기는 **거의 결정론적**(숲의분노·라이트닝·걸작 모두 편차 0), 교차언어 평균 격차 **숲/forest 2.5·라이트닝 0.0**. 유일 불안정은 `forest fury`(65~85). → 결론: 판정 품질은 이미 우수, 프롬프트로 더 짜낼 여지 적음. 개선은 "명시적 규칙화"로서 유지.
- **편향 정정 (v2.2)**: v2.1 프롬프트에 코퍼스 문구("숲의 분노"/"forest fury")를 예시로 박아 **teaching-to-the-test** 소지가 있었음(검증도 같은 문구로 해 오염). → 프롬프트에서 특정 예시 제거·순수 원리로 교체(v2.1→v2.2), **held-out 쌍**(프롬프트·코퍼스에 없는 신규 3쌍)으로 재검증: 평균 격차 5.0(오염)→**3.3(무오염)**, 2/3쌍 완벽 일치. 코퍼스 회귀 없음(24/26). → 규칙은 예시 없이도 일반화. **잔여 한계**: 일부 영어 서사 표현이 한국어 대비 ~10 낮음(모델 특성).
- **교훈**: LLM 품질 주장은 N=1로 하면 안 됨(다회 평균). 그리고 **검증 데이터는 프롬프트/튜닝에 쓴 예시와 분리**해야 함(held-out) — 안 그러면 편향된 초록불.

**▶ 오늘(7/19) 팀 전달 사항 (총괄·R1 참고)**:
1. **판정 일반화 실측 (편향 아님 확인)**: 코퍼스·프롬프트에 없는 신규 14개(문장형 걸작·일상문장·불발·금칙·영어)로 held-out 검증 → **전부 의도대로**. 문장형 걸작은 안정적으로 **power 95**(별들의 심판·화산의 분노 등), 일상문장은 창의적 cast(저녁 메뉴의 계시 25 등), 불발→fizzle, 금칙→blocked, 영어 문장형도 95. → 판정은 특정 프롬프트에 과적합 아님, 제출물 ④ 근거.
2. **⚠️ 스테이지 power 캡 미구현 (총괄 엔진 몫)**: GDD §3.4 "밸런스 가드레일(엔진 강제)"의 **스테이지 캡(S1:60/S2:80/S3:100)이 코드에 없음**(Clamp는 좌표·HP용뿐). 현재 S1에서도 95 그대로 나감. 판정은 GDD대로 원본 60~100을 주는 게 정상(클램프는 엔진 몫). **이는 임재윤이 Phase 2에서 이미 플래그한 "캡이 프롬프트 부탁일 뿐 엔진 강제 아님"(R2_PROGRESS:175/195) 이슈와 동일** → 총괄 power 엔진 작업 시 함께 반영 요망.
3. **보스 대사 UX (총괄/R1 몫)**: `announceSystemMessage`가 모든 메시지를 화면 중앙(0.42h) 같은 자리에 **700ms·큐 없음**으로 표시 → 보스 등장 3메시지(0/500/1500ms)가 **겹치고 너무 빨리 사라짐**(박재현·이도원 보고). 수정 방향: 메시지 큐잉 or 세로 스택 + 보스 대사 지속시간 ↑(2~3초). R2 대사 *내용*은 정상, 표시 유틸 문제.
4. **Phase 1~4 의도 정합성 감사**: 판정 v2(GeminiJudge 활성)·반복 패널티(데미지·힐·실드·버프 전부 적용)·보스 기억(ProtoScene 소비, E2E 검증) 모두 실연결 확인. 미연결 orphan은 `getEvolvedName` 하나(총괄 진화 코드 대기, 계약 노출됨).

**▶ 관련 소식**: 내 **런 기억 이중 기록 레이스**(사망 직후 장판 틱이 보스 처치 → lose+win 이중)를 총괄이 QA 중 발견·**PR #27로 수정**(`deathHandled` 선점 가드). 유사 레이스 만질 땐 이 패턴 따를 것.

**▶ 경계**: `SpellSpec` 변경 없음 예정. 개발은 `VITE_JUDGE_MOCK=1`+템플릿 폴백, 라이브 Gemini 최소(evolve-name은 ④ 결합 검증 1~2회). 성장 시스템 본체는 총괄, chain·cage 폼은 R1.

---

## Phase 3 진행 체크리스트 — [PHASE_3.md](PHASE_3.md) §3 R2 (트랙 2: 보스 기억·대사) ✅ 종료 (2026-07-19)

| # | 작업 | 상태 |
|---|---|---|
| ① | 내성 프로필 모듈 (`bossMemory`→최다원소 저항 ×0.3·최다폼 카운터, 순수함수+테스트) | ✅ 완료 (`bossMemory.ts`, `test:boss` 4군) |
| ② | 런 간 기억 (localStorage, `incant:runmemory:v1:` 버전 접두사) | ✅ 완료 (`runMemory.ts`, `test:runmemory` 4군) |
| ③ | 보스 대사 생성 (프록시 `/boss-line` + **폴백 템플릿 필수**) | ✅ 완료 ((a)클라이언트·폴백 + (b)프록시 배포·라이브 테스트) |
| ④ | 계약 파일 공개 (총괄 보스코어·R3 UI가 소비) | ✅ 완료 (`bossMemoryContract.ts`) |
| ⑤ | `/evolve-name` 엔드포인트 (Phase 3.5) | ✅ 완료·배포·라이브 실측 (PR #26) |

> **①~④는 총괄이 보스에 통합·라이브 검증 완료** (`a02046c` — 장기 fire×0.6 부분내성 + 기억 대사 실측). R2 Phase 3 핵심은 게임에 살아있음. **남은 건 ⑤(성장 시스템용, ~7/24)뿐.**

**▶ 현재 위치**: **R2 Phase 3 전 항목(①~⑤) 완료.** ①~④ 머지·게임 통합 검증(총괄 `a02046c`). ⑤ `/evolve-name` 배포·라이브 실측(PR #26). **라이브 통합 테스트도 완료** (아래 "라이브 실측" 참고).

**▶ 검증**: R2 회귀(boss·runmemory·bossline·history) + 전체 빌드 통과 · `/boss-line` 라이브 · **보스전 통합 실측**(총괄 E2E: 런2 영창 0회에도 장기 fire×0.6 부분내성 + 기억 대사 발동).

**▶ 총괄 통합 가이드**: `import { computeResistance, longTermResistedElement, loadRunMemory, saveRunMemory, summarizeRun, updateRunMemory, getBossLine } from './spell/bossMemoryContract'`
- 보스방 진입: 초기 저항 = `longTermResistedElement(loadRunMemory())`(장기·부분) + 진행 적응 = `computeResistance(history.bossMemory())`(단기·강)
- 대사: `await getBossLine(runMemory)` (프록시 실패해도 템플릿 폴백)
- 런 종료: `saveRunMemory(updateRunMemory(loadRunMemory(), summarizeRun(history, 'win'|'lose')))`

**▶ 라이브 실측 (2026-07-16, 임재윤 직접 영창 테스트)** — 전부 의도대로:
- **① 판정**: "번개를 품은 해일"→water+lightning/wave/pow85 · "배고파 죽겠다"→**heal/self**(의미판정) · "나를 보호해줘"→**shield/self** · "ㅁㄴㅇㄹㅁㄴㅇ"→**fizzle** ✅
- **③ 보스 대사**: 첫조우→초심자 조롱 / 불3사망→"세 번이나 태양의 파편을 휘둘렀건만" / 번개2승→"뇌전해일로 운 좋게 두 번…" — **사망·주문·원소·승패 전부 반영** ✅
- **⑤ 작명**: 진화 "돌덩이 투척"→**"대지의 진노"** / 융합 ice+dark→**"빙결된 심연"** / light+fire→**"성스러운 열화"** ✅

**▶ 관찰 (버그 아님, 총괄 참고)**: 판정 power(예: "돌덩이 투척" pow45=평범)와 **진화는 별개** — 평범 주문도 각인·강화 시 진화·격상 작명됨(설계 의도대로). "약한 주문 진화 제한" 같은 조건이 필요하면 총괄 각인 시스템 쪽 결정.

**▶ 결과 (2026-07-19 Phase 3 종료)**: ①~⑤ 전부 main 머지·통합. ⑤ 캐시 위치는 Phase 4에서 총괄 소비 방식 확정으로 해소(→ Phase 4 B). 다음 작업은 Phase 4 섹션 참고.

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

### ⑤ `/evolve-name` (Phase 3.5) — ✅ 완료·배포·라이브 실측 (PR #26 머지)

- **뭘**: 각인 주문 **진화**·정령 **융합** 시 결과물의 **격상 주문명**을 짓는 엔드포인트 ([PROGRESSION_DESIGN.md](PROGRESSION_DESIGN.md) §5). "속성"이 아니라 "**이름 작명**".
- **패턴 = `/boss-line`과 동일**. 소비자: 총괄 성장 ④(진화·융합). 컷 시에도 템플릿 작명만으로 동작.

**세부 5단계**:
- [x] **Step 1 계약 + 폴백 템플릿** — `evolveName.ts`: `EvolveNameRequest`(evolve/fuse), `sanitizeName`(12자), `templateEvolvedName`(『{원소} 대격변』/`불꽃·뇌전 융합`).
- [x] **Step 2 클라이언트** — `getEvolvedName(req)`: 프록시 우선 → 실패·타임아웃·무효 전부 템플릿 폴백(throw 없음).
- [x] **Step 3 프록시 라우트** — `worker.js`에 `/evolve-name` + `EVOLVE_NAME_PROMPT`(temp 0.9). `{name}` 반환.
- [x] **Step 4 배포 + 라이브 확인** — 실측: fuse fire+lightning→"업화의 뇌격", evolve 화염구→"업화의 심핵". boss-line·판정 무손상.
- [x] **Step 5 회귀 테스트 + 커밋 + PR** — `test:evolvename` 3군 + PR #26. 라이브 실측(위 참고).

**⑤ 결정 필요 (총괄 확인)**:
- **작명 캐시 위치**: 진화는 "런당 1~2회 + 캐시"(PROGRESSION §2)라 **같은 진화=같은 이름**이 맞음. 근데 캐시를 (a) 무기 객체에 이름 저장(총괄측, /evolve-name 재요청 없음) vs (b) `/evolve-name`/클라이언트에서 문장→이름 캐시(판정 캐시 패턴 재사용) 중 어디서 할지는 총괄 소비 방식에 달림. → **지금은 캐시 미구현(성급 회피), 총괄 진화 구현 시 5분 내 붙임.**
- 스키마: `/evolve-name`은 `{name}`, `/boss-line`은 `{text}`, 판정은 v2 유니온 — 소비자 혼동 방지 위해 계약 파일에 `getEvolvedName` 명시 필요.

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
