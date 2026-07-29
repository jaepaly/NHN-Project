import assert from 'node:assert/strict';
import {
  ALTAR_CONFIG,
  drawAltarRewardOptions,
  altarHpCost,
} from '../src/combat-core/run/altarRewardConfig';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { RUN_REWARD_CONFIG, drawRewardOptions } from '../src/combat-core/run/rewardConfig';
import type { RewardOption } from '../src/run/runContract';

/** 결정론 PRNG — 시드 고정 재현 테스트용 (mulberry32). */
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 3택·다양성·프리미엄 배율 ─────────────────────────────
{
  const opts = drawAltarRewardOptions(2, seededRand(42));
  assert.equal(opts.length, 3, '제단 3택');
  const kinds = new Set(opts.map((o) => o.kind));
  assert.equal(kinds.size, 3, '종류 중복 없이 3종 (다양한 강화 선택지)');
  for (const o of opts) {
    assert.ok(o.id.startsWith('altar-'), '제단 id 접두사');
    if (o.kind === 'spirit-haste') {
      // 씬 적용이라 배율 미반영 → 표준(정직): powerScale·"상급" 접두사 없음
      assert.equal(o.powerScale, undefined, 'spirit-haste는 표준(배율 없음)');
    } else {
      assert.equal(o.powerScale, ALTAR_CONFIG.premiumScale, '스케일 가능 종류엔 프리미엄 배율');
      assert.ok(o.powerScale! > 1, '상급 = 표준보다 큼');
      assert.ok(o.title.startsWith('상급 '), '상급 제목');
    }
  }
}

// ── 재현성: 같은 시드 → 같은 결과 ────────────────────────
{
  const a = drawAltarRewardOptions(3, seededRand(7));
  const b = drawAltarRewardOptions(3, seededRand(7));
  assert.deepEqual(a, b, '같은 시드는 같은 3택 (재현 가능)');
}

// ── HP 대가: 최대 HP 비례, 하한 1 ────────────────────────
{
  assert.equal(altarHpCost(100), Math.round(100 * ALTAR_CONFIG.hpCostRatio), '최대HP 비례');
  assert.ok(altarHpCost(1) >= 1, '하한 1 (공짜 제단 방지)');
  assert.ok(altarHpCost(200) > altarHpCost(100), '최대HP 클수록 대가 큼');
}

// ── 스케일 가능 종류만 배율 실림, spirit-haste는 표준 (오염 방지) ──
{
  const altar = drawAltarRewardOptions(1, seededRand(1));
  for (const o of altar) {
    if (o.kind === 'spirit-haste') assert.equal(o.powerScale, undefined, 'spirit-haste 표준');
    else assert.equal(o.powerScale, ALTAR_CONFIG.premiumScale, '나머지 상급 배율');
  }
}

// ── 설명이 배율을 반영한다 (카드 표시 = 실제 적용) — 버그 수정 검증 ──
// 같은 시드 표준(1) vs 배율(2): 스케일 가능 카드는 설명이 달라야(수치↑), spirit-haste는 동일.
{
  const std = drawRewardOptions(5, seededRand(123), 1);
  const prem = drawRewardOptions(5, seededRand(123), 2);
  assert.equal(std.length, prem.length, '같은 시드 같은 개수');
  for (let i = 0; i < std.length; i += 1) {
    assert.equal(std[i].kind, prem[i].kind, '같은 시드 같은 종류·순서');
    if (std[i].kind === 'spirit-haste') {
      assert.equal(std[i].description, prem[i].description, 'spirit-haste 설명은 배율 무관');
      assert.equal(prem[i].powerScale, undefined, 'spirit-haste 배율 없음');
    } else {
      assert.notEqual(std[i].description, prem[i].description, '스케일 카드 설명이 배율 반영(표시=실제)');
      assert.equal(prem[i].powerScale, 2, '스케일 카드 powerScale');
    }
  }
}

// ── Step 2: powerScale이 실제 수치 효과에 곱해진다 (RunController.applyReward) ──
// 제단 "상급"이 이름뿐 아니라 진짜로 더 세지는지 — 표준(+20) vs 상급(2배=+40) 비교.
{
  const makeRun = (powerScale?: number) => {
    const player = new PlayerCombatState();
    const controller = new CombatRunController({
      playerState: player,
      maxRooms: 3,
      rewardDraw: (roomIndex): RewardOption[] => [{
        id: `room-${roomIndex}-max-hp`, kind: 'max-hp', title: 'test', description: 'test', powerScale,
      }],
      scheduleTransition: () => {},
    });
    controller.notifyRoomCleared();
    return { player, controller };
  };
  const baseMaxHp = new PlayerCombatState().maxHp;

  const standard = makeRun();                        // 배율 미지정 = 표준
  standard.controller.chooseReward('room-1-max-hp');
  assert.equal(standard.player.maxHp - baseMaxHp, RUN_REWARD_CONFIG.maxHpIncrease, '표준 max-hp +20');

  const premium = makeRun(ALTAR_CONFIG.premiumScale); // 배율 2 = 상급
  premium.controller.chooseReward('room-1-max-hp');
  assert.equal(
    premium.player.maxHp - baseMaxHp,
    RUN_REWARD_CONFIG.maxHpIncrease * ALTAR_CONFIG.premiumScale,
    '상급 max-hp = 표준 ×2 (+40)',
  );
  assert.ok(premium.player.maxHp > standard.player.maxHp, '상급 > 표준 (실제로 더 셈)');
}

console.log('Altar reward regression: 3택·다양성·프리미엄배율·재현성·HP대가·실적용·설명배율 7군 통과');

// ── 대가가 죽이지 않는다 (R3 배선, 2026-07-29) ──────────────────────────
// 대가는 최대 HP 기준이라 저체력에서 제단에 들어서면 그 자리에서 죽는다.
// 방에 들어선 것만으로 사망하면 선택이 아니라 함정이다.
{
  const { altarHpCostFor } = await import('../src/combat-core/run/altarRewardConfig');
  const assert2 = (await import('node:assert/strict')).default;
  assert2.equal(altarHpCostFor(100, 100), 25, '만피에선 정가 그대로');
  assert2.equal(altarHpCostFor(100, 26), 25, '딱 버틸 수 있으면 정가');
  assert2.equal(altarHpCostFor(100, 25), 24, '정가를 내면 죽는 지점부터 깎인다');
  assert2.equal(altarHpCostFor(100, 5), 4, '저체력');
  assert2.equal(altarHpCostFor(100, 1), 0, 'HP 1이면 공짜 — 죽일 바엔 안 받는다');
  assert2.equal(altarHpCostFor(100, 0), 0);
  assert2.equal(altarHpCostFor(100, Number.NaN), 0, 'NaN 방어');
  // 어떤 조합에서도 사망하지 않는다
  for (let maxHp = 20; maxHp <= 400; maxHp += 20) {
    for (let hp = 1; hp <= maxHp; hp += 1) {
      assert2.ok(hp - altarHpCostFor(maxHp, hp) >= 1, `제단이 죽였다 (maxHp ${maxHp}, hp ${hp})`);
    }
  }
  console.log('altar reward regression: 대가 사망 방지 통과');
}
