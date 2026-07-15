# R1↔R3 런 진행 계약 제안 — 보상 카드·방 전환 UI

> 상태: **제안 (R1 확정 대기)** · 작성 2026-07-15 · PHASE_2.md §2 "런 계약 확정" 게이트(7/15~7/17) 대응
> 타입 정의: [src/run/runContract.ts](../src/run/runContract.ts) (타입 전용 — 구현은 R1 소유)

## 왜 이 PR이 먼저인가

R3 P0(보상 카드 UI·방 전환 연출)는 R1의 방/보상 코어 API가 필요하다. 현재 main과 열린 브랜치에
해당 계약이 없으므로, PHASE_2 지시("전투 상태 로직 중복 구현 금지, 계약을 먼저 제안")에 따라
**인터페이스만** 먼저 합의한다. 이 PR은 동작 변경이 없다 (타입+문서만).

## 흐름 (제안)

```
[combat] 마지막 웨이브 격퇴
   → R1: phase='reward-select', 전투 정지(스포너·적·투사체·영창 입력 잠금)
   → R1: emit 'room-cleared' (결정론적 보상 3택, LLM 호출 금지)
   → R3: 카드 3장 표시. 마우스 클릭 또는 1/2/3 키로 선택 (선택 전 진행 불가는 phase로 보장)
   → R3: controller.chooseReward(id)
   → R1: 수치 적용 → emit 'reward-applied' (R3: HUD 즉시 갱신)
   → R1: phase='room-transition', emit 'room-transition' (durationMs 500~1000)
   → R3: 페이드 + "ROOM 2" 문구 연출
   → R1: phase='combat', emit 'room-started' (R3: 카드·연출 해제)
```

## 책임 경계

| | R1 (이도원) | R3 (jaepaly) |
|---|---|---|
| phase 전이·전투 정지 | ✅ 소유 | 읽기만 |
| 보상 3택 생성·수치 적용 | ✅ 소유 (결정론) | 표시만 |
| 카드 UI·입력(마우스+1/2/3) | — | ✅ 소유 |
| HUD(ROOM n/m·친화 요약) | — | ✅ 소유 |
| 전환 연출(0.5~1s) | 타이밍 제공(durationMs) | ✅ 연출 소유 |

- **입력 소유권**: `reward-select` 동안 1/2/3·마우스는 R3가 소비, Enter(영창)는 R1이 잠금.
- **키보드 완주 보장**: 영창(Enter)과 보상 선택(1/2/3) 모두 키보드만으로 가능 (R3 완료 기준).
- **레이아웃 계약**: 960×640 FIT 기준 — HUD는 좌상단(16,14)~(16,150) 유지, 카드는 중앙 3열
  (카드당 최대 200×280, 간격 24). 카드가 HUD·영창 바와 겹치지 않는 것은 R3 책임.

## 보상 3종 (PHASE_2 §6 스코프 컷 순서 반영)

| kind | 예시 카드 | 적용(R1) |
|---|---|---|
| `max-mana` | "마나 증폭 — 최대 마나 +20" | maxMana 증가 + 즉시 회복 |
| `heal` | "생명의 숨결 — HP 40 회복" | hp 회복 (컷 1순위 대비 변형) |
| `affinity` | "화염 친화 — 화염 위력 +15%" | elementalAffinity 갱신 |

일정 컷 시 `affinity` 제거 → `max-mana`/`heal` 변형 3장 구성 (§6-1).

## R1에게 확인 요청 (이 PR 리뷰에서 답변)

1. `WaveManager.phase`를 확장할지, 별도 `RunController`를 신설할지 (제안: 신설 — WaveManager는 방 내부 웨이브만)
2. 보상 풀 데이터(제목·수치)의 소유 위치 — 제안: R1 폴더의 데이터 파일, R3는 표시만
3. `durationMs` 기본값 (제안: 700ms)
4. 이벤트 방식 — 제안 인터페이스의 on/off 대신 Phaser EventEmitter를 쓸지 (둘 다 무방, 시그니처만 유지)

합의되면 이 문서 상태를 "확정"으로 바꾸고, R1 구현 PR → R3 UI PR 순서로 진행한다 (PHASE_2 §4).
