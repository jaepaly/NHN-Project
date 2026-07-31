import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 슬로모션 적용 범위 회귀 (총괄 제보 2026-07-31).
 *
 * 제보 둘을 함께 고정한다:
 *  ① *"아직 유저의 공격이 벽을 뚫더라"* — 차단이 일부 경로에만 걸려 있었다
 *  ② *"영창 시전하는 중에 각인이나 보스가 사용하는 영창 등이 원래의 속도로
 *     날아가는 거 고쳐야 할듯"* — 슬로모션이 씬의 수동 델타에만 걸려 있었다
 *
 * 둘 다 **"일부 경로만 처리했다"**는 같은 종류의 결함이다.
 */

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

// ── ① 벽 차단이 **모든 피해 경로**를 거치는가 ──────────────────────────────
//
// 처음엔 일반 적중 루프에만 걸었는데 `impact.kind === 'point'`(연쇄·시퀀스 고정
// 대상)가 그 앞에서 조기 반환해 여전히 벽을 뚫었다. 한 곳에 모아 빠뜨릴 자리를 없앴다.
{
  assert.ok(
    /private terrainBlocksCast\(/.test(scene),
    '차단 판정을 공통 함수로 모아야 한다 — 흩어지면 새 경로에서 또 빠진다',
  );

  // 세 경로 모두 거치는가: 연쇄 · 시퀀스 고정 대상 · 일반 적중
  const calls = scene.match(/this\.terrainBlocksCast\(/g) ?? [];
  assert.ok(
    calls.length >= 3,
    `차단 검사가 ${calls.length}곳뿐이다 — 연쇄·고정대상·일반적중 셋 다 거쳐야 한다`,
  );

  // 연쇄는 **도약 구간마다** 봐야 한다. 시전자 기준으로만 보면 벽 뒤로 도약한다.
  const chainAt = scene.indexOf('impact.chainIndex !== undefined');
  assert.ok(chainAt > 0, '연쇄 분기를 찾아야 한다');
  const chainBlock = scene.slice(chainAt, chainAt + 900);
  assert.ok(
    /terrainBlocksCast\(spec, chainSource, chainTarget\)/.test(chainBlock),
    '연쇄는 도약 구간(chainSource → chainTarget)마다 판정해야 한다',
  );

  // 시퀀스가 잠근 대상도 예외가 아니다 — 잠갔다고 벽을 뚫으면 엄폐가 무의미하다
  assert.ok(
    /lockedTarget\?\.alive && !this\.terrainBlocksCast\(/.test(scene),
    '시퀀스 고정 대상도 차단을 거쳐야 한다',
  );

  // zone·rain 예외는 함수 안에 한 번만 — 호출부마다 쓰면 빠뜨린다
  const fnAt = scene.indexOf('private terrainBlocksCast(');
  const fnBody = scene.slice(fnAt, fnAt + 700);
  assert.ok(
    /spec\.form === 'zone' \|\| spec\.form === 'rain'/.test(fnBody),
    '낙하·장판 폼 예외는 공통 함수 안에 둔다',
  );
}

// ── ② 슬로모션이 **트윈·타이머까지** 거는가 ────────────────────────────────
//
// `timeScale` 필드는 씬이 수동으로 굴리는 것(적·웨이브·마나·쿨다운·장판)에만 곱해진다.
// 주문 투사체·각인 자동 시전·보스 패턴은 **Phaser 트윈과 타이머**로 도는데 그건
// 실시간이라 영창 중에도 원래 속도였다. 내 화면만 멈추고 상대는 그대로 움직이는 셈.
{
  assert.ok(
    /private setTimeScale\(/.test(scene),
    '배율을 한 곳에서 걸어야 한다 — 필드 직접 대입이면 Phaser 쪽을 빠뜨린다',
  );

  const fnAt = scene.indexOf('private setTimeScale(');
  const fnBody = scene.slice(fnAt, fnAt + 900);
  assert.ok(/this\.timeScale = /.test(fnBody), '씬 수동 델타용 필드');
  assert.ok(/this\.tweens\.timeScale = /.test(fnBody), '트윈 배율 — 주문 연출이 여기 있다');
  assert.ok(/this\.time\.timeScale = /.test(fnBody), '타이머 배율 — 각인·보스 예약이 여기 있다');

  // ⚠️ physics는 건드리면 안 된다. 이 게임은 물리 바디를 수동 델타로 움직이고
  // 그 델타에 이미 timeScale이 곱해져 있다 — 여기서 또 곱하면 이중 적용이다.
  assert.ok(
    !/physics\.world\.timeScale/.test(fnBody),
    'physics 배율까지 걸면 이중 적용된다 (수동 델타가 이미 곱한다)',
  );

  // 필드에 직접 대입하는 자리가 남아 있으면 그 경로만 Phaser 배율을 안 건다
  const direct = scene.match(/this\.timeScale = (?!safe)/g) ?? [];
  assert.equal(
    direct.length, 0,
    `timeScale 직접 대입이 ${direct.length}곳 남았다 — setTimeScale을 쓸 것`,
  );

  // 세 상태가 모두 setter를 거치는가 (영창 0.1 · 판정 0.15 · 복귀 1)
  for (const value of ['0.1', '0.15', '1']) {
    assert.ok(
      scene.includes(`this.setTimeScale(${value})`),
      `배율 ${value}가 setter를 거쳐야 한다`,
    );
  }
  // 복귀가 진입보다 많아야 한다 — 걸어놓고 안 푸는 경로가 있으면 게임이 멈춘 채 남는다
  const enter = (scene.match(/setTimeScale\(0\./g) ?? []).length;
  const leave = (scene.match(/setTimeScale\(1\)/g) ?? []).length;
  assert.ok(
    leave >= enter,
    `슬로모션 진입 ${enter}회 vs 복귀 ${leave}회 — 안 푸는 경로가 있으면 화면이 멈춘 채 남는다`,
  );
}

console.log('slowmo scope regression: 차단공통화·연쇄·고정대상·낙하예외·배율3축·직접대입금지·복귀 7군 통과');
