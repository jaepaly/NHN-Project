import assert from 'node:assert/strict';
import {
  AWAKENING_CONFIG,
  AWAKENING_KINDS,
  applyAwakening,
  awakenableElement,
  awakeningFor,
  awakeningOptions,
  searingStatus,
} from '../src/combat-core/run/awakening';
import type { AwakeningState } from '../src/combat-core/run/awakening';
import { AFFINITY_VFX_CONFIG } from '../src/render/affinityVfx';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';
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

// 1) 임계는 VFX 상한과 같은 지점 — "더 화려해지지도 않는 곳에서 새 축이 열린다"
assert.equal(
  AWAKENING_CONFIG.threshold,
  AFFINITY_VFX_CONFIG.intensityCap * RUN_REWARD_CONFIG.affinityBonus,
  '각성 임계 = VFX 강도 상한(8스택 × 0.15 = 1.2)',
);
assert.equal(AWAKENING_CONFIG.threshold, 1.2);
// 마스터리 면역(0.9)보다 위 — 한 지점에 큰 보상이 겹치지 않게
assert.ok(AWAKENING_CONFIG.threshold > 0.9, '마스터리 면역 임계보다 위');

// 2) 후보 원소 — 임계 미만은 안 열리고, 임계 이상 중 가장 높은 하나
assert.equal(awakenableElement({ fire: 1.1 }, {}), null, '임계 미만은 후보 아님');
assert.equal(awakenableElement({ fire: 1.2 }, {}), 'fire', '임계 정확히 = 후보');
assert.equal(awakenableElement({ fire: 1.3 }, {}), 'fire');
assert.equal(
  awakenableElement({ fire: 1.3, ice: 1.9 }, {}), 'ice',
  '여럿이면 가장 깊이 투자한 쪽 먼저',
);
assert.equal(awakenableElement({}, {}), null, '친화 없음');
// 이미 각성한 원소는 다시 후보가 되지 않는다 (원소당 1회)
assert.equal(awakenableElement({ fire: 2 }, { fire: 'searing' }), null, '원소당 1회');
assert.equal(
  awakenableElement({ fire: 2, ice: 1.5 }, { fire: 'searing' }), 'ice',
  '각성한 원소는 건너뛰고 다음 후보',
);
// 방어
assert.equal(awakenableElement({ fire: Number.NaN }, {}), null, 'NaN 방어');

// 3) 3택 — 한 원소에 세 갈래, id가 서로 다르고 모두 kind='awaken'
const options = awakeningOptions('ice');
assert.equal(options.length, 3);
assert.deepEqual(options.map((o) => o.awaken?.awakening), [...AWAKENING_KINDS]);
assert.equal(new Set(options.map((o) => o.id)).size, 3, 'id 중복 없음');
assert.ok(options.every((o) => o.kind === 'awaken'));
assert.ok(options.every((o) => o.element === 'ice'), '카드 색·표시용 원소');
assert.ok(options.every((o) => o.awaken?.element === 'ice'));
assert.ok(options.every((o) => o.description.includes('빙결')), '설명에 원소 이름');
// 다른 원소면 id가 겹치지 않는다
assert.equal(
  new Set([...awakeningOptions('fire'), ...options].map((o) => o.id)).size, 6,
  '원소가 다르면 id도 다르다',
);

// 4) 적용 — 원소당 1회, 원본 불변
let state: AwakeningState = {};
state = applyAwakening(state, 'fire', 'searing');
assert.equal(state.fire, 'searing');
const before = { ...state };
const again = applyAwakening(state, 'fire', 'brand');
assert.equal(again.fire, 'searing', '이미 각성한 원소는 덮어쓰지 않는다');
assert.deepEqual(state, before, '원본 불변');
state = applyAwakening(state, 'ice', 'chaining');
assert.equal(state.ice, 'chaining');
assert.equal(state.fire, 'searing', '다른 원소는 유지');

// 5) 시전 판정 — **수동 주속성만**. 자동(각인·정령)은 절대 각성을 받지 않는다 (#67 게이트)
const awakened: AwakeningState = { fire: 'searing' };
assert.equal(awakeningFor(awakened, spell(), false), 'searing', '수동 화염 = 적용');
assert.equal(awakeningFor(awakened, spell(), true), null, '자동 시전은 제외 — 오토 게이트 불변');
assert.equal(
  awakeningFor(awakened, spell({ element_primary: 'ice' }), false), null,
  '각성 안 한 원소는 적용 안 됨',
);
// 부속성으로는 발동하지 않는다 (주속성 기준)
assert.equal(
  awakeningFor(awakened, spell({ element_primary: 'ice', element_secondary: 'fire' }), false),
  null,
  '부속성으로는 발동하지 않는다',
);

// 6) 작열 — 본성 부여, 중복 금지, 기존 보존, 입력 불변
assert.deepEqual(searingStatus(spell()), ['burn'], '화염 → 화상');
assert.deepEqual(searingStatus(spell({ element_primary: 'ice' })), ['freeze'], '빙결 → 빙결');
assert.deepEqual(searingStatus(spell({ status: ['burn'] })), ['burn'], '이미 있으면 중복 안 만든다');
assert.deepEqual(searingStatus(spell({ status: ['slow'] })), ['slow', 'burn'], '기존 위에 얹는다');
const src = spell({ status: ['slow'] });
const snapshot = [...src.status];
searingStatus(src);
assert.deepEqual(src.status, snapshot, '입력 불변');

// 7) 설정 정합 — 파급은 본체보다 약하고, 취약은 실제로 피해를 늘린다
assert.ok(
  AWAKENING_CONFIG.chainingDamageScale < 1,
  '연환 파급은 본체보다 약하다 — 광역 전환이지 배수가 아니다',
);
assert.ok(AWAKENING_CONFIG.chainingExtraTargets >= 1);
assert.ok(AWAKENING_CONFIG.brandWeakenMultiplier > 1, '낙인은 받는 피해를 늘린다');
assert.ok(AWAKENING_CONFIG.brandWeakenSeconds > 0);

console.log('awakening regression: 임계·후보·3택·적용·수동전용·작열·설정정합 7군 통과');
