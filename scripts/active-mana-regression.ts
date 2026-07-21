import assert from 'node:assert/strict';
import {
  ACTIVE_MANA_CONFIG,
  crossedBossManaThresholds,
  manaDropAmount,
  manaPotionSpawnDelay,
} from '../src/combat-core/mana/activeManaConfig';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';

assert.equal(manaDropAmount(false), 5, 'normal enemy restores 5 mana');
assert.equal(manaDropAmount(true), 10, 'elite enemy restores 10 mana');
assert.equal(manaDropAmount(false, 'small-splitter'), 2, 'small splitter has a reduced drop');
assert.equal(manaDropAmount(false, 'shield-sentinel'), 7, 'shield sentinel has a larger drop');
assert.ok(ACTIVE_MANA_CONFIG.passiveRegenPerSecond < 1, 'passive regen remains a safeguard');
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
assert.equal(player.trySpendMana(100), true);
player.update(1);
assert.equal(player.mana, ACTIVE_MANA_CONFIG.passiveRegenPerSecond);
assert.equal(player.restoreMana(manaDropAmount(false)), 5);
assert.equal(player.mana, 5.5);
player.startInputLock(ACTIVE_MANA_CONFIG.castInputLockSeconds);
assert.equal(player.cooldownRemaining, 0.4);

console.log('active mana regression: passive safeguard + normal/elite drops passed');
