# Spell Understanding v2 — 의미 우선 주문 판정

> 상태: **판정 스키마 v2 현행 계약** — behavior·shape·`spell_plan` 확장까지 구현·배포
> 결정일: 2026-07-15
> 최근 정합성 확인: 2026-07-24 (`meaning-v2.6-seq`)
> 오너: R2 판정 계약 / R1 효과 적용 / R3 피드백·QA
> 구현 추적: [Issue #10](https://github.com/jaepaly/NHN-Project/issues/10)

## 1. 문제

초기 v1은 모든 유효 결과를 `element + form + status + power`로 압축했다.
이 구조에서는 LLM이 문장을 이해해도 회복·보호·실패를 표현할 수 없고, 전투 씬은 모든 주문을 적 피해로 적용한다.

추가로 다음 경로가 이해력을 떨어뜨린다.

- MockJudge는 원소 키워드가 없으면 의미 있는 문장도 불발 처리한다.
- `숲`, `자연`, 외래어와 은유를 포괄하는 의미 계층이 없다.
- 성공 캐시가 프롬프트 버전과 분리되지 않아 이전의 나쁜 판정을 계속 재사용할 수 있다.
- 무의미 입력과 금칙 입력도 가짜 `wind/bolt` 주문으로 변환되어 플레이어 피드백이 불명확하다.

## 2. 목표와 비목표

### 목표

1. 한국어·영어·콩글리시·은유를 키워드보다 의미로 판정한다.
2. 공격 외에 회복·보호막·강화·제어·소환을 실제 게임 효과로 표현한다.
3. 의미 있는 비마법 문장은 약하지만 유용한 주문으로 번역한다.
4. 무의미 입력과 금칙 입력을 서로 다른 UX로 처리한다.
5. 프롬프트 변경 뒤 오래된 캐시가 판정을 오염시키지 않게 한다.

### 당시 Phase 2 비목표

- LLM이 회복량·피해량·버프 시간을 직접 정하게 하지 않는다.
- 모든 자연어 표현에 별도 키워드 사전을 만들지 않는다.
- Phase 2에서는 복잡한 소환수 AI나 기억 보스 전투까지 구현하지 않는다. 이후 Phase 3~5에서 behavior DSL·기억 보스·영창 시퀀스로 확장됐으며 아래 계약에 현행 상태를 반영한다.

## 3. 판정 계약

```ts
type SpellDisposition = 'cast' | 'fizzle' | 'blocked';
type SpellEffect = 'damage' | 'heal' | 'shield' | 'buff' | 'control' | 'summon';
type SpellTarget = 'enemy' | 'self' | 'area';

type SpellJudgement =
  | {
      schema_version: 2;
      disposition: 'cast';
      spell: {
        name: string;
        effect: SpellEffect;
        target: SpellTarget;
        element_primary: SpellElement;
        element_secondary: SpellElement | null;
        form: SpellForm;
        size: SpellSize;
        speed: SpellSpeed;
        status: SpellStatus[];
        power: number;
        cost: number;
        flavor?: string;
        behavior?: SummonBehavior; // summon 움직임 DSL
        shape?: SpellShape;        // wall 형상 DSL
      };
      plan?: SpellPlan;            // 복합·순차·동시 영창
    }
  | {
      schema_version: 2;
      disposition: 'fizzle' | 'blocked';
      reason: 'nonsense' | 'unsafe';
      message: string;
    };
```

`SpellJudge.judge()`는 `SpellSpec` 대신 `SpellJudgement`를 반환한다. 단일 영창은 `spell`만, 복합 영창은 검증된 `plan`을 함께 가진다. Worker는 복합 판정에서 대표 `spell`을 생략할 수 있고 클라이언트가 plan에서 대표 스펙을 유도한다. `cast` 분기만 마나·영창 입력락·히스토리·렌더러로 전달한다.

## 4. 의미 판정 순서

프롬프트는 아래 순서를 강제한다.

1. **언어·표현 정규화**: 한국어, 영어, 음역어, 은유의 핵심 의미 파악
2. **disposition**: 의미 있는 문장인지, 무의미한지, 금칙인지 분류
3. **effect·target**: 공격/회복/보호/강화/제어/소환과 대상 결정
4. **element·form**: 이미 결정된 의미와 효과를 시각 팔레트와 궤적으로 매핑
5. **power·cost**: 구체성·창의성·서사성에 따라 점수화
6. **표현 DSL**: summon의 움직임은 `behavior`, wall의 모양은 `shape`로 제한된 어휘 안에서 설계
7. **영창 시퀀스**: 서로 다른 동작의 뚜렷한 순차·동시 관계만 `spell_plan`으로 분해. 단일·반복·시적 다원소 표현은 기존 단일 주문 유지

원소가 직접 언급되지 않았다는 이유로 불발시키지 않는다. 원소는 의미를 시각적으로 표현하기 위한 후단 선택이다.

## 5. 플레이어 입력 정책

| 입력 종류 | disposition | 처리 |
|---|---|---|
| 의미 있는 마법 문장 | `cast` | 의미에 맞는 공격·제어·회복·보호 등으로 발동 |
| 의미 있는 비마법 문장 | `cast` | power 15~40의 약한 유틸리티 주문으로 번역 |
| 명백한 키보드 난타 | `fizzle` | 프록시 호출 없이 실패, 마나·영창 입력락·히스토리 소모 없음 |
| 욕설·부적절 입력 | `blocked` | 발동·마나·영창 입력락·히스토리 소모 없음, 경고문 표시 |
| 프록시 장애·타임아웃 | 폴백 | MockJudge v2로 즉시 복구, 장애 결과는 캐시하지 않음 |
| 모델 드리프트로 의미 입력을 `fizzle` | 폴백 | 로컬 사전검사를 통과한 입력은 MockJudge로 복구하고 원격 `fizzle`은 캐시하지 않음 |

금칙어 원문은 로그·히스토리에 저장하지 않는다.

## 6. 기준 예시

| 입력 | 기대 판정 |
|---|---|
| `라이트닝 스톰` | `cast`, damage/control, area, lightning+wind, rain/nova, shock |
| `lightning storm` | 위 입력과 의미적으로 동등 |
| `숲의 분노` | `cast`, control/damage, area, earth+wind, summon/zone |
| `forest fury` | 위 입력과 의미적으로 동등 |
| `배고프다` | `cast`, heal, self, dark 또는 earth, buff, power 15~40 |
| `오늘 너무 지쳤다` | `cast`, heal/buff, self, power 15~40 |
| `나를 지켜줘` | `cast`, shield, self, light/earth, wall/buff |
| `ㅁㄴㅇㄹ` | `fizzle`, nonsense |
| `asdf` | `fizzle`, nonsense |
| 욕설 문자열 | `blocked`, unsafe |

정확한 보조 원소나 폼은 달라질 수 있지만 `disposition`, `effect`, `target`과 핵심 의미는 고정 기대값으로 검증한다.

## 7. 엔진 적용 규칙

- `damage`: 기존 `spellDamageFromPower`를 사용한다.
- `heal`: 엔진 공식으로 HP를 회복하며 최대 HP를 넘지 않는다.
- `shield`: 제한 시간 또는 흡수량을 가진 보호막 상태를 부여한다.
- `buff`: 이동속도·마나 회복·기본 공격 중 Phase 2에서 1개만 우선 지원한다.
- `control`: 적 둔화·넉백·약화 중 기존 상태와 연결한다.
- `summon`: 제한 시간 자동 공격 개체를 만들며, 검증된 `behavior`가 있으면 orbit/chase/dash/zigzag/hold/retreat 단계 프로그램을 실행한다.
- `shape`: wall 주문에서만 arc/line/zigzag/wave/ring/polygon 형상을 허용하며, 모양은 정규화되어 위력에 직접 영향을 주지 않는다.
- `spell_plan`: 최대 10개 sequence, 단계당 behavior 최대 5개, 전체 지속 최대 3초. 전체 power·마나 예산을 로컬에서 다시 계산하며 `form|move|wait` 외 동작은 실행하지 않는다.

모든 수치는 `power`에서 결정론적으로 계산하고 상한을 둔다. LLM이 임의의 수치 필드를 추가해도 검증 단계에서 버린다.

## 8. 불발·금칙 UX

- `fizzle`: `마력이 형태를 이루지 못했다` 표시, 짧은 흐트러짐 연출, 마나·영창 입력락 소모 없음
- `blocked`: `해당 문장으로는 영창할 수 없습니다` 표시, 주문 이펙트 없음, 마나·영창 입력락 소모 없음
- 두 경우 모두 성공 주문 히스토리와 보스 기억에 기록하지 않는다.
- 접근성을 위해 색상만으로 구분하지 않고 텍스트와 아이콘/기호를 함께 쓴다.

## 9. 캐시·관측성

- 현재 캐시 접두사: `incant:judge:v2:meaning-v2.6-seq:`
- 스키마나 프롬프트 의미가 바뀌면 `promptVersion`을 올린다.
- v1 캐시는 삭제할 필요 없이 읽지 않는다.
- 디버그 HUD/품질 기록에 `source`, `latencyMs`, `schemaVersion`, `promptVersion`을 남긴다.
- 폴백 결과는 기존처럼 성공 캐시에 저장하지 않는다.

## 10. 구현 이력과 소유권

1. **R2**: 타입·검증·프록시 프롬프트·MockJudge v2·캐시 버전
2. **R1**: 효과 디스패처·회복·보호막·비공격 렌더 타깃
3. **R3**: 불발/금칙/회복/보호막 HUD와 연출
4. **공통**: 고정 코퍼스 회귀 → Mock 완주 → Gemini 최소 실측 → Pages 검증

이 순서는 Phase 2 당시 분담 기록이며 전 항목이 구현됐다. 이후 R2가 behavior·shape·`spell_plan` 생산·검증을, R1/R3가 실행·전투·UX 소비를 확장했다. 각 구현 PR은 이 문서를 링크하고 영향을 받는 계약을 본문에 명시한다.

## 11. 승인 기준

- [x] 기준 예시의 `disposition/effect/target` 기대값을 만족
- [x] 한국어·영어 의미 동등성을 held-out 다회 실측
- [x] `heal`이 플레이어 HP를 실제 회복하고 적에게 피해를 주지 않음
- [x] `fizzle/blocked`가 마나·영창 입력락·히스토리를 소비하지 않음
- [x] 구 프롬프트 캐시가 `meaning-v2.6-seq` 판정에 사용되지 않음
- [x] Mock 폴백과 Gemini 모두 `SpellJudgement v2` 검증을 통과
- [x] `test:spell`·`test:judge-fallback`·`test:planvalidate`·`test:sequence` 및 프로덕션 빌드 통과
