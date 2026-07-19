import assert from 'node:assert/strict';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { GeminiJudge, JUDGE_PROMPT_VERSION, JUDGE_SCHEMA_VERSION } from '../src/spell/geminiJudge';
import { MockJudge } from '../src/spell/mockJudge';
import { validateJudgement } from '../src/spell/validate';

const judge = new MockJudge();

async function expectCast(
  text: string,
  effect: 'damage' | 'heal' | 'shield',
  target: 'enemy' | 'self' | 'area',
  primary?: 'lightning' | 'earth',
): Promise<void> {
  const result = await judge.judge(text);
  assert.equal(result.disposition, 'cast', `${text}: cast expected`);
  if (result.disposition !== 'cast') return;
  assert.equal(result.spell.effect, effect, `${text}: effect`);
  assert.equal(result.spell.target, target, `${text}: target`);
  if (primary) assert.equal(result.spell.element_primary, primary, `${text}: element`);
}

await expectCast('라이트닝 스톰', 'damage', 'area', 'lightning');
await expectCast('lightning storm', 'damage', 'area', 'lightning');
await expectCast('숲의 분노', 'damage', 'area', 'earth');
await expectCast('forest fury', 'damage', 'area', 'earth');
await expectCast('배고프다', 'heal', 'self');
await expectCast('오늘 너무 지쳤다', 'heal', 'self');
await expectCast('나를 지켜줘', 'shield', 'self');

assert.equal((await judge.judge('ㅁㄴㅇㄹ')).disposition, 'fizzle');
assert.equal((await judge.judge('asdf')).disposition, 'fizzle');
assert.equal((await judge.judge('씨발')).disposition, 'blocked');
const remoteJudge = new GeminiJudge('https://invalid.example');
assert.equal((await remoteJudge.judge('ㅁㄴㅇㄹ')).disposition, 'fizzle');
assert.equal(remoteJudge.lastSource, 'local');
assert.equal(JUDGE_SCHEMA_VERSION, 2);
assert.equal(JUDGE_PROMPT_VERSION, 'meaning-v2.2');

assert.equal(validateJudgement({ element_primary: 'fire', form: 'bolt' }), null,
  'v1 responses must not pass v2 validation');

const state = new PlayerCombatState();
state.takeDamage(40);
assert.equal(state.heal(15), 15);
assert.equal(state.hp, 75);
state.addShield(20);
const damage = state.takeDamage(25);
assert.deepEqual(damage, { hpDamage: 5, shieldDamage: 20 });
assert.equal(state.hp, 70);

console.log('Spell Understanding v2 regression: 10 inputs + player effects passed');
