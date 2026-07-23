# 영창 시퀀스 빠른 시작

> 상세 타입과 계산식보다 먼저 시스템을 이해하고 직접 체험하기 위한 문서다.  
> 구현 계약이 필요하면 [SPELL_SEQUENCE_SCHEMA_DRAFT.md](SPELL_SEQUENCE_SCHEMA_DRAFT.md)를 참고한다.

## 1. 한 문장 요약

기존에는 영창 한 번이 공격 하나로 변환됐다면, 새 프로토타입에서는 영창 한 번이 **이동·공격·방어·제어·대기를 순차 또는 동시에 실행하는 짧은 전투 시퀀스**가 된다.

예를 들어 `꽃잎 댄스`는 다음처럼 실행할 수 있다.

```text
이동 + 회전 공격 → 잠깐 대기 → 다른 방향으로 이동 + 파동 공격
```

- 화살표 `→`: 다음 sequence로 넘어가 순차 실행
- 더하기 `+`: 같은 sequence의 behavior를 동시에 실행

LLM이 최종 피해량이나 이동 한계를 정하는 구조는 아니다. LLM은 제한된 행동을 조합하고, 로컬 게임은 Power·Mana·시간·타깃·맵 경계를 강제한다.

## 2. 기존 영창과 달라지는 점

| 기존 단일 주문 | 영창 시퀀스 프로토타입 |
|---|---|
| 한 번에 하나의 `SpellSpec` 실행 | 여러 단계와 여러 행동 실행 |
| 이동이나 시간 순서를 표현하기 어려움 | 이동·wait·동시 공격 표현 가능 |
| 주문 전체에 원소·form 하나가 중심 | behavior마다 원소·form 지정 가능 |
| 단일 공격의 Power | 전체 Power를 행동 사이에 분배 |
| 한 번의 자동 조준 | 최초 적중 lock-on 후 후속 행동이 추적 |

현재 제한은 다음과 같다.

- 일반 영창은 최대 10단계다.
- 한 단계에서는 최대 5개 행동이 동시에 실행된다.
- 일반 영창의 총 실행시간은 최대 3초다.
- 이동 하나마다 전체 Power의 10%를 사용한다.
- 새 판정 API는 아직 연결되지 않았으며, 현재는 미리 준비한 로컬 프리셋으로 실행을 검증한다.

## 3. 실행 방법

### 3.1 개발 서버 실행

프로젝트 루트에서 다음 명령을 실행한다.

```bash
npm run dev
```

표시된 로컬 주소를 브라우저에서 열고 게임을 시작한다.

프리셋은 개발 모드에서 로컬로 가로채므로 Gemini API 응답을 기다리지 않는다. 별도의 API 키나 MockJudge 설정도 필요하지 않다.

### 3.2 프리셋 실행

1. 전투 중 `Enter`를 눌러 영창 입력창을 연다.
2. 아래 표의 **입력 문구를 그대로 입력**한다.
3. `Enter`로 영창을 확정한다.
4. Mana가 부족하면 프리셋이 실행되지 않으므로 회복 후 다시 시도한다.

예:

```text
꽃잎 댄스
```

개발용 영문 키로도 실행할 수 있다.

```text
#seq petal-dance
```

한글 입력은 실제 플레이어 경험과 UI를 확인할 때 권장하고, `#seq <key>`는 프리셋을 빠르게 반복하거나 이름 입력 문제를 배제할 때 사용한다.

소리가 들리지 않으면 `M` 음소거 상태를 먼저 확인한다.

## 4. 먼저 확인할 대표 프리셋

전체를 보기 전에 아래 8개를 순서대로 실행하면 핵심 구조를 빠르게 이해할 수 있다.

| 입력 문구 | 개발 키 | 확인할 내용 |
|---|---|---|
| `적막을 가르는 섬광` | `#seq silent-flash` | 이동과 beam의 병렬 실행, 첫 적중 lock-on, 후퇴 |
| `꽃잎 댄스` | `#seq petal-dance` | 추상적 문장을 이동·orbit·wait·wave 안무로 표현 |
| `그림자 바느질` | `#seq shadow-stitching` | bolt 최초 적중 후 cage와 chain이 같은 타깃을 계승 |
| `유성우를 거슬러` | `#seq against-meteor-rain` | 후퇴하며 rain 설치 후 재진입 nova |
| `최후의 성채` | `#seq last-bastion` | shield와 wall control의 비피해 시퀀스 |
| `허공답보` | `#seq void-steps` | 공격 없이 이동만 이어지는 영창과 무속성 UI 처리 |
| `사방의 포화` | `#seq fourfold-barrage` | 한 단계 최대치인 5개 behavior 병렬 실행 |
| `팔원소 대합창` | `#seq octave-of-elements` | 8원소를 보존하면서 Power가 여러 공격에 분배되는 모습 |

