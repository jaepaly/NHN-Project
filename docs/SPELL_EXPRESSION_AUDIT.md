# 자유 영창 표현·전술 충돌 감사

> 생성: 2026년 7월 24일 오후 4:53:05 · `npm run audit:expression`
> Worker 직접 호출 48건, 시작 간격 4500ms, 표현별 N=2.
> HTTP 200 응답을 로컬 `validateJudgement`로 다시 검증했다. 브라우저 캐시와 MockJudge 폴백은 개입하지 않는다.

## 결론

**게이트: 보류** — 현재 DSL/판정의 표현 안정성 또는 전술 분리 문제를 먼저 다뤄야 한다.

| 지표 | 결과 | 기준 | 판정 |
|---|---:|---:|---|
| 유효 live Gemini | 48/48 (100%) | 100% | ✅ |
| 같은 의도 후보 signature 평균 | 93.8% | 관찰 | — |
| 전술별 후보 signature 일치 | 최저 75% | 각 ≥80% | ❌ |
| 같은 의도 전술 fingerprint 일치 | 77.1% | 관찰 | — |
| 다른 전술 후보 signature 분리 | 80% | ≥75% | ✅ |
| 다른 전술 전술 fingerprint 분리 | 80% | 관찰 | — |
| 화염구·화염창·화염검 분리 | 1/3 signature | 전부 분리 | ❌ |
| 동일 문구 후보 signature 반복 안정성 | 23/24 (95.8%) | ≥80% | ✅ |
| 동일 문구 전술 fingerprint 반복 안정성 | 17/24 (70.8%) | 관찰 | — |
| 단일 전술의 plan 오탐 | 0/48 | 0 | ✅ |
| 2.5초 초과 | 0/48 (0%) | 관찰 | — |
| 지연 | p50 1598ms · p90 1869ms · max 2301ms | 관찰 | — |

## 전술별 요약

| 전술 | 후보 signature 최빈값 | 후보 일치 | 전술 일치 | form 관측 | power 범위 | plan |
|---|---|---:|---:|---|---:|---:|
| 화염구(직선 투사) | `single:damage:fire:bolt` | 100% | 100% | bolt | 35~65 | 0/8 |
| 화염창(좁은 관통) | `single:damage:fire:bolt` | 100% | 100% | bolt | 40~75 | 0/8 |
| 화염검(근접 참격) | `single:damage:fire:bolt` | 87.5% | 87.5% | bolt, beam | 40~75 | 0/8 |
| 화염벽(공간 차단) | `single:shield:fire:wall` | 75% | 25% | wall | 35~65 | 0/8 |
| 연쇄 화염(다중 도약) | `single:damage:fire:chain` | 100% | 100% | chain | 35~75 | 0/8 |
| 화염비(상공 광역) | `single:damage:fire:rain` | 100% | 50% | rain | 40~85 | 0/8 |

## 최빈 signature 충돌

- 후보 계약 충돌: 화염구(직선 투사) ↔ 화염창(좁은 관통) / 화염구(직선 투사) ↔ 화염검(근접 참격) / 화염창(좁은 관통) ↔ 화염검(근접 참격)
- 상세 전술 충돌: 화염구(직선 투사) ↔ 화염창(좁은 관통) / 화염구(직선 투사) ↔ 화염검(근접 참격) / 화염창(좁은 관통) ↔ 화염검(근접 참격)

## 해석 기준

- **후보 signature**는 현재 #170-2 초안인 `effect:element_primary:form`이며 이름·power·size·speed는 제외한다.
- **전술 fingerprint**는 target·보조 원소·status·shape·summon behavior와 plan 실행 순서까지 포함한다.
- 같은 의도가 표현 방식에 따라 갈라지면 프롬프트 안정성 문제다.
- 서로 다른 의도가 같은 fingerprint로 합쳐지면 DSL/엔진 표현력 문제다.
- power·size·speed 차이는 이름 변주로 반복을 우회하게 만들 수 있어 pattern 식별자에는 바로 넣지 않고 별도 관찰한다.

## 전체 표본

