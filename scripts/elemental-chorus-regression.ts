import assert from 'node:assert/strict';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import {
  affinityForElement,
  chorusEntryAffinity,
  chorusProjectileCount,
  chorusStage,
  ELEMENTAL_CHORUS,
} from '../src/combat-core/run/elementalChorus';

const controller = new CombatRunController({ playerState: new PlayerCombatState() });
controller.seedAffinity({ fire: 0.15, ice: 0.15, lightning: 0.15 });
assert.equal(controller.state.chorusAffinity, null,
  '제단·카드가 3원소 친화를 올려도 실제 영창 없이 합주를 강제하지 않는다');
assert.equal(controller.state.chorusAvailable, true, '친화 조건을 채우면 합주 전환 선택지는 열린다');
controller.reset();
for (const element of ['fire', 'ice', 'lightning'] as const) {
  for (let i = 0; i < 8; i += 1) controller.growAffinityFromUse(element);
}

assert.equal(controller.state.chorusAffinity, null, '조건 달성만으로 개별 친화도를 강제 압축하지 않는다');
assert.equal(controller.state.chorusAvailable, true, '직접 영창으로도 합주 전환 선택지가 열린다');
assert.equal(controller.activateElementalChorus(), true, '플레이어 선택으로 합주 전환');
let state = controller.state;
assert.equal(state.chorusAffinity, 0.16, '사용 성장 단위(2%)로 3원소 16%에서 합주 친화로 압축 전환');
assert.deepEqual(state.elementalAffinity, {}, '합주 뒤 개별 친화도는 남지 않는다');
assert.equal(chorusStage(state.elementalAffinity, state.chorusAffinity), 1);
assert.equal(chorusProjectileCount(1), 1);
assert.equal(affinityForElement(state.elementalAffinity, state.chorusAffinity, 'dark'), 0.16,
  '한 번도 쓰지 않은 원소도 공통 친화도를 받는다');

for (let i = 0; i < 7; i += 1) controller.growAffinityFromUse('dark');
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
assert.ok(ELEMENTAL_CHORUS.rewardAffinityBonus <= 0.03,
  '합주 친화 카드는 한 장으로 최대 단계에 도달하지 않는 소량 성장');

assert.equal(
  chorusEntryAffinity({ fire: 0.3, ice: 0.3, lightning: 0.15 }),
  ELEMENTAL_CHORUS.entryAffinityCap,
  '개화 전 추가 투자분은 평균으로 반영하되 20%까지만 보존한다',
);

console.log('elemental chorus regression: 개화·공통성장·단계·저피해 파편 통과');