## 5. 플레이테스트에서 볼 것

### 실행 의미

- 같은 단계의 이동과 공격이 동시에 시작되는가
- 진행 바의 단계 경계에서 다음 행동으로 자연스럽게 넘어가는가
- wait 단계가 공격 사이의 박자로 읽히는가
- 3초 이내의 연출이 너무 급하거나 지나치게 길게 느껴지지 않는가

### 조작과 생존

- 시퀀스 중 새 영창과 WASD 이동이 막히는가
- move behavior가 의도한 방향으로 이동하는가
- 이동이 맵 밖으로 나가지 않는가
- 전체 시퀀스 무적이 유용한 연출 보조인지, 지나치게 강한 회피 수단인지
- 시퀀스가 끝난 순간을 진행 바로 파악할 수 있는가

### 타깃

- 최초로 영향을 받은 적을 후속 공격이 우선하는가
- 잠긴 적이 죽으면 가까운 다른 적으로 자연스럽게 전환되는가
- chain이 잠긴 적에서 시작해 다른 적으로 이어지는가
- wall·orbit 같은 지속 공격의 첫 적중도 lock-on을 만들 수 있는가

### 밸런스와 표현

- 행동이 많을수록 각 공격의 위력이 나뉘는 것이 체감되는가
- 이동이 포함된 영창이 이동과 공격을 모두 공짜로 얻는 느낌은 아닌가
- behavior별 원소 발동음과 시각 표현이 순서에 맞게 재생되는가
- 순수 이동·방어·제어 영창도 실패가 아니라 하나의 유효한 주문처럼 보이는가
- 추상적인 이름과 실제 동작 사이에 납득 가능한 연결이 있는가

## 6. 전체 이름 기반 프리셋

### 6.1 쇼케이스 프리셋

아래 프리셋은 R2가 만들어야 할 응답의 의미 범위를 보여준다. 이름 또는 개발 키로 실행할 수 있다.

| 입력 문구 | 개발 키 | 설계 의도 |
|---|---|---|
| `적막을 가르는 섬광` | `silent-flash` | 접근 관통 후 이탈 |
| `도망치는 별` | `fleeing-star` | 후퇴 견제와 원거리 rain |
| `화산맥의 기상` | `waking-volcano` | wall·rain·nova 복합 원소 전장 압박 |
| `서리 거울` | `frost-mirror` | shield 후 freeze와 반격 beam |
| `사슬을 끊는 파도` | `breaking-current` | knockback·후퇴·회복 |
| `천둥새의 비행` | `thunderbird-flight` | 무작위 적 접근·chain·이탈 |
| `태풍의 회랑` | `typhoon-corridor` | 좌우 이동과 wall·orbit 공간 제어 |
| `그림자 바느질` | `shadow-stitching` | 첫 타격 lock-on·cage·chain |
| `백야의 성역` | `white-night-sanctuary` | 중앙 이동과 heal·shield·zone 거점 |
| `모래시계의 수호` | `hourglass-guardian` | shield·wait·wall·shield의 지연 방어 |
| `찰나의 전이` | `instant-crossing` | 0ms 이동과 nova의 즉시 병렬 실행 |
| `사방의 포화` | `fourfold-barrage` | 한 단계 5개 behavior 상한 |
| `유성우를 거슬러` | `against-meteor-rain` | 후퇴 rain 후 재진입 nova |
| `얼어붙은 추격전` | `frozen-chase` | 표식·접근·감금·거리 벌리기 |
| `용이 잠든 산` | `sleeping-dragon-mountain` | wait·summon·복합 원소 마무리 |
| `심장이 두 번 뛰는 동안` | `two-heartbeats` | 시간 은유를 두 차례 타격으로 표현 |
| `별자리를 꿰매는 바늘` | `constellation-seam` | bolt·chain·beam의 창의적 추적 |
| `무지개를 한 자루 창으로` | `rainbow-spear` | 주·보조 원소 하나의 behavior |

