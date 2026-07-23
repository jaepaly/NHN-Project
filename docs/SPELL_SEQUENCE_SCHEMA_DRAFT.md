# 영창 시퀀스 판정 계약 초안

> 대상: R2 판정·프롬프트·검증 구현자, R1 전투 런타임 구현자, R3 각인·성장 연동 구현자  
> 상태: **R1 실행 프로토타입을 기준으로 작성한 협업 초안**  
> 기준 코드: `src/spell/sequencePlan.ts`, `src/spell/sequenceFixtureCatalog.ts`, `src/spell/sequenceEngraveCandidate.ts`  
> 검증: `npm run test:sequence`

처음 검토하거나 직접 실행해 보려면 [SPELL_SEQUENCE_QUICKSTART.md](SPELL_SEQUENCE_QUICKSTART.md)를 먼저 읽는 것을 권장한다.

## 1. 문서 목적

기존 판정은 자유 영창 하나를 `SpellSpec` 하나로 압축한다. 이 구조에서는 다음과 같은 영창을 충분히 표현하기 어렵다.

- 특정 방향으로 회피한 뒤 폭발한다.
- 이동하면서 서로 다른 원소 공격을 동시에 사용한다.
- 공격 사이에 의도적인 정적이나 준비 시간을 둔다.
- 여러 단계에 걸쳐 표식을 남기고 추적 공격으로 마무리한다.
- 추상적인 문장(예: `꽃잎 댄스`)을 동작과 공격의 안무로 해석한다.

새 계약의 목적은 LLM에 전투 로직 전체를 맡기는 것이 아니다. LLM은 제한된 부품으로 **의미 있는 시퀀스 계획**을 만들고, 로컬 런타임은 시간·위력·마나·타깃·안전 한계를 결정론적으로 강제한다.

핵심 원칙은 다음과 같다.

1. `sequence`는 순차 실행한다.
2. 한 `sequence` 안의 `behavior`는 같은 시점에 병렬로 시작한다.
3. LLM은 창의적인 구성과 상대적 강조를 결정한다.
4. 로컬은 실제 수치, 예산, 타깃, 정규화와 실패 복구를 책임진다.
5. 복합 주문도 플레이어가 입력한 **영창 한 번**으로 기록한다.

## 2. 현재 상태와 책임 경계

### R1 프로토타입에서 이미 실행되는 것

- 시퀀스 순차 실행과 behavior 병렬 실행
- `form`, `move`, `wait` behavior
- 최대 개수·시간·Power·Mana 정규화
- 이동 중을 포함한 전체 시퀀스 시간 무적
- 시퀀스 중 재영창 및 플레이어 수동 이동 제한
- 로컬 타깃 고정과 사망 시 재탐색
- 기존 12개 form의 전투 실행
- 반복 페널티, 친화, 격상 약화, 다양성 보너스, 피해 배율 연동
- 시퀀스 진행 시간 HUD
- 보스 기억용 behavior 단위 기록
- 기존 v1 각인으로 투영하는 임시 정책
- 이름으로 실행 가능한 쇼케이스와 회귀 테스트

### R2가 구현·확정해야 하는 것

- Gemini 응답 계약과 프롬프트
- 응답 파싱 및 검증
- 기존 `SpellJudgement v2`와의 호환 또는 새 스키마 버전
- 자연어를 시퀀스·behavior·가중치로 분해하는 판단 품질
- `effect`, `target`, `form`을 서로 독립적인 축으로 판단하도록 프롬프트 보완
- 캐시 버전 분리

### R3 확인이 필요한 것

- 복합 영창을 각인 하나로 변환하는 최종 정책
- 각인이 전체 시퀀스를 보존할지, 대표 공격 하나만 보존할지
- 복합 영창과 보상·진화·정령 시스템의 장기적 연동

## 3. 권장 최상위 응답 형태

기존 거절 결과는 유지하고, `cast` 결과만 단일 `spell` 또는 새 `spell_plan`을 갖게 하는 구별 유니온을 권장한다.

