# R2 시스템 가이드 — INCANT AI 판정 시스템

> **이 문서가 뭔가**: R2(AI 판정 시스템)가 **어떻게 돌아가고, 버그가 나면 어디를 봐야 하는지**의 개발자·AI용 지도.
> 코드가 진짜 소스지만, **코드에 안 보이는 것**(왜 이렇게 됐나 · 이미 판명난 함정 · 어디서 뭘 고치나)을 담는다.
> 이어받는 사람/AI는 이 문서 + 실제 코드를 읽으면 R2 구조를 빠르게 재구성할 수 있다.
>
> **⚠️ 갱신 규칙 (중요)**: 이 문서는 **구조·교훈이 바뀔 때만** 갱신한다 —
> ① 새 서브시스템/DSL 추가 · ② 파일 이동·개명 · ③ 새 함정·설계 교훈 판명 · ④ 데이터 흐름/원칙 변경.
> **일상 작업·진행 상태는 여기 말고 [`R2_PROGRESS.md`](R2_PROGRESS.md)에.** 자잘한 버그 픽스로 이 지도를 매번 고칠 필요 없다.
> 단, 구조가 바뀌었는데 이 지도를 안 고치면 **낡은 지도가 오히려 오도**하므로, 구조 변화 시엔 반드시 함께 친다.

---

## 1. 한눈에 — 데이터 흐름

```
플레이어 문장
   │
   ▼  createJudge() → GeminiJudge.judge(text)            [src/spell/geminiJudge.ts]
   │   ① precheckText   로컬 즉시 (명백한 넌센스/차단어)   [mockJudge.ts]
   │   ② localStorage 캐시 (같은 문장=같은 판정)
   │   ③ 프록시 POST {text} (2.5초 타임아웃) ──► Cloudflare Worker [proxy/worker.js]
   │   │                                          └ JUDGE_PROMPT + Gemini 3.5-flash-lite → JSON
   │   ④ validateJudgement (스키마 재검증·클램프)          [validate.ts]
   │   ⑤ 실패/타임아웃/무효 → MockJudge 폴백 (게임 무중단)  [mockJudge.ts]
   ▼
SpellJudgement { disposition, spell{ effect, target, element, form, size, speed, status, power, cost, behavior?, shape? } }
   │
   ▼  시전 처리                                          [src/scenes/ProtoScene.ts]
   │   · 반복 페널티 × 다양성 × 격상약화 × 친화 → effectiveSpec.power  [spellHistory·spellDiversity·runEscalation·combatConfig]
   │   · 마나 지불/감쇠 시전                              [src/combat-core/mana/]
   │   · 히트 시 × 보스 내성                              [bossMemory / runMemory]
   ▼
렌더                                                    [src/render/spellRenderer.ts]
   · size  → SIZE_SCALE (palette.ts) → 이펙트 크기
   · speed → 투사체 속도·벽 지속·궤도 회전
   · shape → shapedWallPoints  [combat-core/combat/persistentFormConfig.ts]
   · behavior → behaviorRunner (소환수 움직임)
```

**핵심 멘탈모델**: LLM은 **의미 해석(자유 텍스트 → 구조화 JSON)만** 담당. 밸런스·안전·재현성은 전부 **결정론적 코드**가 통제한다. "창의성은 LLM에, 통제는 코드에."

---

## 2. 시스템 지도 — "어디서 뭘 고치나"

각 관심사는 **생성(producer) → 검증(validator) → 소비(consumer)** 사슬로 되어 있다. 버그가 나면 어느 고리인지 먼저 판단한다.

