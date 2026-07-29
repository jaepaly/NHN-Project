import assert from 'node:assert/strict';
import {
  ENGRAVE_CONFIG,
  EngraveManager,
  evolvedStatus,
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
manager.rememberManualCast('wall', { ...spell('화염벽'), form: 'wall' });
manager.rememberManualCast('orbit', { ...spell('화염 궤도'), form: 'orbit' });
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

// 4) 레벨별 발수·주기가 달라도 두 슬롯 단일 대상 지속딜은 수동의 25%로 유지한다.
for (const level of [1, 2, 3] as const) {
  const autoDpsTwoSlots = scaledPowerForLevel(120, level)
    * shotCountForLevel(level)
    / intervalForLevel(level)
    * ENGRAVE_CONFIG.maxSlots;
  const manualDps = 120 / 3;
  assert.ok(autoDpsTwoSlots / manualDps <= 0.4, `Lv${level} 오토 DPS 40% 게이트`);
  assert.equal(autoDpsTwoSlots / manualDps, 0.25, `Lv${level} 각인 DPS 25%`);
}


// 5) 진화 각인 — 3발이 되고 발당 위력은 그대로 (총괄 결정: DPS 1.5배)
{
  const ev = new EngraveManager();
  ev.rememberManualCast('fire ball', spell('화염구', 120, 'medium'));
  for (const level of [1, 2, 3] as const) ev.applyReward(reward('fire ball', level));

  const beforeCasts = ev.update(4);
  assert.equal(beforeCasts.length, 2, 'Lv3는 2발');
  assert.equal(beforeCasts.every((c) => !c.evolved), true, '진화 전엔 evolved=false');
  const perShotBefore = beforeCasts[0].spell.power;

  assert.ok(ev.evolve('fire ball', '겁화의 창'), '진화 성공');
  const afterCasts = ev.update(4);
  assert.equal(afterCasts.length, 3, '진화하면 3발');
  assert.equal(afterCasts.every((c) => c.evolved), true, '씬이 연출을 격상하도록 evolved=true');
  assert.equal(afterCasts[0].spell.power, perShotBefore,
    '발당 위력이 줄면 안 된다 — 3발로 나눠 갖는 게 아니라 한 발 더 얹는 것');
  assert.equal(afterCasts[0].spell.size, 'huge', '진화는 huge');
  assert.equal(afterCasts[0].spell.name, '겁화의 창', 'LLM 격상명');
  assert.ok(afterCasts[0].spell.status.includes('burn'), '화염 진화 = 본성(화상)이 드러난다');

  // 발마다 지연이 누적돼야 한다. 예전 `shot === 0 ? 0 : delay`면 2·3발째가 겹쳤다.
  const delays = afterCasts.map((c) => c.delaySeconds);
  assert.deepEqual(delays, [
    0,
    ENGRAVE_CONFIG.secondShotDelaySeconds,
    ENGRAVE_CONFIG.secondShotDelaySeconds * 2,
  ], '3발이 같은 시각에 겹친다');
  assert.equal(new Set(delays).size, delays.length, '지연이 중복이면 발이 뭉친다');

  // 스냅샷(HUD·저장)도 3발로 보여야 한다
  assert.equal(ev.entries[0].shotCount, 3, '스냅샷 발수');
  assert.equal(ev.entries[0].evolved, true);

  // 원소 본성 — 진화하면 그 원소의 상태이상이 붙는다 (Lv3 정령과 같은 문법).
  // fixture가 이미 burn을 달고 있으므로 여기선 **중복이 안 생기는지**를 본다.
  assert.deepEqual(afterCasts[0].spell.status, ['burn'], '화염 진화 → burn 중복 없음');

  // 없던 원소 본성이 실제로 **추가**되는지는 빙결 각인으로 따로 본다.
  {
    const ice = new EngraveManager();
    const iceSpell: SpellSpec = { ...spell('얼음창'), element_primary: 'ice', status: [] };
    ice.rememberManualCast('ice spear', iceSpell);
    for (const level of [1, 2, 3] as const) ice.applyReward(reward('ice spear', level));
    assert.deepEqual(ice.update(4)[0].spell.status, [], '진화 전엔 상태이상 없음');
    ice.evolve('ice spear', '설한의 창');
    assert.deepEqual(ice.update(4)[0].spell.status, ['freeze'], '빙결 진화 → freeze 추가');
  }

  // 두 번 진화되지 않는다
  assert.equal(ev.evolve('fire ball', '두번째'), null, '이미 진화한 슬롯은 재진화 불가');
  assert.equal(ev.entries[0].spell.name, '겁화의 창', '재진화 시도가 이름을 덮으면 안 된다');
}

// 6) 진화의 DPS 영향 — §0 게이트를 **의도적으로** 연 결과를 수치로 고정한다.
// 여기가 깨지면 밸런스가 소리 없이 움직인 것이다. 총괄이 값을 보고 판단해야 한다.
{
  const dps = (level: 1 | 2 | 3, evolved: boolean) => scaledPowerForLevel(120, level)
    * shotCountForLevel(level, evolved)
    / intervalForLevel(level)
    * ENGRAVE_CONFIG.maxSlots / (120 / 3);

  assert.equal(dps(3, false), 0.25, 'Lv3 두 슬롯 = 수동의 25% (기존)');
  assert.equal(dps(3, true), 0.375, '진화 두 슬롯 = 37.5% (1.5배)');
  // 각인만 놓고 보면 여전히 40% 게이트 안이다
  assert.ok(dps(3, true) <= 0.4, '각인 단독 40% 게이트는 유지');
  // 다만 정령 15%까지 더하면 자동 피해 총합이 40%를 넘는다 — 알고 넘기는 것이다
  assert.ok(dps(3, true) + 0.15 > 0.4,
    '전제가 바뀌었다 — 진화 2슬롯+정령이 40% 이하면 이 주석을 갱신하라');
  assert.equal(+(dps(3, true) + 0.15).toFixed(3), 0.525, '자동 피해 총합 52.5%');
}

// 7) 두 슬롯 모두 Lv3이면 카드 미제시, 새 런 reset은 슬롯·후보·타이머를 모두 초기화한다.
manager.applyReward(reward('fire ball', 2));
manager.applyReward(reward('fire ball', 3));
manager.applyReward(reward('meteor', 2));
manager.applyReward(reward('meteor', 3));
assert.equal(manager.injectReward(baseRewards, 4, () => 0).some((o) => o.kind === 'engrave'), false);
manager.reset();
assert.equal(manager.entries.length, 0);
assert.equal(manager.update(60).length, 0);
assert.equal(manager.injectReward(baseRewards, 1, () => 0).some((o) => o.kind === 'engrave'), false);

console.log('Engrave regression: 후보·슬롯·3Lv·타이머·DPS 게이트·진화3발·진화DPS·reset 7군 통과');

// ── 진화 상태이상 — 본성 부여와 부속성 폴백 (#216 항목8) ─────────────
{
  const base = (over: Partial<SpellSpec> = {}): SpellSpec => ({
    ...spell('x'), element_primary: 'fire', element_secondary: null, status: [], ...over,
  });

  // 원본에 없으면 주속성 본성을 더한다
  assert.deepEqual(evolvedStatus(base()), ['burn'], '화염 → 화상');
  assert.deepEqual(
    evolvedStatus(base({ element_primary: 'ice' })), ['freeze'], '빙결 → 빙결',
  );
  // 기존 상태이상은 보존한 채 덧붙인다
  assert.deepEqual(
    evolvedStatus(base({ status: ['slow'] })), ['slow', 'burn'], '기존 것 위에 얹는다',
  );

  // 이미 본성이 있으면 → 부속성의 본성이 드러난다
  assert.deepEqual(
    evolvedStatus(base({ status: ['burn'], element_secondary: 'ice' })),
    ['burn', 'freeze'],
    '주속성 본성이 이미 있으면 부속성 본성으로 폴백',
  );
  // 부속성 본성까지 이미 있으면 그대로 (중복 금지)
  assert.deepEqual(
    evolvedStatus(base({ status: ['burn', 'freeze'], element_secondary: 'ice' })),
    ['burn', 'freeze'],
    '둘 다 있으면 변화 없음 — 중복을 만들지 않는다',
  );
  // 단일 원소 + 이미 본성 → 그대로. 주보상(3발·huge·격상명)은 별도로 주어진다
  assert.deepEqual(
    evolvedStatus(base({ status: ['burn'] })), ['burn'],
    '단일 원소는 폴백 대상이 없다 — 정상 동작',
  );

  // 순수성: 원본 배열을 만지지 않는다
  const src = base({ status: ['slow'] });
  const snapshot = [...src.status];
  evolvedStatus(src);
  assert.deepEqual(src.status, snapshot, '입력 불변');
}