스키마 버전 숫자는 R2가 기존 배포·캐시와 함께 결정해야 한다. 아래 `3`은 제안값이다.

```ts
type SpellSequenceJudgement =
  | {
      schema_version: 3;
      disposition: 'cast';
      spell_plan: SpellPlan;
    }
  | {
      schema_version: 3;
      disposition: 'fizzle' | 'blocked';
      reason: 'nonsense' | 'unsafe';
      message: string;
    };
```

### 하위 호환 권장안

전환 기간에는 다음 두 입력을 모두 허용한다.

- v2 `cast + spell`: 단일 form behavior를 가진 시퀀스 하나로 감싼다.
- 새 `cast + spell_plan`: 새 검증기와 정규화기를 거친다.

단일 주문을 감쌀 때의 개념적 변환은 다음과 같다.

```ts
{
  name: spell.name,
  power: spell.power,
  durationMs: 0,
  sequences: [{
    durationWeight: 1,
    behaviors: [{ type: 'form', spec: spell, powerWeight: 1 }]
  }]
}
```

전환이 끝나기 전까지 v2 경로를 제거하지 않는다. 폴백 판정도 동일한 변환을 거치게 하면 런타임을 하나로 합칠 수 있다.

## 4. 입력 스키마

### 4.1 SpellPlan

```ts
interface SpellPlan {
  name: string;
  power: number;
  durationMs: number;
  sequences: SpellSequence[];
}
```

| 필드 | 의미 | 로컬 처리 |
|---|---|---|
| `name` | 전체 영창의 표시명 | 영창 기록·HUD·각인 후보명에 사용 |
| `power` | 전체 영창 품질/위력 예산 | `0~100`으로 clamp |
| `durationMs` | LLM이 요청한 총 연출 시간 | Power별 상한과 3초 절대 상한으로 clamp |
| `sequences` | 순차 실행할 단계 | 앞에서부터 최대 10개 |

`power`는 개별 공격의 피해값이 아니다. 전체 영창이 behavior 사이에 나누어 쓰는 총예산이다.

### 4.2 SpellSequence

```ts
interface SpellSequence {
  durationWeight?: number;
  behaviors: SpellBehavior[];
}
```

- 배열 순서대로 실행한다.
- 각 단계의 behavior는 단계 시작 시 동시에 실행한다.
- `durationWeight`는 절대 시간이 아니라 전체 시간에서 차지하는 비율이다.
- 누락 시 `1`, 음수·비정상 값은 로컬에서 보정한다.
- 최대 behavior 수는 5개다.
- 비어 있는 단계는 제거한다.

예를 들어 전체 2400ms에 가중치가 `1, 2, 1`이면 각 단계는 `600, 1200, 600ms`를 받는다.

### 4.3 SpellBehavior

```ts
type SpellBehavior = FormBehavior | MoveBehavior | WaitBehavior;
```

#### FormBehavior

```ts
interface FormBehavior {
  type: 'form';
  spec: SpellSpec;
  powerWeight?: number;
  tuning?: BehaviorTuning;
}
```

- 기존 `SpellSpec`의 form/effect/target/원소/status 의미를 재사용한다.
- `spec.power`와 `spec.cost`는 LLM 값으로 실행하지 않는다. 로컬이 다시 계산한다.
- `powerWeight`는 남은 효과 Power를 form behavior 사이에 나누는 상대 가중치다.
- 누락 시 `1`이다.

#### MoveBehavior

```ts
type MoveDestination =
  | 'cast-point'
  | 'cast-direction'
  | 'target-direction'
  | 'away-from-target'
  | 'random-direction'
  | 'custom-vector'
  | 'random-enemy'
  | 'arena-center';

interface MoveBehavior {
  type: 'move';
  destination: MoveDestination;
  element: SpellElement;
  distance?: number;
  angle?: number;
}
```

이동도 영창의 마법적 정체성을 가지므로 `element`는 필수다. 다만 현재 보스 기억·반복 패널티는 이동을 공격 사용으로 세지 않는다.

