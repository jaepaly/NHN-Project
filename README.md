# INCANT — 말이 곧 마법이 되는 로그라이크

> **NAN 2026 (NHN Game × AI Hackathon) 사전과제 제출작**
> 정해진 스킬은 없다. 당신이 입력한 문장이 곧 주문이 된다.

자유 텍스트로 주문을 영창하면 LLM이 의미·창의성을 판정해 실시간 이펙트로 구현하는 **AI-네이티브 로그라이크**.
보스는 당신이 쓴 주문을 기억하고 대비한다 — 매 순간 새로운 마법을 창작해야 살아남는다.

## 🎮 플레이

- **데모**: https://jaepaly.github.io/NHN-Project/ (기술검증 프로토타입)
- **조작**: WASD 이동 / **Enter** 영창 모드(슬로모션) → 아무 문장이나 입력 → 그것이 주문이 된다

## 🛠 로컬 실행

```bash
npm install
npm run dev     # http://localhost:5173
npm run build   # 프로덕션 빌드 (dist/)
```

### 판정기 설정

- **기본값: GeminiJudge(실제 LLM)** — 별도 설정 없이 팀 공용 프록시로 실제 판정이 동작한다.
  (프록시 실패·2.5초 타임아웃·할당량 초과 시 MockJudge로 자동 폴백하므로 게임은 멈추지 않는다.)
- **MockJudge를 강제**하려면 (오프라인·할당량 절약, 예: 전투 개발): `.env`에 `VITE_JUDGE_MOCK=1`.
- **다른 프록시**(유료 키 배포본 등)를 쓰려면: `.env`에 `VITE_JUDGE_PROXY_URL=<url>`.
- 프록시 배포/키 설정은 [proxy/README.md](proxy/README.md) 참조. (`.env`는 커밋 금지 — `.env.example` 참고)

## 📚 문서

| 문서 | 내용 |
|---|---|
| [docs/GDD.md](docs/GDD.md) | 게임 디자인 문서 (컨셉·주문 시스템·기억 보스·아키텍처) |
| [docs/ROLES.md](docs/ROLES.md) | 팀원 역할 분담 |
| [docs/SUBMISSION_PLAN.md](docs/SUBMISSION_PLAN.md) | 제출물 5종 계획 + 주차별 마일스톤 |
| [docs/AI_USAGE_LOG.md](docs/AI_USAGE_LOG.md) | AI 활용 로그 (전원 기록 의무) |
| [docs/PHASE_1_SUMMARY.md](docs/PHASE_1_SUMMARY.md) | Phase 1 완료 근거·검증 결과·이월 항목 |
| [docs/PHASE_2.md](docs/PHASE_2.md) | Phase 2 담당자별 작업 지시·완료 기준 (완료) |
| [docs/PHASE_3.md](docs/PHASE_3.md) | Phase 3 지시 — 기억하는 보스 & 에셋 (완료) |
| [docs/PHASE_4.md](docs/PHASE_4.md) | **Phase 4 지시 — 성장 시스템 & 폴리싱 (현재)** |
| [docs/PROGRESSION_DESIGN.md](docs/PROGRESSION_DESIGN.md) | 성장 시스템 설계 (보상 풀·각인·정령·진화/융합) |
| [docs/SPELL_UNDERSTANDING_V2.md](docs/SPELL_UNDERSTANDING_V2.md) | 자유 문장 의미 판정·비공격 효과·불발/금칙 설계 |

## 🏗 기술 스택

TypeScript · Vite · Phaser 3 · Gemini Flash (Cloudflare Workers 프록시) · GitHub Pages

## 👥 팀 & 협업 방식

| 이름 | 역할 | 담당 |
|---|---|---|
| **이도원** | R1 게임 코어 + 에셋 | Phaser 씬·전투·적 AI·이펙트 엔진 + **사운드·타이틀·디자인 (Phase 3~)** |
| **임재윤** | R2 AI 시스템 | 판정 프롬프트·프록시 인프라·캐싱/폴백·보스 기억 + 제출물 ④ |
| **jaepaly** | R3 콘텐츠·UX·총괄 | 영창 UX·HUD·콘텐츠 연출·배포·제출물 취합 |

작업 취합·검토·머지와 다음 페이즈 제시는 총괄(@jaepaly)이 담당한다.

### 페이즈 진행 사이클

```
① 총괄이 이 README에 "현재 페이즈" 작업 지시 게시
② 각자 feature 브랜치에서 작업 (에이전트 활용 → AI_USAGE_LOG 기록) → PR 생성
③ 총괄이 취합·검토·머지
④ 총괄이 다음 페이즈 게시 → 반복
```

**공통 규칙**
- `main` 직접 push 금지 — 반드시 브랜치 + PR
- 에이전트(Claude/Codex) 사용 내역은 [docs/AI_USAGE_LOG.md](docs/AI_USAGE_LOG.md)에 즉시 1줄 기록 (제출물 ④ 원천 — PR에 포함)
- 블로커 발생 시 즉시 공유 (끙끙대지 말 것, 마감이 짧다)

---

## 📌 현재 페이즈: Phase 4 (마감 7/26)

> 목표: **"런마다 다른 빌드가 만들어진다 — 내 문장이 각인되고, 정령이 자라고, 그 정점에 LLM이 이름을 붙인다."**

Phase 3는 2026-07-19 완료 — 기억하는 보스(단기 내성·카운터·런 간 기억·라이브 대사), 사운드(원소 8종+BGM),
타이틀 화면·폰트·메타까지 통합 QA(타이틀→보스 풀런 + 라이브 3라우트) 통과.

### 이번 페이즈 핵심

- **이도원 (R1)**: **chain·cage 폼 렌더러** 후 [2스테이지·6전투 런 구조](docs/RUN_STRUCTURE_V2.md), 보스전 BGM·스테이지 색조·wall/orbit
- **임재윤 (R2)**: 판정 품질 튜닝(스냅샷 전/후 비교)·/evolve-name 클라이언트 캐시·심사 기간 할당량 정책 초안
- 성장 시스템 ②각인 → ③정령 → ④진화·융합 → ⑤연출 구현은 총괄 진행 ([PROGRESSION_DESIGN.md](docs/PROGRESSION_DESIGN.md) §6)

담당자별 상세 지시·완료 기준·일정·스코프 컷은 **[docs/PHASE_4.md](docs/PHASE_4.md)** 기준.

### 공통 시작 절차

1. `git checkout main && git pull && npm ci`
2. 개발 중 판정은 `.env`에 `VITE_JUDGE_MOCK=1` (공용 할당량 절약)
3. 역할별 feature 브랜치 + AI_USAGE_LOG 기록을 같은 PR에 포함
4. 계약 파일(`SpellSpec`/`RunContract`) 변경은 구현 전 합의
