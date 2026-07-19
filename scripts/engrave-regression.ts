import assert from 'node:assert/strict';
import {
  ENGRAVE_CONFIG,
  EngraveManager,
  intervalForLevel,
  scaledPowerForLevel,
  shotCountForLevel,
} from '../src/combat-core/engrave/engraveManager';
import type { RewardOption } from '../src/run/runContract';
import type { SpellSpec } from '../src/spell/types';

function spell(name: string, power = 120, size: SpellSpec['size'] = 'medium'): SpellSpec {
  return {
    name,
    effect: 'damage',
    target: 'enemy',
    element_primary: 'fire',
    element_secondary: null,
    form: 'bolt',
    size,
    speed: 'normal',
    status: ['burn'],
    power,
    cost: 50,
  };
}

function reward(spellKey: string, level: number): RewardOption {
  return {
    id: `engrave-${spellKey}-${level}`,
    kind: 'engrave',
    title: 'test',
    description: 'test',
    engrave: { spellKey, level },
  };
}

const baseRewards: RewardOption[] = [
  { id: 'hp', kind: 'max-hp', title: 'HP', description: 'test' },
  { id: 'mana', kind: 'max-mana', title: 'MANA', description: 'test' },
  { id: 'ward', kind: 'ward-start', title: 'WARD', description: 'test' },
];

// 1) damage 수동 영창만 후보가 되고 기본 3택 한 장을 각인 카드로 치환한다.
const manager = new EngraveManager();
manager.rememberManualCast('heal', { ...spell('치유'), effect: 'heal', target: 'self' });
assert.equal(manager.injectReward(baseRewards, 1, () => 0).some((o) => o.kind === 'engrave'), false);
manager.rememberManualCast('fire ball', spell('화염구'));
const firstDraw = manager.injectReward(baseRewards, 1, () => 0);
const firstCard = firstDraw.find((option) => option.kind === 'engrave');
assert.ok(firstCard?.engrave);
assert.equal(firstCard.engrave.level, 1);
assert.equal(firstCard.element, 'fire');
assert.equal(manager.applyReward(firstCard)?.level, 1);

// 2) 슬롯 2개 상한. 빈 슬롯이 있으면 새 주문, 꽉 차면 기존 주문 강화만 제시한다.
manager.rememberManualCast('meteor', spell('유성우'));
const secondCard = manager.injectReward(baseRewards, 2, () => 0)
  .find((option) => option.kind === 'engrave');
assert.ok(secondCard?.engrave);
assert.equal(secondCard.engrave.level, 1);
manager.applyReward(secondCard);
manager.rememberManualCast('third', spell('세 번째 불꽃'));
assert.equal(manager.entries.length, ENGRAVE_CONFIG.maxSlots);
assert.equal(manager.applyReward(reward('third', 1)), null, '세 번째 슬롯 거부');
const fullDraw = manager.injectReward(baseRewards, 3, () => 0);
const upgradeCard = fullDraw.find((option) => option.kind === 'engrave');
assert.ok(upgradeCard?.engrave);
assert.equal(upgradeCard.engrave.level, 2, '슬롯이 차면 기존 각인 강화');

// 3) Lv1 6초 1발 → Lv2 6초 2발(둘째 300ms 지연) → Lv3 4초·크기 상승.
const timer = new EngraveManager();
timer.rememberManualCast('fire ball', spell('화염구', 120, 'medium'));
timer.applyReward(reward('fire ball', 1));
assert.equal(timer.update(5.9).length, 0);
const lv1 = timer.update(0.1);
assert.equal(lv1.length, 1);
assert.equal(lv1[0].spell.power, scaledPowerForLevel(120, 1));
assert.equal(lv1[0].spell.cost, 0);

timer.applyReward(reward('fire ball', 2));
const lv2 = timer.update(6);
assert.equal(lv2.length, 2);
assert.deepEqual(lv2.map((cast) => cast.delaySeconds), [0, ENGRAVE_CONFIG.secondShotDelaySeconds]);

timer.applyReward(reward('fire ball', 3));
const lv3 = timer.update(4);
assert.equal(lv3.length, 2);
assert.equal(lv3[0].spell.size, 'large');
assert.equal(timer.entries[0].intervalSeconds, ENGRAVE_CONFIG.level3IntervalSeconds);

// 4) 레벨별 발수·주기가 달라도 두 슬롯 단일 대상 지속딜은 수동의 35%로 유지한다.
for (const level of [1, 2, 3] as const) {
  const autoDpsTwoSlots = scaledPowerForLevel(120, level)
    * shotCountForLevel(level)
    / intervalForLevel(level)
    * ENGRAVE_CONFIG.maxSlots;
  const manualDps = 120 / 3;
  assert.ok(autoDpsTwoSlots / manualDps <= 0.4, `Lv${level} 오토 DPS 40% 게이트`);
  assert.equal(autoDpsTwoSlots / manualDps, 0.35, `Lv${level} 오토 DPS 35%`);
}

// 5) 두 슬롯 모두 Lv3이면 카드 미제시, 새 런 reset은 슬롯·후보·타이머를 모두 초기화한다.
manager.applyReward(reward('fire ball', 2));
manager.applyReward(reward('fire ball', 3));
manager.applyReward(reward('meteor', 2));
manager.applyReward(reward('meteor', 3));
assert.equal(manager.injectReward(baseRewards, 4, () => 0).some((o) => o.kind === 'engrave'), false);
manager.reset();
assert.equal(manager.entries.length, 0);
assert.equal(manager.update(60).length, 0);
assert.equal(manager.injectReward(baseRewards, 1, () => 0).some((o) => o.kind === 'engrave'), false);

console.log('Engrave regression: 후보·슬롯·3Lv·타이머·DPS 게이트·reset 5군 통과');
