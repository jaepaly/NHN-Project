import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CombatRunController } from '../src/combat-core/run/runController';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import type { RewardOption } from '../src/run/runContract';

/**
 * 보상 적용 시점 회귀 (총괄 제보 2026-07-30).
 *
 * 제보: *"보상 선택시, 그 즉시 체력 등이 변하지 않고 다음 방으로 가야 변하던데?"*
 *
 * ## 원인
 *
 * `chooseReward()`는 **보상 적용과 전환 타이머를 같이** 건다:
 *
 *     applyReward(chosen);            ← 최대 체력·마나·친화 반영
 *     scheduleTransition(...)         ← 다음 방으로
 *
 * #262에서 포탈 선택 단계를 넣을 때, 전환을 멈추는 유일한 방법이 `chooseReward` 호출
 * 자체를 미루는 것이라고 판단했다. 그래서 `runUiBinding`이
 * `await beforeAdvance()` **뒤에** `chooseReward`를 불렀다. 결과적으로 보상 적용도
 * 함께 미뤄져 — 카드를 골라도 포탈에 진입할 때까지 숫자가 바뀌지 않았다.
 *
 * ## 고친 방식
 *
 * `RunControllerOptions.scheduleTransition`이 **주입 가능**하다는 걸 활용했다. 씬이
 * 스케줄러를 넘겨 전환 콜백을 보관하고, 포탈 진입이 끝나면 실행한다. 컨트롤러는
 * 자기가 타이머를 걸었다고 믿고 실제 시점은 씬이 정한다 — 계약을 넘지 않는다.
 *
 * ## 이 회귀가 막는 새 사고
 *
 * 전환을 붙잡아 두는 구조라 **놓아주는 것을 빠뜨리면 런이 갇힌다** (보상은 반영됐는데
 * 방이 영영 안 넘어간다). 종전 사고보다 심각하다 — 종전엔 숫자가 늦게 보일 뿐이었다.
 */

function makeRewards(): RewardOption[] {
  return [
    { id: 'r-hp', kind: 'max-hp', title: '최대 체력', description: '' },
    { id: 'r-mana', kind: 'max-mana', title: '최대 마나', description: '' },
  ];
}

// ── 1) chooseReward는 **즉시** 적용한다 ─────────────────────────────────────
//
// 컨트롤러 자체의 성질이다. 늦게 보이던 것은 호출 시점 문제였으므로, 여기서 즉시성을
// 못박아 두면 다시 "적용이 늦다"를 컨트롤러에서 찾지 않게 된다.
{
  const player = new PlayerCombatState();
  const before = player.maxHp;
  const held: (() => void)[] = [];
  const controller = new CombatRunController({
    playerState: player,
    maxRooms: 4,
    rewardDraw: () => makeRewards(),
    // 전환을 붙잡는다 — 씬이 하는 것과 같다
    scheduleTransition: (_delayMs, callback) => { held.push(callback); },
  });

  controller.notifyRoomCleared();
  controller.chooseReward('r-hp');

  assert.ok(
    player.maxHp > before,
    `chooseReward 직후 최대 체력이 올라야 한다 (${before} → ${player.maxHp})`,
  );
  // 그리고 방은 아직 넘어가지 않았다 — 전환이 붙잡혀 있다
  assert.equal(controller.state.roomIndex, 1, '전환을 붙잡았으면 방 번호는 그대로');
  assert.equal(controller.state.phase, 'room-transition', '위상은 전환 대기');
  assert.equal(held.length, 1, '전환 콜백이 정확히 하나 보관됐다');

  // 놓아주면 넘어간다
  held[0]();
  assert.equal(controller.state.roomIndex, 2, '놓아주면 다음 방');
}

// ── 2) 붙잡은 전환을 놓지 않으면 갇힌다 — 그 사실을 명시한다 ────────────────
{
  const controller = new CombatRunController({
    playerState: new PlayerCombatState(),
    maxRooms: 4,
    rewardDraw: () => makeRewards(),
    scheduleTransition: () => { /* 영원히 붙잡는다 */ },
  });
  controller.notifyRoomCleared();
  controller.chooseReward('r-hp');
  assert.equal(controller.state.roomIndex, 1, '놓지 않으면 방이 넘어가지 않는다');
  assert.equal(
    controller.state.phase, 'room-transition',
    '위상이 room-transition에 머문다 — 이 상태로 방치되면 런이 갇힌다',
  );
}