| destination | 의도 |
|---|---|
| `cast-point` | 사용자가 영창 전에 지정한 지점까지 이동 |
| `cast-direction` | 사용자 지정 지점 방향으로 `distance`만큼 이동 |
| `target-direction` | 현재 로컬 타깃 방향으로 `distance`만큼 이동 |
| `away-from-target` | 현재 로컬 타깃 반대 방향으로 이동 |
| `random-direction` | 임의 방향으로 이동 |
| `custom-vector` | 기준 방향에서 `angle`만큼 회전해 `distance` 이동 |
| `random-enemy` | 살아 있는 임의의 적 위치로 이동 |
| `arena-center` | 전투 구역 중앙으로 이동 |

현재 프로토타입에는 사용자 클릭 조준이 아직 연결되지 않았다. 따라서 `cast-point`와 `cast-direction`은 현재 가장 가까운 적을 기준으로 대체 실행한다. **향후 조준 시스템이 연결되면 사용자 지정 지점을 우선하는 것이 최종 의도**다.

- `distance` 기본값: 180px
- 방향 이동 최대값: 420px
- 맵 경계를 벗어나면 플레이어 반경을 고려해 clamp
- 단계 시간이 0이면 순간 이동처럼 즉시 위치를 바꾼다.
- 별도 `teleport` behavior는 만들지 않는다.
- 이동 시간 동안이 아니라 현재 프로토타입에서는 **전체 시퀀스 시간 동안 무적**이다.

#### WaitBehavior

```ts
interface WaitBehavior {
  type: 'wait';
}
```

`wait`은 해당 단계의 시간을 소비하고 다른 효과를 만들지 않는다. 정적, 준비, 박자, 지연 폭발의 간격을 표현한다.

같은 단계에 다른 behavior가 있으면 `wait`은 의미가 중복되므로 로컬 정규화에서 제거한다. wait-only 단계에서는 하나만 남긴다.

## 5. 기존 SpellSpec 필드 사용 원칙

```ts
interface SpellSpec {
  name: string;
  effect: 'damage' | 'heal' | 'shield' | 'buff' | 'control' | 'summon';
  target: 'enemy' | 'self' | 'area';
  element_primary: SpellElement;
  element_secondary: SpellElement | null;
  form: SpellForm;
  size: 'small' | 'medium' | 'large' | 'huge';
  speed: 'slow' | 'normal' | 'fast';
  status: SpellStatus[];
  power: number;
  cost: number;
  flavor?: string;
}
```

### effect·target·form은 독립 축이다

R2 프롬프트에서 반드시 분리해서 판단해야 한다.

- `damage`는 효과이고 `self`는 기준 위치/대상이다.
- `nova`는 form이며 반드시 self 효과라는 뜻이 아니다.
- `self + damage + nova`는 플레이어 위치에서 폭발하는 공격으로 유효하다.
- `enemy + damage + nova`는 조준 지점으로 발사한 뒤 폭발하는 공격으로 유효하다.
- `self + shield + buff`와 `self + heal + buff`도 서로 다른 결과다.

현재 판정 프롬프트가 `self`와 `damage`를 같은 선택축처럼 다루면 self nova가 거의 나오지 않는다. 이 부분은 시퀀스 스키마 전환 때 함께 수정해야 한다.

### 원소

- 각 form behavior는 주 원소와 선택적 보조 원소를 독립적으로 가진다.
- 한 SpellPlan 전체의 원소 수는 제한하지 않는다.
- “모든 원소로 공격하라” 같은 명시적 영창을 보존하기 위함이다.
- 일반 영창의 Power·시간·behavior 상한은 유지되므로 원소가 많을수록 각 공격의 몫은 작아진다.
- 추후 필살 영창은 원소 수가 아니라 더 큰 시간·Power·behavior 예산으로 차별화하는 편이 안전하다.

## 6. BehaviorTuning: 기준값을 깨지 않는 상대 재분배

