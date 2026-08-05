import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bossCombatInfoLines } from '../src/ui/bossCombatInfoModel';
import { bossHealthBarReadout } from '../src/ui/bossHealthBarModel';

const localLines = bossCombatInfoLines({
  counterStrategy: 'rush',
  resistance: {
    resisted: [{ element: 'ice', reductionPercent: 25 }],
    pierced: ['fire'],
  },
});
assert.equal(localLines.length, 3, 'local plate contains only resistance, pierce, and pattern');

assert.deepEqual(
  bossCombatInfoLines({
    counterStrategy: null,
    resistance: { resisted: [], pierced: [] },
  }).length,
  1,
  'local plate omits absent resistance lines',
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
assert.ok(!sceneSource.includes('bossCombatInfoLines({\n      label:'), 'local plate does not duplicate HP and phase');

console.log('boss combat info regression: global HP and local tactics separation passed');
