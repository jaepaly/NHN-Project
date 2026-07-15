# R1↔R3 런 진행 계약 — 보상 카드·방 전환 UI

> 상태: **R1 답변 반영 (2026-07-15) — R1 최종 확인 대기** · PHASE_2.md §2 "런 계약 확정" 게이트(7/15~7/17)
> 타입 정의: [src/run/runContract.ts](../src/run/runContract.ts) (타입 전용 — 구현은 R1 소유)
> 반영 내역 (PR #12 R1 검토 의견): ① `RewardKind`의 `heal` → `max-hp`(최대 HP 증가+즉시 일부 회복)
> ② `run-completed` 이벤트 추가(마지막 방 클리어 → `run-over`) ③ `RunStateSnapshot.rewards` 누적 기록 추가

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

[마지막 방 클리어 시] → R1: phase='run-over', emit 'run-completed' (보상 선택 없음)
   → R3: 런 요약 화면 (Phase 2에서는 방 2 클리어 = 런 완주)
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
| `max-hp` | "생명 증폭 — 최대 HP +20, 즉시 20 회복" | maxHp 증가 + 즉시 일부 회복 |
| `max-mana` | "마나 증폭 — 최대 마나 +20" | maxMana 증가 + 즉시 회복 |
| `affinity` | "화염 친화 — 화염 위력 +15%" | elementalAffinity 갱신 |

- 수치는 R1 설정(`rewardConfig.ts`)의 임시 밸런스값 — 플레이테스트·팀 합의로 조정
- 일정 컷 시 `affinity` 제거 → `max-hp`/`max-mana` 변형 3장 구성 (§6-1)

## 합의 사항 (2026-07-15, PR #12 리뷰)

1. **RunController 신설** — WaveManager는 방 내부 웨이브만, RunController가 방·보상·런 전이 담당
2. **보상 풀 데이터는 R1 소유** — id·제목·설명·수치는 R1 설정에서 생성, R3는 `RewardOption` 표시만
3. **전환 `durationMs` 기본 700ms**
4. **공개 계약은 타입 지정 on/off 유지** — R1 내부의 Phaser EventEmitter 사용은 자유, R3는 내부 구현에 비의존

**파일 구성 (R1 확정)**
- `src/run/runContract.ts` — R1↔R3 공유 타입·인터페이스 (전투 구현 두지 않음)
- `src/combat-core/run/runController.ts` — R1 실제 구현
- `src/combat-core/run/rewardConfig.ts` — R1 보상 데이터

R1이 수정된 계약을 최종 확인하면 R1 구현 PR → R3 UI 결합 PR 순서로 진행한다 (PHASE_2 §4).
