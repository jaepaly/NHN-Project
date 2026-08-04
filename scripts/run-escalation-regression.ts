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
const t1 = runEscalationProfile(mk({ clears: 0, recentDominantForms: ['bolt'] }));
assert.equal(t1.tier, 1);
assert.deepEqual(t1.weakenedForms, [], '티어1 약화 없음');
assert.equal(t1.weakenMultiplier, 1);
assert.equal(t1.bossDualResistance, false);

// 3) 티어2 — 과의존 **폼** 런-전체 약화 시작 (#171: 원소→폼 전환, 중복 제거)
const t2 = runEscalationProfile(mk({ clears: 1, recentDominantForms: ['bolt', 'bolt', 'nova'] }));
assert.equal(t2.tier, 2);
assert.deepEqual(t2.weakenedForms, ['bolt', 'nova'], '중복 제거');
assert.ok(Math.abs(t2.weakenMultiplier - 0.85) < 1e-9, '티어2 약화 0.85');

// 4) 티어3 — 방 기믹 해금 / 티어4 — 보스 이중 저항
assert.equal(runEscalationProfile(mk({ clears: 2 })).bossDualResistance, false);
assert.equal(runEscalationProfile(mk({ clears: 3 })).bossDualResistance, true, '티어4 이중 저항');

// 5) 상한 — 티어5에서 약화 하한 0.4
const t5 = runEscalationProfile(mk({ clears: 9, recentDominantForms: ['bolt'] }));
assert.equal(t5.tier, 5, '상한');
assert.ok(Math.abs(t5.weakenMultiplier - 0.4) < 1e-9, '약화 하한 0.4');

// 6) 구버전 프로필(폼 이력 없음) — 약화 없음이 정답. 원소 시절의 favoriteElement
// 폴백 같은 대체 축은 두지 않는다: 잘못된 축으로 벌하느니 한 런 쉬는 게 낫다.
// (원소를 약화하면 다채로운 화염 마스터까지 때리는 자기모순이 되살아난다)
const legacyProfile = runEscalationProfile(
  mk({ clears: 1, recentDominantForms: [], favoriteElement: 'lightning', recentDominantElements: ['lightning'] }),
);
assert.deepEqual(legacyProfile.weakenedForms, [], '폼 이력 없으면 약화 없음 (원소 폴백 금지)');

// 7) 원소는 약화 축에서 완전히 빠졌는가 — 원소 집중은 이제 벌 대상이 아니다
{
  const p = runEscalationProfile(
    mk({ clears: 4, recentDominantElements: ['fire', 'fire', 'fire'], recentDominantForms: ['zone'] }),
  );
  assert.deepEqual(p.weakenedForms, ['zone'], '약화는 폼만 본다');
  assert.ok(!('weakenedElements' in p), 'weakenedElements 필드가 남아 있다 — 반쪽 전환');
  // 보스 이중저항 축(원소·서사)은 프로필 게이트만 담당 — 원소 선택은 씬이 runMemory에서 직접
  assert.equal(p.bossDualResistance, true, '이중저항 게이트는 유지');
}

console.log('RunEscalation regression: 티어·폼약화·기믹/이중저항 게이트·구프로필·원소제외 7군 통과');
