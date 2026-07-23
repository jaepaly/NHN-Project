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

---

## 부록 A — Worker 프롬프트 초안 (붙여넣기용)

> 총괄 초안. 임재윤이 문구·수치를 다듬어 `proxy/worker.js`의 `JUDGE_PROMPT`에 넣고 배포한다.
> **원칙**: `spell`(대표 단일)은 항상 내고, `spell_plan`은 **복합/순차 동작일 때만** 추가한다.
> 단일 영창은 plan을 넣지 말 것 — 게이트 실패 모드 1순위("단일이 복잡해짐").

`JUDGE_PROMPT`의 판단 순서에 단계 하나를 더한다(현재 6번 shape 다음, "cast 출력 스키마" 앞):

```text
7. 입력이 **시간 순서가 있는 복합 동작**("먼저 A 그다음 B", "A한 뒤 B")이거나
   **동시 다원소 동작**("얼음과 불을 동시에")이면, spell(대표 하나)에 더해 spell_plan을 설계한다.
   단일 동작이면 spell_plan을 넣지 않는다. 긴 문장이라고 무조건 단계를 늘리지 않는다.
   - sequences: 순차 사건을 앞에서부터 단계로(최대 10). 같은 순간의 사건은 한 단계의 behaviors로 병렬(최대 5).
   - behavior type은 셋뿐: form(공격·효과, spec은 위 cast 스키마와 동일)·move(이동, element 필수)·wait(정적·박자).
   - move.destination(이 5개만): cast-point|target-direction|away-from-target|random-direction|arena-center.
   - power·durationMs는 전체 예산이다. behavior마다 새로 만들지 않는다. spec.power와 spec.cost는 0으로 둔다(로컬 재계산).
   - durationMs는 500~3000. 절대 픽셀·초·피해값·적 위치·무적을 만들지 않는다. 스키마에 없는 type/원소/form 금지.
```

cast 출력 스키마의 `spell` 뒤에 옵션 필드로 추가:

```jsonc
  "spell_plan": {                         // 복합/순차 동작일 때만 (단일이면 생략)
    "name": "전체 영창명", "power": 0, "durationMs": 1500,
    "sequences": [
      { "durationWeight": 2, "behaviors": [
          { "type": "move", "destination": "target-direction", "element": "fire" } ] },
      { "durationWeight": 1, "behaviors": [
          { "type": "form", "powerWeight": 1, "tuning": { "damage": 2, "radius": 2 },
            "spec": { "name":"돌진 폭발","effect":"damage","target":"self",
                      "element_primary":"fire","element_secondary":null,"form":"nova",
                      "size":"large","speed":"normal","status":["burn"],"power":0,"cost":0 } } ] }
    ]
  }
```

스키마 하단 안내에 한 줄 추가:
`spell_plan은 복합/순차·동시 동작일 때만 포함(그 외 생략). type은 form|move|wait, move는 element 필수·destination 5종만.`

### 배포 시 함께 (조율 필수)

1. **캐시 접두 bump** — `src/spell/geminiJudge.ts`의 `CACHE_PREFIX`를 올린다(예: `…:v2.4:` → `…:v3seq:`).
   안 하면 순차 입력의 **옛 단일 캐시가 새 plan을 가린다**(§18).
2. **프롬프트 버전** — `src/spell/geminiJudge.ts`의 `JUDGE_PROMPT_VERSION`을 올리고, `scripts/spell-regression.ts`의 assert도 같이 갱신.
3. 배포는 임재윤(wrangler 인증) — 총괄 PC는 미인증.

> 클라이언트는 `spell` 없이 `spell_plan`만 와도 대표 주문을 유도한다(`validateJudgement`). 즉 대표 spell을 생략해 토큰을 아껴도 되지만, 캐시·기록 가독성을 위해 대표를 함께 내는 것을 권장.

## 부록 B — 실측 하니스

```bash
npm run gate:sequence        # 배포된 프록시에 30입력(복합10·추상10·단일10)
# PROXY_URL=... npm run gate:sequence  # 다른 프록시 지정
```

자동 집계: 유효 JSON% · 복합 행동 보존%(plan·시퀀스≥2) · **단일 1-시퀀스 유지** · 지연 p50/p90 · **2.5초 초과율**.
게이트 판정(🟢/🔴)까지 출력. **배포 전 먼저 돌려 baseline**(전부 plan 없음)을 잡고, 배포 후 다시 돌려 비교.
`scripts/sequence-yield-harness.ts` — 입력 세트는 자유 편집.
