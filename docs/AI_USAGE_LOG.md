# AI 활용 로그 (제출물 ④ 원천 데이터)

> **규칙**: 에이전트로 유의미한 작업을 할 때마다 즉시 아래 표에 1줄 추가.
> 나중에 몰아 쓰면 디테일이 사라진다. "프롬프트 요약"은 나중에 문서에 인용할 수 있게 핵심 지시를 남길 것.
> 형식: 최신이 위로.

| 날짜 | 담당 | 도구 | 작업 | 프롬프트/지시 요약 | 산출물 | 비고 |
|---|---|---|---|---|---|---|
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
