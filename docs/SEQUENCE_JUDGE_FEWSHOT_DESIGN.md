# 영창 Judge 최소 JSON 대조쌍 설계

> 기계 판독 원본: `SEQUENCE_JUDGE_FEWSHOT_CASES.json`  
> 상태: 프롬프트 삽입 전 설계·계약 검증 단계

## 목적

자연어 규칙만 추가한 후보 1~5는 제목형 영창의 단일/plan 경계를 안정적으로 학습시키지 못했다. 다음 실험은 30종 legacy 답안을 복사하지 않고, 서로 다른 판단 경계를 보여주는 완전 JSON 예시만 사용한다.

## 선정한 9개 경계

| ID | 학습 경계 |
|---|---|
| `magic-object-motion-single` | 마법 형상 이동은 플레이어 `move`가 아님 |
| `embodied-motion-parallel-plan` | 플레이어 체현 이동+공격의 동시 병렬 |
| `static-image-single` | 정적 이미지의 과분할 금지 |
| `causal-transition-plan` | 원인→결과의 순차 단계 |
| `simultaneous-dual-element-plan` | 서로 다른 원소의 동시 병렬 |
| `sequential-move-then-form-plan` | 이동 완료 후 공격 |
| `explicit-repeat-with-wait-plan` | 명시 반복과 wait-only 박자 |
| `pure-movement-plan` | form·buff 없이 플레이어 이동만으로 완결되는 plan |
| `form-encodes-plurality-single` | chain 등 form이 관계를 이미 표현하는 경우 |

## legacy 30종과의 관계

- 입력 문구는 30종과 겹치지 않는다.
- expected JSON도 초기 fixture를 복사하지 않고 현행 계약으로 새로 작성했다.
- 30종은 계속 회귀·평가군으로만 사용한다.
- few-shot은 개별 정답을 암기시키는 목적이 아니라 판단 경계를 보여주는 학습 예시다.

## 삽입 원칙

9종을 모두 즉시 넣지 않는다.

1. 우선 4개 핵심 대조쌍만 넣은 후보를 만든다.
2. 자동 하한선과 지연을 측정한다.
3. 실패 경계에 대응하는 예시만 추가한다.
4. 응답 지연이 늘면 예시 JSON을 축약하되 필수 필드는 제거하지 않는다.
5. legacy 30종 결과를 보고 해당 입력과 비슷한 예시를 사후 추가하지 않는다.

첫 후보 권장 4종:

- `magic-object-motion-single`
- `embodied-motion-parallel-plan`
- `explicit-repeat-with-wait-plan`
- `form-encodes-plurality-single`

이 네 사례가 현재 가장 큰 오류인 장식용 move, 체현 이동 누락, 반복 축약, form 관계의 과분할을 직접 대조한다.
