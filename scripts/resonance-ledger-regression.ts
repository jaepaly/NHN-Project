import assert from 'node:assert/strict';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { CombatRunController } from '../src/combat-core/run/runController';
import { buildResonanceLedger } from '../src/run/resonanceLedger';
import type { RewardOption } from '../src/run/runContract';

function reward(
  id: string,
  kind: RewardOption['kind'],
  title: string,
  description = '효과 설명',
): RewardOption {
  return { id, kind, title, description };
}

const rewards: RewardOption[] = [
  reward('hp-1', 'max-hp', '생명력 증폭'),
  reward('affinity-1', 'affinity', '화염 친화'),
  reward('affinity-2', 'affinity', '화염 친화'),
  reward('leave', 'altar-leave', '그냥 떠난다'),
  reward('altar-root', 'altar-high', '생명력 50'),
  reward('altar-meteor', 'meteor', '원소 낙성', '마법진과 함께 별똥별이 떨어집니다'),
  reward('awakening-freeze', 'awaken', '빙결 각성 · 동결', '빙결한 적에게 추가 효과'),
];

const entries = buildResonanceLedger(rewards);

// 1) 패시브 HUD 요약과 달리 같은 보상도 획득한 순서 그대로 두 번 남는다.
assert.deepEqual(
  entries.map((entry) => entry.rewardId),
  ['hp-1', 'affinity-1', 'affinity-2', 'altar-meteor', 'awakening-freeze'],
  '중간 제단 선택/거절은 빼고, 실제 보상 순서를 보존해야 한다',
);
assert.equal(entries[1].title, entries[2].title, '동일 공명도 합치지 않는다');
assert.notEqual(entries[1].rewardId, entries[2].rewardId, '각 획득 기록은 독립 항목이다');

// 2) 고위 제단과 각성은 "제단 방문"이 아니라 최종으로 얻은 효과를 남긴다.
assert.equal(entries[3].title, '원소 낙성');
assert.equal(entries[3].description, '마법진과 함께 별똥별이 떨어집니다');
assert.equal(entries[4].title, '빙결 각성 · 동결');

// 3) 목록 정보는 선택창에 바로 쓸 수 있는 최소 표시 정보를 항상 갖는다.
for (const entry of entries) {
  assert.ok(entry.category.length > 0, `${entry.rewardId}: 분류`);
  assert.ok(entry.glyph.length > 0, `${entry.rewardId}: 문양`);
  assert.ok(entry.accent.startsWith('#'), `${entry.rewardId}: 강조색`);
}

// 4) 제단의 2차 선택은 초기에 기록된 경로 카드를 최종 효과 카드로 바꾼다.
const altarRoot = reward('altar-high-root', 'altar-high', '생명력 50');
const altarResult = reward('altar-high-meteor', 'meteor', '원소 낙성');
const controller = new CombatRunController({
  playerState: new PlayerCombatState(),
  maxRooms: 2,
  rewardDraw: () => [altarRoot],
  scheduleTransition: () => undefined,
});
controller.notifyRoomCleared();
controller.chooseReward(altarRoot.id);
assert.equal(controller.replaceLatestReward(altarRoot.id, altarResult), true, '최근 제단 경로를 찾아야 한다');
assert.equal(controller.state.rewards[0].id, altarResult.id, '최종 효과만 기록에 남긴다');
assert.equal(controller.replaceLatestReward('missing', altarResult), false, '일치하는 경로가 없으면 변경하지 않는다');

console.log('resonance ledger regression: 순서 보존 · 중복 비합산 · 제단 최종 효과 · 표시 정보 · 후속 선택 교체 통과');