```ts
interface BehaviorTuning {
  damage?: number;
  range?: number;
  radius?: number;
  duration?: number;
  strength?: number;
  amount?: number;
}
```

`tuning`은 최종 배율이 아니라 **한 behavior 안에서 무엇을 강조할지 나타내는 상대 가중치**다.

예:

```json
{ "damage": 1, "radius": 3 }
```

이는 “기준 공격보다 공짜로 3배 넓게”가 아니라, 피해를 일부 희생하고 반경을 강조하라는 뜻이다. 로컬은 유효한 tuning 값들의 평균을 중립점으로 삼아 각 비율을 계산하고 최종 배율을 `0.65~1.35`로 clamp한다.

- 값이 하나만 있으면 비교 대상이 없으므로 중립 배율 `1`이다.
- 0, 음수, NaN, 무한대는 무시한다.
- 모든 필드를 항상 채울 필요는 없다.
- 해당 effect/form에서 의미가 있는 축만 사용한다.

권장 의미:

| 키 | 주요 소비처 |
|---|---|
| `damage` | 피해 계수 |
| `range` | beam/wave/chain/wall 등의 사거리·전개 거리 |
| `radius` | nova/zone/rain/orbit 등의 반경 |
| `duration` | 지속 공격·제어·보호 효과 시간 |
| `strength` | 둔화 등 제어 강도 |
| `amount` | heal/shield 등 즉시 자원량 |

모든 form의 기준값은 현재 전투 런타임 값을 사용한다. LLM이 절대 픽셀·피해·초를 직접 정하지 않는다. 이 원칙이 기존 밸런스를 보존한다.

## 7. Power와 Mana 계약

### 7.1 총 Power

- 입력 Power는 `0~100`으로 clamp한다.
- 기존 R2의 영창 품질/Power 판정 기준을 유지한다.
- 시퀀스가 길거나 behavior가 많다는 이유만으로 총 Power를 추가 지급하지 않는다.

### 7.2 이동 비용

move behavior 하나마다 총 Power의 10%를 고정 예약한다.

```text
effectPower = max(0, totalPower - totalPower × 0.1 × moveCount)
```

이 비용은 distance나 duration과 무관하다. 이동 영창 자체를 허용하면서 이동+다중 공격이 공짜가 되는 것을 막기 위한 단순 규칙이다.

순수 이동 영창은 공격 Power가 0이어도 정상적으로 실행된다. 이동이 10개면 form에 남는 Power는 0이다.

### 7.3 form Power 배분

남은 `effectPower`를 모든 시퀀스의 form behavior가 `powerWeight` 비율로 공유한다.

```text
behaviorPower = effectPower × behaviorWeight / sum(all form weights)
```

- 단계별로 예산을 새로 받지 않는다.
- 동시에 실행된다고 Power가 복제되지 않는다.
- 보조 원소가 있다고 별도의 Power를 추가하지 않는다.
- 로컬 계산 후 각 `spec.cost`는 0으로 바꾼다. 마나는 plan 단위로 한 번만 낸다.

### 7.4 Mana

현재 프로토타입 공식:

```text
manaCost = max(5, round(totalPower × 0.6))
```

Mana는 LLM이 결정하지 않는다. 같은 Power라면 단일 공격이든 복합 시퀀스든 기본 마나 비용은 같다. 이동·다중 공격의 기회비용은 Power 분배와 시전 시간에 존재한다.

최종 마나 경제가 변경되더라도 `SpellPlan`에는 LLM 산출 `cost`를 추가하지 않고 로컬 계산을 유지하는 것을 권장한다.

## 8. 시간 계약

### 8.1 Power별 최대 시간

```text
maxDuration(power) = min(3000, 500 + clamp(power, 0, 100) × 25) ms
resolvedDuration = min(requestedDuration, maxDuration(power))
```

예:

| Power | 최대 시간 |
|---:|---:|
| 0 | 500ms |
| 10 | 750ms |
| 50 | 1750ms |
| 100 | 3000ms |

