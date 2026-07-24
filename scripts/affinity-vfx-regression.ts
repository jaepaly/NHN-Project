import assert from 'node:assert/strict';
import {
  AFFINITY_VFX_CONFIG,
  affinityVfxIntensity,
  reducedAffinityVfxIntensity,
} from '../src/render/affinityVfx';
import { RUN_REWARD_CONFIG } from '../src/combat-core/run/rewardConfig';

const step = RUN_REWARD_CONFIG.affinityBonus; // 0.15/스택 = 강도 1

// 1) 연속 강도 매핑 — 친화 0.15당 강도 1, 상한 intensityCap
assert.equal(affinityVfxIntensity(0), 0, '무친화 = 강도 0');
assert.equal(affinityVfxIntensity(step), 1, '1스택 = 강도 1');
assert.equal(affinityVfxIntensity(step * 3), 3, '3스택(0.45) = 강도 3');
assert.equal(affinityVfxIntensity(step * 6), 6, '6스택(0.9) = 강도 6 (더 이상 0.45 상한 아님)');
assert.equal(
  affinityVfxIntensity(step * 20), AFFINITY_VFX_CONFIG.intensityCap, '강도 상한',
);
assert.equal(affinityVfxIntensity(Number.NaN), 0, 'NaN 방어');
assert.equal(affinityVfxIntensity(-1), 0, '음수 방어');

// 2) 연속성 — 사용 성장(+0.02)의 작은 친화 증가도 강도에 반영된다 (매 시전 체감의 핵심)
const small = affinityVfxIntensity(0.20);
const smaller = affinityVfxIntensity(0.18);
assert.ok(small > smaller, '0.02 친화 차이도 강도로 구분된다 (정수 티어면 둘 다 같았다)');
assert.ok(Math.abs((small - smaller) - 0.02 / step) < 1e-9, '차이가 연속 비례');

// 3) 자동 각인·정령은 수동보다 강도를 낮춘다 (0 하한)
assert.equal(reducedAffinityVfxIntensity(0, 1), 0);
assert.equal(reducedAffinityVfxIntensity(step, 1), 0, '1스택 - 1 = 0');
assert.equal(reducedAffinityVfxIntensity(step * 3, 1), 2, '3스택 - 1 = 2');
assert.equal(reducedAffinityVfxIntensity(step * 2, 0.5), 1.5, '연속 감산도 가능');

// 4) 깊은 마스터가 얕은 투자보다 확연히 화려하다 (0.45 vs 0.9 구분 — 개편의 목적)
const shallow = affinityVfxIntensity(0.45);
const deep = affinityVfxIntensity(0.9);
assert.ok(deep > shallow * 1.5, `깊은 특화(${deep})가 얕은(${shallow})보다 크게 화려 — 이전엔 둘 다 3(동일)`);

// 5) 설정 정합 — 임계 순서
const cfg = AFFINITY_VFX_CONFIG;
assert.ok(cfg.minIntensity < cfg.emberFromIntensity, '엠버는 최소 강도 위');
assert.ok(cfg.emberFromIntensity < cfg.flashFromIntensity, '섬광은 엠버 위 (단계적 격상)');
assert.ok(cfg.flashFromIntensity <= cfg.intensityCap, '섬광 임계가 상한 안');
assert.ok(cfg.sparksPerStack > 0 && cfg.radiusPerStack > 0, '스파크·반경이 강도에 증가');

console.log('AffinityVfx regression: 연속 강도·사용성장 반영·자동 감쇠·깊이 구분·임계정합 5군 통과');
