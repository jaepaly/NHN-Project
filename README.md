# INCANT (가칭) — 말이 곧 마법이 되는 로그라이크

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
| [docs/PHASE_2.md](docs/PHASE_2.md) | Phase 2 담당자별 작업 지시·완료 기준 |

## 🏗 기술 스택

TypeScript · Vite · Phaser 3 · Gemini Flash (Cloudflare Workers 프록시) · GitHub Pages

## 👥 팀 & 협업 방식

| 이름 | 역할 | 담당 |
|---|---|---|
| **이도원** | R1 게임 코어 | Phaser 씬·전투·적 AI·파츠 조합 이펙트 엔진·성능 |
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

## 📌 현재 페이즈: Phase 2 (마감 7/27)

> 목표: **"방을 클리어하고 보상을 골라 다음 방으로 이어지는 한 런의 뼈대를 완성한다."**

Phase 1 기술 목표는 2026-07-15에 조기 달성했다. 완료 근거와 라이브 검증 결과는
[Phase 1 완료 요약](docs/PHASE_1_SUMMARY.md)에 보관한다.

### 이번 페이즈 핵심

- **R1 이도원**: 2개 방 진행·3택 1 보상 적용·주문 폼 6종 완성
- **R2 임재윤**: 런 주문 히스토리·반복 패널티·보스 기억용 요약 계약
- **R3 jaepaly**: 보상 선택 UI·방 전환/HUD·통합 QA와 Pages 배포

담당자별 구현 범위, 인터페이스 계약, 일정과 완료 기준은
**[docs/PHASE_2.md](docs/PHASE_2.md)**를 기준으로 한다.

### 공통 시작 절차

1. `git checkout main && git pull && npm ci`
2. 반복 전투 개발은 `.env`에 `VITE_JUDGE_MOCK=1`을 사용한다.
3. 역할별 feature 브랜치에서 작업하고 AI 활용 로그를 같은 PR에 포함한다.
4. `SpellSpec` 스키마나 역할 간 이벤트 계약 변경은 구현 전에 공유한다.

> 게임명 투표 [Issue #2](https://github.com/jaepaly/NHN-Project/issues/2)는 7/20까지 유지하며, 결과는 기능 개발과 별도로 반영한다.