### 6.2 추가 시연 프리셋

| 입력 문구 | 개발 키 | 설계 의도 |
|---|---|---|
| `불사조의 낙화` | `phoenix-dive` | 이동 wave·wait·nova 마무리 |
| `뇌광의 사냥` | `thunder-hunt` | 표식·적 접근·chain 추적 |
| `겨울 정원의 폐막` | `winter-garden` | zone slow 후 cage freeze |
| `일식의 왈츠` | `eclipse-waltz` | 빛·어둠 이동과 orbit·beam |
| `최후의 성채` | `last-bastion` | shield 후 wall control |
| `해일의 역류` | `receding-tide` | 타깃 반대 이동과 wave·rain |
| `폭풍의 눈` | `eye-of-storm` | zone·orbit 병렬 후 이동·chain |
| `심연의 군세` | `abyssal-host` | zone·summon 후 cage·beam |
| `새벽의 순례` | `dawn-pilgrimage` | 중앙 이동과 heal·shield |
| `허공답보` | `void-steps` | 네 단계 순수 이동 |
| `유리별의 사격` | `glass-star-shot` | bolt·이동 beam·nova |
| `팔원소 대합창` | `octave-of-elements` | 8원소 다단계 합성 공격 |

## 7. 기계적 디버그 프리셋

아래 항목은 자연스러운 주문보다는 특정 런타임 규칙 하나를 빠르게 확인하기 위한 개발용 입력이다.

| 입력 | 확인 목적 |
|---|---|
| `#seq single` | 단일 form을 새 구조로 실행 |
| `#seq dash-nova` | 이동 후 nova |
| `#seq parallel` | 이동과 form 병렬 실행 |
| `#seq lockon` | 첫 영향 대상 lock-on |
| `#seq retarget` | 잠긴 적 사망 후 재탐색 |
| `#seq petal-dance` | 추상적 다단계 시퀀스 |
| `#seq shield` | 순수 방어 효과 |
| `#seq movement-only` | 순수 이동과 공격 통계 제외 |

## 8. 현재 프로토타입에서 오해하기 쉬운 부분

### 이 프리셋들은 실제 Gemini 응답이 아니다

프리셋은 R1이 설계 범위와 실행 가능성을 검증하려고 작성한 결정론적 샘플이다. R2가 스키마를 연결하면 같은 문장이 항상 이 계획과 완전히 같게 나올 필요는 없다. 다만 아래 의미는 보존되어야 한다.

- 명시한 순서와 동시성
- 이동·공격·방어 같은 핵심 동사
- 명시한 원소 수와 조합
- 추상적 문장의 전투적 이미지
- 전체 Power·시간 제한

### 사용자 지정 조준은 아직 연결되지 않았다

최종 의도는 첫 공격 전 사용자가 지정한 지점을 사용하고, 최초로 영향을 받은 적부터 lock-on하는 것이다. 현재는 조준 시스템이 없으므로 가장 가까운 적이 초기 기준이 된다.

### 전체 시퀀스 무적은 리뷰 대상이다

현재는 실행 중 이동이 제한되는 불이익을 보완하기 위해 전체 시퀀스 동안 무적이다. 일반 영창을 최대 3초로 줄였지만 회피기로 지나치게 강할 가능성이 있다. 플레이테스트 의견이 필요한 핵심 항목이다.

### 실제 LLM 응답 연결은 R2 후속 작업이다

현재 브랜치는 로컬 실행 뼈대, 정규화, 예산, 프리셋과 계약 문서를 제공한다. Gemini 프롬프트·validator·캐시 버전 변경은 R2 리뷰 후 연결한다.

## 9. 상세 자료

- [영창 시퀀스 상세 스키마](SPELL_SEQUENCE_SCHEMA_DRAFT.md)
- 실행 계획과 정규화: `src/spell/sequencePlan.ts`
- 전체 쇼케이스 카탈로그: `src/spell/sequenceFixtureCatalog.ts`
- 각인 임시 투영: `src/spell/sequenceEngraveCandidate.ts`
- 회귀 테스트: `scripts/spell-sequence-regression.ts`

상세 스키마는 처음부터 전부 읽기보다 이 문서의 대표 프리셋을 먼저 실행한 뒤, 구현 또는 리뷰가 필요한 항목을 찾아보는 방식으로 사용하는 것을 권장한다.