// ── 3) **씬의 모든 종료 경로가 전환을 놓아준다** ────────────────────────────
//
// ⚠️ 이게 이 파일의 핵심이다. `chooseRoomDestination`은 두 갈래로 끝난다:
//   ① 선택지 0개 → 즉시 해제
//   ② 선택지 1개 이상 → 전체 지도 UI 선택/폴백 뒤 finally에서 해제
// 하나라도 `releaseRunTransition()`을 빠뜨리면 그 경로로 끝난 방에서 런이 갇힌다.
// 소스를 읽어 호출 수를 센다 — 새 종료 경로가 생기면 개수가 어긋나 잡힌다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  const releases = scene.match(/this\.releaseRunTransition\(\)/g) ?? [];
  assert.equal(
    releases.length, 2,
    `releaseRunTransition 호출이 2건이어야 한다 (현재 ${releases.length}) —`
    + ' chooseRoomDestination의 종료 경로가 둘이다. 경로를 추가했다면 해제도 추가하고'
    + ' 이 숫자를 갱신할 것. 빠뜨리면 그 경로에서 런이 갇힌다.',
  );
  // 게이트와 해제가 짝으로 존재한다
  assert.ok(
    /private pendingRunTransition/.test(scene),
    '전환을 보관하는 필드가 있어야 한다',
  );
  assert.ok(
    /scheduleTransition: \(delayMs, callback\)/.test(scene),
    '씬이 scheduleTransition을 주입해야 한다 — 안 넘기면 컨트롤러가 setTimeout으로 바로 걸어버린다',
  );
  // 런 리셋에서 보관분을 버린다 — 남으면 새 런에서 지난 런의 전환이 터진다
  assert.ok(
    /this\.pendingRunTransition = null;/.test(scene),
    '런 리셋이 보관된 전환을 버려야 한다',
  );
}

// ── 4) runUiBinding이 **적용을 먼저** 한다 ──────────────────────────────────
//
// 순서가 다시 뒤집히면 제보된 증상이 그대로 돌아온다. 소스 순서로 고정한다.
{
  const binding = readFileSync('src/ui/runUiBinding.ts', 'utf8');
  const chooseAt = binding.indexOf('controller.chooseReward(chosen.id)');
  const advanceAt = binding.indexOf('await hooks.chooseNextRoom?.()');
  assert.ok(chooseAt > 0 && advanceAt > 0, '두 호출이 모두 있어야 한다');
  assert.ok(
    chooseAt < advanceAt,
    'chooseReward가 chooseNextRoom보다 **먼저** 와야 한다 —'
    + ' 뒤에 두면 보상 적용이 방 선택 완료까지 미뤄진다(총괄 제보 증상)',
  );
  assert.ok(
    binding.includes('if (choosingNextRoom)') && binding.includes('queuedTransition = transition'),
    '방 선택 UI 위로 전환 암막이 먼저 시작된다',
  );
}

// ── 5) 결산 총계는 보상·방 전환 중에도 계속 간다 (R1 계측, #349) ───────────
//
// ⚠️ 원래 이 단언은 `updateRunElapsed`가 전투 게이트를 쓰면 안 된다고 했다. 그런데
// 그 필드는 R2가 상단 HUD 타이머용으로 "조작·전투 시간만"이라고 회귀로 잠근 것이라
// (`run-timer-hud-regression`) **두 회귀가 같은 함수를 두고 정반대를 요구했다.**
//
// 목적이 다른 두 지표를 한 필드에 얹은 게 원인이었다 — 총괄 결정으로 분리했다:
//
//   runElapsedMs    조작·전투 시간   → 상단 HUD (R2)
//   runWallClockMs  전체 경과 시간   → 결산 총계·밸런스 계측 (R1)
//
// R1의 의도(보상·방 전환도 세야 방별 합계와 총계가 맞는다)는 새 필드가 그대로 지킨다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  const timer = scene.match(
    /private updateRunWallClock\(delta: number\): void \{[\s\S]*?\n {2}\}/,
  );
  assert.ok(timer, '결산 총계 갱신 함수를 찾아야 한다');
  const body = timer[0];
  assert.ok(!body.includes('isCombatActive()'), '보상·방 전환을 전투 게이트로 제외하면 안 된다');
  assert.ok(body.includes("phase === 'run-over'"), '런 완료 뒤에는 타이머를 멈춰야 한다');
  assert.ok(body.includes('this.time.paused'), '명시적 일시정지는 런 타임에서 제외한다');
  assert.ok(body.includes('this.runWallClockMs += Math.max(0, delta)'), '현실 시간 delta를 누적한다');
  // 결산이 실제로 벽시계를 쓰는가 — HUD 필드를 쓰면 방별 합계와 총계가 어긋난다
  assert.ok(
    scene.includes('elapsedMs: this.runWallClockMs,'),
    '런 결산 총계는 전체 경과 시간을 써야 한다 — 방별 합계와 정합해야 계측 표가 성립한다',
  );
}

