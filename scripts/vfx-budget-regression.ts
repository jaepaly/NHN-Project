import assert from 'node:assert/strict';
import {
  VFX_BUDGET_CONFIG,
  decorParticleFrequencyMs,
  persistentFieldAlphaScale,
} from '../src/render/vfxBudget';

// 1) 단일 시전 보존 — freeCount까지는 감쇠 없음 (한 발의 손맛)
assert.equal(persistentFieldAlphaScale(0), 1, '존 없음 = 감쇠 없음');
assert.equal(persistentFieldAlphaScale(1), 1, '단일 존 = 감쇠 없음');

// 2) 중첩 지수 감쇠 — 2개째부터, 3개 중첩 총광량이 단일의 ~1.15배로 수렴
const two = persistentFieldAlphaScale(2);
const three = persistentFieldAlphaScale(3);
assert.equal(two, VFX_BUDGET_CONFIG.decayPerExtra, '2개 = decayPerExtra 1승');
assert.ok(Math.abs(three - VFX_BUDGET_CONFIG.decayPerExtra ** 2) < 1e-12, '3개 = 2승');
const totalGlow3 = 3 * three;
assert.ok(totalGlow3 < 1.3, `3중첩 총광량 ${totalGlow3.toFixed(2)} — 단일의 1.3배 미만`);
assert.ok(totalGlow3 > 1, '완전 소등은 아니다 — 존 위치는 보여야 한다');

// 3) 하한 — 아무리 쌓여도 minScale 밑으로 안 내려간다
assert.equal(persistentFieldAlphaScale(50), VFX_BUDGET_CONFIG.minScale, '하한 고정');
// 단조 비증가 — 많이 쌓일수록 밝아지는 역전은 없다
let prev = Infinity;
for (let n = 0; n <= 10; n += 1) {
  const s = persistentFieldAlphaScale(n);
  assert.ok(s <= prev, `단조 비증가 위반 at ${n}`);
  prev = s;
}

// 4) 방어 — 비정상 입력은 "감쇠 없음"으로 (VFX 예산 때문에 게임이 죽으면 안 된다)
assert.equal(persistentFieldAlphaScale(NaN), 1, 'NaN → 감쇠 없음');
assert.equal(persistentFieldAlphaScale(-3), 1, '음수 → 감쇠 없음');

// 5) 파티클 빈도 — 어두워진 만큼 간격을 늘린다 (빛의 총량 동반 감소)
const base = VFX_BUDGET_CONFIG.particleBaseFrequencyMs;
assert.equal(decorParticleFrequencyMs(base, 1), base, '감쇠 없음 = 기본 간격');
assert.ok(decorParticleFrequencyMs(base, 0.5) > base, '감쇠 시 간격 증가(개수 감소)');
assert.equal(
  decorParticleFrequencyMs(base, 0.01),
  base / VFX_BUDGET_CONFIG.minScale,
  '간격 증가도 minScale에서 멈춘다 — 파티클 전멸 방지',
);
assert.equal(decorParticleFrequencyMs(NaN, 0.5), base * 2, '비정상 base → 기본값');
assert.equal(decorParticleFrequencyMs(base, NaN), base, '비정상 scale → 감쇠 없음');

// 6) 자동 시전 감쇠 상수 — (0,1] 범위: 수동보다 밝아지는 역전 금지
assert.ok(
  VFX_BUDGET_CONFIG.autoCastScale > 0 && VFX_BUDGET_CONFIG.autoCastScale <= 1,
  'autoCastScale ∈ (0,1]',
);

console.log('vfx budget regression: 단일보존·지수감쇠·하한·방어·파티클·오토감쇠 6군 통과');
