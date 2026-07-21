import assert from 'node:assert/strict';
import {
  runEscalationTier,
  runEscalationProfile,
} from '../src/spell/runEscalation';
import { EMPTY_RUN_MEMORY } from '../src/spell/runMemory';
import type { RunMemory } from '../src/spell/runMemory';

const mk = (over: Partial<RunMemory>): RunMemory => ({ ...EMPTY_RUN_MEMORY, ...over });

// 1) tier: 누적 clears → 티어 (1-based, 상한 5, 방어)
assert.equal(runEscalationTier(0), 1, '첫 런 = 티어1');
assert.equal(runEscalationTier(1), 2);
assert.equal(runEscalationTier(4), 5);
assert.equal(runEscalationTier(10), 5, '상한 5');
assert.equal(runEscalationTier(-3), 1, '음수 방어');
assert.equal(runEscalationTier(Number.NaN), 1, 'NaN 방어');

// 2) 티어1 — 격상 없음 (첫 런은 그대로)
const t1 = runEscalationProfile(mk({ clears: 0, recentDominantElements: ['fire'] }));
assert.equal(t1.tier, 1);
assert.deepEqual(t1.weakenedElements, [], '티어1 약화 없음');
assert.equal(t1.weakenMultiplier, 1);
assert.equal(t1.gimmicksUnlocked, false);
assert.equal(t1.bossDualResistance, false);

// 3) 티어2 — 애용 원소 런-전체 약화 시작 (중복 제거)
const t2 = runEscalationProfile(mk({ clears: 1, recentDominantElements: ['fire', 'fire', 'water'] }));
assert.equal(t2.tier, 2);
assert.deepEqual(t2.weakenedElements, ['fire', 'water'], '중복 제거');
assert.ok(Math.abs(t2.weakenMultiplier - 0.85) < 1e-9, '티어2 약화 0.85');
assert.equal(t2.gimmicksUnlocked, false);

// 4) 티어3 — 방 기믹 해금 / 티어4 — 보스 이중 저항
assert.equal(runEscalationProfile(mk({ clears: 2 })).gimmicksUnlocked, true, '티어3 기믹');
assert.equal(runEscalationProfile(mk({ clears: 2 })).bossDualResistance, false);
assert.equal(runEscalationProfile(mk({ clears: 3 })).bossDualResistance, true, '티어4 이중 저항');

// 5) 상한 — 티어5에서 약화 하한 0.4
const t5 = runEscalationProfile(mk({ clears: 9, recentDominantElements: ['fire'] }));
assert.equal(t5.tier, 5, '상한');
assert.ok(Math.abs(t5.weakenMultiplier - 0.4) < 1e-9, '약화 하한 0.4');

// 6) 폴백 — recentDominant 없으면 favoriteElement
const fav = runEscalationProfile(mk({ clears: 1, recentDominantElements: [], favoriteElement: 'lightning' }));
assert.deepEqual(fav.weakenedElements, ['lightning'], 'favoriteElement 폴백');

console.log('RunEscalation regression: 티어·약화·기믹/이중저항 게이트·폴백 6군 통과');
