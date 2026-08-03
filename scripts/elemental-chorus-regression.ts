import assert from 'node:assert/strict';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import {
  affinityForElement,
  chorusProjectileCount,
  chorusStage,
  ELEMENTAL_CHORUS,
} from '../src/combat-core/run/elementalChorus';

const controller = new CombatRunController({ playerState: new PlayerCombatState() });
for (const element of ['fire', 'ice', 'lightning'] as const) {
  for (let i = 0; i < 15; i += 1) controller.growAffinityFromUse(element);
}

let state = controller.state;
assert.equal(state.chorusAffinity, ELEMENTAL_CHORUS.entryAffinity, '3원소 30%에서 합주 친화로 압축 전환');
assert.deepEqual(state.elementalAffinity, {}, '합주 뒤 개별 친화도는 남지 않는다');
assert.equal(chorusStage(state.elementalAffinity, state.chorusAffinity), 1);
assert.equal(chorusProjectileCount(1), 1);
assert.equal(affinityForElement(state.elementalAffinity, state.chorusAffinity, 'dark'), 0.15,
  '한 번도 쓰지 않은 원소도 공통 친화도를 받는다');

for (let i = 0; i < 8; i += 1) controller.growAffinityFromUse('dark');
state = controller.state;
assert.equal(state.chorusAffinity, 0.23, '전환 후 어느 원소를 써도 공통 게이지가 +1% 오른다');
assert.equal(chorusStage(state.elementalAffinity, state.chorusAffinity), 2);
assert.equal(chorusProjectileCount(2), 3);

for (let i = 0; i < 20; i += 1) controller.growAffinityFromUse('water');
state = controller.state;
assert.equal(state.chorusAffinity, ELEMENTAL_CHORUS.affinityCap, '합주 친화도는 30% 상한');
assert.equal(chorusStage(state.elementalAffinity, state.chorusAffinity), 3);
assert.equal(chorusProjectileCount(3), 5);
assert.ok(ELEMENTAL_CHORUS.projectilePowerScale <= 0.05,
  '공명 파편은 단일 전문 빌드의 상위 화력이 되지 않는 보조 피해');

console.log('elemental chorus regression: 개화·공통성장·단계·저피해 파편 통과');
