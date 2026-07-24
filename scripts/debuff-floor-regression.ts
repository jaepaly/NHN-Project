import assert from 'node:assert/strict';
import { DEBUFF_FLOOR, flooredResistMultiplier } from '../src/combat-core/combat/debuffFloor';

// 데미지에 이미 격상이 반영돼 있다고 보고, 곱할 보정 배율을 검증한다.
// 최종 총 배율(= 격상 × 반환값)이 관심사.
function total(escalation: number, resist: number): number {
  return escalation * flooredResistMultiplier(escalation, resist);
}

// 1) 저항 없음(≥1) → 격상만 유지, 하한 개입 안 함
assert.equal(flooredResistMultiplier(1, 1), 1, '무저항·무격상 = 그대로');
assert.equal(flooredResistMultiplier(0.4, 1), 1, '격상만(무저항)은 건드리지 않는다');
assert.equal(flooredResistMultiplier(0.5, 1.2), 1, '증폭(취약)도 그대로');

// 2) 내성만(격상 없음) → ×0.5 하한
assert.equal(total(1, 0.3), DEBUFF_FLOOR, '내성 0.3 단독 → 0.5로 바닥');
assert.equal(total(1, 0.6), 0.6, '내성 0.6은 하한 위 → 그대로');

// 3) 격상×내성 겹침 → 합산이 ×0.5 밑으로 안 감 (핵심 함정 케이스)
assert.ok(Math.abs(total(0.4, 0.3) - DEBUFF_FLOOR) < 1e-9, '0.4×0.3=0.12 → 0.5로 구제');
assert.ok(total(0.4, 0.3) > 0.4 * 0.3, '하한이 실제로 끌어올렸다');

// 4) 겹쳐도 하한 위면 손 안 댐
assert.ok(Math.abs(total(0.9, 0.8) - 0.72) < 1e-9, '0.9×0.8=0.72 > 0.5 → 그대로');

// 5) 어떤 (격상<1, 내성<1) 조합도 총 배율 ≥ 하한
for (const e of [0.4, 0.6, 0.8, 1]) {
  for (const r of [0.3, 0.5, 0.7, 0.9]) {
    assert.ok(total(e, r) >= DEBUFF_FLOOR - 1e-9, `총 배율 ${total(e, r).toFixed(3)} ≥ ${DEBUFF_FLOOR} (e=${e},r=${r})`);
  }
}

// 6) 방어 — NaN·음수·0 격상
assert.equal(flooredResistMultiplier(Number.NaN, 0.3), DEBUFF_FLOOR / 1, 'NaN 격상 → 1로 취급');
assert.equal(flooredResistMultiplier(0, 0.3), DEBUFF_FLOOR / 1, '0 격상 → 1로 취급');
assert.equal(flooredResistMultiplier(0.4, Number.NaN), 1, 'NaN 내성 → 저항 없음 취급');

console.log('debuff floor regression: 무저항·내성단독·겹침구제·하한위·전조합보장·방어 6군 통과');
