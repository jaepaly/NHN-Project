# 팀 작업 방식 — INCANT

> 3인이 각자 AI 코딩 에이전트를 지휘해 개발했다. 이 문서는 그 **운영 규칙**이다.
> (역할 분담의 실제 산출물은 [SUBMISSION_ROLES.md](SUBMISSION_ROLES.md) 참조)

## 페이즈 사이클

```
① 총괄이 페이즈 작업 지시 게시 (docs/PHASE_*.md)
② 각자 feature 브랜치에서 작업 (에이전트 활용 → AI_USAGE_LOG 기록) → PR 생성
③ 총괄이 취합·검토·머지
④ 총괄이 다음 페이즈 게시 → 반복
```

| 페이즈 | 문서 | 상태 |
|---|---|---|
| Phase 1 | [PHASE_1_SUMMARY.md](PHASE_1_SUMMARY.md) | 완료 |
| Phase 2 | [PHASE_2.md](PHASE_2.md) | 완료 |
| Phase 3 — 기억하는 보스 & 에셋 | [PHASE_3.md](PHASE_3.md) | 완료 |
| Phase 4 — 성장 시스템 & 폴리싱 | [PHASE_4.md](PHASE_4.md) | 완료 |
| Phase 5 — 프레젠테이션 승격 & 완성도 | [PHASE_5.md](PHASE_5.md) | 진행 |

## 공통 규칙

- **`main` 직접 push 금지** — 반드시 브랜치 + PR
- **에이전트 사용 내역은 즉시 1줄 기록** → [AI_USAGE_LOG.md](AI_USAGE_LOG.md).
  제출물 ④의 원천 데이터이므로 PR에 함께 포함한다
- **계약 파일 변경은 구현 전 합의** — `SpellSpec`·`RunContract`·`MapGraph` 표면처럼
  역할 경계에 걸친 인터페이스는 먼저 커밋해 고정하고 그 위에서 병렬 작업한다
- 블로커는 즉시 공유 (끙끙대지 말 것)

## 시작 절차

```bash
git checkout main && git pull && npm ci
npm test          # 회귀 106종
npm run dev
```

- 판정은 **기본값이 실제 Gemini** — 별도 설정 없이 동작한다
- Mock은 콩글리시·창의 판정 품질이 낮아 **실제 테스트엔 부적합**하다.
  손맛·판정 확인은 실제 Gemini로 한다
- 오프라인·할당량 우려 시에만 `.env`에 `VITE_JUDGE_MOCK=1`, **테스트 후 제거** 권장

## 품질 방어

- **회귀 스크립트 106종** — 순수 로직뿐 아니라 **씬 배선**도 검사한다.
  배선 유실은 화면을 봐야만 아는 종류의 버그라, 코드 문자열 검사로 CI가 잡게 했다
- PR은 CI(`test`·`build`) 통과가 머지 조건이다
- 밸런스·성능 주장은 **실측 근거를 PR 본문에 남긴다** (예: 시드 N개 실행 결과,
  프레임 수동 구동 측정치)

## 역할 간 인터페이스 계약

| 경계 | 계약 |
|---|---|
| R1 ↔ R2 | 판정 JSON 스키마 (`SpellSpec`·`SpellJudgement` v2) |
| R1 ↔ R3 | 보상 계약(`RewardKind`·`RunController` 이벤트), 맵 그래프 표면(`MapGraph`), 씬 전환 |
| R2 ↔ R3 | 영창 UX 타이밍, 보스 대사 포맷, 시퀀스 `form`/`wait` 스키마 |
