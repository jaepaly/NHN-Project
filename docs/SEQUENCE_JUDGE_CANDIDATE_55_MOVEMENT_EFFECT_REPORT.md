# 영창 Judge 의도 기준선 자동 채점

> 기준 응답: `docs/SEQUENCE_JUDGE_CANDIDATE_55_MOVEMENT_EFFECT.json`  
> 기대값: `docs/SEQUENCE_JUDGE_MOVEMENT_EFFECT_HELDOUT_EXPECTATIONS.json`  
> Worker: https://incant-judge-proxy.incant-judge-proxy.workers.dev  
> 응답 수집: 2026-07-30T11:36:36.141Z

## 요약

- 자동 점수 평균: **98/100**
- 자동 항목 만점: **12/16**
- 권장 모드 일치: **14/16**
- 자동 실패 항목: **5개**
- 수동 판정 대기 항목: **24개**

자동 점수는 스키마에서 관찰 가능한 anchor·구조·관계만 평가한다. 시각적 만족도, 인과성, 전환의 자연스러움, 장식용 이동 여부는 점수에 포함하지 않고 수동 판정으로 남긴다.

## 해석

- **98점은 전체 품질 점수가 아니다.** 원소·형태·필수 구조처럼 스키마에서 관찰 가능한 표면 계약의 보존율이다.
- 자동 항목만으로도 4종에서 실패가 발생했지만, 현행 출력의 핵심 문제인 비슷한 `move → form` 반복과 장면의 재미는 자동 점수에 거의 반영되지 않는다.
- 따라서 이 수치는 프롬프트가 최소 계약을 훼손하는지 감시하는 하한선으로 사용하고, 최종 채택은 아래 수동 시각 평가를 함께 통과해야 한다.

## 사례별 결과

| # | 입력 | 기대/실제 | 자동 점수 | 실패 | 수동 |
|---:|---|---|---:|---:|---:|
| 1 | 불꽃을 두르고 적진을 꿰뚫는다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 2 | 도약 끝에 벼락을 내리꽂는다 | `sequence_required` / `sequence` | 93 | 1 | 1 |
| 3 | 한 칼을 남기고 바람처럼 빠져나온다 | `sequence_required` / `sequence` | 96 | 1 | 1 |
| 4 | 서리 길을 그리며 미끄러진다 | `sequence_required` / `sequence` | 100 | 0 | 2 |
| 5 | 회오리 속을 달려 적들을 밀어낸다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 6 | 그림자 사이를 오가며 발목을 묶는다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 7 | 빛의 틈으로 몸을 피한다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 8 | 바람을 타니 몸이 깃털처럼 가벼워진다 | `sequence_required` / `sequence` | 100 | 0 | 2 |
| 9 | 철의 껍질을 두르고 돌진한다 | `sequence_required` / `sequence` | 100 | 0 | 2 |
| 10 | 쓰러진 동료에게 날아가 생명의 빛을 건넨다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 11 | 늑대 등에 올라 함께 적진을 달린다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 12 | 달빛을 밟고 적 곁에 내려선다 | `sequence_required` / `sequence` | 96 | 1 | 1 |
| 13 | 안개 속으로 사라져 다른 곳에 나타난다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 14 | 불새의 비행 | `single_preferred` / `sequence` | 79 | 2 | 3 |
| 15 | 상처 위에 별빛이 머문다 | `single_preferred` / `single` | 100 | 0 | 2 |
| 16 | 뿌리가 전장을 기어가 발목을 잡는다 | `single_preferred` / `sequence` | 100 | 0 | 3 |

## 자동 실패 상세

### 2. 도약 끝에 벼락을 내리꽂는다

- `allowed-form`: 허용 형태 nova/beam/wave 중 실제 bolt

### 3. 한 칼을 남기고 바람처럼 빠져나온다

- `duration-range`: durationMs 950, 선호 250~900

### 12. 달빛을 밟고 적 곁에 내려선다

- `duration-range`: durationMs 550, 선호 600~1500

### 14. 불새의 비행

- `allowed-form`: 허용 형태 summon/bolt/orbit/rain 중 실제 wave
- `forbidden:movement`: 금지 movement 검출

## 수동 평가 시 확인할 것

- 입력에서 기대한 사건과 장면 전개가 실제 출력에서 읽히는가
- 단계마다 역할이 구분되고 앞뒤 사건의 인과가 자연스러운가
- 병렬 행동이 하나의 장면을 만들며 불필요한 `move`가 끼어들지 않는가
- 3초 내외의 실행에서 결과가 과밀하거나 지나치게 단조롭지 않은가
- 정확한 legacy JSON과 다르더라도 더 재미있고 설득력 있는 대안인가