| # | 전술 | 표현 | N | 입력 | 결과명 | candidate | tactical | size/speed/status | power | plan | ms | 출처/오류 |
|---:|---|---|---:|---|---|---|---|---|---:|---:|---:|---|
| 1 | 화염구(직선 투사) | 기술명 | 1 | 파이어볼 | 파이어볼 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/normal/burn | 40 | N | 1598 | gemini |
| 2 | 화염구(직선 투사) | 기술명 | 2 | 파이어볼 | 파이어볼 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/normal/burn | 35 | N | 2301 | gemini |
| 3 | 화염구(직선 투사) | 명령문 | 1 | 응축한 불덩이를 적에게 곧장 쏴라 | 응축 불덩이 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 65 | N | 1603 | gemini |
| 4 | 화염구(직선 투사) | 명령문 | 2 | 응축한 불덩이를 적에게 곧장 쏴라 | 응축된 불덩이 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 65 | N | 1719 | gemini |
| 5 | 화염구(직선 투사) | 서술문 | 1 | 손끝에 모은 불꽃을 구체로 빚어 적을 향해 날린다 | 화염탄 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/normal/burn | 65 | N | 1680 | gemini |
| 6 | 화염구(직선 투사) | 서술문 | 2 | 손끝에 모은 불꽃을 구체로 빚어 적을 향해 날린다 | 화염탄 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/normal/burn | 65 | N | 1254 | gemini |
| 7 | 화염구(직선 투사) | 영문 | 1 | Fireball, launch a ball of fire straight at the enemy | Fireball | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/normal/burn | 40 | N | 1866 | gemini |
| 8 | 화염구(직선 투사) | 영문 | 2 | Fireball, launch a ball of fire straight at the enemy | 파이어볼 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/normal/burn | 40 | N | 1667 | gemini |
| 9 | 화염창(좁은 관통) | 기술명 | 1 | 파이어 스피어 | 파이어 스피어 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/normal/burn | 40 | N | 1463 | gemini |
| 10 | 화염창(좁은 관통) | 기술명 | 2 | 파이어 스피어 | 파이어 스피어 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 45 | N | 1566 | gemini |
| 11 | 화염창(좁은 관통) | 명령문 | 1 | 불꽃을 날카로운 창으로 압축해 적을 꿰뚫어라 | 불꽃의 창 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 75 | N | 1670 | gemini |
| 12 | 화염창(좁은 관통) | 명령문 | 2 | 불꽃을 날카로운 창으로 압축해 적을 꿰뚫어라 | 화창의 일격 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 75 | N | 1687 | gemini |
| 13 | 화염창(좁은 관통) | 서술문 | 1 | 길게 뻗은 불의 창끝이 적을 관통한다 | 화염의 창 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 70 | N | 1555 | gemini |
| 14 | 화염창(좁은 관통) | 서술문 | 2 | 길게 뻗은 불의 창끝이 적을 관통한다 | 화창관통 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 75 | N | 1436 | gemini |
| 15 | 화염창(좁은 관통) | 영문 | 1 | Flame spear, pierce the enemy with a narrow lance of fire | 화염 창 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 65 | N | 1642 | gemini |
| 16 | 화염창(좁은 관통) | 영문 | 2 | Flame spear, pierce the enemy with a narrow lance of fire | 화염 창 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 65 | N | 1237 | gemini |
| 17 | 화염검(근접 참격) | 기술명 | 1 | 파이어 소드 | 파이어 소드 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 40 | N | 1638 | gemini |
| 18 | 화염검(근접 참격) | 기술명 | 2 | 파이어 소드 | 파이어 소드 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/normal/burn | 40 | N | 1427 | gemini |
| 19 | 화염검(근접 참격) | 명령문 | 1 | 불꽃으로 검을 만들어 눈앞의 적을 베어라 | 화염검 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 75 | N | 1524 | gemini |
| 20 | 화염검(근접 참격) | 명령문 | 2 | 불꽃으로 검을 만들어 눈앞의 적을 베어라 | 화염검 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 75 | N | 1314 | gemini |
| 21 | 화염검(근접 참격) | 서술문 | 1 | 손에 두른 불길이 칼날이 되어 가까운 적을 가른다 | 화염검기 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 75 | N | 1512 | gemini |
| 22 | 화염검(근접 참격) | 서술문 | 2 | 손에 두른 불길이 칼날이 되어 가까운 적을 가른다 | 화염의 검 | `single:damage:fire:beam` | `single:damage:enemy:fire:beam:burn:-:-` | medium/fast/burn | 75 | N | 1819 | gemini |
| 23 | 화염검(근접 참격) | 영문 | 1 | Flame sword, form a burning blade and slash the nearby enemy | 불꽃 검 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 65 | N | 1913 | gemini |
| 24 | 화염검(근접 참격) | 영문 | 2 | Flame sword, form a burning blade and slash the nearby enemy | 불타는 검 | `single:damage:fire:bolt` | `single:damage:enemy:fire:bolt:burn:-:-` | medium/fast/burn | 75 | N | 1320 | gemini |
| 25 | 화염벽(공간 차단) | 기술명 | 1 | 파이어 월 | 파이어 월 | `single:shield:fire:wall` | `single:shield:area:fire:wall:burn:arc:-` | medium/normal/burn | 35 | N | 2113 | gemini |
| 26 | 화염벽(공간 차단) | 기술명 | 2 | 파이어 월 | 파이어 월 | `single:shield:fire:wall` | `single:shield:area:fire:wall:burn:-:-` | medium/normal/burn | 35 | N | 1490 | gemini |
| 27 | 화염벽(공간 차단) | 명령문 | 1 | 적 앞에 불길의 벽을 세워 길을 막아라 | 화염의 장벽 | `single:control:fire:wall` | `single:control:enemy:fire:wall:burn:line:-` | medium/normal/burn | 45 | N | 1691 | gemini |
| 28 | 화염벽(공간 차단) | 명령문 | 2 | 적 앞에 불길의 벽을 세워 길을 막아라 | 화염의 벽 | `single:control:fire:wall` | `single:control:area:fire:wall:burn:line:-` | medium/normal/burn | 65 | N | 1794 | gemini |
| 29 | 화염벽(공간 차단) | 서술문 | 1 | 바닥에서 솟은 불의 장벽이 전장을 가로막는다 | 화염 장벽 | `single:shield:fire:wall` | `single:shield:area:fire:wall:-:-:-` | large/normal/- | 45 | N | 1585 | gemini |
| 30 | 화염벽(공간 차단) | 서술문 | 2 | 바닥에서 솟은 불의 장벽이 전장을 가로막는다 | 화염 장벽 | `single:shield:fire:wall` | `single:shield:area:fire:wall:-:line:-` | large/normal/- | 45 | N | 1506 | gemini |
| 31 | 화염벽(공간 차단) | 영문 | 1 | Firewall, raise a wall of flame across the enemy's path | 화염의 장벽 | `single:shield:fire:wall` | `single:shield:area:fire:wall:burn:line:-` | large/normal/burn | 65 | N | 1585 | gemini |
| 32 | 화염벽(공간 차단) | 영문 | 2 | Firewall, raise a wall of flame across the enemy's path | Firewall | `single:shield:fire:wall` | `single:shield:area:fire:wall:burn:line:-` | large/normal/burn | 45 | N | 1887 | gemini |
| 33 | 연쇄 화염(다중 도약) | 기술명 | 1 | 체인 플레임 | 체인 플레임 | `single:damage:fire:chain` | `single:damage:enemy:fire:chain:burn:-:-` | medium/fast/burn | 40 | N | 1669 | gemini |
| 34 | 연쇄 화염(다중 도약) | 기술명 | 2 | 체인 플레임 | 체인 플레임 | `single:damage:fire:chain` | `single:damage:enemy:fire:chain:burn:-:-` | medium/fast/burn | 35 | N | 1544 | gemini |
| 35 | 연쇄 화염(다중 도약) | 명령문 | 1 | 불꽃이 적들 사이를 연쇄적으로 튀어 옮겨 붙게 해라 | 불꽃 연쇄 | `single:damage:fire:chain` | `single:damage:enemy:fire:chain:burn:-:-` | medium/fast/burn | 65 | N | 1566 | gemini |
| 36 | 연쇄 화염(다중 도약) | 명령문 | 2 | 불꽃이 적들 사이를 연쇄적으로 튀어 옮겨 붙게 해라 | 불꽃 연쇄 | `single:damage:fire:chain` | `single:damage:enemy:fire:chain:burn:-:-` | medium/fast/burn | 65 | N | 1626 | gemini |
| 37 | 연쇄 화염(다중 도약) | 서술문 | 1 | 하나의 불씨가 무리 사이를 연달아 도약하며 태운다 | 연쇄 불씨 | `single:damage:fire:chain` | `single:damage:enemy:fire:chain:burn:-:-` | medium/fast/burn | 75 | N | 1869 | gemini |
| 38 | 연쇄 화염(다중 도약) | 서술문 | 2 | 하나의 불씨가 무리 사이를 연달아 도약하며 태운다 | 연쇄 불씨 | `single:damage:fire:chain` | `single:damage:enemy:fire:chain:burn:-:-` | medium/fast/burn | 75 | N | 1549 | gemini |
| 39 | 연쇄 화염(다중 도약) | 영문 | 1 | Chain flame, make fire leap from one enemy to the next | 체인 플레임 | `single:damage:fire:chain` | `single:damage:enemy:fire:chain:burn:-:-` | medium/fast/burn | 65 | N | 1495 | gemini |
| 40 | 연쇄 화염(다중 도약) | 영문 | 2 | Chain flame, make fire leap from one enemy to the next | 연쇄 화염 | `single:damage:fire:chain` | `single:damage:enemy:fire:chain:burn:-:-` | medium/fast/burn | 75 | N | 1441 | gemini |
| 41 | 화염비(상공 광역) | 기술명 | 1 | 파이어 레인 | 파이어 레인 | `single:damage:fire:rain` | `single:damage:area:fire:rain:burn:-:-` | large/normal/burn | 40 | N | 1842 | gemini |
| 42 | 화염비(상공 광역) | 기술명 | 2 | 파이어 레인 | 파이어 레인 | `single:damage:fire:rain` | `single:damage:area:fire:rain:burn:-:-` | large/normal/burn | 40 | N | 1333 | gemini |
| 43 | 화염비(상공 광역) | 명령문 | 1 | 하늘에서 수많은 불덩이를 적들 위로 쏟아부어라 | 메테오 레인 | `single:damage:fire:rain` | `single:damage:enemy:fire:rain:burn:-:-` | huge/fast/burn | 85 | N | 1741 | gemini |
| 44 | 화염비(상공 광역) | 명령문 | 2 | 하늘에서 수많은 불덩이를 적들 위로 쏟아부어라 | 메테오 레인 | `single:damage:fire:rain` | `single:damage:area:fire:rain:burn:-:-` | huge/fast/burn | 85 | N | 1528 | gemini |
| 45 | 화염비(상공 광역) | 서술문 | 1 | 타오르는 운석들이 비처럼 전장에 떨어진다 | 운석우 | `single:damage:fire:rain` | `single:damage:area:fire+earth:rain:burn:-:-` | huge/normal/burn | 85 | N | 1625 | gemini |
| 46 | 화염비(상공 광역) | 서술문 | 2 | 타오르는 운석들이 비처럼 전장에 떨어진다 | 운석 비 | `single:damage:fire:rain` | `single:damage:area:fire+earth:rain:burn+knockback:-:-` | huge/normal/burn+knockback | 75 | N | 1717 | gemini |
| 47 | 화염비(상공 광역) | 영문 | 1 | Fire rain, call burning meteors down over the battlefield | 파이어 레인 | `single:damage:fire:rain` | `single:damage:area:fire:rain:burn:-:-` | huge/normal/burn | 75 | N | 1520 | gemini |
| 48 | 화염비(상공 광역) | 영문 | 2 | Fire rain, call burning meteors down over the battlefield | 파이어 레인 | `single:damage:fire:rain` | `single:damage:area:fire+earth:rain:burn:-:-` | huge/normal/burn | 85 | N | 1412 | gemini |
