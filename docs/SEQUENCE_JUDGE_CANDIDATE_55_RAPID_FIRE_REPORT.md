# 영창 Judge 의도 기준선 자동 채점

> 기준 응답: `docs/SEQUENCE_JUDGE_CANDIDATE_55_RAPID_FIRE.json`  
> 기대값: `docs/SEQUENCE_JUDGE_CANDIDATE_43_RAPID_FIRE_EXPECTATIONS.json`  
> Worker: https://incant-judge-proxy.incant-judge-proxy.workers.dev  
> 응답 수집: 2026-07-30T11:30:16.290Z

## 요약

- 자동 점수 평균: **99/100**
- 자동 항목 만점: **10/12**
- 권장 모드 일치: **12/12**
- 자동 실패 항목: **2개**
- 수동 판정 대기 항목: **14개**

자동 점수는 스키마에서 관찰 가능한 anchor·구조·관계만 평가한다. 시각적 만족도, 인과성, 전환의 자연스러움, 장식용 이동 여부는 점수에 포함하지 않고 수동 판정으로 남긴다.

## 해석

- **99점은 전체 품질 점수가 아니다.** 원소·형태·필수 구조처럼 스키마에서 관찰 가능한 표면 계약의 보존율이다.
- 자동 항목만으로도 2종에서 실패가 발생했지만, 현행 출력의 핵심 문제인 비슷한 `move → form` 반복과 장면의 재미는 자동 점수에 거의 반영되지 않는다.
- 따라서 이 수치는 프롬프트가 최소 계약을 훼손하는지 감시하는 하한선으로 사용하고, 최종 채택은 아래 수동 시각 평가를 함께 통과해야 한다.

## 사례별 결과

| # | 입력 | 기대/실제 | 자동 점수 | 실패 | 수동 |
|---:|---|---|---:|---:|---:|
| 1 | 불씨 화살 연사 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 2 | 얼음 송곳을 세 발 연속으로 쏜다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 3 | 천둥 창을 잇달아 꽂는다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 4 | 작은 물방울을 두 번 쏘고 마지막에 파도를 터뜨린다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 5 | 어둠의 칼날을 속사한다 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 6 | 대지 충격파를 두 차례 연발한다 | `sequence_required` / `sequence` | 96 | 1 | 1 |
| 7 | 불꽃 창을 한꺼번에 쏟아붓는다 | `either` / `single` | 100 | 0 | 1 |
| 8 | 서리 포대 일제사격 | `either` / `single` | 100 | 0 | 1 |
| 9 | 태양 광선을 계속 유지한다 | `single_preferred` / `single` | 100 | 0 | 2 |
| 10 | 독안개 장판을 오래 유지한다 | `single_preferred` / `single` | 88 | 1 | 2 |
| 11 | 유성 소나기가 전장을 덮는다 | `single_preferred` / `single` | 100 | 0 | 1 |
| 12 | 단 한 발의 바람 화살 | `single_preferred` / `single` | 100 | 0 | 1 |

## 자동 실패 상세

### 6. 대지 충격파를 두 차례 연발한다

- `duration-range`: durationMs 1800, 선호 600~1600

### 10. 독안개 장판을 오래 유지한다

- `element:earth`: 필수 원소 earth 누락

## 수동 평가 시 확인할 것

- 입력에서 기대한 사건과 장면 전개가 실제 출력에서 읽히는가
- 단계마다 역할이 구분되고 앞뒤 사건의 인과가 자연스러운가
- 병렬 행동이 하나의 장면을 만들며 불필요한 `move`가 끼어들지 않는가
- 3초 내외의 실행에서 결과가 과밀하거나 지나치게 단조롭지 않은가
- 정확한 legacy JSON과 다르더라도 더 재미있고 설득력 있는 대안인가
