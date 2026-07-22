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

// 한글 외래어(콩글리시) — 실플레이에서 가장 흔한 입력. Mock 폴백에서도 원소가 살아야 한다.
// (사용자 제보: "파이어볼"·"아쿠아 펀치"가 전부 질풍으로 판정되던 회귀)
await expectCast('파이어볼', 'damage', 'enemy', 'fire');
await expectCast('아쿠아 펀치', 'damage', 'enemy', 'water');
await expectCast('썬더 볼트', 'damage', 'enemy', 'lightning');
await expectCast('아이스 애로우', 'damage', 'enemy', 'ice');
await expectCast('다크 오라', 'damage', 'enemy', 'dark');
await expectCast('힐링 라이트', 'heal', 'self', 'light');

// 한국어 활용형 — 어간이 기본 명사와 달라 사전에 없으면 기본 원소로 떨어진다
// (사용자 QA 제보: "얼어붙은 창"이 ice가 아니라 wind로 판정되던 회귀)
await expectCast('얼어붙은 창을 꽂는다', 'damage', 'enemy', 'ice');
// "얼려버리는"은 원소가 ice이면서 효과는 control — 얼리면 멈추는 게 자연스럽다
await expectCast('얼려버리는 한기', 'control', 'area', 'ice');
await expectCast('활활 태우는 열기', 'damage', 'enemy', 'fire');
await expectCast('어두운 그늘이 덮친다', 'damage', 'enemy', 'dark');
await expectCast('감전시키는 전류', 'damage', 'enemy', 'lightning');

// '락'(rock)이 "벼락"에 걸려 번개를 대지로 오판시키던 오탐 — 재발 방지
await expectCast('내리치는 벼락', 'damage', 'enemy', 'lightning');
// '심연'은 물이 아니라 어둠의 은유로 쓴다 (라이브 Gemini 판정과 일치)
await expectCast('집어삼키는 심연', 'damage', 'enemy', 'dark');

// 부분 문자열 오탐 방지: 긴 키워드가 짧은 키워드를 이긴다
await expectCast('라이트닝 스톰', 'damage', 'area', 'lightning');
// "힐링"의 '링'이 orbit 폼으로, "존재"의 '존'이 zone 폼으로 새지 않는다
const healing = await judge.judge('힐링 라이트');
assert.equal(healing.disposition, 'cast');
if (healing.disposition === 'cast') assert.notEqual(healing.spell.form, 'orbit');

// 외래어도 원소가 잡히면 위력 상한이 풀린다 (의미 없는 입력만 40으로 묶임)
const fireball = await judge.judge('거대한 파이어볼을 적에게 날린다');
assert.equal(fireball.disposition, 'cast');
if (fireball.disposition === 'cast') {
  assert.ok(fireball.spell.power > 40, `외래어 주문 power가 상한에 묶임: ${fireball.spell.power}`);
}

const controlChain = await judge.judge('적들을 연쇄 속박');
assert.equal(controlChain.disposition, 'cast');
if (controlChain.disposition === 'cast') {
  assert.equal(controlChain.spell.effect, 'control');
  assert.equal(controlChain.spell.form, 'chain');
}

assert.equal((await judge.judge('ㅁㄴㅇㄹ')).disposition, 'fizzle');
assert.equal((await judge.judge('asdf')).disposition, 'fizzle');
assert.equal((await judge.judge('씨발')).disposition, 'blocked');
const remoteJudge = new GeminiJudge('https://invalid.example');
assert.equal((await remoteJudge.judge('ㅁㄴㅇㄹ')).disposition, 'fizzle');
assert.equal(remoteJudge.lastSource, 'local');
assert.equal(JUDGE_SCHEMA_VERSION, 2);
assert.equal(JUDGE_PROMPT_VERSION, 'meaning-v2.3'); // v2.3: 소환 behavior DSL 추가 (#101)

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

console.log('Spell Understanding v2 regression: 27 inputs(외래어 8종·활용형 7종 포함) + player effects passed');
