import assert from 'node:assert/strict';
import {
  KNOCKBACK_CONFIG,
  knockbackDistanceForForm,
} from '../src/combat-core/combat/knockbackConfig';

assert.equal(knockbackDistanceForForm('bolt'), KNOCKBACK_CONFIG.standardDistance);
assert.equal(knockbackDistanceForForm('rain'), KNOCKBACK_CONFIG.standardDistance);
assert.equal(knockbackDistanceForForm('wall'), KNOCKBACK_CONFIG.standardDistance);
assert.equal(knockbackDistanceForForm('zone'), KNOCKBACK_CONFIG.zoneDistance);
assert.equal(knockbackDistanceForForm('orbit'), KNOCKBACK_CONFIG.orbitDistance);
assert.ok(KNOCKBACK_CONFIG.zoneDistance < KNOCKBACK_CONFIG.orbitDistance);
assert.ok(KNOCKBACK_CONFIG.orbitDistance < KNOCKBACK_CONFIG.standardDistance);

console.log('Knockback regression: standard + reduced persistent distances passed');
