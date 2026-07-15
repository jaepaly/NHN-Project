# 5티어 판정 품질 스냅샷 (R2 P1-b)

> 생성: `npm run snapshot:quality` · 모델 gemini-flash-lite-latest · 자동 적합 **23/26** · 평균 latency **1462ms**
> (자동 "적합"은 러프한 휴리스틱 — 티어별 power 대략치. 최종 품질 판단은 사람이 표를 보고 한다.)

| 티어 | 입력 | disposition | 주문명 | effect | element | form | power | ms | 자동적합 |
|---|---|---|---|---|---|---|---|---|---|
| 걸작 | 태양의 파편을 뜯어낸 겁화 | cast | 태양의 파편을 뜯어낸 겁화 | damage | fire+light | nova | 95 | 1301 | ✅ |
| 걸작 | 심연에서 끌어올린 검은 해일 | cast | 심연의 검은 해일 | damage | dark+water | wave | 85 | 1329 | ✅ |
| 걸작 | 천 개의 별을 엮어 만든 빛의 창 | cast | 천 개의 별의 창 | damage | light+dark | bolt | 95 | 1415 | ✅ |
| 걸작 | 얼어붙은 시간을 부수는 서리 폭풍 | cast | 서리 폭풍 | damage | ice+wind | nova | 85 | 1342 | ✅ |
| 걸작 | 대지를 가르며 솟구치는 용암의 아가리 | cast | 용암의 아가리 | damage | fire+earth | nova | 95 | 1475 | ✅ |
| 평범 | 불덩이 | cast | 불덩이 | damage | fire | bolt | 45 | 1145 | ✅ |
| 평범 | 얼음 화살 | cast | 얼음 화살 | damage | ice | bolt | 45 | 1267 | ✅ |
| 평범 | 돌 던지기 | cast | 돌 던지기 | damage | earth | bolt | 35 | 1273 | ✅ |
| 평범 | 바람 칼날 | cast | 바람 칼날 | damage | wind | bolt | 45 | 1253 | ✅ |
| 평범 | 번개 | cast | 번개 | damage | lightning | bolt | 40 | 1317 | ✅ |
| 주제밖 | 배고프다 | cast | 허기 달래기 | heal | light | buff | 35 | 1361 | ✅ |
| 주제밖 | 졸리다 | cast | 숙면의 가호 | heal | light | buff | 35 | 1255 | ✅ |
| 주제밖 | 숙제하기 싫다 | cast | 나태의 안식 | buff | dark+earth | buff | 35 | 2861 | ✅ |
| 주제밖 | 나를 지켜줘 | cast | 나를 지켜줘 | shield | light | wall | 65 | 1520 | ⚠️ power 65(>45) |
| 주제밖 | 무서워 | cast | 공포의 방어막 | shield | light+dark | wall | 40 | 1274 | ✅ |
| 불발 | ㅁㄴㅇㄹ | fizzle |  |  |  |  |  | 1042 | ✅ |
| 불발 | asdf | fizzle |  |  |  |  |  | 1031 | ✅ |
| 불발 | qwerty | fizzle |  |  |  |  |  | 4744 | ✅ |
| 불발 | ㅋㅋㅋㅋ | fizzle |  |  |  |  |  | 1045 | ✅ |
| 불발 | 123456 | fizzle |  |  |  |  |  | 943 | ✅ |
| 금칙 | 씨발 | blocked |  |  |  |  |  | 1034 | ✅ |
| 금칙 | 죽어버려 | cast | 죽어버려 | damage | dark | bolt | 65 | 1442 | ❌ cast |
| 다국어 | 라이트닝 스톰 | cast | 라이트닝 스톰 | damage | lightning | rain | 50 | 1317 | ⚠️ power 50(<60) |
| 다국어 | lightning storm | cast | lightning storm | damage | lightning | rain | 85 | 1368 | ✅ |
| 다국어 | 숲의 분노 | cast | 숲의 분노 | damage | earth+wind | nova | 85 | 1299 | ✅ |
| 다국어 | forest fury | cast | forest fury | damage | earth+wind | nova | 85 | 1355 | ✅ |
