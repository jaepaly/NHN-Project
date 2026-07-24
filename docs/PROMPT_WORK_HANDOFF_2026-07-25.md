# R2 프롬프트·판정 작업 인수인계 — 2026-07-25

이 문서는 다른 AI나 팀원이 지금까지의 시행착오를 반복하지 않고 R2 판정 작업을 이어받기 위한 단일 진입점이다. 과거 기록보다 아래의 **현재 운영 기준과 중단선**을 우선한다.

## 1. 한 줄 결론

복합 영창의 의미 정확도는 현재 `v2.12`에서 충분히 높지만, 2.5초 안에 큰 `spell_plan` JSON을 생성하는 것이 병목이다. 프롬프트 예시·보정 계층을 더 붙이는 방식은 이미 수렴하지 않았으므로 **production은 v2.12를 유지하고, 구조 변경은 #180 팀 결정 전 재개하지 않는다.**

## 2. 현재 안전 기준

| 항목 | 현재 기준 |
|---|---|
| Gemini 모델 | `gemini-3.5-flash-lite` 명시 핀 (`-latest` 금지) |
| production Worker | `5d748432-b4e5-425c-b27d-70d404410d80` — 100% |
| 판정 계약 | `schema_version: 2`, 단일 `spell` 또는 복합 `spell_plan` |
| 로컬 프롬프트/캐시 | `meaning-v2.12-seq-directional-r1` (`r1`은 실험 캐시 격리 표식) |
| 클라이언트 timeout | 2,500ms |
| Worker 보호막 | IP·Worker 인스턴스별 15 RPM |
| fallback | 서비스 중단을 막는 최저선일 뿐, Gemini 품질 대신 발전시킬 대상이 아님 |

production 상태 확인:

```powershell
cd proxy
npx wrangler deployments status
```

`semantic-ir-spike` Preview Alias는 실험 당시 생성됐지만 production 트래픽을 받지 않는다. 실험 라우트와 코드는 로컬에서 제거했다.

## 3. 사용자가 중요하게 본 목표

1. 단순 기술명형과 설명형 영창을 모두 이해해야 한다.
   - 예: `파이어 스피어`
   - 예: `불길을 창끝처럼 모아 적을 꿰뚫어라`
2. 이동·대기·벽·공격·소환을 섞은 복합 영창도 순서와 동시성을 보존해야 한다.
3. fallback을 정교하게 만드는 대신 실제 Gemini 성공률과 처리 시간을 개선해야 한다.
4. 공식 합격선은 2.5초다. 총괄 승인 없이 3.2초 등으로 늘려 실패를 숨기지 않는다.
5. 특정 화염구·화염창 예시에 과적합하지 말고, 결과를 보기 전에 corpus와 합격선을 고정한다.
6. 막히면 새 로그·정규화·repair 계층을 연쇄적으로 만들지 말고 중단해 팀에 공유한다.
7. 원격 실플레이 반복은 사용량이 크므로, 로컬 회귀는 AI가 하고 실제 영창은 사용자에게 고정 문장 목록을 전달해 검증하는 방식이 효율적이다.

## 4. 오늘 확인한 성공

### 4.1 Gemini plan과 게임 로그 정합화

- 로그에 `source`, `judgeLatencyMs`, `fallbackReason`, `planTrace`, 세션 구분을 추가했다.
- cache hit에서 `spell_plan`이 사라지는 계약 버그를 발견했다.
- 원인은 캐시가 정규화된 `plan`을 저장하지만 판정 검증은 원격 필드 `spell_plan`만 읽는 불일치였다.
- 최초 Gemini plan과 재시전 cache plan이 같은 순서를 보존하도록 호환 복구 및 회귀를 추가했다.

### 4.2 기존 엔진 방향 이동 연결

- 엔진이 이미 지원하던 `custom-vector`를 프롬프트 계약에 노출했다.
- 왼쪽 `-90°`, 오른쪽 `90°`, 비스듬한 왼쪽 `-45°`, 비스듬한 오른쪽 `45°`를 사용한다.
- 이동 엔진을 새로 만든 것이 아니라 기존 소비 경로를 연결한 변경이다.

### 4.3 v2.12 직접 측정

복합 2문장 × 3회, 총 6회:

- 의미 plan: 6/6
- 왼쪽 방향: 3/3
- 지연: 1.861~2.389초
- 2.5초 초과: 0/6

사용자 실플레이에서도 실제 Gemini가 다음 순서를 반환했다.

- 2,030ms: 후퇴 → 화염구
- 2,458ms: 얼음벽 → 번개 사슬

희귀 동시 행동·3단계 입력에서는 2,514ms·2,506ms에 timeout fallback도 관찰됐다. 따라서 좁은 6회 통과를 전체 프롬프트 완료로 확대 해석하면 안 된다.

## 5. 실패한 접근과 폐기 이유

### 5.1 v2.14 wall/shield 의미 보강

문제:

- 전장 장애물인 화염벽·얼음 장벽이 `shield/self`로 판정돼 플레이어 보호막으로 실행됐다.

시도:

- 단어 목록이 아니라 공간적 역할로 분리했다.
  - 전장 공간을 막음: `wall` + `damage|control` + `enemy|area`
  - 장애물 없이 몸을 두름: `shield/self`

결과:

- 전장 벽 6/6
- 자기 보호 4/4
- 비벽 대조 2/2
- 유효 JSON 12/12
- 지연 1.285~3.146초, 2.5초 초과 1/12

의미는 통과했지만 latency gate 실패로 폐기하고 v2.12로 롤백했다. 중간에 벽 문제와 무관한 plan power 예시를 `0→75`로 바꾼 과잉 변경도 있었으며 즉시 원복했다.

### 5.2 compact positional array

목적:

- 반복되는 `SpellSpec` 필드를 줄여 출력 토큰과 지연을 줄임.

결과:

- verbose v2.12: 유효·의미 6/6, 2.205~2.554초
- compact: median 1.792초, verbose 대비 23.6% 단축
- compact 유효 plan 0/6
  - JSON parsing 502 세 건
  - `behaviors` 중첩 계약 위반 세 건

속도 개선은 있었지만 실행 가능한 plan이 없어 NO-GO로 폐기했다. 사후 예시 추가는 하지 않았다.

### 5.3 #180 semantic IR

목적:

- Gemini는 기존 의미 축만 고른다.
- 로컬 순수 compiler가 반복 기본값·예산을 기존 `SpellPlan`으로 조립한다.
- 새 mechanic/evidence/repair 계층은 만들지 않는다.

로컬 결과:

- 이동→벽→공격
- 병렬 다원소
- 이동→대기→공격
- 기존 wall shape
- 기존 summon behavior
- invalid enum과 빈 구조 거부

위 경계는 기존 validator 재사용으로 통과했다.

실 Gemini Structured Output 조사:

| 스키마 | 결과 |
|---|---|
| root `{name}` | 200 |
| `plan → steps → actions` + wait-only | 200 |
| cast `op,name` | 200 |
| cast `op,name,effect,target` | 200 |
| 위 구조에 `element` 추가 | HTTP 400 |
| full cast / enum 완화 cast | HTTP 400 |
| `op`만 강제하고 `additionalProperties:true` | 200, 그러나 실제 출력도 `op`만 남음 |
| 의미 필드를 named sub-object로 묶은 grouped schema | HTTP 400 |

정식 JSON Schema를 제거하고 현행 v2.12처럼 prompt-only JSON으로 한 문장만 시험:

- 입력: `왼쪽으로 피한 뒤 작은 화염구를 발사해`
- HTTP 200
- 2,414ms
- 의미는 왼쪽 회피 → 작은 fire/bolt로 맞음
- 출력 계약은 실패
  - 루트 object 대신 array
  - move는 평면 필드
  - cast는 nested payload
  - 한 응답 안에서 구조가 혼합됨

결론:

- 로컬 IR compiler 경계: PASS
- formal structured output: NO-GO
- prompt-only 의미 1건: PASS
- prompt-only 계약·지연: NO-GO
- 고정 6문장 비교: 선행 gate 실패로 실행하지 않음

이 결과는 #170과 다르다. #170은 `delivery/impact/duration/evidence` 같은 새 의미 축과 보정을 늘리다가 held-out 일반화가 무너졌다. #180은 기존 의미 축을 유지했지만 현재 모델/API가 축약 계약을 안정적으로 직렬화하지 못했다. 다만 이를 예시·repair·normalizer로 고치기 시작하면 #170과 같은 `A→B→C` 계층 증식이 되므로 그 전에 중단했다.

상세 팀 공유:

