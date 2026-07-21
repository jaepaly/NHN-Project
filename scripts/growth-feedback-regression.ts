import assert from 'node:assert/strict';
import {
  GROWTH_FEEDBACK_CONFIG,
  auraElement,
  colorFor,
  gainLabelFor,
  runeRingCount,
} from '../src/render/growthFeedbackConfig';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';
import { ELEMENT_PALETTES } from '../src/render/palette';
import type { RewardOption } from '../src/run/runContract';

function option(partial: Partial<RewardOption> & Pick<RewardOption, 'kind'>): RewardOption {
  return { id: 't', title: 't', description: 't', ...partial };
}

// 1) 부상 텍스트 — 증가분이 실제 적용 수치와 같은 출처를 쓴다 (표시/적용 불일치 방지)
assert.equal(
  gainLabelFor(option({ kind: 'max-hp' })).text,
  `+${RUN_REWARD_CONFIG.maxHpIncrease} MAX HP`,
  'HP 증가분은 RUN_REWARD_CONFIG 기준',
);
assert.equal(
  gainLabelFor(option({ kind: 'max-mana' })).text,
  `+${RUN_REWARD_CONFIG.maxManaIncrease} MAX MANA`,
  '마나 증가분',
);
assert.equal(
  gainLabelFor(option({ kind: 'affinity', element: 'fire' })).text,
  `화염 위력 +${Math.round(RUN_REWARD_CONFIG.affinityBonus * 100)}%`,
  '친화는 원소명 + 퍼센트',
);
assert.equal(
  gainLabelFor(option({ kind: 'swift-incant' })).text,
  `영창 쿨다운 -${RUN_REWARD_CONFIG.swiftIncantReduction}s`,
  '쿨다운 감소',
);
assert.equal(
  gainLabelFor(option({ kind: 'mana-surge' })).text,
  `마나 획득 +${Math.round(RUN_REWARD_CONFIG.manaSurgeGainBonus * 100)}% · 흡수 범위 증가`,
  '마나 획득과 흡수 범위',
);
assert.equal(
  gainLabelFor(option({ kind: 'ward-start' })).text,
  `방 개막 보호막 +${RUN_REWARD_CONFIG.wardStartShield}`,
  '수호 기점',
);

// 2) 성장 카드 라벨 — 레벨·진화 종류가 드러난다
assert.equal(
  gainLabelFor(option({ kind: 'engrave', engrave: { spellKey: 'k', level: 2 } })).text,
  '각인 Lv2',
);
assert.equal(
  gainLabelFor(option({ kind: 'spirit', spirit: { spiritId: 's', role: 'attack', level: 3 } })).text,
  '정령 Lv3',
);
assert.equal(
  gainLabelFor(option({
    kind: 'evolve',
    evolve: { target: 'engrave', engraveKey: 'k', elements: ['fire'] },
  })).text,
  '각인 진화',
);
assert.equal(
  gainLabelFor(option({
    kind: 'evolve',
    evolve: { target: 'spirit-fuse', spiritIds: ['a', 'b'], elements: ['fire', 'ice'] },
  })).text,
  '정령 융합',
  '융합과 진화는 다른 문구',
);
// 데이터가 없어도 라벨은 항상 나온다 (연출이 보상 흐름을 막지 않는다)
assert.ok(gainLabelFor(option({ kind: 'engrave' })).text.length > 0, '각인 데이터 없어도 라벨');
assert.ok(gainLabelFor(option({ kind: 'evolve' })).text.length > 0, '진화 데이터 없어도 라벨');

// 3) 색 규칙 — 원소가 있으면 원소색(카드 UI와 동일 규칙), 없으면 종류색
assert.equal(
  colorFor(option({ kind: 'affinity', element: 'ice' })),
  ELEMENT_PALETTES.ice.core,
  '원소 카드는 원소 core 색',
);
assert.equal(
  colorFor(option({ kind: 'engrave', element: 'dark' })),
  ELEMENT_PALETTES.dark.core,
  '각인도 원소색 우선',
);
assert.notEqual(
  colorFor(option({ kind: 'max-hp' })),
  colorFor(option({ kind: 'ward-start' })),
  '원소 없는 종류끼리는 서로 구분되는 색',
);

// 4) 룬 링 — 보상 수에 비례하되 상한이 있다 (화면이 링으로 뒤덮이지 않게)
assert.equal(runeRingCount(0), 0, '보상 없으면 링 없음');
assert.equal(runeRingCount(3), 3, '보상 수만큼');
assert.equal(
  runeRingCount(99),
  GROWTH_FEEDBACK_CONFIG.runeRingMaxCount,
  '상한 적용',
);
assert.equal(runeRingCount(-5), 0, '음수 방어');
assert.equal(runeRingCount(2.7), 2, '정수 내림');
assert.equal(runeRingCount(Number.NaN), 0, 'NaN 방어');

// 5) 친화 오라 — 최다 친화 원소, 없으면 null
assert.equal(auraElement({}), null, '친화 없으면 오라 없음');
assert.equal(auraElement({ fire: 0.15 }), 'fire', '단일 친화');
assert.equal(auraElement({ fire: 0.15, water: 0.3 }), 'water', '최다 친화 원소');
assert.equal(auraElement({ fire: 0.3, water: 0.3 }), 'fire', '동률이면 먼저 획득한 쪽 유지');
assert.equal(auraElement({ fire: 0 }), null, '0은 친화로 치지 않음');

console.log('GrowthFeedback regression: 부상 텍스트·성장 라벨·색 규칙·룬 링 상한·친화 오라 5군 통과');
