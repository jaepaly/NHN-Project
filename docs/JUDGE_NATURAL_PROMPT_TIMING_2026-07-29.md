# fixture 유사 자연어 실플레이 판정 지연 진단 — 2026-07-29

## 목적

공개 fixture 문자열과 `#seq` 명령을 사용하지 않은 신규 자연어 영창을 로컬 게임의 실제 입력창으로 호출하고, `logs/play.jsonl`의 관측 필드로 Gemini 판정 지연·fallback·single/sequence 분류·실제 시퀀스 실행 여부를 확인했다.

이번 진단은 프롬프트, 클라이언트 timeout, Worker 설정을 변경하지 않은 기준선 측정이다.

## 측정 조건

- 프롬프트 버전: `meaning-v2.15-abstract-seq`
- 판정기: `GeminiJudge(gemini-via-proxy)`
- sequence 기능: 활성
- Mock 강제: 비활성
- 실행 경로: 로컬 게임 영창 입력창 → 배포된 Worker → Gemini
- exact fixture 및 기존 로그 중복 검사: 7문장 모두 중복 없음
- 판정 시각: 2026-07-29 20:18~20:21 KST

## 결과

| 자연어 영창 | 출처 | 판정 시간 | 판정 | 단계/행동 | 실제 sequence 실행 | fixture |
|---|---:|---:|---:|---:|---:|---:|
| 뒤로 세 걸음 물러나며 얼음 창을 연달아 쏜다 | Gemini | 1,533ms | sequence | 2/2 | 예 | 아니오 |
| 서리 장막과 번개 화살을 동시에 펼친다 | Gemini | 1,833ms | sequence | 1/2 | 예 | 아니오 |
| 두 차례 울리는 황혼의 종 | Gemini | 1,604ms | sequence | 2/2 | 예 | 아니오 |
| 바람을 타고 솟아올라 빛의 칼날로 내려친다 | Gemini | 1,346ms | sequence | 2/2 | 예 | 아니오 |
| 검은 파도가 갈라진 자리에서 별빛이 피어난다 | Gemini | 1,588ms | sequence | 2/2 | 예 | 아니오 |
| 한 줄기 푸른 섬광 | Gemini | 1,072ms | single | 0/0 | 해당 없음 | 아니오 |
| 커다란 바위 방패 | Gemini | 1,134ms | single | 0/0 | 해당 없음 | 아니오 |

제안한 여덟 문장 중 `불꽃 고리를 펼친 다음 중심에서 폭발시킨다`는 판정 이벤트가 없어 집계에서 제외했다.

## 집계

- Gemini 정상 판정: **7/7 (100%)**
- fallback: **0/7 (0%)**
- 기대 분류 일치: **7/7**
  - sequence 경계군: **5/5**
  - single 대조군: **2/2**
- 실제 sequence 실행: **5/5**
- 전체 지연: 최소 **1,072ms**, 중앙값 **1,533ms**, 평균 **1,444ms**, p90/최대 **1,833ms**
- sequence 평균: **1,581ms**
- single 평균: **1,103ms**

## 판단

이번 신규 자연어 표본에서는 현재 상한(single 2,500ms / sequence 3,200ms)에 걸린 요청이 없었다. 가장 느린 sequence도 1,833ms로 상한보다 1,367ms 빨랐고, single 최대도 1,134ms로 상한보다 1,366ms 빨랐다.

따라서 이 표본만으로 timeout을 즉시 늘릴 근거는 없다. 오히려 v2.15가 fixture 외 자연어에서도 sequence 5/5, single 2/2를 구분했고 fallback 없이 실제 실행까지 이어진다는 긍정적 기준선이다. 다만 7회는 tail latency를 결론내기에는 작으므로, 기존에 보고된 timeout 세션과 합쳐 장시간 플레이에서 p95·p99 및 시간대별 편차를 추가 관찰해야 한다.