// ── 6) 설치물 단계에서도 따라다니는 것들이 갱신된다 ─────────────────────────
//
// 제보: *"보상 선택시, 정령이 갑자기 거기에 멈추는 버그가 있음."*
//
// `update()`가 `isCombatActive()`로 갈리고, 설치물 단계에서 플레이어만 움직이면
// 그 동안 정령은 마지막 궤도 좌표에 박혀 있게 된다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  const branch = scene.match(
    /\} else if \(this\.roomFixture\) \{[\s\S]*?\n {4}\}/,
  );
  assert.ok(branch, '설치물 단계 분기를 찾아야 한다');
  const body = branch[0];
  for (const call of ['updatePlayerMovement', 'updateSpirits', 'updateSummon', 'updateFriendlyMissiles']) {
    assert.ok(body.includes(call), `설치물 단계에서 ${call}가 돌아야 한다`);
  }
  // 전투 요소는 멈춘 채로 둔다 — 걸어가는 동안 맞으면 안 된다
  for (const call of ['updateEnemies', 'updateEnemyProjectiles', 'updateWaveFlow']) {
    assert.ok(!body.includes(call), `설치물 단계에서 ${call}는 멈춰 있어야 한다`);
  }
  // timeScale을 곱한 델타를 쓴다 — 전투 분기와 같은 시간 축이어야 궤도 속도가 일관된다
  assert.ok(
    /const d = \(delta \/ 1000\) \* this\.timeScale;/.test(body),
    '설치물 단계도 timeScale을 반영한 델타를 써야 한다',
  );
}

// ── 7) 방 시간은 진행 HUD가 아니라 런 종료 DEV 표에서 확인한다 ─────────────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  const summary = readFileSync('src/ui/runSummaryOverlay.ts', 'utf8');
  assert.ok(scene.includes('private roomElapsedMs = 0'), '룸 타이머 상태가 있어야 한다');
  assert.ok(scene.includes('this.roomElapsedMs = 0;'), '방 시작마다 룸 타이머를 초기화해야 한다');
  assert.ok(scene.includes("this.combatRunController.state.phase !== 'combat'"),
    '보상·전환 중에는 룸 타이머를 멈춰야 한다');
  assert.ok(scene.includes('this.roomElapsedMs += Math.max(0, delta)'),
    '슬로모 배율이 아닌 현실 시간 delta를 누적해야 한다');
  assert.ok(!scene.includes('[DEV] ROOM ${formatRunElapsed(this.roomElapsedMs)}'),
    '진행 중 DEV 방 타이머를 노출하면 안 된다');
  assert.ok(scene.includes('this.recordCurrentRoomTiming(state.roomIndex)'),
    '방 클리어·전환·런 완료 시 방 시간을 확정해야 한다');
  assert.ok(scene.includes('mapSeed: this.currentMapSeed'), '결산에 맵 시드를 전달해야 한다');
  assert.ok(scene.includes('debug: import.meta.env.DEV'), '방별 표는 DEV에서만 전달해야 한다');
  assert.ok(summary.includes('DEV · ROOM TIMINGS'), '결산에 DEV 방별 시간 표가 있어야 한다');
  for (const heading of ['ROOM', 'STAGE', '종류', 'NODE', '클리어']) {
    assert.ok(summary.includes(`<th>${heading}</th>`), `방별 표 열 ${heading}`);
  }
}

console.log(
  'reward timing regression: 즉시적용·붙잡힘·해제경로2건·UI순서·연속런타임·비전투추적·DEV결산 7군 통과',
);