| 관심사 | 생성 (producer) | 검증·클램프 | 소비 (consumer) |
|---|---|---|---|
| **판정** 문장→JSON | `proxy/worker.js` `JUDGE_PROMPT` | `validate.ts` `validateJudgement` | 게임 전반 |
| **size·speed** | 모델이 냄 (규칙 없이도 정확) | `validate.ts` (enum·기본값) | `spellRenderer.ts` `SIZE_SCALE`(`palette.ts`)·speed 분기 |
| **소환 behavior** | `worker.js` 프롬프트 5항 + `summonBehavior.ts` 어휘 | `summonBehavior.ts` `validateSummonBehavior` | `behaviorRunner` |
| **벽 shape** | `worker.js` 프롬프트 6항 + `spellShape.ts` 어휘 | `spellShape.ts` `validateSpellShape` | `persistentFormConfig.ts` `shapedWallPoints` |
| **반복 억제** | `spellHistory.ts` `repeatMultiplier` (`REPEAT_PENALTY`) | — | `ProtoScene` 피해계산 |
| **다양성 보너스** | `spellDiversity.ts` `diversityBonus` | — | `ProtoScene` 피해계산 |
| **회차 격상** | `runEscalation.ts` (과의존 원소 약화·기믹 티어) | — | `ProtoScene`·보스 |
| **보스 기억·내성** | `bossMemory.ts`(단기)·`runMemory.ts`(런간) | — | (총괄) 보스코어 — `bossMemoryContract.ts` 하나로 import |
| **보스 대사** | `worker.js` `BOSS_LINE_PROMPT` | `bossLine.ts` sanitize·템플릿 폴백 | 보스전 |
| **진화·융합 작명** | `worker.js` `EVOLVE_NAME_PROMPT` | `evolveName.ts` sanitize·캐시 | 성장 시스템(진화·융합) |
| **능동형 마나** | `combat-core/mana/activeManaConfig.ts`·`degradedCast.ts` | — | `ProtoScene`·`playerCombatState.ts` |
| **폴백(무중단)** | `mockJudge.ts` (키워드 판정 — size/speed 키워드도 #138) | — | `GeminiJudge` 실패 시 |
| **프록시 인프라** | `worker.js` (키 은닉·15 RPM·CORS·모델 핀) | — | 모든 LLM 호출 |
| **실뎀 계산** | `combat-core/combat/combatConfig.ts` + `ProtoScene` | — | 히트 시 데미지 |

> **DSL 3형제 패턴 (behavior·shape, 그리고 size/speed)**: 프롬프트가 **생성**하고 → 검증 파일이 **화이트리스트·클램프**하고 → 렌더가 **소비**한다. 프롬프트 어휘·수치 한계는 **검증 파일의 상수와 정확히 일치**해야 한다(단일 소스). 한쪽만 바꾸면 조용히 어긋난다.

---

## 3. 설계 원칙 (왜 이렇게 됐나)

- **LLM 불신**: 모델 출력은 신뢰 못 할 입력. `validate.ts`가 enum·범위·DSL을 재검증·클램프. `power:9999`가 와도 게임엔 안 들어간다.
- **서버측 프롬프트 고정**: 프롬프트·API 키는 `worker.js`. 클라는 `{text}`만. → 브라우저에서 프롬프트 조작 불가.
- **무중단 폴백**: 프록시 장애·타임아웃·429 어떤 이유로든 실패하면 `MockJudge`가 대신. 품질만 낮아지고 **게임은 안 멈춘다**.
- **단일 소스 DSL**: 프롬프트 어휘·한계 ≡ 검증 파일 상수(`SUMMON_MOVE_KINDS`/`BEHAVIOR_LIMITS`, `SHAPE_KINDS`/`SHAPE_LIMITS`). 못 맞추면 화이트리스트 밖→기본값 폴백으로 조용히 버려진다.
- **표현 ≠ 위력**: shape·behavior·size 연출은 **정규화**되어 세기에 영향 없음(벽 정면폭은 size가 고정, 소환 DPS 예산 고정). **밸런스 만지려고 여기 건드리지 마라** — 위력은 `power`·친화·격상에서.
- **계약 파일**: 크로스롤(총괄 보스코어·R3 UI) 소비는 `bossMemoryContract.ts` 하나만 import.

---

## 4. ⚠️ 함정 & 판명난 것 (건드리기 전에 반드시 읽어라)

- **`curl` 인라인 한글 금지** — Windows Git Bash가 한글 UTF-8을 깨뜨려 **가짜 fizzle**을 만든다(하루 종일 헛발질한 전례). 판정 HTTP 테스트는 **Node `fetch`**로, 또는 `JSON.stringify`로 쓴 파일 body(`curl -d @file`). Node·브라우저는 항상 깨끗한 UTF-8.
- **size·speed는 팬텀이었다** — 실 Gemini 3.5는 size/speed를 **이미 정확히** 냄(실측 40/40, N=2~3 결정론적). 판정이 틀려 보이면 **프롬프트가 아니라 Mock 폴백**을 의심하라.
- **Mock 폴백 오인 주의** — 배치 측정 페이싱이 **15 RPM을 넘으면** 폴백(Mock)이 섞여 "프롬프트가 틀렸다"로 오인된다. 판정 품질 측정 시 **반드시 `lastSource`(gemini/cache/fallback/local) 기록 + 캐시 제거**. Mock은 size=power파생·speed=form파생이라 수식어를 무시(#138에서 키워드 인식 추가했지만 폴백 한정).
- **모델 핀 필수** — `gemini-3.5-flash-lite` **명시 고정**. `-latest` 별칭 **금지**(자동 드리프트로 2.5-flash-lite가 폐기·404된 전례). 재현성 우선.
- **프롬프트 바꾸면 버전핀 3곳** — `src/spell/geminiJudge.ts`의 `JUDGE_PROMPT_VERSION` + `scripts/spell-regression.ts` + `scripts/gemini-fizzle-fallback-regression.ts`. 하나라도 놓치면 회귀 red(의도된 가드). 버전 올리면 옛 localStorage 캐시가 무효화됨.
- **소스 = 배포 정합** — `worker.js`를 바꿔도 `wrangler deploy` 안 하면 **라이브 프록시는 옛 프롬프트**. 프롬프트 검증은 반드시 **배포 후** 라이브로. 반대로 배포만 하고 소스 머지를 안 하면 다음 배포가 되돌린다.
- **fizzle/blocked는 노카운트** — 마나·쿨다운·히스토리 전부 소비 안 함. cast만 기록.

---

## 5. 검증법 (이 repo 컨벤션)

- **판정 테스트**: Node `fetch`로 라이브 프록시 직접 호출(curl 금지). **N회 반복·held-out(튜닝에 안 쓴 신규 문장)·`lastSource` 확인**. "초록불 테스트" 말고 실제 값·다회 평균.
- **코드 회귀**: `npm run test:*` **전체**(subset 금지) + `npx tsc --noEmit` + `npm run build`. 의존성 0(node:assert + esbuild), Vitest 미도입.
- **인게임**: `npm run dev` → `http://localhost:5173/NHN-Project/`. (브라우저 캔버스라 런타임 검사는 `window.__game`으로.)
- **프록시 배포**: `cd proxy && npx wrangler deploy` (임재윤 Cloudflare 계정). 프롬프트 변경 후 필수. 인증은 머신별 캐시라 안 되면 사람이.

---

## 관련 문서
- [`R2_PROGRESS.md`](R2_PROGRESS.md) — 진행 상태·체크리스트·상세 로그 (자주 바뀜)
- [`AI_USAGE_TECH.md`](AI_USAGE_TECH.md) — 제출물 ④ (심사자용 AI 활용 설명)
- [`SPELL_UNDERSTANDING_V2.md`](SPELL_UNDERSTANDING_V2.md) — 판정 스키마·프롬프트 상세
- `proxy/README.md` — 프록시 배포 절차