일반 영창은 절대 3초를 넘지 않는다. 5초 이상의 긴 연출은 추후 필살 영창의 차별점으로 남긴다.

### 8.2 단계 시간

- 각 단계 시간은 `durationWeight / 전체 durationWeight` 비율로 계산한다.
- 모든 weight가 0이면 모든 단계에 동일한 weight 1을 적용한다.
- form은 단계 시작 시 발동하고, 지속형 form은 자체 런타임 수명 동안 남는다.
- move tween은 해당 단계 시간을 사용한다.
- wait-only 단계는 해당 단계 시간만큼 아무 행동 없이 기다린다.
- 단계 시간이 끝나면 다음 단계가 시작된다.

## 9. 동일 단계 중복과 정규화

한 단계에서 최대 5개 behavior만 앞에서부터 유지한다.

현재 중복 서명:

```text
move: "move"
wait: "wait"
form: form + primary/secondary element + effect detail
```

따라서:

- move는 destination이 달라도 한 단계에 하나만 남는다.
- wait은 한 단계에 하나만 남는다.
- 같은 form이라도 원소나 효과가 다르면 병렬 실행할 수 있다.
- form·원소·효과 의미까지 같은 중복은 하나만 남긴다.
- damage form의 status 차이만으로 같은 공격을 복제하지 않는다.
- control form은 status 구성이 다르면 별도 behavior로 구분할 수 있다.

이 규칙은 “완전히 같은 행동을 중첩해 Power를 복제하는 것”만 막고, `불 wave + 물 wave` 같은 합성 공격은 허용한다.

## 10. 타깃 계약

타깃은 LLM 응답에 별도 적 ID나 좌표로 넣지 않는다. 전투 상태는 응답 시점과 실행 시점 사이에 바뀌므로 로컬이 책임진다.

의도한 최종 흐름:

1. 첫 form이 실행되기 전에는 사용자가 지정한 cast point를 기준으로 한다.
2. form이 최초로 적에게 피해 또는 제어를 적용하면 그 적을 lock-on한다.
3. 이후 적 대상 behavior는 잠긴 적을 우선한다.
4. 잠긴 적이 살아 있으면 계속 유지한다.
5. 잠긴 적이 죽으면 마지막 위치에서 가장 가까운 살아 있는 적으로 재탐색한다.
6. 대상이 없으면 각 form의 기존 fallback 조준 규칙을 사용한다.

현재 사용자 지정 조준이 없는 프로토타입에서는 1번을 가장 가까운 적으로 대체한다.

세부 원칙:

- chain은 잠긴 적을 첫 타격으로 삼고, 그 적에서 다른 적으로 연쇄한다.
- wall/orbit/zone 같은 지속형도 실제로 처음 영향을 준 적을 lock-on 후보로 제공한다.
- 같은 behavior가 여러 적을 동시에 맞히면 런타임 콜백 순서의 첫 적을 잠근다.
- 이동만 있는 영창은 적 lock을 만들지 않는다.
- LLM에 target mode를 단계마다 요구하지 않는다. 응답 복잡도와 전투 상태 결합을 줄이기 위함이다.

## 11. 실행 중 플레이어 상태

현재 프로토타입 정책:

- 시퀀스 시작부터 총 시간이 끝날 때까지 무적
- 시퀀스 실행 중 새 영창 불가
- 시퀀스 실행 중 플레이어 수동 이동 불가
- move behavior는 로컬 tween으로만 이동
- 진행 바에 전체 남은 시간과 단계 경계를 표시

전체 무적은 최종 확정이라기보다 플레이테스트가 필요한 정책이다. 3초 상한으로 악용 가능성을 제한했지만, 플레이어가 피하기 어려운 공격을 영창 입력으로 무조건 회피하는 방어기로 사용할 수 있다.

후속 논의 선택지:

1. 현행처럼 전체 시퀀스 무적 유지
2. move가 있는 단계만 무적
3. move tween이 실제로 진행되는 시간만 무적
4. 피해 감소 또는 1회 피격 무효로 약화

