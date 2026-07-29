import assert from 'node:assert/strict';
import {
  BUILD_CHIP_CONFIG,
  buildChipModel,
  cooldownRatio,
  spiritFallbackElement,
} from '../src/run/buildChipModel';
import type { EngravedSpellSnapshot } from '../src/combat-core/engrave/engraveManager';
import type { SpiritSnapshot } from '../src/combat-core/spirit/spiritManager';
import type { SpellSpec } from '../src/spell/types';

const spell = (over: Partial<SpellSpec> = {}): SpellSpec => ({
  name: '화염구',
  effect: 'damage',
  target: 'enemy',
  element_primary: 'fire',
  element_secondary: null,
  form: 'bolt',
  size: 'medium',
  speed: 'normal',
  status: [],
  power: 60,
  cost: 20,
  ...over,
});

const engrave = (over: Partial<EngravedSpellSnapshot> = {}): EngravedSpellSnapshot => ({
  spellKey: '화염구',
  level: 1,
  spell: spell(),
  intervalSeconds: 4,
  shotCount: 1,
  remainingSeconds: 2,
  evolved: false,
  ...over,
});

const spirit = (over: Partial<SpiritSnapshot> = {}): SpiritSnapshot => ({
  spiritId: 's1',
  role: 'attack',
  element: 'ice',
  level: 2,
  intervalSeconds: 5,
  remainingSeconds: 1,
  fused: false,
  ...over,
});

// 1) 항상 정확히 4칸 — 비어 있어도 자리를 지킨다 (위치가 곧 정체성)
const empty = buildChipModel([], []);
assert.equal(empty.length, BUILD_CHIP_CONFIG.engraveSlots + BUILD_CHIP_CONFIG.spiritSlots);
assert.deepEqual(empty.map((c) => c.kind), ['engrave', 'engrave', 'spirit', 'spirit'], '각인 먼저, 정령 뒤');
assert.ok(empty.every((c) => !c.filled), '전부 빈 칸');
assert.ok(empty.every((c) => c.detail.length > 0), '빈 칸도 안내 문구를 준다');
assert.deepEqual(empty.map((c) => c.slot), [0, 1, 0, 1], '행 안의 자리 번호');

// 2) 슬롯 초과분은 버린다 — 칸이 늘면 고정 기하가 깨진다
const over = buildChipModel(
  [engrave(), engrave({ spellKey: 'b' }), engrave({ spellKey: 'c' })],
  [spirit(), spirit({ spiritId: 's2' }), spirit({ spiritId: 's3' })],
);
assert.equal(over.length, 4, '넘쳐도 4칸');
assert.ok(over.every((c) => c.filled));

// 3) 각인 칩 — 폼·원소·레벨·진화가 스펙에서 온다
const [e0] = buildChipModel([engrave({
  level: 3,
  evolved: true,
  shotCount: 3,
  spell: spell({ name: '설한의 참', element_primary: 'ice', element_secondary: 'earth', form: 'slash', power: 90 }),
})], []);
assert.equal(e0.name, '설한의 참');
assert.equal(e0.element, 'ice');
assert.equal(e0.elementSecondary, 'earth', '부속성 = 칩 투톤');
assert.equal(e0.form, 'slash', '폼 = 글리프 선택');
assert.equal(e0.level, 3);
assert.equal(e0.evolved, true, '진화 = 금테');
assert.ok(e0.detail.some((d) => d.includes('90')), '위력이 툴팁에');
assert.ok(e0.detail.some((d) => d.includes('진화')), '진화 표기');

// 4) 정령 칩 — 폼이 없고(역할이 정체성), 융합은 이름·금테로
const spiritOnly = buildChipModel([], [spirit({ role: 'heal', element: undefined })]);
assert.equal(spiritOnly[2].form, null, '정령은 폼 없음');
assert.equal(spiritOnly[2].element, spiritFallbackElement('heal'), '치유 정령 색 폴백');
assert.equal(spiritOnly[2].element, 'light');
assert.equal(spiritFallbackElement('guard'), 'earth');
const fused = buildChipModel([], [spirit({ fused: true, fusedName: '서리불꽃', elementSecondary: 'fire' })]);
assert.equal(fused[2].name, '서리불꽃');
assert.equal(fused[2].evolved, true, '융합 = 금테');
assert.equal(fused[2].elementSecondary, 'fire');
// 이름 없는 공격 정령은 역할 이름으로
assert.equal(buildChipModel([], [spirit()])[2].name, '공격 정령');

// 5) 쿨다운 비율 — 0~1, 방어
assert.equal(cooldownRatio(2, 4), 0.5);
assert.equal(cooldownRatio(0, 4), 0, '지금 나간다');
assert.equal(cooldownRatio(4, 4), 1, '방금 쐈다');
assert.equal(cooldownRatio(9, 4), 1, '상한 클램프');
assert.equal(cooldownRatio(-3, 4), 0, '음수 방어');
assert.equal(cooldownRatio(2, 0), 0, 'interval 0 → 0 (0으로 나누지 않는다)');
assert.equal(cooldownRatio(Number.NaN, 4), 0, 'NaN 방어');
assert.equal(cooldownRatio(2, Number.NaN), 0, 'NaN interval 방어');
assert.equal(buildChipModel([engrave({ remainingSeconds: 1, intervalSeconds: 4 })], [])[0].cooldownRatio, 0.25);
assert.equal(empty[0].cooldownRatio, 0, '빈 칸은 쿨다운 없음');

// 6) 순수성 — 입력을 만지지 않는다
const src = [engrave()];
const snapshot = JSON.stringify(src);
buildChipModel(src, [spirit()]);
assert.equal(JSON.stringify(src), snapshot, '입력 불변');

// 7) 각성 표식 — 원소 단위로 걸리고, 진화와 독립이다
{
  const awakened = { fire: 'searing' as const };
  const [e0] = buildChipModel([engrave()], [], awakened);
  assert.equal(e0.awakening, 'searing', '화염 각인 = 화염 각성 표식');
  // 다른 원소 각인은 표식 없음
  const [other] = buildChipModel(
    [engrave({ spell: spell({ element_primary: 'ice' }) })], [], awakened,
  );
  assert.equal(other.awakening, null, '각성 안 한 원소는 표식 없음');
  // 정령도 같은 원소면 걸린다 (각성은 원소 전체에 걸리므로)
  const sp = buildChipModel([], [spirit({ element: 'fire' })], awakened);
  assert.equal(sp[2].awakening, 'searing', '같은 원소 정령도 표식');
  // 원소 없는 정령은 폴백 원소 기준
  const heal = buildChipModel([], [spirit({ role: 'heal', element: undefined })], { light: 'brand' });
  assert.equal(heal[2].awakening, 'brand', '폴백 원소(light)로 표식이 걸린다');
  // 진화와 독립 — 진화했지만 각성 안 함 / 각성했지만 진화 안 함이 각각 가능
  const [evolvedOnly] = buildChipModel([engrave({ evolved: true })], [], {});
  assert.equal(evolvedOnly.evolved, true);
  assert.equal(evolvedOnly.awakening, null, '진화해도 각성은 별개');
  assert.equal(e0.evolved, false, '각성해도 진화는 별개');
  // 인자를 안 주면 표식 없음 (기본값)
  assert.equal(buildChipModel([engrave()], [])[0].awakening, null, '기본값은 각성 없음');
  // 빈 칸은 항상 null
  assert.equal(buildChipModel([], [], awakened)[0].awakening, null, '빈 칸은 표식 없음');
}

console.log('build chip regression: 4칸고정·초과절단·각인·정령폴백·쿨다운·순수성·각성표식 7군 통과');
