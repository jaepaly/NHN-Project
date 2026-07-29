import assert from 'node:assert/strict';
import {
  DAMAGE_NUMBER,
  damageColor,
  damageEmphasis,
  damageLabel,
} from '../src/render/damageNumber';

// 1) 비율 기준 — 절대 피해량이 아니라 최대 체력 대비로 잰다
//    (친화·루프로 피해가 무한히 커져도 척도가 살아 있어야 한다)
const small = damageEmphasis(10, 100);
const big = damageEmphasis(50, 100);
assert.equal(small.ratio, 0.1);
assert.equal(big.ratio, 0.5);
assert.ok(big.fontPx > small.fontPx, '비율이 크면 글자도 크다');

// **핵심**: 절대값이 10배여도 상대 비율이 같으면 같은 크기다
const early = damageEmphasis(30, 100); // 초반: 30딜 / 100HP
const late = damageEmphasis(300, 1000); // 후반: 300딜 / 1000HP
assert.equal(early.fontPx, late.fontPx, '성장해도 같은 비율이면 같은 강조 — 척도가 안 죽는다');
assert.equal(early.tier, late.tier);

// 2) fullRatio(50%)에서 최대 — 잡몹 일격(100%)과 보스 대타격이 같은 무게
const halfKill = damageEmphasis(50, 100);
const oneShot = damageEmphasis(100, 100);
assert.equal(halfKill.fontPx, DAMAGE_NUMBER.maxFontPx, '50%에서 이미 최대 크기');
assert.equal(oneShot.fontPx, DAMAGE_NUMBER.maxFontPx, '100%도 같은 최대 — 더 커지지 않는다');
assert.equal(damageEmphasis(500, 100).ratio, 1, '과잉 피해도 비율은 1로 클램프');

// 3) 크기 범위 — 하한 아래로 안 내려가고 상한 위로 안 올라간다
assert.equal(damageEmphasis(0, 100).fontPx, DAMAGE_NUMBER.minFontPx, '0 피해도 최소 크기');
assert.equal(damageEmphasis(1, 1000000).fontPx, DAMAGE_NUMBER.minFontPx, '미미한 피해 = 최소');
for (const [d, hp] of [[7, 90], [33, 120], [200, 400], [1, 3]]) {
  const e = damageEmphasis(d, hp);
  assert.ok(e.fontPx >= DAMAGE_NUMBER.minFontPx && e.fontPx <= DAMAGE_NUMBER.maxFontPx, '범위 안');
  assert.ok(e.ratio >= 0 && e.ratio <= 1, '비율 0~1');
}
// 단조 증가 — 피해가 늘면 글자가 작아지는 역전은 없다
let prev = -1;
for (let d = 0; d <= 120; d += 5) {
  const f = damageEmphasis(d, 100).fontPx;
  assert.ok(f >= prev, `단조 증가 위반 at ${d}`);
  prev = f;
}

// 4) 등급 — 강조 임계와 최대 임계
assert.equal(damageEmphasis(5, 100).tier, 0, '5% = 평범');
assert.equal(damageEmphasis(30, 100).tier, 1, '30% = 묵직');
assert.equal(damageEmphasis(60, 100).tier, 2, '60% = 치명적');
assert.equal(
  damageEmphasis(DAMAGE_NUMBER.emphasisRatio * 100, 100).tier, 1, '임계 정확히 = 묵직',
);

// 5) 방어 — maxHp를 모르면 비율 0으로 보고 최소 크기 (숫자가 아예 안 뜨는 것보다 낫다)
for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
  const e = damageEmphasis(50, bad as number);
  assert.equal(e.ratio, 0, `maxHp ${bad} → 비율 0`);
  assert.equal(e.fontPx, DAMAGE_NUMBER.minFontPx);
}
assert.equal(damageEmphasis(Number.NaN, 100).ratio, 0, '피해 NaN 방어');
assert.equal(damageEmphasis(-10, 100).ratio, 0, '음수 피해 방어');

// 6) 색 — 저항은 등급을 무시하고 붉게 (덜 들어갔다는 게 더 중요한 정보)
assert.equal(damageColor(2, true), damageColor(0, true), '저항이면 등급 무관하게 같은 색');
assert.notEqual(damageColor(0, false), damageColor(2, false), '평범과 치명적은 색이 다르다');
assert.notEqual(damageColor(2, false), damageColor(2, true), '저항 여부로 색이 갈린다');

// 7) 표시 문자열 — 정수 반올림, 최소 1, 저항 표식
assert.equal(damageLabel(23.4, false), '23');
assert.equal(damageLabel(23.6, false), '24');
assert.equal(damageLabel(0.2, false), '1', '0으로 보이면 안 맞은 것처럼 읽힌다');
assert.equal(damageLabel(0, false), '1');
assert.ok(damageLabel(50, true).includes('↓'), '저항 표식');
assert.ok(!damageLabel(50, false).includes('↓'));

// 8) 설정 정합
assert.ok(DAMAGE_NUMBER.minFontPx < DAMAGE_NUMBER.maxFontPx);
assert.ok(DAMAGE_NUMBER.emphasisRatio < DAMAGE_NUMBER.fullRatio, '강조 임계는 최대 임계 아래');
assert.ok(DAMAGE_NUMBER.fullRatio > 0 && DAMAGE_NUMBER.fullRatio <= 1);
assert.ok(DAMAGE_NUMBER.mergeWindowMs > 0, '누적 창이 있어야 틱 스팸을 막는다');

console.log('damage number regression: 비율기준·성장불변·최대임계·범위·등급·방어·색·표시 8군 통과');
