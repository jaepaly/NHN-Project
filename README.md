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

## 🏗 기술 스택

TypeScript · Vite · Phaser 3 · Gemini Flash (Cloudflare Workers 프록시) · GitHub Pages

## 👥 팀 & 협업 방식

| 이름 | 역할 | 담당 |
|---|---|---|
| **이도원** | R1 게임 코어 | Phaser 씬·전투·적 AI·파츠 조합 이펙트 엔진·성능 |
| **임재윤** | R2 AI 시스템 | 판정 프롬프트·프록시 인프라·캐싱/폴백·보스 기억 + 제출물 ④ |

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

## 📌 현재 페이즈: Phase 1 (마감 7/20 일요일)

> 목표: **"방 하나를 실제 LLM 판정으로 처음부터 끝까지 플레이할 수 있다"**

### 시작하기 (전원 공통, 첫날)

1. 리포 clone → `npm install` → `npm run dev` → Enter 눌러 "번개를 품은 해일" 영창해보기
2. [docs/GDD.md](docs/GDD.md) 정독 → 의견은 GitHub Issue로
3. 게임명 투표: GDD §1.1 후보 3개 (INCANT / 아케인 신택스 / 영창) — [Issue #2](https://github.com/jaepaly/NHN-Project/issues/2)에 댓글

### 🎮 이도원 (R1 게임 코어)

**이번 페이즈 목표: 웨이브 전투 코어 루프의 뼈대**

- [ ] `ProtoScene`을 전투 씬으로 발전: 플레이어 HP/마나 상태, WASD 이동 (현재 고정형)
- [ ] 적 3종 구현 (GDD §5): 추격자(삼각형·직선 추격), 사수(사각형·원거리 탄막), 분열체(육각형·처치 시 분열)
- [ ] 웨이브 스포너: 웨이브 2~3회 격퇴 → 방 클리어 판정
- [ ] 주문 적중 → 피해/처치 판정 (power 기반 데미지 공식 1차 — 밸런스는 나중, 공식 구조만)
- [ ] 파츠 렌더러 폼 추가: `beam`, `wave` ([src/render/spellRenderer.ts](src/render/spellRenderer.ts) — 현재 bolt/nova 구현됨, 패턴 참고)
- **완료 기준**: 영창으로 적을 잡아 웨이브를 클리어하는 영상 1개를 PR에 첨부
- 참고: [src/scenes/ProtoScene.ts](src/scenes/ProtoScene.ts), [src/spell/types.ts](src/spell/types.ts) (SpellSpec 스키마 = R2와의 계약, 임의 변경 금지)

### 🤖 임재윤 (R2 AI 시스템)

**이번 페이즈 목표: 실제 LLM 판정 연결 (MockJudge → Gemini)**

- [ ] **[PR #1](https://github.com/jaepaly/NHN-Project/pull/1) 리뷰·머지** (5티어 판정 정책 — 본인 영역이므로 첫 리뷰 담당)
- [ ] Cloudflare 계정 + Gemini API 키 발급 → 프록시 배포 ([proxy/README.md](proxy/README.md) 가이드, 5분 소요)
- [ ] `GeminiJudge` 구현 (`src/spell/geminiJudge.ts`): fetch → `validateSpec` 재검증 → 2.5초 타임아웃/실패 시 MockJudge 폴백 → localStorage 캐시 (GDD §3.5 체인)
- [ ] `.env.example` 추가 (`VITE_JUDGE_PROXY_URL`) + README 실행 문서 갱신
- [ ] 판정 품질 1차 테스트: 5티어별 입력 10개씩 시트 작성 → 실제 판정 결과 기록 → 프롬프트 튜닝 (기록 자체가 제출물 ④ 소재)
- **완료 기준**: 데모 페이지에서 실제 Gemini 판정으로 주문 발동 + 프록시 강제 다운 시 폴백 동작 확인 영상을 PR에 첨부
- 참고: [src/spell/judge.ts](src/spell/judge.ts) (인터페이스), [src/spell/mockJudge.ts](src/spell/mockJudge.ts), [src/spell/validate.ts](src/spell/validate.ts)

> 작업 중 궁금한 점·블로커는 총괄에게 바로 공유. 7/20에 취합·검토 후 Phase 2가 게시된다.
