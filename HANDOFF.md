# HANDOFF — 작업 인수인계 (Claude ↔ Codex ↔ 다른 기계)

> **이어받는 AI/사람에게**: 시작 전 **이 파일 + `docs/R2_PROGRESS.md`를 먼저 읽어라.**
> 그다음 아래 「현재 인수인계」의 *다음 할 것*부터 이어간다. 코드는 직접 탐색해 이해하고,
> **큰 변경(모델·계약·배포·main 머지)은 진행 전 사람에게 확인**한다.

---

## 현재 인수인계  <!-- 끊을 때마다 이 블록만 갱신하고 commit+push -->

- **목표(한 줄)**: 판정·표현력 DSL·제출물 ④ **전부 완료·머지**. 남은 것 = 자투리(실뎀 검증·#67 §5·#112)뿐.
- **브랜치**: `main` (동기화됨, working tree 깨끗)
- **현재 상태**: 판정 `gemini-3.5-flash-lite` **v2.5 배포**(349d207f). **#133 형상 shape DSL** 머지·배포·검증(shape 10/10·오탐 0). **#134 size·speed는 팬텀**(실 Gemini 40/40 정확)으로 종결 — 진짜 결함이던 **MockJudge 수식어 맹인**은 총괄 **#138**로 수정. **제출물 ④** 문서(#130)+**PDF(#142)** 머지·git 공유 완료.
- **방금 한 것 / 마지막 검증**: ④ PDF 생성(`docs/AI_USAGE_TECH.md`→HTML→Chrome headless 인쇄, `docs/AI_USAGE_TECH.pdf` 10p)·머지(#142). R2_PROGRESS 현행화(완료 누적 구조). HANDOFF 이 블록 갱신.
- **막힌 곳 / 다음 할 것**: (진행 중 코드 작업 없음) 자투리 = **실뎀 로깅 검증**("같은 속성 뎀감 과한가", diff 백업 `scratchpad/protoscene-dmg-logging.diff` 새 ProtoScene 재적용 후 플레이) · **#67 §5** · **#112** 계약 무결성.
- **관련 파일·이슈**: `docs/R2_PROGRESS.md`(최상단=최신 체크리스트), `docs/AI_USAGE_TECH.md`+`.pdf`(제출물 ④), #133·#134·#138·#139·#142.
- **주의**: 판정 측정은 **반드시 `lastSource` 기록 + 캐시 제거**(배치가 15 RPM 넘으면 Mock 폴백 섞여 프롬프트 문제로 오인 — #134 교훈). curl 인라인 금지(아래). **배포**: 이 세션에선 wrangler가 인증돼 AI가 `npx wrangler deploy` 직접 함 — 단 머신별 인증 캐시에 따라 다르니 안 되면 사람이.

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
