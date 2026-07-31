# 영창 Judge 의도 기준선 자동 채점

> 기준 응답: `docs/SEQUENCE_JUDGE_CANDIDATE_55_GENERALIZATION_RESULTS.json`  
> 기대값: `docs/SEQUENCE_JUDGE_CANDIDATE_55_GENERALIZATION_EXPECTATIONS.json`  
> Worker: https://incant-judge-proxy.incant-judge-proxy.workers.dev  
> 응답 수집: 2026-07-30T11:40:27.152Z

## 요약

- 자동 점수 평균: **98/100**
- 자동 항목 만점: **14/16**
- 권장 모드 일치: **14/16**
- 자동 실패 항목: **3개**
- 수동 판정 대기 항목: **18개**

자동 점수는 스키마에서 관찰 가능한 anchor·구조·관계만 평가한다. 시각적 만족도, 인과성, 전환의 자연스러움, 장식용 이동 여부는 점수에 포함하지 않고 수동 판정으로 남긴다.

## 해석

- **98점은 전체 품질 점수가 아니다.** 원소·형태·필수 구조처럼 스키마에서 관찰 가능한 표면 계약의 보존율이다.
- 자동 항목만으로도 2종에서 실패가 발생했지만, 현행 출력의 핵심 문제인 비슷한 `move → form` 반복과 장면의 재미는 자동 점수에 거의 반영되지 않는다.
- 따라서 이 수치는 프롬프트가 최소 계약을 훼손하는지 감시하는 하한선으로 사용하고, 최종 채택은 아래 수동 시각 평가를 함께 통과해야 한다.

## 사례별 결과

| # | 입력 | 기대/실제 | 자동 점수 | 실패 | 수동 |
|---:|---|---|---:|---:|---:|
| 1 | 황혼이 갈라진다 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 2 | 천공의 장례 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 3 | 심연의 개화 | `sequence_preferred` / `single` | 100 | 0 | 2 |
| 4 | 폭풍의 즉위 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 5 | 우주의 심장박동 | `sequence_required` / `sequence` | 80 | 1 | 1 |
| 6 | 별을 삼킨 파도 | `either` / `single` | 100 | 0 | 1 |
| 7 | 겨울이 폭발한다 | `either` / `single` | 100 | 0 | 1 |
| 8 | 불멸의 행진 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 9 | 서리의 활공 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 10 | 달의 선회 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 11 | 번개의 순례 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 12 | 바람 없는 비행 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 13 | 별의 깃털 | `single_preferred` / `single` | 100 | 0 | 1 |
| 14 | 불꽃을 실은 화살이 날아간다 | `single_preferred` / `single` | 100 | 0 | 1 |
| 15 | 해일의 행진 | `single_preferred` / `sequence` | 82 | 2 | 2 |
| 16 | 새벽의 방패 | `single_preferred` / `single` | 100 | 0 | 1 |

## 자동 실패 상세

### 5. 우주의 심장박동

- `relation:repetition`: repetition 미검출

### 15. 해일의 행진

- `forbidden:movement`: 금지 movement 검출
- `maximum-move-count`: move 1/0 이하

## 수동 평가 시 확인할 것

- 입력에서 기대한 사건과 장면 전개가 실제 출력에서 읽히는가
- 단계마다 역할이 구분되고 앞뒤 사건의 인과가 자연스러운가
- 병렬 행동이 하나의 장면을 만들며 불필요한 `move`가 끼어들지 않는가
- 3초 내외의 실행에서 결과가 과밀하거나 지나치게 단조롭지 않은가
- 정확한 legacy JSON과 다르더라도 더 재미있고 설득력 있는 대안인가
