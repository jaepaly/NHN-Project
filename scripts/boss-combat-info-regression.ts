import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bossResistanceBadges } from '../src/ui/bossCombatInfoModel';
import { bossHealthBarReadout } from '../src/ui/bossHealthBarModel';

const badges = bossResistanceBadges({
  resisted: [{ element: 'ice', reductionPercent: 25 }],
  pierced: ['fire'],
});
assert.deepEqual(badges, [
  { element: 'ice', reductionPercent: 25, negated: false },
  { element: 'fire', reductionPercent: 0, negated: true },
], 'active and mastery-negated resistances both become persistent badges');

assert.equal(
  bossResistanceBadges({ resisted: [], pierced: ['fire'] })[0]?.negated,
  true,
  'mastery-negated resistance remains visible in the boss HUD',
);

assert.equal(
  bossResistanceBadges({ resisted: [], pierced: [] }).length,
  0,
  'stage boss and unadapted phase add no resistance row to the boss bar',
);

assert.deepEqual(bossHealthBarReadout({
  label: 'Gatekeeper', hp: 319.2, maxHp: 520, phase: 2,
}), {
  title: 'Gatekeeper  ·  PHASE 2',
  hpLabel: '320/520',
  ratio: 320 / 520,
});
assert.deepEqual(bossHealthBarReadout({
  label: 'Gatekeeper', hp: -10, maxHp: 0, phase: 1,
}), {
  title: 'Gatekeeper  ·  PHASE 1',
  hpLabel: '0/1',
  ratio: 0,
});

const sceneSource = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
assert.ok(sceneSource.includes('this.updateBossCombatInfo();'), 'boss HUD updates every frame');
assert.ok(sceneSource.includes('enemy instanceof BossEnemy && enemy.alive'), 'only a living boss is tracked');
assert.ok(sceneSource.includes('this.bossHealthBarHud.update({'), 'global boss health HUD is updated');
assert.ok(sceneSource.includes('this.bossHealthBarHud.hide();'), 'global boss health HUD hides outside boss fights');
assert.ok(sceneSource.includes('resistances: bossResistanceBadges(resistance)'),
  'global boss bar receives resistance icon data');
assert.ok(sceneSource.includes('this.syncBossResistanceRings(boss, resistance);'),
  'boss body resistance rings stay synchronized with live affinity changes');
assert.ok(sceneSource.includes('if (key === this.bossRenderedResistanceKey) return;'),
  'boss body resistance rings are not recreated every frame');
assert.ok(!sceneSource.includes('masteryBoss') && !sceneSource.includes('seedMasteryBossRun'),
  'temporary mastery boss preview is removed after playtest');
assert.ok(sceneSource.includes('저항은 마스터리로 무효'),
  'boss entrance notice distinguishes mastery-negated resistance from active reduction');
assert.ok(sceneSource.includes('resistance.resisted.map((entry) => entry.element)'),
  'boss body resistance rings omit elements negated by mastery');
assert.ok(!sceneSource.includes('bossCombatInfoHud'), 'boss-following local plate is fully removed');
assert.ok(!sceneSource.includes('패턴  '), 'persistent boss HUD does not expose pattern strategy text');
assert.ok(!sceneSource.includes('돌진 강화') && !sceneSource.includes('탄막 강화'),
  'phase notice does not expose adaptive pattern strategy text');

const hudSource = readFileSync('src/ui/bossHealthBarHud.ts', 'utf8');
assert.ok(hudSource.includes('drawBossElementIcon'), 'global boss bar renders elemental silhouettes');
assert.ok(hudSource.includes('RESISTANCE_ROW_HEIGHT'), 'resistance expands the fixed boss bar instead of floating in combat');
assert.ok(hudSource.includes("resistance.negated ? '0%'"),
  'mastery-negated resistance is visibly distinguished from active reduction');
assert.ok(!hudSource.includes("'내성'") && !hudSource.includes("'관통'"),
  'resistance row does not repeat resistance or pierce as text');

console.log('boss combat info regression: health bar and icon-only resistance badges passed');
