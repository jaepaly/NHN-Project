import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const audio = readFileSync('src/audio/gameAudio.ts', 'utf8');
const title = readFileSync('src/scenes/TitleScene.ts', 'utf8');
const proto = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
const binding = readFileSync('src/ui/runUiBinding.ts', 'utf8');
const main = readFileSync('src/main.ts', 'utf8');

const names = [
  'ui-confirm',
  'mana-crystal-pickup',
  'route-transition',
  'player-hit',
  'title-start',
] as const;

for (const name of names) {
  assert.match(audio, new RegExp(`'${name}'`), `${name}: GameAudio registration`);
  assert.ok(existsSync(`public/assets/audio/sfx-${name}.ogg`), `${name}: deployed OGG`);
}

assert.match(audio, /'player-hit': \{ volumeScale: 1, cooldownMs: 90 \}/);
assert.match(audio, /'mana-crystal-pickup': \{ volumeScale: 0\.9, cooldownMs: 70 \}/);
assert.match(title, /GameAudio\.preloadSfx\(this, 'title-start'\)/);
assert.match(title, /GameAudio\.playOneShot\(this, 'title-start'/);
assert.match(title, /GameAudio\.preloadSfx\(this, 'ui-confirm'\)/);
assert.equal(
  [...title.matchAll(/GameAudio\.playOneShot\(this, 'ui-confirm'/g)].length,
  2,
  'title settings and codex close confirmations',
);
assert.doesNotMatch(binding, /confirmSelection/, 'standard rewards use reward-select without ui-confirm');
assert.doesNotMatch(main, /confirmSelection/, 'reward binding must not inject ui-confirm');
assert.match(proto, /this\.audio\.playSfx\('route-transition'\)/);
assert.match(proto, /showBossChoice[\s\S]*?this\.audio\.playSfx\('ui-confirm'\)/);
assert.match(proto, /chooseInheritedAffinity[\s\S]*?this\.audio\.playSfx\('ui-confirm'\)/);
assert.match(proto, /activatePauseMenuItem[\s\S]*?this\.audio\.playSfx\('ui-confirm'\)/);
assert.match(proto, /showSettingsOverlay[\s\S]*?this\.audio\.playSfx\('ui-confirm'\)/);
assert.match(proto, /if \(result\.hpDamage > 0\) this\.audio\.playSfx\('player-hit'\)/);
assert.equal(
  [...proto.matchAll(/if \(restored > 0\) this\.audio\.playSfx\('mana-crystal-pickup'\)/g)].length,
  2,
  'normal and room-clear sweep crystal pickup paths',
);

console.log('audio integration regression: ok');
