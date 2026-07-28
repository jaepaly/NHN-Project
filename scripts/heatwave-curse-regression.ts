import assert from 'node:assert/strict';
import {
  HEATWAVE_CURSE_CONFIG,
  heatwaveCoolingHeal,
  heatwaveDamagePerSecond,
  isHeatwaveCoolingElement,
} from '../src/combat-core/run/heatwaveCurse';

assert.equal(HEATWAVE_CURSE_CONFIG.entryGraceSeconds, 3);
assert.equal(HEATWAVE_CURSE_CONFIG.coolingImmunitySeconds, 5);
assert.equal(heatwaveDamagePerSecond(100), 1);
assert.equal(heatwaveCoolingHeal(100), 10);
assert.equal(heatwaveDamagePerSecond(0), 0);
assert.equal(isHeatwaveCoolingElement('water'), true);
assert.equal(isHeatwaveCoolingElement('ice'), true);
assert.equal(isHeatwaveCoolingElement('wind'), true);
assert.equal(isHeatwaveCoolingElement('fire'), false);

console.log('Heatwave curse regression: ratios and cooling elements passed');
