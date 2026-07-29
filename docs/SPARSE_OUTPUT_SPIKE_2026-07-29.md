# v2.15 원본 + sparse output 격리 스파이크

> 작성일: 2026-07-29 · 관련 #158 · 브랜치 `codex/judge-sparse-output-spike`
>
> 결과를 보기 전에 변경 범위, corpus, 합격선과 중단선을 고정한다.

## 1. 질문과 불변 조건

질문은 하나다. **검증·실행 시 의미가 같은 기본 필드를 Gemini 출력에서 생략하면, 원본 v2.15 분류 품질을 유지하면서 response bytes와 tail latency를 유의미하게 줄일 수 있는가?**

불변:

- baseline은 production v2.15 (`origin/main` `2f14ba9`).
- 원본 `JUDGE_PROMPT` 규칙·우선순위·예시를 삭제하거나 축약하지 않는다.
- named/nested JSON, key 이름, validator, resolver, 엔진, 모델, maxOutputTokens는 유지한다.
- 단일 `spell` 출력은 바꾸지 않는다.
- plan root의 `name/power/durationMs`, form spec의 `name/effect/target/element_primary/form`, move의 `destination/element`는 유지한다.
- timeout 상향, retry, repair/2차 호출, semantic IR, positional array는 범위 밖이다.

변경:

- plan form spec의 기본 `element_secondary:null`, `size:"medium"`, `speed:"normal"`, `status:[]`, 로컬 재계산 `power/cost`를 생략한다.
- `durationWeight`/`powerWeight`가 1이면 생략한다.
- 실제 강조가 없으면 `tuning`을 생략한다.

baseline prompt: Windows checkout 기준 7,016 chars / 11,480 UTF-8 bytes / CRLF SHA-256 `d98e97d0714a038e80ab41a7090945fca659704b958bb7024d95a19de6c3b6e2`. 정적 원문 보존 검사는 Git blob과 같은 LF 정규화 SHA-256 `1279f406bcad6c495f2ed5db2bd9fe721c56613674665f3e415a8f68602cc85b`를 사용한다.

## 2. 테스트 피라미드

### 정적·단위

- 원본 v2.15의 sequence/single 우선순위, 12개 경계 예시, enum, 방향, 무단 지원 효과 금지 문구가 모두 남아 있는지 검사.
- full plan과 sparse plan이 `validateJudgement` → `resolveSpellPlan` 뒤 완전히 동일한지 검사.
- 기존 judge fallback, plan validate, sequence 회귀와 production build.

### Preview 통합

- `wrangler versions upload`만 사용하고 production 트래픽은 0%로 둔다.
- Node `fetch`로 HTTP, JSON, validator, mode, sequence/behavior 수, effects, response bytes, elapsed를 기록한다.
- 모든 호출은 전역 최소 4.3초 간격. 429 또는 provider 오류가 연속되면 즉시 중단한다.
- 실패 호출은 자동 재시도하지 않는다.

## 3. 스모크 8종

baseline/candidate 순서를 케이스마다 교차한다.

| 기대 | 입력 |
|---|---|
| sequence | 왼쪽으로 피한 뒤 번개를 세 번 내리친다 |
| sequence | 얼음 장벽을 세우면서 번개를 쏜다 |
| sequence | 적에게 파고들어 칼날로 벤다 |
| sequence | 불사조의 낙화 |
| sequence | 심장이 두 번 뛰는 동안 |
| sequence | 팔원소 대합창 |
| single | 서리 거울 |
| single | 파이어볼 |

즉시 중단:

- candidate HTTP/JSON/validator 실패
- 명시 복합 3종 중 single 1건
- single 2종 중 sequence 1건
- candidate의 입력에 없는 heal/shield/buff 수가 같은 paired baseline보다 증가
- 429

스모크 통과:

- candidate 명시 복합 3/3, 추상·수사 sequence 최소 2/3, single 2/2
- candidate의 전체 mode 정답 수가 같은 회차 baseline보다 낮지 않음

## 4. 품질 corpus 42종

### 공개 sequence 권장 19

도망치는 별 / 화산맥의 기상 / 천둥새의 비행 / 태풍의 회랑 / 그림자 바느질 / 찰나의 전이 / 사방의 포화 / 유성우를 거슬러 / 얼어붙은 추격전 / 심장이 두 번 뛰는 동안 / 별자리를 꿰매는 바늘 / 불사조의 낙화 / 뇌광의 사냥 / 겨울 정원의 폐막 / 일식의 왈츠 / 해일의 역류 / 새벽의 순례 / 허공답보 / 팔원소 대합창

### 공개 single 우선 11

적막을 가르는 섬광 / 서리 거울 / 사슬을 끊는 파도 / 백야의 성역 / 모래시계의 수호 / 용이 잠든 산 / 무지개를 한 자루 창으로 / 최후의 성채 / 폭풍의 눈 / 심연의 군세 / 유리별의 사격

### held-out sequence 8

1. 잿빛 달이 부서진 뒤 파편들이 적을 추격한다
2. 번개 고리를 펼치며 오른쪽으로 도약해 낙뢰를 꽂는다
3. 세 차례 울리는 빙결 종소리
4. 붉은 혜성의 귀환
5. 파도 위를 달리는 검무
6. 어둠이 갈라지고 그 틈에서 별빛이 쏟아진다
7. 모래 폭풍 속을 후퇴하며 불꽃 화살을 난사한다
8. 새벽을 깨우는 천둥의 행진

### held-out single 4

한 개의 검은 태양 / 고요한 수정 구체 / 거대한 화염구 / 굳어버린 시간의 방패

품질 GO:

- HTTP 200·JSON·`validateJudgement` 42/42
- 공개 sequence 최소 16/19, 공개 single 최소 10/11
- held-out sequence 최소 6/8, held-out single 4/4
- 무단 heal/shield/buff 0

## 5. 지연 GO

품질을 통과한 뒤 스모크의 명시 복합 3 + 추상 1 + single 2를 baseline/candidate 각각 N=3 교차 호출한다(36콜).

- candidate paired median이 baseline보다 최소 150ms이면서 10% 이상 빠름
- candidate p90이 baseline보다 악화하지 않음
- 2.5초·3.2초 초과 건수가 baseline보다 증가하지 않음
- candidate response bytes 중앙값이 baseline보다 최소 15% 작음

하나라도 실패하면 production 미변경 NO-GO다.

## 6. 호출·배포 경계

- 계획 호출: smoke 16 + candidate quality 42 + paired latency 36 = 최대 94콜.
- 429는 품질 실패로 세지 않고 즉시 중단해 quota 상태를 공유한다.
- `wrangler deploy`, `wrangler versions deploy`, production cache version bump는 사용자·총괄 승인 전 금지한다.

## 7. 게이트 정정·실행 기록

- 최초 스모크는 S5 `심장이 두 번 뛰는 동안`에서 중단됐다. baseline과 candidate가 모두 single로 분류하고 각각 입력에 없는 heal/buff를 1건 추가했다.
- 원본 v2.15 보존 실험의 목표는 baseline 대비 비열화 방지인데, baseline도 실패한 항목에 candidate만 절대 0건을 요구한 스모크 기준은 논리적으로 모순이었다.
- 결과를 유리하게 만들기 위한 prompt/corpus/품질선 변경 없이, **스모크의 무단 지원 즉시 중단선만 paired baseline보다 증가하지 않음으로 정정**한다. 42종 candidate 품질 단계의 절대 0건 기준은 유지한다.
