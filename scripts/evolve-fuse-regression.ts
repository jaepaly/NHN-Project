import assert from 'node:assert/strict';
import {
  ENGRAVE_CONFIG,
  EngraveManager,
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
import {
  buildEvolveOption,
  injectEvolveReward,
} from '../src/combat-core/evolve/evolveRewards';
import {
  autoSpellImpactDamageFromPower,
  spellImpactDamageFromPower,
} from '../src/combat-core/combat/combatConfig';
import { ZONE_CONFIG, RAIN_CONFIG } from '../src/combat-core/combat/areaSpellConfig';
import { CHAIN_CONFIG } from '../src/combat-core/combat/advancedFormConfig';
import type { RewardOption } from '../src/run/runContract';
import type { SpellSpec } from '../src/spell/types';

function damageSpell(name: string, element: SpellSpec['element_primary']): SpellSpec {
  return {
    name,
    effect: 'damage',
    target: 'enemy',
    element_primary: element,
    element_secondary: null,
    form: 'bolt',
    size: 'medium',
    speed: 'normal',
    status: [],
    power: 50,
    cost: 30,
  };
}

function engraveTo(manager: EngraveManager, key: string, spell: SpellSpec, level: number): void {
  manager.rememberManualCast(key, spell);
  for (let next = 1; next <= level; next++) {
    const applied = manager.applyReward({
      id: `${key}-${next}`,
      kind: 'engrave',
      title: 'test',
      description: 'test',
      engrave: { spellKey: key, level: next },
    });
    assert.ok(applied, `각인 Lv${next} 적용 실패`);
  }
}

function spiritReward(spiritId: string, role: 'attack' | 'heal' | 'guard', level: number): RewardOption {
  return {
    id: `${spiritId}-${level}`,
    kind: 'spirit',
    title: 'test',
    description: 'test',
    spirit: { spiritId, role, level },
  };
}

// 1) 각인 진화 게이트 — Lv3 + 동일 원소 친화 + 미진화만 후보다.
{
  const manager = new EngraveManager();
  engraveTo(manager, 'fireball', damageSpell('화염구', 'fire'), 3);
  assert.equal(manager.evolveCandidates({}).length, 0, '친화 없으면 후보 없음');
  assert.equal(manager.evolveCandidates({ water: 0.15 }).length, 0, '다른 원소 친화는 무효');
  assert.equal(manager.evolveCandidates({ fire: 0.15 }).length, 1, 'Lv3+화염 친화 → 후보');

  const low = new EngraveManager();
  engraveTo(low, 'spark', damageSpell('불꽃', 'fire'), 2);
  assert.equal(low.evolveCandidates({ fire: 0.15 }).length, 0, 'Lv3 미만은 후보 아님');

  // 진화: 개명 + huge 시전 + DPS 예산 불변
  assert.equal(manager.evolve('fireball', '  '), null, '빈 이름 거부');
  const evolved = manager.evolve('fireball', '멸망의 태양 낙하');
  assert.ok(evolved?.evolved, '진화 성공');
  assert.equal(evolved?.spell.name, '멸망의 태양 낙하', 'LLM 격상명 반영');
  assert.equal(manager.evolve('fireball', '또다른이름'), null, '이중 진화 거부');
  assert.equal(manager.evolveCandidates({ fire: 0.15 }).length, 0, '진화 후 후보에서 제외');

  const casts = manager.update(intervalForLevel(3));
  assert.ok(casts.length > 0, '진화 각인 자동 시전 발생');
  assert.equal(casts[0].spell.size, 'huge', '진화 시전은 huge');
  assert.equal(casts[0].spell.name, '멸망의 태양 낙하', '시전 spec에 격상명');
  assert.equal(
    casts[0].spell.power,
    scaledPowerForLevel(50, 3),
    '진화해도 power 예산 불변 (40% 게이트)',
  );
}

// 2) 정령 융합 — 공격 2체만 후보, 소모→이중 원소 1체(2슬롯·2배 예산·huge).
{
  const manager = new SpiritManager();
  manager.applyReward(spiritReward('attack-fire', 'attack', 1));
  manager.applyReward(spiritReward('heal', 'heal', 1));
  assert.equal(manager.fuseCandidate(), null, '공격 1체+치유는 융합 불가');

  const dual = new SpiritManager();
  dual.applyReward(spiritReward('attack-fire', 'attack', 1));
  dual.applyReward(spiritReward('attack-lightning', 'attack', 1));
  const candidate = dual.fuseCandidate();
  assert.deepEqual(candidate?.elements, ['fire', 'lightning'], '융합 후보 원소 2개');

  assert.equal(dual.fuse(['attack-fire', 'attack-fire'], '이름'), null, '동일 정령 2회 거부');
  assert.equal(dual.fuse(['attack-fire', 'heal'], '이름'), null, '비공격 정령 거부');
  const fused = dual.fuse(candidate!.spiritIds, '작열하는 뇌운');
  assert.ok(fused?.fused, '융합 성공');
  assert.equal(fused?.element, 'fire', '주속성');
  assert.equal(fused?.elementSecondary, 'lightning', '부속성');
  assert.equal(dual.entries.length, 1, '2체 소모 → 1체');
  assert.equal(dual.slotCount(), SPIRIT_CONFIG.maxSlots, '융합체는 2슬롯 점유');
  assert.equal(
    dual.applyReward(spiritReward('attack-ice', 'attack', 1)),
    null,
    '슬롯 가득 — 새 계약 불가 (게이트 우회 차단)',
  );

  const pulses = dual.update(spiritInterval('attack', 3));
  assert.equal(pulses[0].kind, 'attack');
  if (pulses[0].kind !== 'attack') throw new Error('expected attack pulse');
  assert.equal(pulses[0].spell.element_secondary, 'lightning', '이중 원소 시전');
  assert.equal(pulses[0].spell.size, 'huge', '융합 시전은 huge');
  assert.equal(pulses[0].spell.name, '작열하는 뇌운', '격상명 반영');
  assert.equal(
    pulses[0].spell.power,
    spiritAttackPower(3) * 2,
    '2슬롯 예산 — 슬롯당 DPS 불변',
  );
  assert.ok(pulses[0].spell.status.length >= 2, '두 원소 상태이상 결합');
}

// 3) 진화 카드 생성·주입 — 정적 카드만 치환하고 성장 카드는 보존한다.
{
  const engrave = new EngraveManager();
  const spirit = new SpiritManager();
  assert.equal(
    buildEvolveOption(2, engrave, spirit, { fire: 0.15 }, () => 0),
    null,
    '후보 없으면 카드 없음',
  );

  engraveTo(engrave, 'fireball', damageSpell('화염구', 'fire'), 3);
  const option = buildEvolveOption(2, engrave, spirit, { fire: 0.15 }, () => 0);
  assert.equal(option?.kind, 'evolve');
  assert.equal(option?.evolve?.target, 'engrave');
  assert.equal(option?.evolve?.engraveKey, 'fireball');

  const cards: RewardOption[] = [
    { id: 'a', kind: 'max-hp', title: 'HP', description: 't' },
    {
      id: 'b', kind: 'engrave', title: 'ENG', description: 't',
      engrave: { spellKey: 'x', level: 1 },
    },
    {
      id: 'c', kind: 'spirit', title: 'SPI', description: 't',
      spirit: { spiritId: 'heal', role: 'heal', level: 1 },
    },
  ];
  const injected = injectEvolveReward(cards, option, () => 0.9);
  assert.equal(injected.filter((card) => card.kind === 'evolve').length, 1, '진화 카드 1장');
  assert.equal(injected.filter((card) => card.kind === 'engrave').length, 1, '각인 카드 보존');
  assert.equal(injected.filter((card) => card.kind === 'spirit').length, 1, '정령 카드 보존');
  assert.equal(injected.find((card) => card.kind === 'evolve')?.id, option?.id, '정적 카드 자리에 주입');

  const growthOnly: RewardOption[] = [cards[1], cards[2]];
  assert.deepEqual(
    injectEvolveReward(growthOnly, option, () => 0),
    growthOnly,
    '정적 카드 없으면 주입 생략',
  );
}

// 4) 오토 DPS 총합 게이트 — 진화·융합을 끼워도 수동의 40%를 넘지 않는다.
{
  const manualDps = SPIRIT_CONFIG.attackBasePower / 3;
  const engraveDps = scaledPowerForLevel(SPIRIT_CONFIG.attackBasePower, 3)
    * shotCountForLevel(3) / intervalForLevel(3) * ENGRAVE_CONFIG.maxSlots; // 진화 = Lv3와 동일 예산
  const fusedDps = (spiritAttackPower(3) * 2) / spiritInterval('attack', 3); // 융합 = 2슬롯 예산
  assert.ok((engraveDps + fusedDps) / manualDps <= 0.4 + Number.EPSILON, '진화+융합 총합 ≤ 40%');
  assert.equal(Math.round(((engraveDps + fusedDps) / manualDps) * 100), 40, '정확히 40%');
}

// 6) 실피해 정합 (PR #39 R1 리뷰) — 오토 시전은 반올림·최소 피해 1 없이 정확값을 쓴다.
//    수동 변환은 저출력·다타격 폼에서 게이트를 부풀린다: 각인 Lv1 12.5→13,
//    zone 10틱 × 0.08배는 틱당 min 1로 승격돼 펄스당 10 (의도 0.8×power).
{
  // 수동 경로는 불변: 타격별 반올림 + 최소 피해 1 유지
  assert.equal(spellImpactDamageFromPower(12.5, 1), 13, '수동: 반올림 유지');
  assert.equal(spellImpactDamageFromPower(7.5, 0.08), 1, '수동: 최소 피해 1 유지');

  // 오토 경로: 정확값 — 산술 게이트(power/주기)와 실전이 항상 일치
  assert.equal(autoSpellImpactDamageFromPower(12.5, 1), 12.5, '오토: 비반올림');
  assert.equal(autoSpellImpactDamageFromPower(7.5, 0.08), 0.6, '오토: 바닥(min 1) 미적용');
  assert.equal(autoSpellImpactDamageFromPower(-5, 2), 0, '오토: 음수 방어');

  // 최악 케이스였던 대지 정령 zone: 펄스 총피해 = power × (틱수 × 틱배율) ≤ power
  const zoneTotalMultiplier = ZONE_CONFIG.tickCount * ZONE_CONFIG.damageMultiplierPerTick;
  const earthLv2Power = spiritAttackPower(2);
  const zonePulseDamage = autoSpellImpactDamageFromPower(earthLv2Power, zoneTotalMultiplier);
  assert.ok(zonePulseDamage <= earthLv2Power, 'zone 펄스 총피해가 power 예산 이내');
  const inflated = spellImpactDamageFromPower(earthLv2Power, ZONE_CONFIG.damageMultiplierPerTick)
    * ZONE_CONFIG.tickCount;
  assert.ok(inflated > earthLv2Power, '(대조) 수동 변환이면 바닥 승격으로 예산 초과였다');

  // chain: 단일 대상 기준 최초 타격 배율 1, 이후 감쇠 — 대상당 피해가 power를 넘지 않는다
  assert.equal(CHAIN_CONFIG.damageMultipliers[0], 1, 'chain 최초 배율 1');
  for (let i = 1; i < CHAIN_CONFIG.damageMultipliers.length; i++) {
    assert.ok(
      CHAIN_CONFIG.damageMultipliers[i] < CHAIN_CONFIG.damageMultipliers[i - 1],
      'chain 배율 단조 감소',
    );
  }
  // rain: 타격당 배율 ≤ 1 (타격은 공간 분산 — 단일 소형 적 기준 1~2회 피격)
  assert.ok(RAIN_CONFIG.damageMultiplierPerStrike <= 1, 'rain 타격당 배율 ≤ 1');
}

// 5) reset — 융합·진화 상태가 새 런에서 초기화된다.
{
  const spirit = new SpiritManager();
  spirit.applyReward(spiritReward('attack-fire', 'attack', 1));
  spirit.applyReward(spiritReward('attack-ice', 'attack', 1));
  spirit.fuse(['attack-fire', 'attack-ice'], '서리불꽃');
  spirit.reset();
  assert.equal(spirit.slotCount(), 0, '정령 reset');

  const engrave = new EngraveManager();
  engraveTo(engrave, 'fireball', damageSpell('화염구', 'fire'), 3);
  engrave.evolve('fireball', '멸망의 태양 낙하');
  engrave.reset();
  assert.equal(engrave.entries.length, 0, '각인 reset');
  assert.equal(engrave.evolveCandidates({ fire: 0.15 }).length, 0, '진화 후보 reset');
}

console.log('EvolveFuse regression: 진화 게이트·융합 소모·카드 주입·40% 게이트·실피해 정합·reset 6군 통과');
