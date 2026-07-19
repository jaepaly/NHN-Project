# 5티어 판정 품질 스냅샷 (R2 P1-b)

> 생성: `npm run snapshot:quality` · 모델 gemini-flash-lite-latest · 자동 적합 **24/26** · 평균 latency **1227ms**
> (자동 "적합"은 러프한 휴리스틱 — 티어별 power 대략치. 최종 품질 판단은 사람이 표를 보고 한다.)

| 티어 | 입력 | disposition | 주문명 | effect | element | form | power | ms | 자동적합 |
|---|---|---|---|---|---|---|---|---|---|
| 걸작 | 태양의 파편을 뜯어낸 겁화 | cast | 태양의 파편을 뜯어낸 겁화 | damage | fire+light | nova | 95 | 1347 | ✅ |
| 걸작 | 심연에서 끌어올린 검은 해일 | cast | 심연의 검은 해일 | damage | dark+water | wave | 85 | 1240 | ✅ |
| 걸작 | 천 개의 별을 엮어 만든 빛의 창 | cast | 천 개의 별 빛의 창 | damage | light | bolt | 95 | 1344 | ✅ |
| 걸작 | 얼어붙은 시간을 부수는 서리 폭풍 | cast | 서리 폭풍 | damage | ice+wind | nova | 85 | 1317 | ✅ |
| 걸작 | 대지를 가르며 솟구치는 용암의 아가리 | cast | 용암의 아가리 | damage | fire+earth | nova | 85 | 1269 | ✅ |
| 평범 | 불덩이 | cast | 불덩이 | damage | fire | bolt | 40 | 1267 | ✅ |
| 평범 | 얼음 화살 | cast | 얼음 화살 | damage | ice | bolt | 40 | 1308 | ✅ |
| 평범 | 돌 던지기 | cast | 돌 던지기 | damage | earth | bolt | 30 | 1262 | ✅ |
| 평범 | 바람 칼날 | cast | 바람 칼날 | damage | wind | bolt | 40 | 1224 | ✅ |
| 평범 | 번개 | cast | 번개 | damage | lightning | bolt | 35 | 1258 | ✅ |
| 주제밖 | 배고프다 | cast | 허기진 영혼의 위로 | heal | light | buff | 35 | 1376 | ✅ |
| 주제밖 | 졸리다 | cast | 졸리다 | heal | light | buff | 25 | 1381 | ✅ |
| 주제밖 | 숙제하기 싫다 | cast | 현실도피의 안개 | buff | dark+wind | zone | 35 | 1371 | ✅ |
| 주제밖 | 나를 지켜줘 | cast | 나를 지켜줘 | shield | light | wall | 40 | 1311 | ✅ |
| 주제밖 | 무서워 | cast | 무서워 | shield | light | wall | 35 | 1255 | ✅ |
| 불발 | ㅁㄴㅇㄹ | fizzle |  |  |  |  |  | 1039 | ✅ |
| 불발 | asdf | fizzle |  |  |  |  |  | 1005 | ✅ |
| 불발 | qwerty | fizzle |  |  |  |  |  | 1006 | ✅ |
| 불발 | ㅋㅋㅋㅋ | fizzle |  |  |  |  |  | 1057 | ✅ |
| 불발 | 123456 | fizzle |  |  |  |  |  | 993 | ✅ |
| 금칙 | 씨발 | blocked |  |  |  |  |  | 1044 | ✅ |
| 평범 | 죽어버려 | cast | 죽어버려 | damage | dark | bolt | 35 | 1165 | ✅ |
| 다국어 | 라이트닝 스톰 | cast | 라이트닝 스톰 | damage | lightning | rain | 50 | 1186 | ⚠️ power 50(<60) |
| 다국어 | lightning storm | cast | lightning storm | damage | lightning | rain | 45 | 1263 | ⚠️ power 45(<60) |
| 다국어 | 숲의 분노 | cast | 숲의 분노 | damage | earth+wind | nova | 75 | 1357 | ✅ |
| 다국어 | forest fury | cast | forest fury | damage | earth+wind | nova | 65 | 1256 | ✅ |
