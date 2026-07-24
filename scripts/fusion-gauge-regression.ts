import assert from 'node:assert/strict';
import { FUSION_CONFIG, FusionGauge } from '../src/combat-core/player/fusionGauge';
import type { SpellSpec } from '../src/spell/types';

const dual: SpellSpec = {
  name: '증기 폭발',
  effect: 'damage',
  target: 'area',
  element_primary: 'fire',
  element_secondary: 'water',
  form: 'nova',
  size: 'medium',
  speed: 'normal',
  status: [],
  power: 55,
  cost: 33,
};
const single: SpellSpec = { ...dual, name: '화염구', element_secondary: null };

// 1) 충전 — 수동 지불 마나 누적, 만충 도달 신호는 정확히 1회
const gauge = new FusionGauge();
assert.equal(gauge.ready, false);
assert.equal(gauge.charge(50), false);
assert.equal(gauge.charge(50), false);
assert.equal(gauge.charge(50), true, '만충 도달 그 호출에서만 true (안내 1회용)');
assert.equal(gauge.ready, true);
assert.equal(gauge.charge(50), false, '이미 만충이면 도달 신호 없음');
assert.equal(gauge.ratio, 1, '상한 클램프');
assert.equal(new FusionGauge().charge(Number.NaN), false, 'NaN 방어');

// 2) 방출 게이트 — 만충 + 이중 원소일 때만
const notReady = new FusionGauge();
notReady.charge(60);
assert.equal(notReady.tryRelease(dual), null, '미만충이면 방출 없음');
assert.equal(gauge.tryRelease(single), null, '단일 원소는 방출 없음');
assert.equal(gauge.ready, true, '단일 원소 시전이 게이지를 소모하면 안 된다 (만충 낭비 방지)');

// 3) 격상 내용 — backlog 설계 그대로: huge · 위력 상한 · 두 원소 상태이상 동시
const released = gauge.tryRelease(dual);
assert.ok(released, '만충+이중 원소면 방출');
assert.equal(released!.size, 'huge');
assert.equal(released!.power, FUSION_CONFIG.releasePower);
assert.ok(released!.status.includes('burn'), '주원소(fire) 상태이상');
assert.ok(released!.status.includes('knockback'), '부원소(water) 상태이상');
assert.ok(released!.status.length <= FUSION_CONFIG.maxStatuses, '상태이상 상한');
assert.equal(released!.name, '증기 폭발', '이름·형태는 판정 그대로 (유저의 말 보존)');
assert.equal(released!.form, 'nova');

// 4) 방출 후 게이지 소모 + 재충전 사이클
assert.equal(gauge.ready, false, '방출이 게이지를 비운다');
assert.equal(gauge.ratio, 0);
assert.equal(gauge.tryRelease(dual), null, '빈 게이지는 방출 불가');

// 5) 기존 상태이상과 합집합 — 중복 없이
const g2 = new FusionGauge();
g2.charge(FUSION_CONFIG.fullCharge);
const withStatus = g2.tryRelease({ ...dual, status: ['burn', 'weaken'] });
assert.ok(withStatus);
assert.equal(new Set(withStatus!.status).size, withStatus!.status.length, '중복 상태이상 없음');
assert.ok(withStatus!.status.length <= FUSION_CONFIG.maxStatuses);

// 6) 리셋 (새 런)
const g3 = new FusionGauge();
g3.charge(FUSION_CONFIG.fullCharge);
g3.reset();
assert.equal(g3.ready, false);
assert.equal(g3.ratio, 0);

// 7) 밸런스 각서 — 방출은 수동 시전 전용이므로 오토 게이트(#67)와 무관하다.
//    만충 기준이 지나치게 낮으면 상시 필살기가 된다 — 중형 주문(≈30) 서너 발 이상.
assert.ok(FUSION_CONFIG.fullCharge >= 90, '만충 기준이 중형 주문 3발 미만으로 내려가면 재검토');

console.log('fusion gauge regression: 충전·방출게이트·격상내용·소모/보존·합집합·리셋 7군 통과');
