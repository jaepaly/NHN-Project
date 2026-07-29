# v2.15 compact 프롬프트 격리 스파이크

> 작성일: 2026-07-29 · 관련 #158 · 브랜치 `codex/judge-prompt-compact-spike`
>
> 이 문서는 결과를 보기 **전에** corpus, 지표, 합격선과 중단선을 고정한다. 결과를 본 뒤 문장을 교체하거나 합격선을 낮추지 않는다.

## 1. 질문과 변경 팔

검증할 질문은 두 개다.

1. 동일 출력 계약에서 프롬프트 본문만 줄이면 응답 지연이 유의미하게 줄어드는가?
2. 동일 named/nested JSON 구조에서 로컬이 복원할 기본값을 생략하면 출력 bytes와 tail이 더 줄어드는가?

| 팔 | 변경 | 바꾸지 않는 것 |
|---|---|---|
| baseline | production v2.15 | 전체 |
| compact-text | 규칙 7 결정문·예시·스키마 설명 중복 축약 | 모델, enum, named/nested JSON, validator, 엔진 |
| sparse-plan | compact-text + plan 내부 기본값/로컬 재계산 필드 생략 | object/array 계층, key 이름, 단일 spell 계약, plan root power/duration |

`semantic IR`, positional array, formal response schema, repair/2차 호출, 자동 재시도, timeout 상향은 범위 밖이다.

## 2. 테스트 피라미드

### 정적·단위

- `JUDGE_PROMPT` 문자 수와 baseline 대비 절감률.
- 모든 effect/target/element/form 및 move destination 계약 보존.
- `spell`/`spell_plan` 상호배타성과 우선순위 문구 보존.
- 희소 plan 샘플이 `validateSpellPlan`을 통과하고 `resolveSpellPlan`에서 기본값·power/cost를 복원.
- 기존 judge/plan/sequence 회귀와 전체 빌드.

### Preview 통합

- Version Preview에 Node `fetch`로 호출한다. Windows 인라인 curl은 사용하지 않는다.
- HTTP 상태, JSON 파싱, `validateJudgement`, `validateSpellPlan`, mode, sequence/behavior 수, 요청/응답 bytes, 전체 elapsed를 기록한다.
- Preview Worker가 계측 헤더를 제공할 수 있으면 Gemini upstream elapsed도 별도로 기록한다.

### 실플레이

- Preview 품질·지연 GO 뒤에만 진행한다.
- production 배포 전 사용자가 fixture가 아닌 자연어로 최종 체감을 확인한다.

## 3. 1차 스모크 8종

세 팔 모두 같은 순서가 아니라 `baseline → compact-text → sparse-plan`을 케이스마다 회전해 시간대 편향을 줄인다.

| 기대 | 입력 | 보는 경계 |
|---|---|---|
| sequence | 왼쪽으로 피한 뒤 번개를 세 번 내리친다 | 절대방향+순차+수량 |
| sequence | 얼음 장벽을 세우면서 번개를 쏜다 | 병렬 |
| sequence | 적에게 파고들어 칼날로 벤다 | 융합 이동+slash |
| sequence | 불사조의 낙화 | 추상 동작 |
| sequence | 심장이 두 번 뛰는 동안 | 수량 우선순위 vs 정적 명사 |
| sequence | 팔원소 대합창 | 다원소 압축 |
| single | 서리 거울 | 정적 단일 |
| single | 파이어볼 | 직접 원소+형태 단일 |

즉시 중단:

- 후보에서 HTTP/JSON/validator 실패 1건 이상
- 명시 복합 3종 중 single 1건 이상
- 단일 2종 중 sequence 1건 이상
- 입력에 없는 heal/shield/buff 추가
- 429 발생 시 품질/지연 실패로 세지 않고 호출을 중지해 quota 상태를 공유

## 4. 공개 회귀 30종

### 시퀀스 권장 19종

1. 도망치는 별
2. 화산맥의 기상
3. 천둥새의 비행
4. 태풍의 회랑
5. 그림자 바느질
6. 찰나의 전이
7. 사방의 포화
8. 유성우를 거슬러
9. 얼어붙은 추격전
10. 심장이 두 번 뛰는 동안
11. 별자리를 꿰매는 바늘
12. 불사조의 낙화
13. 뇌광의 사냥
14. 겨울 정원의 폐막
15. 일식의 왈츠
16. 해일의 역류
17. 새벽의 순례
18. 허공답보
19. 팔원소 대합창

### 단일 우선 11종

1. 적막을 가르는 섬광
2. 서리 거울
3. 사슬을 끊는 파도
4. 백야의 성역
5. 모래시계의 수호
6. 용이 잠든 산
7. 무지개를 한 자루 창으로
8. 최후의 성채
9. 폭풍의 눈
10. 심연의 군세
11. 유리별의 사격

## 5. 동결 held-out 12종

아래 문장은 compact 프롬프트 예시에 넣지 않는다.

### 시퀀스 권장 8종

1. 잿빛 달이 부서진 뒤 파편들이 적을 추격한다
2. 번개 고리를 펼치며 오른쪽으로 도약해 낙뢰를 꽂는다
3. 세 차례 울리는 빙결 종소리
4. 붉은 혜성의 귀환
5. 파도 위를 달리는 검무
6. 어둠이 갈라지고 그 틈에서 별빛이 쏟아진다
7. 모래 폭풍 속을 후퇴하며 불꽃 화살을 난사한다
8. 새벽을 깨우는 천둥의 행진

### 단일 우선 4종

1. 한 개의 검은 태양
2. 고요한 수정 구체
3. 거대한 화염구
4. 굳어버린 시간의 방패

## 6. GO/NO-GO

### 품질

- HTTP 200·JSON·`validateJudgement`: 100%
- 공개 시퀀스 권장: **최소 16/19**
- 공개 단일 우선: **최소 10/11**
- held-out 시퀀스 권장: 최소 6/8
- held-out 단일 우선: 4/4
- 명시 복합 구조 누락 0, 입력에 없는 heal/shield/buff 0, sequence 3 초과 0

### 지연

스모크 통과 후보 하나만 지연 집중 6종을 baseline과 번갈아 N=3 호출한다.

- candidate paired median이 baseline보다 **150ms 이상이면서 10% 이상 단축**
- p90은 baseline보다 악화하지 않음
- 2.5/3.2초 클라이언트 상한 초과 건수는 baseline보다 증가하지 않음
- sparse-plan 채택에는 response bytes도 baseline 대비 15% 이상 감소

품질을 통과해도 위 시간 기준을 못 넘으면 “유의미한 단축 없음”으로 NO-GO다. 지연을 통과해도 품질 기준 하나라도 실패하면 NO-GO다.

## 7. 호출 예산과 배포 경계

- 예상 최대: 스모크 24콜 + 최종 후보 품질 42콜 + paired latency 36콜 = **102콜**.
- 각 호출은 최소 4.3초 간격으로 15 RPM을 지킨다.
- 429 또는 provider 오류가 연속되면 끙끙대며 반복하지 않고 즉시 중지·공유한다.
- `wrangler versions upload`만 허용한다. Version Preview는 배포가 아니며 production 트래픽 0%.
- `wrangler deploy`, `wrangler versions deploy`, production 캐시 버전 bump는 사용자와 총괄 승인 전 금지한다.
