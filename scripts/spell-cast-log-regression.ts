import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SPELL_CAST_LOG,
  activeSpellCastLogs,
  appendSpellCastLog,
  spellCastLogAlpha,
} from '../src/ui/spellCastLogModel';

const input = (label: string, now: number, kind: 'manual' | 'auto' | 'chorus' = 'manual') => ({
  kind,
  label,
  color: '#ffffff',
  now,
});

// Blank messages do not create a row.
assert.deepEqual(appendSpellCastLog([], input('   ', 0)), []);

// Repeated automatic casts are merged instead of flooding the HUD.
let entries = appendSpellCastLog([], input('각인 · 불꽃 장판', 100, 'auto'));
entries = appendSpellCastLog(entries, input('각인 · 불꽃 장판', 900, 'auto'));
assert.equal(entries.length, 1);
assert.equal(entries[0].count, 2);
assert.equal(entries[0].expiresAt, 900 + SPELL_CAST_LOG.holdMs);

// The list keeps only the three most recent distinct events.
entries = appendSpellCastLog(entries, input('얼음창의 심판 · 빙결 사사', 1_100));
entries = appendSpellCastLog(entries, input('공명 파편 2발', 1_200, 'chorus'));
entries = appendSpellCastLog(entries, input('정령 · 불꽃 파동', 1_300, 'auto'));
assert.equal(entries.length, SPELL_CAST_LOG.maxEntries);
assert.equal(entries[0].label, '얼음창의 심판 · 빙결 사사');

// Expired rows disappear, with alpha fading only in the final window.
const live = entries.at(-1)!;
assert.equal(activeSpellCastLogs([live], live.expiresAt).length, 0);
assert.equal(spellCastLogAlpha(live, live.expiresAt), 0);
assert.equal(spellCastLogAlpha(live, live.expiresAt - SPELL_CAST_LOG.fadeMs / 2), 0.5);

// HUD wiring must expose only cast-level events and hide while the pause menu is open.
const scene = readFileSync(resolve(process.cwd(), 'src/scenes/ProtoScene.ts'), 'utf8');
assert.match(scene, /import \{ SpellCastLogHud \} from '\.\.\/ui\/spellCastLogHud';/);
assert.match(scene, /this\.spellCastLog = new SpellCastLogHud\(this\);/);
assert.match(scene, /this\.spellCastLog\.setVisible\(!visible\);/);
assert.match(scene, /this\.recordSpellLog\(\s*'manual'/);
assert.match(scene, /this\.recordSpellLog\(\s*'auto'/);
assert.match(scene, /this\.recordSpellLog\(\s*'chorus'/);

console.log('spell cast log regression: passed');
