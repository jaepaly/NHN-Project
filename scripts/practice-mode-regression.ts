import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRACTICE_DUMMY_CONFIG,
  consumePracticeRunRequest,
  requestPracticeRun,
} from '../src/dev/practiceMode';

assert.equal(consumePracticeRunRequest(), false);
requestPracticeRun();
assert.equal(consumePracticeRunRequest(), true);
assert.equal(PRACTICE_DUMMY_CONFIG.maxHp, 450);
assert.ok(PRACTICE_DUMMY_CONFIG.regenerationPerSecond > 0);

const title = readFileSync('src/scenes/TitleScene.ts', 'utf8').replace(/\s+/g, ' ');
const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8').replace(/\s+/g, ' ');
const dummy = readFileSync('src/dev/trainingDummyEnemy.ts', 'utf8').replace(/\s+/g, ' ');

assert.match(title, /if \(import\.meta\.env\.DEV\) this\.createPracticeTab\(width, height\);/u);
assert.match(title, /requestPracticeRun\(\); this\.startGame\(\);/u);
assert.match(scene, /const practice = import\.meta\.env\.DEV && consumePracticeRunRequest\(\);[\s\S]*?if \(practice\) this\.seedPracticeRun\(\);/u);
assert.match(scene, /encounterLine = 'PRACTICE · 고정 표적';/u);
assert.match(scene, /this\.roomRadar\.setStatus\(roomLine, encounterLine\);/u);
assert.match(scene, /if \(this\.practiceRun\) this\.playerState\.restoreMana\(this\.playerState\.maxMana\);/u);
assert.match(dummy, /readonly kind = 'boss' as const;/u);
assert.match(dummy, /get canDealContactDamage\(\): boolean \{ return false; \}/u);
assert.doesNotMatch(dummy, /this\.view\.[xy] \+=/u);

console.log('practice mode regression: practice state works through room radar passed');