R2 스키마에는 별도 invulnerability 필드를 넣지 않는다. 무엇을 선택하든 로컬 전투 규칙이어야 하며 LLM이 무적 시간을 정하게 하지 않는다.

## 12. 기존 전투 보정과 기록

### 한 영창으로 처리하는 것

- 마나 지불: 한 번
- 반복 문장 판정: 한 번
- 최근 주문명: SpellPlan 이름 하나
- 총 영창 횟수: 하나
- 각인 후보 등록: 하나

### form behavior마다 처리하는 것

- 원소 친화 보정
- 격상 원소 약화
- 다양성 보너스
- 플레이어 최종 피해 배율
- 실제 사용 원소와 form 기록
- 보스의 주력 원소·주력 form 분석

보조 원소도 보스 기억의 원소 사용에 포함한다. move와 wait은 공격 습관 분석에서 제외한다. 순수 이동 영창은 전체 영창 횟수에는 포함하지만 주력 원소·form 통계를 오염시키지 않는다.

현재 반복 페널티는 SpellPlan의 원문 반복을 기준으로 전체 Power에 한 번 적용한 뒤 모든 form에 같은 배율을 적용한다. behavior별 반복 페널티를 추가로 적용하지 않는다.

## 13. 각인 임시 투영 정책

현재 R3 각인 v1은 `SpellSpec` 하나만 저장한다. R1 프로토타입은 복합 영창을 다음과 같이 임시 투영한다.

1. `damage` form만 후보로 삼는다.
2. move, wait, control, heal, shield, buff, summon은 무료 피해로 변환하지 않는다.
3. 기존 각인 제외 대상인 wall/orbit도 제외한다.
4. 후보 중 배분 Power가 가장 높은 form을 대표로 선택한다.
5. 동률이면 뒤에 실행되는 마무리 공격을 선택한다.
6. 적격 damage form의 Power 합을 대표 form에 담되 전체 plan Power를 넘지 않는다.
7. 각인 이름은 `전체 영창명 · 대표 공격명`으로 만든다.
8. 적격 form이 없으면 각인 후보를 만들지 않는다.

이는 **R3 확인 전 임시 정책**이다. 목적은 시퀀스 Power 배분 후 기존 각인 배율까지 적용되어 위력이 이중으로 희석되는 것을 막으면서, 방어·제어 영창이 공짜 공격 각인으로 변하는 것도 방지하는 것이다.

## 14. 오류·초과 응답 정규화

로컬 검증기는 LLM의 선의를 전제로 하지 않는다.

| 입력 문제 | 권장 처리 |
|---|---|
| Power 범위 초과/음수 | `0~100` clamp |
| duration 초과 | Power별 상한으로 clamp |
| sequence 10개 초과 | 앞 10개만 유지 |
| behavior 5개 초과 | 각 단계 앞 5개만 유지 |
| 빈 sequence | 제거 |
| wait와 다른 behavior 혼합 | wait 제거 |
| wait만 여러 개 | 하나만 유지 |
| 동일 behavior 중복 | 첫 항목만 유지 |
| 음수·비정상 weight | 0 또는 기본값으로 보정 |
| 모든 durationWeight가 0 | 단계 균등 배분 |
| form Power 총 weight가 0 | 모든 form Power 0 |
| `spec.power`, `spec.cost` 조작 | 무시하고 로컬 재계산 |
| 이동 거리 초과 | 420px clamp |
| 이동 도착점 맵 밖 | 월드 경계 clamp |
| 알 수 없는 enum/type | 해당 behavior 제거 또는 전체 판정 실패 |
| 정규화 후 sequence가 0개 | fizzle 또는 기존 fallback 주문 |
| JSON 파싱/검증 실패 | 기존 GeminiJudge fallback 정책 유지 |

구조적으로 잘못된 behavior를 억지로 다른 behavior로 추측 변환하지 않는다. 제거 후 실행 가능한 계획이 남지 않으면 안전한 fallback으로 전환한다.

