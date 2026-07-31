# 영창 Judge 의도 기준선 자동 채점

> 기준 응답: `docs/SEQUENCE_JUDGE_CANDIDATE_45_RESULTS.json`  
> 기대값: `docs/SEQUENCE_JUDGE_CANDIDATE_45_EXPECTATIONS.json`  
> Worker: https://incant-judge-proxy.incant-judge-proxy.workers.dev  
> 응답 수집: 2026-07-30T09:30:45.587Z

## 요약

- 자동 점수 평균: **98/100**
- 자동 항목 만점: **14/18**
- 권장 모드 일치: **16/18**
- 자동 실패 항목: **4개**
- 수동 판정 대기 항목: **21개**

자동 점수는 스키마에서 관찰 가능한 anchor·구조·관계만 평가한다. 시각적 만족도, 인과성, 전환의 자연스러움, 장식용 이동 여부는 점수에 포함하지 않고 수동 판정으로 남긴다.

## 해석

- **98점은 전체 품질 점수가 아니다.** 원소·형태·필수 구조처럼 스키마에서 관찰 가능한 표면 계약의 보존율이다.
- 자동 항목만으로도 4종에서 실패가 발생했지만, 현행 출력의 핵심 문제인 비슷한 `move → form` 반복과 장면의 재미는 자동 점수에 거의 반영되지 않는다.
- 따라서 이 수치는 프롬프트가 최소 계약을 훼손하는지 감시하는 하한선으로 사용하고, 최종 채택은 아래 수동 시각 평가를 함께 통과해야 한다.

## 사례별 결과

| # | 입력 | 기대/실제 | 자동 점수 | 실패 | 수동 |
|---:|---|---|---:|---:|---:|
| 1 | 왕좌를 잃은 번개 | `either` / `single` | 100 | 0 | 1 |
| 2 | 붉은 달이 이빨을 드러낸다 | `either` / `single` | 100 | 0 | 1 |
| 3 | 폭풍이 왕관을 부순다 | `either` / `single` | 100 | 0 | 1 |
| 4 | 침묵이 칼날이 되어 떨어진다 | `either` / `single` | 100 | 0 | 1 |
| 5 | 찰나의 전이 | `sequence_required` / `sequence` | 90 | 1 | 1 |
| 6 | 빛보다 먼저 도착한다 | `sequence_required` / `sequence` | 90 | 1 | 1 |
| 7 | 시간을 베어 한 걸음 앞선다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 8 | 밤을 가르고 한 걸음 앞선다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 9 | 다시 일어설 빛 | `single_preferred` / `single` | 100 | 0 | 1 |
| 10 | 빛의 틈으로 몸을 피한다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 11 | 그들의 시간만 멈춘다 | `single_preferred` / `single` | 100 | 0 | 1 |
| 12 | 죽은 숲이 발목을 붙든다 | `single_preferred` / `single` | 100 | 0 | 1 |
| 13 | 불사조의 낙화 | `sequence_preferred` / `single` | 83 | 1 | 2 |
| 14 | 천둥새의 비행 | `sequence_preferred` / `single` | 100 | 0 | 2 |
| 15 | 재가 춤추고 불꽃이 답한다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 16 | 일식의 왈츠 | `sequence_required` / `sequence` | 94 | 1 | 2 |
| 17 | 끝나지 않는 겨울 | `single_preferred` / `single` | 100 | 0 | 1 |
| 18 | 번개 사슬 | `single_preferred` / `single` | 100 | 0 | 1 |

## 자동 실패 상세

### 5. 찰나의 전이

- `allowed-effect`: 허용 효과 damage/control 중 실제 buff

### 6. 빛보다 먼저 도착한다

- `allowed-effect`: 허용 효과 damage/control 중 실제 buff

### 13. 불사조의 낙화

- `element:wind`: 필수 원소 wind 누락

### 16. 일식의 왈츠

- `forbidden:delay`: 금지 delay 검출

## 수동 평가 시 확인할 것

- 입력에서 기대한 사건과 장면 전개가 실제 출력에서 읽히는가
- 단계마다 역할이 구분되고 앞뒤 사건의 인과가 자연스러운가
- 병렬 행동이 하나의 장면을 만들며 불필요한 `move`가 끼어들지 않는가
- 3초 내외의 실행에서 결과가 과밀하거나 지나치게 단조롭지 않은가
- 정확한 legacy JSON과 다르더라도 더 재미있고 설득력 있는 대안인가
