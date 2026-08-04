import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8').replace(/\s+/g, ' ');
const bossHud = readFileSync('src/ui/bossHealthBarHud.ts', 'utf8').replace(/\s+/g, ' ');

assert.match(bossHud, /const y = 35;/u, 'boss bar sits below the timer');
assert.match(bossHud, /const x = width \/ 2;/u, 'boss bar is centered');
assert.match(scene, /this\.add\.text\(width \/ 2, height - 20, 'WASD/u, 'controls are centered at the bottom');
assert.match(scene, /private renderResearchInspect\(\): void/u, 'research has an ESC inspector renderer');
assert.match(scene, /if \(!this\.buildInspectOpen \|\| !research\)/u, 'research detail hides outside ESC inspection');
assert.match(scene, /const noticeHeight = roomNoticeHeight\(this\.waveText\.height\);/u, 'only optional hazard notice sits below radar');
assert.doesNotMatch(scene, /RIGHT_PANEL|rightPanelHeight/u, 'legacy combined right panel removed');

console.log('hud information hierarchy regression: combat and ESC information layers passed');
