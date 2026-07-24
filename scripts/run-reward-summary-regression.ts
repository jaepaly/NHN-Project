import assert from 'node:assert/strict';
import {
  ownedLabelFor,
  rewardCounts,
  summarizeRunRewards,
} from '../src/run/runRewardSummary';
import type { RewardOption } from '../src/run/runContract';

function reward(kind: RewardOption['kind'], element?: RewardOption['element']): RewardOption {
  return { id: `${kind}-${element ?? ''}-${Math.random()}`, kind, title: '', description: '', element };
}

// 1) 빈 런 — 요약 없음 (첫 방 빈 줄 방지)
assert.equal(summarizeRunRewards([]), '', '보상 없으면 빈 문자열');
assert.equal(rewardCounts([]).size, 0);

// 2) 친화는 원소별로 나뉘고 ×N으로 묶인다
const rewards: RewardOption[] = [
  reward('affinity', 'fire'),
  reward('affinity', 'fire'),
  reward('affinity', 'ice'),
  reward('swift-incant'),
];
const summary = summarizeRunRewards(rewards);
assert.ok(summary.startsWith('강화 · '), summary);
assert.ok(summary.includes('화염친화×2'), summary);
assert.ok(summary.includes('빙결친화'), summary);
assert.ok(!summary.includes('빙결친화×'), '1개는 ×N 안 붙음');
assert.ok(summary.includes('신속영창'), summary);

// 3) 각인·정령·진화는 요약에서 제외 (전용 HUD 줄이 따로 있다)
const withEngrave = summarizeRunRewards([
  reward('engrave'), reward('spirit'), reward('evolve'), reward('mana-surge'),
]);
assert.equal(withEngrave, '강화 · 마나격류', '패시브만 남는다');

// 4) 이미 보유 라벨 — 스택형만, 현재 보유 수 반영
const owned: RewardOption[] = [reward('affinity', 'fire'), reward('affinity', 'fire')];
assert.equal(ownedLabelFor(reward('affinity', 'fire'), owned), '보유 ×2', '같은 원소 친화 누적');
assert.equal(ownedLabelFor(reward('affinity', 'ice'), owned), null, '다른 원소는 미보유');
assert.equal(ownedLabelFor(reward('swift-incant'), owned), null, '미보유 스택형은 null');
assert.equal(
  ownedLabelFor(reward('swift-incant'), [reward('swift-incant')]),
  '보유 ×1',
);

// 5) 스택 무의미한 종류는 배지 없음 (max-hp·수호기점)
assert.equal(ownedLabelFor(reward('max-hp'), [reward('max-hp')]), null, 'max-hp는 배지 없음');
assert.equal(ownedLabelFor(reward('ward-start'), [reward('ward-start')]), null, '수호기점 배지 없음');

// 6) 등장 순서 보존 (먼저 고른 게 앞에)
const ordered = summarizeRunRewards([
  reward('swift-incant'), reward('affinity', 'dark'), reward('mana-surge'),
]);
assert.ok(
  ordered.indexOf('신속영창') < ordered.indexOf('암영친화')
  && ordered.indexOf('암영친화') < ordered.indexOf('마나격류'),
  `순서 보존: ${ordered}`,
);

console.log('run reward summary regression: 빈런·친화묶음·전용줄제외·보유라벨·비스택·순서 6군 통과');
