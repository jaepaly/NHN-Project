import assert from 'node:assert/strict';
import {
  advanceHeatwaveTimers,
  HEATWAVE_CURSE_CONFIG,
  heatwaveCoolingHeal,
  heatwaveDamagePerSecond,
  isHeatwaveDamaging,
  isHeatwaveCoolingElement,
} from '../src/combat-core/run/heatwaveCurse';

assert.equal(HEATWAVE_CURSE_CONFIG.entryGraceSeconds, 3);
assert.equal(HEATWAVE_CURSE_CONFIG.coolingImmunitySeconds, 5);
assert.equal(heatwaveDamagePerSecond(100), 1.5);
assert.equal(heatwaveCoolingHeal(100), 10);
assert.equal(heatwaveDamagePerSecond(0), 0);
assert.equal(isHeatwaveCoolingElement('water'), true);
assert.equal(isHeatwaveCoolingElement('ice'), true);
assert.equal(isHeatwaveCoolingElement('wind'), true);
assert.equal(isHeatwaveCoolingElement('fire'), false);

let timers = advanceHeatwaveTimers({
  graceRemaining: HEATWAVE_CURSE_CONFIG.entryGraceSeconds,
  immunityRemaining: 0,
}, 2);
assert.deepEqual(timers, {
  graceRemaining: 1,
  immunityRemaining: 0,
  damagingSeconds: 0,
});
assert.equal(isHeatwaveDamaging(timers), false);

timers = advanceHeatwaveTimers(timers, 1.5);
assert.deepEqual(timers, {
  graceRemaining: 0,
  immunityRemaining: 0,
  damagingSeconds: 0.5,
});
assert.equal(isHeatwaveDamaging(timers), true);

timers = advanceHeatwaveTimers({
  graceRemaining: 0,
  immunityRemaining: HEATWAVE_CURSE_CONFIG.coolingImmunitySeconds,
}, 3);
assert.deepEqual(timers, {
  graceRemaining: 0,
  immunityRemaining: 2,
  damagingSeconds: 0,
});
assert.equal(isHeatwaveDamaging(timers), false);

timers = advanceHeatwaveTimers(timers, 2.25);
assert.deepEqual(timers, {
  graceRemaining: 0,
  immunityRemaining: 0,
  damagingSeconds: 0.25,
});
assert.equal(isHeatwaveDamaging(timers), true);

console.log('Heatwave curse regression: ratios, cooling elements, and timer transitions passed');
