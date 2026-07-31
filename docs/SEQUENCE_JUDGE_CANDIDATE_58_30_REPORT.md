# 영창 Judge 의도 기준선 자동 채점

> 기준 응답: `docs/SEQUENCE_JUDGE_CANDIDATE_58_30_RESULTS.json`  
> 기대값: `docs/SEQUENCE_JUDGE_EXPECTATIONS.json`  
> Worker: https://incant-judge-proxy.incant-judge-proxy.workers.dev  
> 응답 수집: 2026-07-30T12:07:18.914Z

## 요약

- 자동 점수 평균: **95/100**
- 자동 항목 만점: **24/30**
- 권장 모드 일치: **22/30**
- 자동 실패 항목: **13개**
- 수동 판정 대기 항목: **49개**

자동 점수는 스키마에서 관찰 가능한 anchor·구조·관계만 평가한다. 시각적 만족도, 인과성, 전환의 자연스러움, 장식용 이동 여부는 점수에 포함하지 않고 수동 판정으로 남긴다.

## 해석

- **95점은 전체 품질 점수가 아니다.** 원소·형태·필수 구조처럼 스키마에서 관찰 가능한 표면 계약의 보존율이다.
- 자동 항목만으로도 6종에서 실패가 발생했지만, 현행 출력의 핵심 문제인 비슷한 `move → form` 반복과 장면의 재미는 자동 점수에 거의 반영되지 않는다.
- 따라서 이 수치는 프롬프트가 최소 계약을 훼손하는지 감시하는 하한선으로 사용하고, 최종 채택은 아래 수동 시각 평가를 함께 통과해야 한다.

## 사례별 결과

| # | 입력 | 기대/실제 | 자동 점수 | 실패 | 수동 |
|---:|---|---|---:|---:|---:|
| 1 | 적막을 가르는 섬광 | `single_preferred` / `sequence` | 100 | 0 | 3 |
| 2 | 도망치는 별 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 3 | 화산맥의 기상 | `sequence_preferred` / `sequence` | 65 | 3 | 2 |
| 4 | 서리 거울 | `single_preferred` / `sequence` | 100 | 0 | 2 |
| 5 | 사슬을 끊는 파도 | `either` / `sequence` | 100 | 0 | 1 |
| 6 | 천둥새의 비행 | `sequence_preferred` / `sequence` | 75 | 2 | 2 |
| 7 | 태풍의 회랑 | `either` / `sequence` | 100 | 0 | 3 |
| 8 | 그림자 바느질 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 9 | 백야의 성역 | `single_preferred` / `sequence` | 100 | 0 | 3 |
| 10 | 모래시계의 수호 | `either` / `sequence` | 100 | 0 | 1 |
| 11 | 찰나의 전이 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 12 | 사방의 포화 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 13 | 유성우를 거슬러 | `sequence_required` / `sequence` | 100 | 0 | 2 |
| 14 | 얼어붙은 추격전 | `sequence_preferred` / `sequence` | 65 | 3 | 1 |
| 15 | 용이 잠든 산 | `either` / `sequence` | 100 | 0 | 1 |
| 16 | 심장이 두 번 뛰는 동안 | `sequence_required` / `sequence` | 100 | 0 | 1 |
| 17 | 별자리를 꿰매는 바늘 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 18 | 무지개를 한 자루 창으로 | `single_preferred` / `sequence` | 100 | 0 | 3 |
| 19 | 불사조의 낙화 | `sequence_preferred` / `sequence` | 63 | 3 | 1 |
| 20 | 뇌광의 사냥 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 21 | 겨울 정원의 폐막 | `sequence_preferred` / `sequence` | 88 | 1 | 1 |
| 22 | 일식의 왈츠 | `sequence_preferred` / `sequence` | 100 | 0 | 2 |
| 23 | 최후의 성채 | `single_preferred` / `sequence` | 100 | 0 | 3 |
| 24 | 해일의 역류 | `single_preferred` / `sequence` | 100 | 0 | 2 |
| 25 | 폭풍의 눈 | `single_preferred` / `sequence` | 100 | 0 | 3 |
| 26 | 심연의 군세 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 27 | 새벽의 순례 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 28 | 허공답보 | `sequence_preferred` / `sequence` | 100 | 0 | 1 |
| 29 | 유리별의 사격 | `single_preferred` / `sequence` | 100 | 0 | 2 |
| 30 | 팔원소 대합창 | `sequence_required` / `sequence` | 97 | 1 | 1 |

## 자동 실패 상세

### 3. 화산맥의 기상

- `relation:order`: order 미검출
- `relation:finale`: finale 미검출
- `sequence-range`: 시퀀스 1, 허용 2~4

### 6. 천둥새의 비행

- `forbidden:movement`: 금지 movement 검출
- `sequence-range`: 시퀀스 1, 허용 2~4

### 14. 얼어붙은 추격전

- `element:ice`: 필수 원소 ice 누락
- `relation:order`: order 미검출
- `sequence-range`: 시퀀스 1, 허용 2~4

### 19. 불사조의 낙화

- `relation:order`: order 미검출
- `relation:finale`: finale 미검출
- `sequence-range`: 시퀀스 1, 허용 2~4

### 21. 겨울 정원의 폐막

- `element:ice`: 필수 원소 ice 누락

### 30. 팔원소 대합창

- `duration-range`: durationMs 1600, 선호 2300~3000

## 수동 평가 시 확인할 것

- 입력에서 기대한 사건과 장면 전개가 실제 출력에서 읽히는가
- 단계마다 역할이 구분되고 앞뒤 사건의 인과가 자연스러운가
- 병렬 행동이 하나의 장면을 만들며 불필요한 `move`가 끼어들지 않는가
- 3초 내외의 실행에서 결과가 과밀하거나 지나치게 단조롭지 않은가
- 정확한 legacy JSON과 다르더라도 더 재미있고 설득력 있는 대안인가
