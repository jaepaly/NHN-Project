# AI 활용 로그 (제출물 ④ 원천 데이터)

> **규칙**: 에이전트로 유의미한 작업을 할 때마다 즉시 아래 표에 1줄 추가.
> 나중에 몰아 쓰면 디테일이 사라진다. "프롬프트 요약"은 나중에 문서에 인용할 수 있게 핵심 지시를 남길 것.
> 형식: 최신이 위로.

| 날짜 | 담당 | 도구 | 작업 | 프롬프트/지시 요약 | 산출물 | 비고 |
|---|---|---|---|---|---|---|
| 2026-07-19 | 이도원 | Codex + GitHub | R1 Phase 2~4 작업 로그 누락 복구 | 로컬 Git 커밋과 GitHub PR 메타데이터를 대조해 Phase 2 병합 상태를 갱신하고, Phase 3 사운드·타이틀·보스 리뷰 및 Phase 4 chain/cage·보스 BGM·배경 색조 작업을 R1 역할·협업 경계·검증 중심으로 역기록 | `docs/R1_PROJECT_WORK_LOG.md`, `docs/AI_USAGE_LOG.md` | PR #15~#18·#20~#25·#29·#30·#32와 실제 head SHA를 근거로 작성. 기능 코드는 변경하지 않음 |
| 2026-07-19 | jaepaly | Claude Code | Phase 3 통합 QA + 런 기억 이중 기록 버그 수정 | 타이틀→3방 런→보스 풀런 E2E(Mock, 백그라운드 탭 수동 스테핑). 검증: 타이틀 전환·시드 보상 풀(방마다 상이)·신속 영창 쿨다운 3.0→2.6·단기 내성 fire 100→30·rush 카운터 ×1.6·하수인 소환·패배/승리 요약·재시작. QA 중 발견: 사망 선행 후 보스 처치(장판 틱 레이스) 시 run-completed가 persistRunMemory('win')을 가드 앞에서 호출해 한 런에 lose+win 이중 기록(deaths·clears 동시 증가) → 핸들러 상단 deathHandled 가드로 승리 기록·연출 전부 선점 차단. 레이스 재현으로 수정 실측 | `ProtoScene.ts` run-completed 가드 | 회귀 4종·빌드·콘솔 무오류. 스테핑 시계 역행 함정(성능시계 재사용) 발견 — loop.now 기준 단조 시계로 해결 |
| 2026-07-16 | 임재윤 | Claude Code (Opus 4.8) | R2 Phase 3.5 ⑤: /evolve-name 진화·융합 작명 | boss-line과 동일 패턴으로 진화/융합 작명 엔드포인트. evolveName.ts(계약·sanitize·템플릿 폴백·getEvolvedName) + worker.js /evolve-name 라우트·프롬프트 배포. 실측: fuse fire+lightning→"업화의 뇌격", evolve 화염구→"업화의 심핵". 라이브는 테스트 제외(폴백·순수함수만 회귀 3군). 캐시 위치는 총괄 진화 소비 방식 정해지면 결정(백로그) | `src/spell/evolveName.ts`, `proxy/worker.js`(배포), `scripts/evolve-name-regression.ts`, `test:evolvename` | boss-line/판정 무손상 확인. getEvolvedName은 string 반환(스키마 추상화) |
| 2026-07-16 | 이도원 | Codex | Phase 3 타이틀 화면·메타 구현 | 코드 타이포그래피와 Phaser 도형으로 INCANT 타이틀 씬을 구성하고 Enter/클릭 전환, Noto Serif KR, SVG 파비콘, 1200×630 OG 이미지와 메타 태그를 구현 | `src/scenes/TitleScene.ts`, `src/main.ts`, `index.html`, `public/assets/favicon.svg`, `public/assets/og-incant.svg`, `public/assets/og-incant.png`, `docs/ASSET_CREDITS.md` | 타이틀 비주얼은 외부 이미지 생성 없이 코드 기반으로 제작. OG PNG는 자체 SVG를 래스터 변환 |
| 2026-07-16 | jaepaly | Claude Code | 기억하는 보스 통합 (총괄 — R2 계약×보스 코어×사운드) | 자리표시자를 R2 bossMemoryContract로 교체: 단기 computeResistance(+counterStrategy를 돌진/탄막 패턴에 적용), 장기 longTermResistedElement 부분 내성(×0.6), getBossLine 오프닝, 승패 시 runMemory 저장, boss-appear SFX. E2E 2연속 런: 런1 fire×0.3+rush → 승리 저장 → 런2 영창 0회인데 장기 fire×0.6 + "겁화의 해일로 운 좋게 이겼다고 자만 마라" 기억 대사 실측 | `ProtoScene.ts`, `bossEnemy/bossConfig`, 자리표시자 삭제, 회귀 재편 | 회귀 11종·빌드·콘솔 무오류 |
| 2026-07-16 | 임재윤 | Claude Code (Opus 4.8) | R2 Phase 3 ③(b): 프록시 /boss-line 엔드포인트·배포 | worker.js에 경로 라우팅(/boss-line)과 보스 대사 프롬프트(temperature 0.9) 추가 후 Cloudflare 배포. 런 요약→위협 대사 실측(첫조우·재도전에서 최고주문·애용원소·사망 반영), 기존 판정(/) 무손상 확인 | `proxy/worker.js` (배포됨) | 라이브 최소 검증. 판정 로직 무변경(추가만) |
| 2026-07-16 | 임재윤 | Claude Code (Opus 4.8) | R2 Phase 3 ③(a): 보스 대사 클라이언트·템플릿 폴백 | getBossLine(런요약)→프록시 /boss-line 우선, 실패·타임아웃·첫조우엔 템플릿 폴백(보스는 반드시 말함). sanitize(공백·길이80), 상태별 템플릿(첫조우/애용주문/원소/사망). 프록시 엔드포인트(b)는 후속 | `src/spell/bossLine.ts`, `scripts/boss-line-regression.ts`, `test:bossline` | 회귀 5군·tsc 통과. 폴백 우선 개발(라이브 최소) |
| 2026-07-16 | 임재윤 | Claude Code (Opus 4.8) | R2 Phase 3 ②: 런 간 기억 (localStorage) | 런 종료 요약(사망·클리어·애용원소·최고피해주문·마지막결과)을 버전 접두사(incant:runmemory:v1:) localStorage에 누적. 순수 갱신 함수 + storage 주입형 로드/저장. 누적 내성 밸런스 함정을 최근 5런·최다 1개(longTermResistedElement)로 완화 | `src/spell/runMemory.ts`, `scripts/run-memory-regression.ts`, `test:runmemory` | 회귀 4군·tsc 통과. ①단기+②장기 조합해 총괄 보스코어가 소비 |
| 2026-07-16 | 임재윤 | Claude Code (Opus 4.8) | R2 Phase 3 ①: 보스 내성 프로필 (계약+순수함수) | bossMemory 요약 → 최다 원소 저항(피해×0.3)·최다 폼 카운터 전략(rush/ranged) 계산하는 순수 함수와 계약 타입(BossResistanceProfile) 공개. minCasts 3 게이트. 전투 적용은 총괄 보스 코어가 소비 | `src/spell/bossMemory.ts`, `scripts/boss-resistance-regression.ts`, `test:boss` | 계약 우선 패턴, 회귀 4군·tsc 통과. ② 런간기억은 누적 내성 밸런스 완화 예정 |
| 2026-07-16 | 이도원 | Codex | Phase 3 R1 사운드 에셋 편집·Phaser 통합 | Adobe Firefly 채택 음원을 무음 정리·페이드·피크 정규화하고 전투 BGM을 인트로+크로스페이드 루프로 편집. Phaser preload와 `playCast(element)`/`playSfx(name)`/`playBgm()` API, 전역 볼륨 0.5, M키 음소거 및 localStorage 저장을 구현하고 전투·UI 이벤트에 연결 | `public/assets/audio/`, `scripts/process-audio-assets.py`, `scripts/create-bgm-loop.py`, `src/audio/gameAudio.ts`, `src/scenes/ProtoScene.ts`, `docs/ASSET_CREDITS.md` | 실제 후보 청취와 최종 채택·루프 경계 승인은 사용자 수행. Codex는 파형 분석, 편집 자동화, 코드 통합 및 빌드 검증 수행 |
| 2026-07-16 | 이도원 | Codex | R1 Phase 2 광역 폼 렌더러·자동 조준 구현 | zone·rain을 추가하고 원형 광역은 적 위치·중간점 중 최다 적중 중심을, beam·wave는 적 방향·중간 각도 중 최다 적중 회랑을 자동 선택하며 control 장판은 마지막 틱 뒤 0.5초 내 해제되도록 연결 | `areaSpellConfig.ts`, `spellRenderer.ts`, `ProtoScene.ts`, `area-forms-regression.ts`, `test:forms` | 임시 범위·지속시간·타격 배율 기록, 광역·방향 회귀 18군·control 회귀 6군·전체 회귀·빌드·Mock 브라우저 렌더링 및 콘솔 무오류 확인 |
| 2026-07-16 | jaepaly | Claude Code | 성장 시스템 ① 보상 풀 확장 | "보상이 매 런 동일" 피드백 → PROGRESSION_DESIGN 설계 후 시드 랜덤 3택(mulberry32, 재현 가능)·신규 패시브 3종(신속 영창/마나 격류/수호 기점)·RewardKind 계약 확장. 기존 R1 회귀는 고정 추첨 주입으로 의미 보존 | `rewardConfig.ts` 풀·추첨, `runController.ts` 시드 RNG·ward, `playerCombatState.ts` 쿨다운 감소·재생 배율, 카드 UI 색/라벨, 회귀 7군 | E2E: 방마다 다른 카드, 수호 기점 개막 +30, 쿨다운 3.0→2.6 실측 |
| 2026-07-16 | jaepaly | Claude Code | Phase 3 보스 전투 코어 (총괄 트랙) | 마지막 방=보스방 관례로 RunController 무변경 통합. 보스(방사 볼리·하수인 임계 소환), bossMemory 기반 원소 내성 ×0.3(R2 계약 지점 분리), 기억 템플릿 대사, 승리/패배 런 요약 오버레이·Enter 재시작. E2E 중 승패 동시 확정 레이스 발견 → 선점 가드로 수정 | `combat-core/boss/` 3종, `runSummaryOverlay.ts`, reset API, `test:boss-core` 5군 | 내성 실측 fire 15 vs water 50(정확히 ×0.3), 전 회귀 8종·빌드·콘솔 무오류 |
| 2026-07-16 | jaepaly | Claude Code | Phase 2 종료·Phase 3 지시 게시 | 통합 QA(Mock/라이브 각 2방 완주·콘솔 무오류)로 Phase 2를 닫고, INCANT 확정·에셋 트랙 이도원 이관·AI 사운드 우선 방침을 반영한 Phase 3(기억하는 보스&에셋) 지시문 작성 — 이도원용 에셋 제작 에이전트 가이드(도구·프롬프트·통합 API·라이선스) 포함 | `PHASE_3.md`, README·GDD·ROLES 갱신 | 라이브 검증은 캐시 활용으로 Gemini 할당량 0 |
| 2026-07-15 | jaepaly | Claude Code | R3 런 UI 결합 (Phase 2 R3 P0 완료) | RunController 공개 계약만 소비하는 바인딩 모듈로 카드·전환·HUD를 이벤트에 연결(씬 무접촉), 데모 훅 제거. 브라우저 E2E: 방1 클리어→카드 자동 표시→키보드 선택→ROOM 2 전환 연출→친화 HUD 칩→RUN COMPLETE까지 완주, 콘솔 무오류 | `ui/runUiBinding.ts`, `main.ts` | R1 #15~17 검토·승인 후 결합. 회귀 6종·빌드 통과 |
| 2026-07-15 | 이도원 | Codex | 공용 bolt 실시간 충돌 판정 수정 | 최초 조준 좌표 도착 후 잠근 적에게 적용하던 판정을 투사체의 프레임별 이동 구간과 살아 있는 적의 현재 위치를 비교하는 최초 충돌 판정으로 교체 | `boltCollision.ts`, 적 충돌 반경 계약, `spellRenderer.ts`, `ProtoScene.ts`, `bolt-collision-regression.ts`, `test:bolt` | 경로상 첫 적 적중·이동 회피·빗나감·투사체 반경 포함 회귀 6군 및 전체 회귀·빌드 통과, 플레이 검증 대기 |
| 2026-07-15 | 이도원 | Codex | R1 Phase 2 control·summon 효과 구현 | 미정인 상태이상 전체를 확장하지 않고 control을 직접 피해 없는 이동 둔화에 연결하고, summon을 제한 시간 동안 플레이어를 따라다니며 자동 공격하는 구체로 축소 구현 | `control/`, `summons/`, 적 공통 update 계약, 공용 아군 투사체, `ProtoScene.ts`, control·summon 회귀 테스트 | 둔화·소환 수치는 임시값, 회귀·빌드·control/summon 플레이 검증 완료, 전용 폼 렌더러는 후속 작업 |
| 2026-07-15 | 이도원 | Codex | R1 Phase 2 런·보상 코어 및 전투 씬 연결 | PR #12 계약을 구현한 2개 방·결정론적 3택 보상과 최대 HP·마나 성장을 만들고, 전투 phase 정지·방 초기화·R2 주문 히스토리 반복 패널티·원소 친화를 실제 영창 흐름에 연결 | `PlayerCombatState`, `rewardConfig.ts`, `runController.ts`, `ProtoScene.ts`, `run-controller-regression.ts`, `test:run` | 런 회귀 6군·기존 주문/히스토리 회귀·프로덕션 빌드·로컬 브라우저 무오류 확인 |
| 2026-07-15 | jaepaly | Claude Code | R3 보상 카드·방 전환·런 HUD 선행 구현 | R1 코어 대기 없이 계약 타입만으로 UI를 자립형 DOM 오버레이로 구현(전투 씬 무접촉). 카드 3택(마우스+1/2/3+화살표), 전환 페이드, ROOM/친화 HUD. 브라우저에서 키보드 완주·960×640 겹침 없음을 좌표 계산으로 검증 | `ui/rewardCardOverlay.ts`, `ui/roomTransition.ts`, `ui/runHud.ts`, main.ts 데모 훅 | rAF 정지(백그라운드 탭) 폴백 처리. R1 결합 시 데모 훅 제거 |
| 2026-07-15 | 임재윤 | Claude Code (Opus 4.8) | R2 Phase 2: 주문 히스토리·반복 패널티·보스 요약 | 검증된 cast 주문만 기록하는 런 단위 SpellHistory 모듈(기록/조회 API), 동일 정규화 문장 반복 시 power×0.8 로컬 패널티(floor 0.3), BossMemoryProfile 초안, node:assert 회귀 스크립트 | `src/spell/spellHistory.ts`, `scripts/spell-history-regression.ts`, `test:history` | 팀 재현스크립트 컨벤션 준수(Vitest 미도입), 7군 통과·tsc 통과 |
| 2026-07-15 | jaepaly | Claude Code | PR #11 검토 + R1↔R3 런 계약 제안 | v2 판정 계약·자원 미소모·회복/보호막을 코드와 브라우저 런타임(heal +21·shield +31·fizzle 자원 불변)으로 검증. R1 방/보상 계약 부재 확인 → 중복 구현 대신 인터페이스 계약 제안 | PR #11 검토 승인, `runContract.ts`, `R3_RUN_UI_CONTRACT.md` | 라이브 Gemini 미사용 (Mock·로컬 검증만) |
| 2026-07-15 | jaepaly | Codex | Spell Understanding v2 수직 구현 | 의미 있는 비마법 문장을 효과 주문으로 번역하고 무의미·금칙 입력은 자원 소모 없이 거부하도록 판정 계약, Mock/Gemini, 엔진 효과와 HUD를 연결 | `SpellJudgement v2`, 의미 우선 Worker 프롬프트, 회복·보호막·고정 회귀 스크립트 | 공용 Gemini 호출 없이 Mock 10입력·빌드 검증 |
| 2026-07-15 | jaepaly | Codex | Spell Understanding v2 설계 | 명시적 원소 키워드 의존과 공격 전용 스키마의 한계를 분석하고, 의미 우선 판정·회복/보호 효과·불발/금칙·캐시 버전·고정 회귀 코퍼스를 역할별 계약으로 설계 | GDD §3, `SPELL_UNDERSTANDING_V2.md`, `PHASE_2.md`, README | Phase 2 P0·절대 컷 금지로 승격 |
| 2026-07-15 | jaepaly | Codex | Phase 1 취합 종료·Phase 2 지시 설계 | R1/R2/R3 병합 상태와 Pages·Gemini 라이브 검증을 근거로 Phase 1 완료를 기록하고, W2 코어 루프를 역할별 계약·완료 기준·일정으로 분해 | `PHASE_1_SUMMARY.md`, `PHASE_2.md`, README, SUBMISSION_PLAN | 라이브 Gemini 요청 1회, `[gemini]` 확인 |
| 2026-07-15 | jaepaly | Codex | R3 영창 입력 포커스 회귀 수정 | Enter로 영창창을 열면 Phaser 키 캡처를 해제하고 짧은 렌더 구간 동안 입력 포커스를 재확인해 마우스 클릭 없이 바로 타이핑되도록 수정 | `ProtoScene.ts` | Enter→즉시 타이핑·Esc 후 재진입 브라우저 회귀 테스트 |
| 2026-07-15 | jaepaly | Codex | R3 영창 차징 UX·HUD·팔레트 | 영창 입력의 공명 게이지·판정 대기 연출, HP/마나/쿨다운 HUD, 주문 원소 팔레트와 판정 소스의 지속 표시를 구현하고 로컬 Mock 모드로 시각 검증 | `index.html`, `ProtoScene.ts`, `palette.ts`, README | 공용 Gemini 할당량 없이 빌드·브라우저 검증 |
| 2026-07-14 | 임재윤 | Claude Code (Opus 4.8) | R2 실제 LLM 판정 연결 (②③④) | 프록시 배포·디버깅(모델·시크릿·thinking 잘림 해결) → GeminiJudge 구현(2.5초 폴백·캐시·검증) → README/.env 문서화 | worker.js 개선, geminiJudge/createJudge.ts, .env.example, README | 무료 티어 함정 다수 해결(R2_PROGRESS 기록). ⑤ 품질 튜닝은 후속 |
| 2026-07-14 | 이도원 | Codex | R1 누적 작업·역할 문서화 | 역할 기술서와 PR 작성에 활용하도록 R1 태그, 작성자, 페이즈별 실제 커밋과 협업 경계를 계속 추가할 수 있는 담당자 전용 문서로 정리 | `docs/R1_PROJECT_WORK_LOG.md` | R1 이도원 전용, 실제 Git 이력과 역할 문서 기준 |
| 2026-07-14 | 이도원 | Codex | beam·wave 주문 폼 및 전투 마무리 | 직선 관통 광선과 전진형 파면의 다중 적 피해, 테스트 수치·긴 주문명 표시를 정리하고 R1 전투 로직만 `src/combat-core/`로 분리 | `feat/spell-renderer-forms`, 렌더러·전투 설정·주문 UI, 전투 로직 구조 | 공용 `render/scenes`는 최상위 유지, `SpellSpec` 구조 유지 |
| 2026-07-14 | 이도원 | Codex | 사수·분열체·혼합 웨이브 구현 | 공통 적 계약, 거리 유지형 사수의 탄막·접촉 피해, 처치 시 소형 2기로 분열하는 적과 글로우 정렬, 혼합 웨이브를 연결 | `feat/enemy-variety`, 사수·분열체·공통 적 모듈, 씬·웨이브 연동 | 적 수치와 웨이브 구성은 임시값 |
| 2026-07-14 | 이도원 | Codex | 웨이브 스포너·방 클리어 구현 | 적 생성, 전멸 판정, 웨이브 사이 대기와 마지막 웨이브 이후 방 클리어 상태를 관리자로 분리해 전투 씬에 연결 | `feat/wave-spawner`, `WaveManager`, `ProtoScene` 웨이브 연동 | 웨이브 수·구성·대기 시간은 임시값 |
| 2026-07-14 | 이도원 | Codex | 추격자·기본 전투 루프 구현 | 추격자 AI, 개체별 접촉 피해 쿨다운, 비관통 유도 기본 공격, 사거리 조정과 `power` 기반 주문 피해·처치 흐름을 구현 | `feat/enemy-chaser-combat`, `ChaserEnemy`, 전투 설정·씬 연동 | 기본 공격 및 적 수치는 임시값 |
| 2026-07-14 | 이도원 | Codex | 플레이어 HP·마나·글로벌 쿨다운 구현 | 전투 상태를 별도 모듈로 분리하고 주문 비용, 마나 회복과 3초 글로벌 쿨다운을 영창 흐름에 연결 | `feat/player-combat-state`, `playerCombatState`, `ProtoScene` 상태 연동 | 마나 회복량은 임시값 |
| 2026-07-14 | 이도원 | Codex | 플레이어 WASD·스크롤 카메라 구현 | WASD 이동, 대각선 정규화, 플레이어 추적 카메라, 월드 경계와 영창 중 이동 차단을 구현 | `feat/player-movement-state`, `ProtoScene` 이동·카메라 로직 | 카메라·월드 크기는 임시 결정 |
| 2026-07-14 | (사용자) | Claude Code (Opus 4.8) | 판정 정책 설계 | "이상한 텍스트(배고프다) 입력 시?" 논의 → 하이브리드 5티어 정책 확정 (주제 밖 입력도 창의적 해석, 상한 40) | GDD §3.3 갱신, 판정 프롬프트 반영 | 엣지 케이스를 게임 경험으로 설계 |
| 2026-07-14 | (사용자) | Claude Code (Opus 4.8) | 대회 조사·컨셉 기획 | NAN 2026 조사 → 트렌드 분석 → 컨셉 4안 비교 → "자유 텍스트 주문 로그라이크+기억 보스" 확정 | 컨셉 확정, GDD 초안 | 기획 단계부터 에이전트 주도 |
| 2026-07-14 | (사용자) | Claude Code (Opus 4.8) | 리포 셋업·문서화 | 리포 초기화, GDD/ROLES/SUBMISSION_PLAN 작성, Vite+Phaser 스캐폴드, 기술검증 프로토타입 | 이 리포 초기 커밋 | |

## 기록 대상 (예시)

- 프롬프트 설계·튜닝 세션 (판정 품질 개선 반복)
- 파티클 config 대량 생산 (원소×폼 조합)
- 코드 생성·리팩터링·디버깅 세션
- QA 스크립트/테스트 생성
- 문서·영상 대본·아트(이미지/사운드) 생성

## 통계 집계 (제출 직전 작성)

- 도구별 활용 비중: Claude Code __%, Codex __%, 기타 __%
- 작업 유형별: 코드 __%, 콘텐츠(config·밸런스) __%, 문서 __%, 기획 __%
- 총 세션 수 / 대표 사례 3건 (제출물 ④ 2부에 상세 인용)
