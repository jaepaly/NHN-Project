import assert from 'node:assert';
import {
  diversityBonus,
  DIVERSITY_CONFIG,
  type DiversityCast,
} from '../src/spell/spellDiversity';

/**
 * 다양성 보너스(당근) 회귀 — #92.
 * 규칙: 배율은 **항상 ≥ 1.0**(페널티 없음), 최근과 다른 원소·폼일수록 커진다.
 */

const { elementWeight, formWeight, maxBonus, window } = DIVERSITY_CONFIG;
const fire = (form: DiversityCast['form'] = 'bolt'): DiversityCast => ({ element: 'fire', form });
const ice = (form: DiversityCast['form'] = 'bolt'): DiversityCast => ({ element: 'ice', form });
const approx = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

// ── 1. 첫 시전(비교 대상 없음) → 중립 1.0 ──
approx(diversityBonus(fire(), []), 1);

// ── 2. 원소만 새로움(불 뒤 얼음, 같은 폼) → 1 + maxBonus·elementW ──
approx(diversityBonus(ice('bolt'), [fire('bolt')]), 1 + maxBonus * elementWeight);

// ── 3. 원소+폼 둘 다 새로움 → 완전 보너스 1 + maxBonus ──
approx(diversityBonus(ice('beam'), [fire('bolt')]), 1 + maxBonus);

// ── 4. 폼만 새로움(같은 불, 다른 폼) → 1 + maxBonus·formW ──
approx(diversityBonus(fire('beam'), [fire('bolt')]), 1 + maxBonus * formWeight);

// ── 5. 완전 반복(같은 원소·같은 폼) → 보너스 없음 1.0 ──
approx(diversityBonus(fire('bolt'), [fire('bolt')]), 1);

// ── 6. 윈도우 밖 과거는 "다시 신선" — window개 초과 전 시전은 무시 ──
// recent = [fire, ice, ice, ice] (window=3이면 마지막 3개 [ice,ice,ice]만 봄) → fire는 다시 신선
const olderFire: DiversityCast[] = [fire('bolt'), ...Array(window).fill(ice('beam'))];
approx(diversityBonus(fire('bolt'), olderFire), 1 + maxBonus); // 불도 폼(bolt)도 윈도우에 없음

// ── 7. 윈도우 안 반복은 여전히 억제 — 직전에 쓴 원소는 신선 아님 ──
approx(diversityBonus(fire('bolt'), [ice('beam'), fire('bolt')]), 1);

// ── 8. 배율은 절대 1.0 미만이 아니다 (페널티 없음 보장) ──
const seqs: DiversityCast[][] = [
  [], [fire()], [fire(), ice(), fire()], Array(10).fill(fire('bolt')),
];
for (const recent of seqs) {
  for (const cur of [fire('bolt'), ice('beam'), fire('beam')]) {
    assert.ok(diversityBonus(cur, recent) >= 1, '배율이 1.0 미만');
  }
}

// ── 9. 가중치 정합: 원소 신선(0.6) > 폼 신선(0.4) ──
assert.ok(
  diversityBonus(ice('bolt'), [fire('bolt')]) > diversityBonus(fire('beam'), [fire('bolt')]),
  '원소 다양성이 폼 다양성보다 커야 한다',
);

console.log('✅ spell-diversity-regression: 9군 통과');