## 15. 종료·중단 정리

시퀀스 도중 다음 조건을 매 단계 시작과 이동 tween 갱신에서 확인한다.

- 플레이어 사망
- 전투 상태 종료
- 방 전환 또는 런 종료

중단 시 필요한 로컬 정리:

- 실행 대기 중인 다음 단계 중단
- 활성 move tween 정지
- 진행 HUD 제거
- 영창 입력·수동 이동 lock 해제
- 시퀀스 전용 무적은 만료 또는 명시 해제
- 이미 생성된 지속형 공격은 기존 방 정리 정책을 따른다.

현재 `castFromText`의 `finally`가 일반적인 입력 UI 복구를 보장한다. 향후 네트워크 판정과 시퀀스 실행을 합칠 때도 반드시 `try/finally` 경계를 유지해야 한다.

## 16. 요청·응답 예시

### 예시 A: 이동 후 폭발

입력:

```text
적에게 파고든 뒤 불꽃으로 폭발해
```

개념 응답:

```json
{
  "schema_version": 3,
  "disposition": "cast",
  "spell_plan": {
    "name": "돌진 폭발",
    "power": 75,
    "durationMs": 1500,
    "sequences": [
      {
        "durationWeight": 2,
        "behaviors": [
          {
            "type": "move",
            "destination": "target-direction",
            "element": "fire",
            "distance": 190
          }
        ]
      },
      {
        "durationWeight": 1,
        "behaviors": [
          {
            "type": "form",
            "powerWeight": 1,
            "tuning": { "damage": 2, "radius": 2 },
            "spec": {
              "name": "돌진 폭발",
              "effect": "damage",
              "target": "self",
              "element_primary": "fire",
              "element_secondary": null,
              "form": "nova",
              "size": "large",
              "speed": "normal",
              "status": ["burn"],
              "power": 0,
              "cost": 0
            }
          }
        ]
      }
    ]
  }
}
```

### 예시 B: 추상적 영창을 안무로 해석

입력:

```text
꽃잎 댄스
```

해석 의도:

1. 바람 원소 이동과 orbit 공격을 병렬 실행한다.
2. 짧은 wait으로 박자를 만든다.
3. 다른 방향으로 이동하면서 wave로 마무리한다.

LLM은 단어에 form 이름이 없더라도 문장의 이미지와 동사를 제한된 behavior 조합으로 번역해야 한다. 반대로 스키마에 없는 새 form 문자열을 창작해서는 안 된다.

### 예시 C: 여러 원소의 합창

입력:

```text
모든 원소가 차례로 합창해 적을 공격한다
```

여러 원소를 보존하되 최대 sequence/behavior와 총 Power 안에서 구성한다. 원소 수를 임의로 둘로 줄이는 것보다 각 behavior Power가 나뉘어 개별 공격이 약해지는 편이 사용자 의도와 시스템 예산을 동시에 지킨다.

실행 가능한 추가 예시는 `src/spell/sequenceFixtureCatalog.ts`와 `debugSpellPlan()`에 있다. 문서 예시만으로 프롬프트를 과적합하지 말고 전체 카탈로그를 회귀 코퍼스로 사용한다.

## 17. R2 프롬프트 설계 지침

판정 순서를 다음처럼 권장한다.

1. 기존 안전/무의미 판정으로 `cast`, `fizzle`, `blocked` 결정
2. 전체 영창의 이름과 Power 결정
3. 문장 안의 시간 순서·접속사·동시성을 찾음
4. 순차 사건을 sequence로 분리
5. 같은 순간의 사건을 behavior로 병렬 배치
6. 각 form의 effect/target/form/원소를 독립 판정
7. 강조된 특성을 tuning 상대 가중치로 표현
8. 전체 길이를 고려해 durationMs와 durationWeight 결정
9. 로컬 제한을 넘기지 않는지 자체 점검

프롬프트에 다음 금지사항을 명시한다.