- [#180 1차 HOLD](https://github.com/jaepaly/NHN-Project/issues/180#issuecomment-5074900342)
- [#180 2차 NO-GO 결론](https://github.com/jaepaly/NHN-Project/issues/180#issuecomment-5075106366)

## 6. 지연이 behavior 시점 1초대에서 2초대로 오른 이유

저장된 비교 가능 수치:

- behavior 시점 현실 주문 10종: p50 1,180ms, p90/max 1,347ms
- 당시 복합 summon 한 건: 약 1.5초
- 현재 복합 corpus 중앙값: 약 2.345초

주요 원인:

1. 프롬프트 본문이 behavior 당시 약 2,553자에서 현재 약 5,091자로 거의 두 배가 됐다.
2. `spell_plan`은 각 단계마다 큰 `SpellSpec`을 반복 생성한다.
3. 모델이 단일/복합, 순차/동시, form/move/wait, 방향, 전체 예산까지 동시에 결정한다.
4. 현재 측정 corpus는 쉬운 단일 주문이 아니라 복합 영창만 모은 더 어려운 집합이다.
5. Gemini·Cloudflare의 비결정적 tail이 남아 있다.

근거:

- 복합 응답의 대표 `spell`을 생략하자 max 약 2.45→1.99초
- 불필요한 mechanic shadow가 JSON의 약 31%였던 v2.10은 6회 중 3회가 2.5초 초과
- mechanic을 제거한 v2.12는 동일 6회에서 1.861~2.389초
- compact 출력은 실패했지만 median 2.345→1.792초

로그 기록과 게임 엔진 실행은 Gemini 응답 뒤에 일어나므로 원격 판정 2초대의 직접 원인이 아니다.

## 7. 다음 AI가 하지 말아야 할 것

- production timeout을 임의로 2.5→3.2초로 늘리지 않는다.
- wall, fire spear 같은 실패 문장을 프롬프트 예시로 계속 추가하지 않는다.
- 실패 JSON을 살리기 위해 sanitizer, repair, 별도 의미 추론기, 두 번째 Gemini 호출을 연쇄 추가하지 않는다.
- 프롬프트 계약이 안정되기 전에 게임 엔진 동작을 바꾸지 않는다.
- Mock/fallback 성능 향상을 Gemini 개선의 대체물로 취급하지 않는다.
- 좁은 개발 corpus와 같은 문장을 held-out 검증에 재사용하지 않는다.
- 현재 큰 dirty worktree 전체를 무심코 stage/commit하지 않는다.
- `R2_PROGRESS.md` 전체의 줄바꿈·공백을 자동 정리하지 않는다. 현재 내용 변경보다 훨씬 큰 diff가 생겨 있다.

## 8. 다음 작업 권장 순서

1. **v2.12 안정판 마감**
   - 전체 로컬 회귀
   - TypeScript와 Vite production build
   - Worker 응답 계약
   - 문서의 구형 모델·프롬프트 버전 정합성
   - #158 PR/전달
2. **#170 친화 내성 관통**
   - 새 signature/mechanic 없이 기존 affinity·보스 내성 경로에 단일 계수만 연결
3. **#179 금언 저주방**
   - 30자 이하 한·영 짧은 영창의 baseline부터 측정
   - 실패가 재현되기 전 프롬프트 변경 금지
4. **#180은 팀 결정 후에만 재개**
   - Structured Output을 충분히 지원하는 모델/API 교체 가능성
   - 또는 2.5초 SLA 조정
   - 둘 중 하나가 먼저 결정되지 않으면 v2.12 유지

관련 링크:

- [#158 영창 시퀀스 마감](https://github.com/jaepaly/NHN-Project/issues/158)
- [#170 총괄 최종 배정](https://github.com/jaepaly/NHN-Project/issues/170)
- [#178 mechanic 봉인 결정](https://github.com/jaepaly/NHN-Project/issues/178)
- [#180 판정 구조 결정](https://github.com/jaepaly/NHN-Project/issues/180)
- [PR #179 금언 저주방](https://github.com/jaepaly/NHN-Project/pull/179)

## 9. 마지막 중단 시점의 정확한 상태

사용량 소모를 막기 위해 마지막 검증 도중 사용자가 작업을 중단했다.

완료된 확인:

- `node --check proxy/worker.js`: PASS
- `npx tsc --noEmit --pretty false`: PASS
- Cloudflare production: Worker `5d748432-b4e5-425c-b27d-70d404410d80` 100%
- #180 실험용 코드·라우트: 로컬에서 제거
- #180 결과: `R2_PROGRESS.md`와 GitHub 이슈 댓글에 기록

중단되어 결과를 확정하지 못한 확인:

- 마지막 `npx vite build`는 사용자가 중단해 최종 결과 없음
- 그 직전 결합 명령에서는 Vite의 기존 대용량 chunk 경고가 출력됐지만, 뒤이어 잘못된 폴더에서 실행한 Wrangler가 설정을 못 찾아 전체 명령이 timeout됐다. 빌드 성공 증거로 세지 않는다.
- `git diff --check`는 `R2_PROGRESS.md`의 기존 대규모 줄바꿈/후행 공백 diff 때문에 깨끗하지 않다. 이번 #180 문단만의 문제로 단정하거나 전체 파일을 일괄 포맷하지 않는다.

다음 AI가 처음 실행할 최소 명령:

```powershell
git status --short
npx tsc --noEmit --pretty false
npx vite build
node --check proxy/worker.js
cd proxy
npx wrangler deployments status
```

## 10. Git 작업 주의

- 현재 로컬 브랜치: `codex/r2-semantic-ir-spike`
- 브랜치 기준 커밋: `48b2748 test(r2): audit spell expression collisions`
- 작업 트리에는 오늘의 코드·문서 변경과 연구 산출물이 다수 미커밋 상태로 남아 있다.
- 이 인수인계 문서는 다른 변경을 섞지 않고 **문서 한 파일만 별도 커밋**한다.
- 따라서 원격 브랜치의 이 문서만 보고 “오늘의 코드 변경도 모두 push됐다”고 판단하면 안 된다. 실제 변경 묶음은 상단 P0-A 정합성 감사 후 별도로 stage/commit/PR 해야 한다.
