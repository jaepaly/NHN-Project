import assert from 'node:assert/strict';
import {
  AFFINITY_VFX_CONFIG,
  affinityVfxTier,
  reducedAffinityVfxTier,
} from '../src/render/affinityVfx';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';

const step = RUN_REWARD_CONFIG.affinityBonus; // 0.15/스택

// 1) 티어 매핑 — 스택 수 그대로, 상한 3
assert.equal(affinityVfxTier(0), 0, '무친화 = 기본 연출');
assert.equal(affinityVfxTier(step), 1);
assert.equal(affinityVfxTier(step * 2), 2);
assert.equal(affinityVfxTier(step * 3), 3);
assert.equal(affinityVfxTier(step * 5), 3, '상한 3');
assert.equal(affinityVfxTier(Number.NaN), 0, 'NaN 방어');
assert.equal(affinityVfxTier(-1), 0, '음수 방어');

// 자동 각인·정령은 수동 영창보다 한 단계 낮되 0 아래로 내려가지 않는다.
assert.equal(reducedAffinityVfxTier(0, 1), 0);
assert.equal(reducedAffinityVfxTier(step, 1), 0);
assert.equal(reducedAffinityVfxTier(step * 2, 1), 1);
assert.equal(reducedAffinityVfxTier(step * 3, 1), 2);

// 2) 연출 수치 — 티어가 오를수록 단조 증가 (화려함이 실제로 커진다)
const cfg = AFFINITY_VFX_CONFIG;
for (let t = 1; t <= cfg.maxTier; t += 1) {
  assert.ok(cfg.ringsPerTier[t] > cfg.ringsPerTier[t - 1] - 1, '링 감소 없음');
  assert.ok(cfg.sparksPerTier[t] > cfg.sparksPerTier[t - 1], '스파크 단조 증가');
  assert.ok(cfg.ringRadius[t] > cfg.ringRadius[t - 1], '반경 단조 증가');
}
assert.equal(cfg.ringsPerTier.length, cfg.maxTier + 1, '티어 배열 정합');

console.log('AffinityVfx regression: 티어 매핑·자동 감쇠·방어·단조 증가 3군 통과');