- Power나 Mana를 behavior마다 새로 생성하지 말 것
- 실제 피해량, 픽셀, 초 단위 제어값을 만들지 말 것
- 적 ID나 현재 좌표를 출력하지 말 것
- 스키마에 없는 원소·form·status를 만들지 말 것
- 무적 behavior를 만들지 말 것
- 같은 행동을 이름만 바꿔 중복하지 말 것
- 긴 문장이라고 무조건 sequence 수를 늘리지 말 것
- 추상적인 문장을 무조건 단일 nova/zone으로 축약하지 말 것

## 18. 캐시와 버전

새 판정은 기존 v2 캐시와 구조가 다르므로 캐시 키 또는 접두사에 다음을 포함해야 한다.

- schema version
- prompt version
- model identifier 또는 판정 정책 버전

기존 v2 캐시를 새 plan으로 자동 신뢰하지 않는다. 명시적인 단일-plan 변환을 거치거나 새 응답을 받아야 한다.

## 19. 테스트 계약

R2 구현 후 최소 검증 항목:

- 기존 v2 단일 주문 변환
- fizzle/blocked 불변
- sequence/behavior 상한
- Power·Mana 결정론
- duration clamp와 weight 배분
- move 10% 비용
- tuning 예산 중립성과 clamp
- 병렬/순차 의미 보존
- self damage nova 판정
- 보조 원소 및 다원소 영창
- 추상적 영창의 다단계 구성
- 잘못된 enum/빈 plan fallback
- 캐시 버전 격리
- 실제 Gemini 응답의 JSON 안정성·지연시간·토큰 크기

R1 회귀:

```bash
npm run test:sequence
npm run test:spell
npm run test:advanced-forms
npm run test:persistent-forms
npm run test:history
npm run test:boss
npm run build
```

## 20. 확정된 내용과 리뷰 요청

### R1 프로토타입 기준으로 확정해 전달하는 내용

- 최대 sequence 10개, 단계당 behavior 5개
- 순차 sequence / 병렬 behavior
- form / move / wait의 세 종류
- 일반 영창 최대 3초와 Power별 시간 상한
- move당 총 Power 10% 고정 비용
- form 전체 상대 weight 배분
- Power 기반 로컬 Mana 계산
- behavior별 원소와 form별 tuning
- 로컬 타깃 lock-on과 사망 시 재탐색
- LLM이 무적·적 ID·절대 전투 수치를 정하지 않음
- 영창 한 번/behavior 사용 여러 번의 기록 분리

### R2 리뷰 요청

1. `SpellJudgement v3` 도입과 v2 호환 방식을 확정해 달라.
2. `effect`, `target`, `form`을 독립 축으로 판정해 self damage nova가 가능하도록 프롬프트를 수정해 달라.
3. 본 문서와 fixture catalog를 기준으로 Gemini 응답 스키마·validator·fallback·cache version을 구현해 달라.
4. 응답 길이와 지연시간이 현재 Worker 제한 안에서 안정적인지 실측해 달라.
5. 추상적 문장과 명시적 복합 명령 양쪽에서 sequence 수가 과도하거나 지나치게 축약되지 않는지 확인해 달라.

### R3 리뷰 요청

1. §13의 대표 form 각인 투영 정책을 임시안으로 수용할지 확인해 달라.
2. 장기적으로 전체 sequence 각인을 지원할지, v1 단일 SpellSpec 각인을 유지할지 결정해 달라.

## 21. 의도 요약

이 시스템의 성공 기준은 JSON이 복잡해지는 것이 아니다. 플레이어가 자유 문장으로 상상한 **전투의 순서와 동시성**이 화면에서 읽히고, 기존 단일 주문보다 행동 폭이 넓어졌다고 느끼는 것이다.

LLM에는 의미 해석과 안무를 맡기고, 밸런스와 안전은 로컬이 소유한다. 이 경계가 유지되어야 창의적인 영창을 늘리면서도 응답 변동·과도한 이동·Power 복제·무적 악용·타깃 불일치가 게임 전체를 흔들지 않는다.
