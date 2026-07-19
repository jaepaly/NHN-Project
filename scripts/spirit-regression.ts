import assert from 'node:assert/strict';
import {
  ENGRAVE_CONFIG,
  intervalForLevel,
  scaledPowerForLevel,
  shotCountForLevel,
} from '../src/combat-core/engrave/engraveManager';
import {
  SPIRIT_CONFIG,
  SpiritManager,
  spiritAttackPower,
  spiritInterval,
} from '../src/combat-core/spirit/spiritManager';
import type { RewardOption, SpiritRole } from '../src/run/runContract';
import type { SpellElement, SpellForm } from '../src/spell/types';

const baseRewards: RewardOption[] = [
  { id: 'hp', kind: 'max-hp', title: 'HP', description: 'test' },
  { id: 'mana', kind: 'max-mana', title: 'MANA', description: 'test' },
  { id: 'ward', kind: 'ward-start', title: 'WARD', description: 'test' },
];

function reward(
  spiritId: string,
  role: SpiritRole,
  level: number,
  element?: SpellElement,
): RewardOption {
  return {
    id: `${spiritId}-${level}`,
    kind: 'spirit',
    title: 'test',
    description: 'test',
    element,
    spirit: { spiritId, role, level },
  };
}

// 1) 정령 카드는 정적 보상만 치환하며 기존 각인 카드와 공존한다.
const manager = new SpiritManager();
const withEngrave: RewardOption[] = [
  {
    id: 'engrave',
    kind: 'engrave',
    title: 'ENGRAVE',
    description: 'test',
    engrave: { spellKey: 'fire', level: 1 },
  },
  ...baseRewards.slice(0, 2),
];
const injected = manager.injectReward(withEngrave, 1, () => 0);
assert.equal(injected.filter((option) => option.kind === 'engrave').length, 1);
assert.equal(injected.filter((option) => option.kind === 'spirit').length, 1);
const first = injected.find((option) => option.kind === 'spirit');
assert.ok(first?.spirit);
assert.equal(manager.applyReward(first)?.level, 1);

// 2) 최대 2슬롯, 순차 Lv3 강화, 잘못된 레벨과 세 번째 슬롯을 거부한다.
assert.equal(manager.applyReward(reward('attack-water', 'attack', 1, 'water'))?.level, 1);
assert.equal(manager.entries.length, SPIRIT_CONFIG.maxSlots);
assert.equal(manager.applyReward(reward('heal', 'heal', 1)), null);
assert.equal(manager.applyReward(reward('attack-fire', 'attack', 3, 'fire')), null);
assert.equal(manager.applyReward(reward('attack-fire', 'attack', 2, 'fire'))?.level, 2);
assert.equal(manager.applyReward(reward('attack-fire', 'attack', 3, 'fire'))?.level, 3);

// 3) 8원소 공격 정령은 Lv1 bolt, Lv2부터 지정 폼, Lv3 상태·대형화를 사용한다.
const forms: Record<SpellElement, SpellForm> = {
  fire: 'nova',
  water: 'wave',
  lightning: 'chain',
  ice: 'cage',
  earth: 'zone',
  wind: 'bolt',
  light: 'beam',
  dark: 'rain',
};
for (const [element, form] of Object.entries(forms) as Array<[SpellElement, SpellForm]>) {
  const attack = new SpiritManager();
  attack.applyReward(reward(`attack-${element}`, 'attack', 1, element));
  const lv1 = attack.update(spiritInterval('attack', 1));
  assert.equal(lv1[0].kind, 'attack');
  if (lv1[0].kind !== 'attack') throw new Error('expected attack pulse');
  assert.equal(lv1[0].spell.form, 'bolt');
  attack.applyReward(reward(`attack-${element}`, 'attack', 2, element));
  const lv2 = attack.update(spiritInterval('attack', 2));
  assert.equal(lv2[0].kind, 'attack');
  if (lv2[0].kind !== 'attack') throw new Error('expected attack pulse');
  assert.equal(lv2[0].spell.form, form);
  attack.applyReward(reward(`attack-${element}`, 'attack', 3, element));
  const lv3 = attack.update(spiritInterval('attack', 3));
  assert.equal(lv3[0].kind, 'attack');
  if (lv3[0].kind !== 'attack') throw new Error('expected attack pulse');
  assert.equal(lv3[0].spell.size, 'large');
  assert.ok(lv3[0].spell.status.length > 0);
  assert.equal(lv3[0].spell.cost, 0);
}

// 4) 치유·수호 펄스와 긴 프레임의 catch-up, reset을 검증한다.
const utility = new SpiritManager();
utility.applyReward(reward('heal', 'heal', 1));
utility.applyReward(reward('guard', 'guard', 1));
const utilityPulses = utility.update(spiritInterval('heal', 1));
assert.deepEqual(utilityPulses.map((pulse) => pulse.kind).sort(), ['guard', 'heal']);
assert.equal(utilityPulses.find((pulse) => pulse.kind === 'heal')?.amount, SPIRIT_CONFIG.healAmounts[0]);
const catchUp = new SpiritManager();
catchUp.applyReward(reward('guard', 'guard', 1));
assert.equal(catchUp.update(spiritInterval('guard', 1) * 2).length, 2);
catchUp.reset();
assert.equal(catchUp.entries.length, 0);
assert.equal(catchUp.update(60).length, 0);

// 5) 각인 2슬롯 + 공격 정령 2슬롯의 단일 대상 자동 DPS 합계는 수동의 40% 이하이다.
for (const level of [1, 2, 3] as const) {
  const manualPower = SPIRIT_CONFIG.attackBasePower;
  const manualDps = manualPower / 3;
  const engraveDps = scaledPowerForLevel(manualPower, level)
    * shotCountForLevel(level)
    / intervalForLevel(level)
    * ENGRAVE_CONFIG.maxSlots;
  const spiritDps = spiritAttackPower(level)
    / spiritInterval('attack', level)
    * SPIRIT_CONFIG.maxSlots;
  assert.ok((engraveDps + spiritDps) / manualDps <= 0.4 + Number.EPSILON);
  assert.equal(Math.round(((engraveDps + spiritDps) / manualDps) * 100), 40);
}

console.log('Spirit regression: 보상 공존·2슬롯·8원소 폼·유틸 펄스·자동 DPS 40% 게이트 5군 통과');
