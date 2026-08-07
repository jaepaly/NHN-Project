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
  'run-complete',
  'trap-room-enter',
  'elite-room-enter',
  'ui-cursor-move',
  'boss-volley-fire',
  'boss-charge-start',
  'boss-charge-end',
  'boss-hazard-spawn',
  'boss-summon',
  'boss-gravity-pull',
  'ultimate-incant-enter',
] as const;

for (const name of names) {
  assert.match(audio, new RegExp(`'${name}'`), `${name}: GameAudio registration`);
  assert.ok(existsSync(`public/assets/audio/sfx-${name}.ogg`), `${name}: deployed OGG`);
}

assert.match(audio, /'player-hit': \{ volumeScale: 1, cooldownMs: 90 \}/);
assert.match(audio, /hit: \{ volumeScale: 0\.5, cooldownMs: 35 \}/);
assert.match(audio, /'enemy-defeat': \{ volumeScale: 0\.6, cooldownMs: 50 \}/);
assert.match(audio, /'mana-crystal-pickup': \{ volumeScale: 0\.65, cooldownMs: 110 \}/);
assert.match(audio, /'trap-room-enter': \{ volumeScale: 1\.25, cooldownMs: 500 \}/);
assert.match(audio, /'elite-room-enter': \{ volumeScale: 1\.25, cooldownMs: 500 \}/);
assert.match(audio, /'boss-charge-end': \{ volumeScale: 1\.2, cooldownMs: 250 \}/);
assert.match(audio, /altar: 1\.2/);
assert.match(audio, /playBossIncantEnter\(\)[\s\S]*?SFX_KEYS\['incant-enter'\][\s\S]*?volume: volume \* 0\.55,[\s\S]*?detune: -180/);
assert.match(audio, /playBossElementCast\(element: SpellElement\)[\s\S]*?CAST_KEYS\[element\][\s\S]*?volume: volume \* 1\.1,[\s\S]*?detune: -180/);
assert.match(audio, /document\.addEventListener\('pointerover', this\.onDomPointerOver, true\)/);
assert.match(audio, /document\.addEventListener\('focusin', this\.onDomFocusIn, true\)/);
assert.match(title, /GameAudio\.preloadSfx\(this, 'title-start'\)/);
assert.match(title, /GameAudio\.playOneShot\(this, 'title-start'/);
assert.match(title, /GameAudio\.preloadSfx\(this, 'ui-confirm'\)/);
assert.match(title, /GameAudio\.preloadSfx\(this, 'ui-cursor-move'\)/);
assert.match(title, /GameAudio\.preloadBgm\(this, 'title'\)/);
assert.match(title, /this\.audio\.playBgm\('title'\)/);
assert.match(title, /this\.audio\.stopBgm\(\)/);
assert.equal(
  [...title.matchAll(/GameAudio\.playOneShot\(this, 'ui-confirm'/g)].length,
  3,
  'title settings, codex, and shop close confirmations',
);
assert.doesNotMatch(binding, /confirmSelection/, 'standard rewards use reward-select without ui-confirm');
assert.doesNotMatch(main, /confirmSelection/, 'reward binding must not inject ui-confirm');
assert.match(proto, /this\.audio\.playSfx\('route-transition'\)/);
assert.match(proto, /this\.audio\.playSfx\('run-complete'\)/);
assert.match(proto, /offerLegacyEngrave[\s\S]*?playSfx\('reward-select'\)/);
assert.match(proto, /offerResearchContract[\s\S]*?playSfx\('ui-confirm'\)/);
assert.match(proto, /roomKind === 'trap'[\s\S]*?playSfx\('trap-room-enter'\)/);
assert.match(proto, /roomKind === 'elite'[\s\S]*?playSfx\('elite-room-enter'\)/);
assert.match(proto, /spawnBossVolley[\s\S]*?playSfx\('boss-volley-fire'\)/);
assert.match(proto, /case 'charge-start':[\s\S]*?playSfx\('boss-charge-start'\)/);
assert.match(proto, /wasCharging && !enemy\.charging[\s\S]*?playSfx\('boss-charge-end'\)/);
assert.match(proto, /cancelCharge\(\)[\s\S]*?playSfx\('boss-charge-end'\)/);
assert.doesNotMatch(proto, /boss-pattern-warning/);
assert.match(proto, /warningDurationMs[\s\S]*?delayedCall[\s\S]*?playSfx\('boss-hazard-spawn'\)/);
assert.match(proto, /spawnBossMinions[\s\S]*?playSfx\('boss-summon'\)/);
assert.match(proto, /telegraphLeftBefore > 0[\s\S]*?playSfx\('boss-gravity-pull'\)/);
assert.match(proto, /openIncant[\s\S]*?castMode === 'ultimate' \? 'ultimate-incant-enter' : 'incant-enter'/);
assert.match(proto, /queueMirrorCast[\s\S]*?playBossIncantEnter\(\)/);
assert.match(proto, /fireMirrorCast[\s\S]*?playBossElementCast\(spec\.element_primary\)/);
assert.match(proto, /queueBossArcana[\s\S]*?playBossIncantEnter\(\)/);
assert.match(proto, /updateBossArcana[\s\S]*?playBossElementCast\(pending\.spec\.element_primary\)[\s\S]*?bossCastSpellAt/);
const queueMirrorCast = proto.slice(
  proto.indexOf('private queueMirrorCast'),
  proto.indexOf('private updateMirrorCast'),
);
assert.doesNotMatch(queueMirrorCast, /playSfx\('boss-hazard-spawn'\)/);
assert.doesNotMatch(queueMirrorCast, /playMirrorCast/, 'mirror sound belongs to actual fire, not telegraph');
const openRewardlessRoomChoice = proto.slice(
  proto.indexOf('private openRewardlessRoomChoice'),
  proto.indexOf('private enterMapNode'),
);
assert.doesNotMatch(openRewardlessRoomChoice, /playSfx\('room-clear'\)/, 'room-cleared event owns the cue');
assert.doesNotMatch(proto, /pendingMirrorCast = \{[\s\S]*?playSfx\('boss-appear'\)/);
assert.match(proto, /playBgm\(kind === 'altar' \? 'altar' : 'reward'\)/);
assert.match(proto, /showBossChoice[\s\S]*?this\.audio\.playSfx\('ui-confirm'\)/);
assert.match(proto, /chooseInheritedAffinity[\s\S]*?this\.audio\.playSfx\('ui-confirm'\)/);
assert.match(proto, /activatePauseMenuItem[\s\S]*?this\.audio\.playSfx\('ui-confirm'\)/);
assert.doesNotMatch(title, /showSettingsOverlay/, '타이틀도 기존 DOM 설정 창을 다시 열면 안 된다');
assert.match(title, /new GameSettingsPanel\(/, '타이틀 설정은 게임 UI 패널을 열어야 한다');
assert.match(proto, /if \(result\.hpDamage > 0\) this\.audio\.playSfx\('player-hit'\)/);
assert.equal(
  [...proto.matchAll(/if \(restored > 0\) this\.audio\.playSfx\('mana-crystal-pickup'\)/g)].length,
  2,
  'normal and room-clear sweep crystal pickup paths',
);

for (const name of ['title', 'reward', 'altar']) {
  assert.ok(existsSync(`public/assets/audio/bgm-${name}-intro.ogg`), `${name}: intro OGG`);
  assert.ok(existsSync(`public/assets/audio/bgm-${name}-loop.ogg`), `${name}: loop OGG`);
}

console.log('audio integration regression: ok');
