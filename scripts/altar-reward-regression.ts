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
