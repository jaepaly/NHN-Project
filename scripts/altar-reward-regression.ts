import assert from 'node:assert/strict';
import {
  ALTAR_CONFIG,
  drawAltarRewardOptions,
  altarHpCost,
} from '../src/combat-core/run/altarRewardConfig';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';
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
    assert.equal(o.powerScale, ALTAR_CONFIG.premiumScale, '각 옵션에 프리미엄 배율');
    assert.ok(o.powerScale! > 1, '상급 = 표준보다 큼');
    assert.ok(o.id.startsWith('altar-'), '제단 id 접두사');
    assert.ok(o.title.startsWith('상급 '), '상급 제목');
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

// ── 표준 3택은 배율 미지정(=1로 간주) — 제단만 배율 실림 (오염 방지) ──
{
  const altar = drawAltarRewardOptions(1, seededRand(1));
  assert.ok(altar.every((o) => o.powerScale === ALTAR_CONFIG.premiumScale), '제단은 전부 배율 실림');
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

console.log('Altar reward regression: 3택·다양성·프리미엄배율·재현성·HP대가 + 실적용(표준vs상급) 5군 통과');
