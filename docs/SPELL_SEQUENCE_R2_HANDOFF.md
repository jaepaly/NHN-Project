# 영창 시퀀스 판정 — R2 핸드오프 (Worker만 남음)

> 대상: R2(임재윤). 총괄이 **클라이언트 수직을 완성**했다. 남은 건 **Worker 프롬프트 + 캐시 버전 + 실측**뿐이다.
> 계약 원본: [SPELL_SEQUENCE_SCHEMA_DRAFT.md](SPELL_SEQUENCE_SCHEMA_DRAFT.md) · 실행 런타임: `src/spell/sequencePlan.ts`

## 총괄이 이미 구현한 것 (클라이언트, main 예정)

| 조각 | 파일 | 내용 |
|---|---|---|
| **안전벽 검증기** | `src/spell/spellPlanValidate.ts` | `validateSpellPlan(raw)` — §14 화이트리스트·클램프·strip. 유효 sequence 0개면 null. `planFromSpec`(v2 래핑)·`representativeSpecFromPlan`(대표 유도) 동봉 |
| **판정 캐리어** | `src/spell/types.ts` | `SpellJudgement` cast에 옵션 `plan?: SpellPlan`. schema_version은 **2 유지**(하위호환) |
| **원격 파싱** | `src/spell/validate.ts` | `validateJudgement`가 응답의 `spell_plan`을 검증해 싣는다. `spell`이 없어도 plan에서 대표 주문 유도 |
| **폴백 산출** | `src/spell/mockJudge.ts` | 명시적 순차 마커가 있으면 MockJudge가 절별 form plan을 낸다 → Gemini가 늦어 폴백돼도 시퀀스 유지 |
| **씬 연결** | `src/scenes/ProtoScene.ts` | `judgement.plan`이 있으면 `runSequenceCast`로 시퀀스 실행(마나·기록·각인·무적·UX 공통 경로) |
| **기능 플래그** | 〃 | `VITE_SEQUENCE_JUDGE=0` → plan 무시하고 v2 단일 경로로 **즉시 복귀** |

**즉 Worker가 `spell_plan`을 보내는 순간 클라이언트가 바로 소비·실행한다.** 실측: MockJudge 경로로 실판정 시퀀스 캐스트 → 마나 소비·기록·실행·콘솔 무오류 확인 완료.

## R2가 채우면 되는 것

### 1. Worker `JUDGE_PROMPT`에 `spell_plan` 출력 추가 (`proxy/worker.js`)

응답 계약(클라이언트가 받는 형태):

```jsonc
// 단일 영창 — 기존 그대로 (plan 없음)
{ "schema_version": 2, "disposition": "cast", "spell": { /* SpellSpec */ } }

// 복합 영창 — spell(대표) + spell_plan
{ "schema_version": 2, "disposition": "cast",
  "spell": { /* 대표 SpellSpec, 생략 시 클라이언트가 plan에서 유도 */ },
  "spell_plan": { "name","power","durationMs","sequences":[ /* SCHEMA_DRAFT §4 */ ] } }
```

- 스키마·수치 단일 출처는 `SPELL_SEQUENCE_SCHEMA_DRAFT.md` §4·§17. 프롬프트 금지사항은 §17 하단 그대로.
- **핵심 게이트 기준**: 단일 영창("파이어볼")은 **plan 없이 spell만** — 불필요하게 시퀀스로 감싸지 말 것.
- LLM이 절대 정하지 않음: power/mana 절대치, 픽셀·초, 적 ID, 무적. (클라이언트가 재계산·클램프)
- `spell_plan.sequences[].behaviors[].spec.power/cost`는 아무 값이나 보내도 됨 — 로컬이 0으로 덮고 예산 배분.

### 2. 캐시 버전 분리 (§18)

프롬프트가 바뀌면 `geminiJudge.ts`의 `CACHE_PREFIX`(또는 Worker 캐시 키)에 **schema/prompt 버전을 올려라**. 안 그러면 순차 입력의 **옛 v2 단일 캐시가 새 plan을 가린다**. (예: `incant:judge:v2.4:` → `:v3seq:`)

### 3. 2일 게이트 실측 (총괄·임재윤 합의안)

30 입력 실측: 명시적 복합 10 · 추상 10 · 기존 단일 10. 측정: 유효 JSON율 / 복합 행동 보존율 / **2.5초 초과율** / 단일 영창 1-시퀀스 유지 / 기존 단일 품질 회귀.

**계속 진행 기준**: 유효 JSON ≥90% · 치명 구조오류 0 · 복합 핵심행동 보존 ≥80% · 단일 영창 안 복잡해짐 · 지연 허용 · 폴백 정상.

> ⚠️ **진짜 게이트 축은 지연이다.** plan JSON은 출력 토큰이 커서 2.5초 폴백 임계에 근접할 수 있다(#83 v2 실측 p90 1.35s 참고). 2.5초 초과율을 pass/fail 1순위로. 다행히 초과해도 MockJudge가 plan을 내므로 **열화가 우아**(하드 v2 드롭 아님).

미달이면 `VITE_SEQUENCE_JUDGE=0`로 v2 복귀 + 연구 프로토타입으로 보존(제출물 ④ "AI 네이티브 탐색" 근거).

## 회귀

```bash
npm run test:planvalidate   # 검증기·대표유도·판정연결 (신규)
npm run test:sequence       # 런타임·예산·픽스처
npm run test:spell          # 단일 판정 불변 (Mock)
npm run build
```
