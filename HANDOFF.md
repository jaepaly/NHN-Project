# HANDOFF — 작업 인수인계 (Claude ↔ Codex ↔ 다른 기계)

> **이어받는 AI/사람에게**: 시작 전 **이 파일 + `docs/R2_PROGRESS.md`를 먼저 읽어라.**
> 그다음 아래 「현재 인수인계」의 *다음 할 것*부터 이어간다. 코드는 직접 탐색해 이해하고,
> **큰 변경(모델·계약·배포·main 머지)은 진행 전 사람에게 확인**한다.

---

## 현재 인수인계  <!-- 끊을 때마다 이 블록만 갱신하고 commit+push -->

- **목표(한 줄)**: 판정·behavior 안정화 완료. 다음 국면 = 제출물 ④(AI 활용 기술 문서, R2 오너) 준비 + 마나경제(#121)에 따른 API §6 재점검.
- **브랜치**: `main` (동기화됨, working tree 깨끗)
- **현재 상태**: 판정기 `gemini-3.5-flash-lite`에서 정상(Node 실측 검증). behavior DSL(#106)·다양성(#94)·격상(#84) 다 머지. #110 닫힘.
- **방금 한 것 / 마지막 검증**: 3.5 판정 품질·behavior 6종·난타 fizzle Node로 검증(전부 정상). 로컬 정리·main 동기화.
- **막힌 곳 / 다음 할 것**: (진행 중인 코드 작업 없음) → 제출물 ④ 착수하거나, #121 마나경제 진화 시 SUBMISSION_PLAN §6 재점검.
- **관련 파일·이슈**: `docs/R2_PROGRESS.md`(최상단 최신), #110(판정 안정화), `docs/SUBMISSION_PLAN.md §6`, `docs/SPELL_UNDERSTANDING_V2.md`.
- **주의**: HTTP 판정 검증은 **curl 인라인 금지**(아래 참조). 총괄 #111(클라 fizzle 안전망) 머지됨.

---

## 📌 영구 정보 (이 repo·환경 고정 — 잘 안 바뀜)

### ⚠️ 검증 방법 (제일 중요)
- **HTTP로 판정 테스트할 때 curl 인라인 `-d '{"text":"한글"}'` 금지** — Windows Git Bash가 한글 UTF-8을 깨뜨려 **가짜 fizzle**이 남(2026-07 하루 종일 이걸로 헛발질함). **Node `fetch`로 테스트**하거나, `JSON.stringify`로 쓴 파일 body(`curl -d @file`)를 써라. Node·브라우저는 항상 깨끗한 UTF-8.
- 코드 회귀: `npm run test:*` **전체** 돌릴 것(subset 금지) + `npx tsc --noEmit` + `npm run build`.
- 인게임: `npm run dev` → `http://localhost:5173/NHN-Project/`.

### 배포 (프록시)
- `proxy/worker.js` = Cloudflare Worker(판정 프롬프트·모델 고정). **배포는 사람이**: `cd proxy; npx wrangler deploy` (임재윤 Cloudflare 계정, 대화형 로그인 필요 → AI가 대신 못 함).
- 모델 = `gemini-3.5-flash-lite` **명시 핀**. **`-latest` 금지**(자동 드리프트로 2.5 폐기된 전례). 프롬프트 바꾸면 `src/spell/geminiJudge.ts`의 `JUDGE_PROMPT_VERSION` bump + `scripts/spell-regression.ts` 버전핀 갱신.

### Windows 환경
- node/npm PATH 수동: `export PATH="/c/Program Files/nodejs:$PATH"` (Bash).
- gh: `/c/Program Files/GitHub CLI/gh.exe`, git/gh는 샌드박스 끄고 실행.
- PowerShell에서 npx 막히면: `Set-ExecutionPolicy -Scope Process Bypass` 또는 `npx.cmd`.

### Git 워크플로
- 팀 공유 repo(`jaepaly/NHN-Project`), 개인은 **브랜치**로 작업. **main 직접 push·self-merge 금지**(총괄 머지). feature 브랜치 + PR.
- 푸시 전: `git fetch` → origin/main 앞섰으면 로컬 머지 + 전체 회귀 재실행 → push 후 `로컬 HEAD == 원격 HEAD` 확인.
- 커밋 메시지 끝에 Co-Authored-By 표기.

### 맥락 문서 (읽으면 전체 그림 잡힘)
- `docs/R2_PROGRESS.md` — R2 상세 진행·결정 히스토리 (**최상단이 최신**)
- `docs/SPELL_UNDERSTANDING_V2.md` — 판정 설계 의도 (fizzle=키보드 난타만, 의미 있으면 전부 cast)
- GitHub Issues — 결정·총괄 의도 (예: #92 반복억제 방향, #110 판정 안정화, #101 소환 behavior)
