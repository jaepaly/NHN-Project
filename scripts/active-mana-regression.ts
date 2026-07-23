import assert from 'node:assert/strict';
import {
  ACTIVE_MANA_CONFIG,
  crossedBossManaThresholds,
  manaDropAmount,
  manaPotionSpawnDelay,
} from '../src/combat-core/mana/activeManaConfig';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { degradedCastPlan } from '../src/combat-core/mana/degradedCast';

assert.equal(manaDropAmount(false), 8, 'normal enemy restores 8 mana');
assert.equal(manaDropAmount(true), 16, 'elite enemy restores 16 mana');
assert.equal(manaDropAmount(false, 'small-splitter'), 3, 'small splitter has a reduced drop');
assert.equal(manaDropAmount(false, 'shield-sentinel'), 11, 'shield sentinel has a larger drop');
assert.ok(
  ACTIVE_MANA_CONFIG.passiveRegenPerSecond > 0 && ACTIVE_MANA_CONFIG.passiveRegenPerSecond <= 4,
  'passive regen is a trickle floor (>0), not a primary source (<=4) — kills still dominate',
);
assert.equal(manaPotionSpawnDelay(0), 10);
assert.equal(manaPotionSpawnDelay(0.5), 12.5);
assert.equal(manaPotionSpawnDelay(1), 15);
assert.deepEqual(crossedBossManaThresholds(100, 89, 100), [0.9]);
assert.deepEqual(
  crossedBossManaThresholds(100, 69, 100),
  [0.9, 0.8, 0.7],
  'large damage grants every crossed 10% threshold',
);
assert.deepEqual(crossedBossManaThresholds(9, 0, 100), [], 'no threshold remains below 10%');

const player = new PlayerCombatState();
assert.equal(player.drainMana(7), 7, '환경 마나 감소량 반환');
assert.equal(player.mana, 93, '환경 마나 감소 적용');
assert.equal(player.drainMana(999), 93, '마나 0 하한');
assert.equal(player.mana, 0);
player.restoreMana(100);
assert.equal(player.trySpendMana(100), true);
player.update(1);
assert.equal(player.mana, ACTIVE_MANA_CONFIG.passiveRegenPerSecond);
assert.equal(player.restoreMana(manaDropAmount(false)), 8);
assert.equal(player.mana, ACTIVE_MANA_CONFIG.passiveRegenPerSecond + 8);
player.startInputLock(ACTIVE_MANA_CONFIG.castInputLockSeconds);
assert.equal(player.cooldownRemaining, 0.4);

// 영창 환류 — 수동 주문 킬 환급. 킬 가치의 주는 여전히 크리스탈 드롭이어야 한다.
assert.ok(
  ACTIVE_MANA_CONFIG.spellKillRefundMana > 0
  && ACTIVE_MANA_CONFIG.spellKillRefundMana <= ACTIVE_MANA_CONFIG.normalDropMana,
  'spell-kill refund stays a bonus (>0), never exceeding the normal crystal drop',
);
const refundPlayer = new PlayerCombatState();
refundPlayer.trySpendMana(100);
assert.equal(
  refundPlayer.restoreMana(ACTIVE_MANA_CONFIG.spellKillRefundMana),
  ACTIVE_MANA_CONFIG.spellKillRefundMana,
  'refund lands as instant mana (no pickup travel)',
);

// 감쇠 시전 — 마나 부족은 거부가 아니라 잦아든 주문 (바닥 미만만 거부)
assert.deepEqual(degradedCastPlan(24, 50), { spend: 24, ratio: 1 }, '충분하면 온전');
assert.deepEqual(degradedCastPlan(24, 12), { spend: 12, ratio: 0.5 }, '부족하면 비례 감쇠 + 전액 지불');
assert.equal(degradedCastPlan(24, 4), null, '바닥(5) 미만은 기존 거부 경로');
const edge = degradedCastPlan(24, ACTIVE_MANA_CONFIG.degradedCastMinMana);
assert.ok(edge && Math.abs(edge.ratio - 5 / 24) < 1e-9, '바닥 경계는 감쇠 시전');
assert.deepEqual(degradedCastPlan(0, 3), { spend: 0, ratio: 1 }, '무비용 방어');
assert.deepEqual(degradedCastPlan(Number.NaN, 3), { spend: 0, ratio: 1 }, 'NaN 방어');

console.log('active mana regression: passive safeguard + drops + spell-kill refund + degraded cast passed');
