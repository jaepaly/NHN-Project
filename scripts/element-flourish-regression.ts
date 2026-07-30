import assert from 'node:assert/strict';
import { AFFINITY_VFX_CONFIG, flourishRingCount } from '../src/render/affinityVfx';
import { ELEMENTS } from '../src/spell/types';
import {
  ELEMENT_FLOURISH,
  boltPolyline,
  darkOuterRadius,
  darkTendrilCount,
  earthChunkAt,
  earthChunkCount,
  earthChunkSize,
  fireRise,
  fireSway,
  fireTongueCount,
  flourishRingScaleFor,
  hasElementFlourish,
  iceShardCount,
  iceSpikeCount,
  iceSpikeLength,
  lightningBranchCount,
  lightningFlickerCount,
  lightningJitter,
  lightningReach,
  lightningSegmentCount,
  lightRayCount,
  lightRayLength,
  spiralPolyline,
  tendrilPolyline,
  tonguePolyline,
  waterFrontCount,
  waterFrontRadius,
  waterRadius,
  usesImpactFlash,
  windArmCount,
  windRadius,
  windTurns,
} from '../src/render/elementFlourish';

const CAP = AFFINITY_VFX_CONFIG.intensityCap;

// 1) **8원소 전부** 고유 연출을 갖는다 (총괄 지적 2차).
//    일부만 나누면 안 나눈 쪽이 링 20개를 그대로 써서 화면에서 가장 요란해지고,
//    그들끼리는 여전히 구분이 안 된다. 하나라도 빠지면 여기서 깨진다.
assert.equal(ELEMENTS.length, 8, '원소는 8종');
for (const el of ELEMENTS) {
  assert.equal(hasElementFlourish(el), true, `${el} 고유 연출이 없다`);
  assert.ok(flourishRingScaleFor(el) < 1, `${el} 링 상쇄 배율 < 1`);
}

// 2) **#220 예산**: 고유 연출이 붙은 원소는 링을 줄여 총광량을 상쇄한다.
//    선을 추가하면서 면까지 그대로 두면 광과민성 예산이 깨진다.
for (const el of ELEMENTS) {
  assert.equal(flourishRingScaleFor(el), ELEMENT_FLOURISH[el].ringScale);
}
// 상쇄 후에도 링이 0이 되지는 않는다 (렌더러가 max(1,…)로 보장 — 여기선 배율만 확인)
for (const el of ELEMENTS) {
  const scaled = flourishRingCount(CAP, 'bolt') * flourishRingScaleFor(el);
  assert.ok(scaled >= 1, `${el} 최대 강도에서 링이 최소 1은 남는다`);
}

// 3) 번개 — 강도에 따라 갈래·꺾임·거칠기·사거리·점멸이 함께 는다 (전부 단조 비감소)
const lightningMetrics = [
  ['갈래', (t: number) => lightningBranchCount(t, 'bolt')],
  ['꺾임', (t: number) => lightningSegmentCount(t)],
  ['흔들림', (t: number) => lightningJitter(t)],
  ['사거리', (t: number) => lightningReach(t, 'bolt')],
  ['점멸', (t: number) => lightningFlickerCount(t)],
] as const;
for (const [label, fn] of lightningMetrics) {
  let prev = -Infinity;
  for (let t = 0; t <= CAP + 2; t += 0.25) {
    const v = fn(t);
    assert.ok(v >= prev, `번개 ${label} 단조 위반 at ${t}`);
    prev = v;
  }
  // 상한 위로는 안 커진다 (친화 1.2에서 최대 — 기존 규약과 같은 지점)
  assert.equal(fn(CAP), fn(CAP + 10), `번개 ${label} 상한 고정`);
  assert.ok(Number.isFinite(fn(Number.NaN)), `번개 ${label} NaN 방어`);
  assert.ok(fn(-5) >= 0, `번개 ${label} 음수 방어`);
}
// 강도가 오르면 실제로 **더 많아진다** (단조만으로는 상수 함수도 통과한다)
assert.ok(lightningBranchCount(CAP, 'bolt') > lightningBranchCount(0, 'bolt'), '갈래가 는다');
assert.ok(lightningSegmentCount(CAP) > lightningSegmentCount(0), '꺾임이 는다');
assert.ok(lightningFlickerCount(CAP) > lightningFlickerCount(0), '점멸이 는다');
// 상한 값
// **상한 도달** — 안 닿으면 그 max는 죽은 설정이고 "끝까지 올리면 최대"가 거짓이 된다
assert.equal(lightningBranchCount(CAP, 'bolt'), ELEMENT_FLOURISH.lightning.maxBranches);
assert.equal(lightningSegmentCount(CAP), ELEMENT_FLOURISH.lightning.maxSegments);
assert.equal(lightningFlickerCount(CAP), ELEMENT_FLOURISH.lightning.maxFlickers);
// 꺾임은 최소 2 — 1이면 직선이라 지그재그가 아니다
assert.ok(lightningSegmentCount(0) >= 2, '최소 강도에서도 꺾인 선');
// nova 폼배율은 갈래 **개수**만 줄이고 꺾임은 건드리지 않는다 (모양 보존)
assert.ok(lightningBranchCount(CAP, 'nova') < lightningBranchCount(CAP, 'bolt'), 'nova 갈래 축소');

// 4) "찌릿"의 정체 — 짧은 점멸 + 완전한 공백. 이 둘이 없으면 부드러운 확장과 같아진다.
assert.ok(ELEMENT_FLOURISH.lightning.strikeMs <= 80, '점멸이 짧다 (잔상 없음)');
assert.ok(ELEMENT_FLOURISH.lightning.gapMs > 0, '점멸 사이 공백이 있다 — 이게 핵심');

// 5) 얼음 — 스파이크·길이는 단조, 깨짐은 임계 위에서만
const iceMetrics = [
  ['스파이크', (t: number) => iceSpikeCount(t, 'bolt')],
  ['길이', (t: number) => iceSpikeLength(t, 'bolt')],
] as const;
for (const [label, fn] of iceMetrics) {
  let prev = -Infinity;
  for (let t = 0; t <= CAP + 2; t += 0.25) {
    const v = fn(t);
    assert.ok(v >= prev, `얼음 ${label} 단조 위반 at ${t}`);
    prev = v;
  }
  assert.equal(fn(CAP), fn(CAP + 10), `얼음 ${label} 상한 고정`);
  assert.ok(Number.isFinite(fn(Number.NaN)), `얼음 ${label} NaN 방어`);
}
assert.ok(iceSpikeCount(CAP, 'bolt') > iceSpikeCount(0, 'bolt'), '스파이크가 는다');
assert.equal(iceSpikeCount(CAP, 'bolt'), ELEMENT_FLOURISH.ice.maxSpikes);
// 깨짐 — 임계(강도 5 = 친화 0.75) 미만에서는 0. 얕은 투자에선 안 나온다
const shatterAt = ELEMENT_FLOURISH.ice.shatterFromIntensity;
assert.equal(iceShardCount(shatterAt - 0.01, 'bolt'), 0, '임계 미만 = 깨지지 않는다');
assert.ok(iceShardCount(shatterAt, 'bolt') > 0, '임계에서 깨진다');
assert.ok(iceShardCount(CAP, 'bolt') > iceShardCount(shatterAt, 'bolt'), '깊을수록 파편이 는다');
assert.equal(iceShardCount(CAP, 'bolt'), ELEMENT_FLOURISH.ice.maxShards, '파편도 상한에 닿는다');
assert.equal(iceShardCount(Number.NaN, 'bolt'), 0, 'NaN 방어');
// 계단 성장 — 1이면 연속과 같아 물처럼 보인다
assert.ok(ELEMENT_FLOURISH.ice.growthSteps >= 2, '성장이 계단으로 끊긴다');

// 6) 갈래 폴리라인 — 양 끝 고정, 그 사이만 흔들린다
const seq = [0.9, 0.1, 0.5, 0.2, 0.8, 0.4];
let i = 0;
const rand = () => seq[i++ % seq.length];
const pts = boltPolyline(0, 100, 4, 12, rand);
assert.equal(pts.length, 5, '꺾임 4 → 점 5개');
assert.deepEqual(pts[0], { x: 0, y: 0 }, '시작점은 원점 고정 — 여러 갈래가 흩어지면 안 된다');
assert.ok(Math.abs(pts[4].x - 100) < 1e-9 && Math.abs(pts[4].y) < 1e-9, '끝점은 사거리 고정');
// 중간 점들은 법선 방향으로만 흔들린다 — 각도 0이면 y만 흔들리고 x는 균등해야 한다
for (let k = 1; k < 4; k += 1) {
  assert.ok(Math.abs(pts[k].x - 25 * k) < 1e-9, `진행 방향은 균등해야 한다 (점 ${k})`);
  assert.ok(Math.abs(pts[k].y) <= 12 + 1e-9, `흔들림이 상한 안 (점 ${k})`);
}
// 각도를 돌려도 길이는 보존된다
for (const angle of [0, Math.PI / 3, Math.PI, -Math.PI / 2]) {
  const p = boltPolyline(angle, 80, 3, 0, () => 0.5);
  assert.ok(Math.abs(Math.hypot(p[p.length - 1].x, p[p.length - 1].y) - 80) < 1e-9, '끝점 거리 보존');
}
// 방어 — 이상한 입력에도 점열이 나온다
assert.equal(boltPolyline(0, 0, 0, 0, () => 0).length, 3, '꺾임 0 → 최소 2로 올린다');
assert.ok(boltPolyline(0, Number.NaN, 3, Number.NaN, () => 0.5).every(
  (p) => Number.isFinite(p.x) && Number.isFinite(p.y),
), 'NaN 입력에도 유한한 좌표');

// 7) 불 — 혀·높이·흔들림이 강도에 단조, 상한 도달
const fireMetrics = [
  ['혀', (t: number) => fireTongueCount(t, 'bolt')],
  ['높이', (t: number) => fireRise(t, 'bolt')],
  ['흔들림', (t: number) => fireSway(t)],
] as const;
for (const [label, fn] of fireMetrics) {
  let prev = -Infinity;
  for (let t = 0; t <= CAP + 2; t += 0.25) {
    const v = fn(t);
    assert.ok(v >= prev, `불 ${label} 단조 위반 at ${t}`);
    prev = v;
  }
  assert.equal(fn(CAP), fn(CAP + 10), `불 ${label} 상한 고정`);
  assert.ok(Number.isFinite(fn(Number.NaN)), `불 ${label} NaN 방어`);
}
assert.equal(fireTongueCount(CAP, 'bolt'), ELEMENT_FLOURISH.fire.maxTongues, '혀 상한 도달');
assert.ok(fireTongueCount(CAP, 'bolt') > fireTongueCount(0, 'bolt'), '혀가 는다');

// 불 혀 — 뿌리는 붙어 있고 끝이 날린다 (흔들림이 위로 갈수록 커진다)
const tongue = tonguePolyline(60, 12, 0.7, 8);
assert.equal(tongue.length, 9, '표본 8 → 점 9개');
assert.ok(Math.abs(tongue[0].x) < 1e-9 && Math.abs(tongue[0].y) < 1e-9, '뿌리는 원점');
assert.ok(Math.abs(tongue[8].y + 60) < 1e-9, '끝은 높이만큼 위로 (y 음수)');
assert.ok(tongue.every((p) => p.y <= 1e-9), '항상 위로만 간다 (아래로 내려가지 않는다)');
// 흔들림 폭이 위로 갈수록 커진다 — 진폭은 t에 비례
const amp = tongue.map((p) => Math.abs(p.x));
assert.ok(amp[8] >= amp[1], '끝이 뿌리보다 더 흔들린다');
assert.ok(tongue.every((p) => Math.abs(p.x) <= 12 + 1e-9), '흔들림이 상한 안');
// 위상이 다르면 형태가 다르다 — 같으면 모든 혀가 한 몸처럼 흔들린다
const t1 = tonguePolyline(60, 12, 0, 8);
const t2 = tonguePolyline(60, 12, Math.PI, 8);
assert.ok(t1.some((p, i) => Math.abs(p.x - t2[i].x) > 1e-6), '위상이 형태를 바꾼다');
assert.ok(tonguePolyline(Number.NaN, Number.NaN, Number.NaN, 4)
  .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), '불 NaN 방어');

// 8) 바람 — 팔·회전·반경 단조 + **섬광 없음**
const windMetrics = [
  ['팔', (t: number) => windArmCount(t, 'bolt')],
  ['회전', (t: number) => windTurns(t)],
  ['반경', (t: number) => windRadius(t, 'bolt')],
] as const;
for (const [label, fn] of windMetrics) {
  let prev = -Infinity;
  for (let t = 0; t <= CAP + 2; t += 0.25) {
    const v = fn(t);
    assert.ok(v >= prev, `바람 ${label} 단조 위반 at ${t}`);
    prev = v;
  }
  assert.equal(fn(CAP), fn(CAP + 10), `바람 ${label} 상한 고정`);
  assert.ok(Number.isFinite(fn(Number.NaN)), `바람 ${label} NaN 방어`);
}
assert.equal(windArmCount(CAP, 'bolt'), ELEMENT_FLOURISH.wind.maxArms, '팔 상한 도달');
assert.equal(windTurns(CAP), ELEMENT_FLOURISH.wind.maxTurns, '회전 상한 도달');
// **바람만 타격 섬광을 쓰지 않는다** — 확 퍼지는 원이 붙으면 회전감이 죽는다
assert.equal(usesImpactFlash('wind'), false, '바람은 섬광 없음');
for (const el of ELEMENTS.filter((e) => e !== 'wind')) {
  assert.equal(usesImpactFlash(el), true, `${el}는 섬광 유지`);
}
// 나선 — 중심에서 시작해 반경까지 감긴다
const spiral = spiralPolyline(0, 50, 1.5, 12);
assert.equal(spiral.length, 13);
assert.deepEqual(spiral[0], { x: 0, y: 0 }, '중심에서 시작');
assert.ok(Math.abs(Math.hypot(spiral[12].x, spiral[12].y) - 50) < 1e-9, '끝은 반경만큼');
// 반경이 단조 증가 — 안팎으로 오가면 나선이 아니다
let prevR = -1;
for (const p of spiral) {
  const r = Math.hypot(p.x, p.y);
  assert.ok(r >= prevR - 1e-9, '나선 반경 단조 증가');
  prevR = r;
}
// 회전수가 크면 실제로 더 감긴다 (각도 총량 비교)
const oneTurn = spiralPolyline(0, 50, 1, 40);
const twoTurn = spiralPolyline(0, 50, 2, 40);
const sweep = (pts: Array<{ x: number; y: number }>) => {
  let total = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a0 = Math.atan2(pts[i - 1].y, pts[i - 1].x);
    const a1 = Math.atan2(pts[i].y, pts[i].x);
    let d = a1 - a0;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    total += Math.abs(d);
  }
  return total;
};
assert.ok(sweep(twoTurn) > sweep(oneTurn) * 1.5, '회전수가 크면 더 감긴다');
assert.ok(spiralPolyline(Number.NaN, Number.NaN, Number.NaN, 4)
  .every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)), '바람 NaN 방어');

// 9) 물 — 파면이 밀려나갔다 **되돌아온다**. 이 왕복이 링과의 결정적 차이다.
for (const [label, fn] of [
  ['파면', (t: number) => waterFrontCount(t, 'bolt')],
  ['반경', (t: number) => waterRadius(t, 'bolt')],
] as const) {
  let prev = -Infinity;
  for (let t = 0; t <= CAP + 2; t += 0.25) {
    const v = fn(t);
    assert.ok(v >= prev, `물 ${label} 단조 위반 at ${t}`);
    prev = v;
  }
  assert.equal(fn(CAP), fn(CAP + 10), `물 ${label} 상한 고정`);
  assert.ok(Number.isFinite(fn(Number.NaN)), `물 ${label} NaN 방어`);
}
assert.equal(waterFrontCount(CAP, 'bolt'), ELEMENT_FLOURISH.water.maxFronts, '파면 상한 도달');
// 반경 곡선 — 0에서 시작, 중간에 최대, 끝은 **0이 아니라 물러난 위치**
assert.equal(waterFrontRadius(0, 100), 0, '시작은 0');
assert.ok(Math.abs(waterFrontRadius(0.6, 100) - 100) < 1e-9, '60%에서 최대');
const receded = waterFrontRadius(1, 100);
assert.ok(receded > 0, '끝이 0이면 그냥 사라지는 링과 같다 — 물은 물러난다');
assert.ok(receded < 100, '물러났으니 최대보다 작다');
assert.ok(Math.abs(receded - 100 * ELEMENT_FLOURISH.water.recedeRatio) < 1e-9, 'recedeRatio 일치');
// 앞구간은 증가, 뒷구간은 감소 (왕복)
let up = waterFrontRadius(0, 100);
for (let t = 0; t <= 0.6; t += 0.05) {
  const v = waterFrontRadius(t, 100);
  assert.ok(v >= up - 1e-9, '밀려나가는 구간은 증가');
  up = v;
}
let down = waterFrontRadius(0.6, 100);
for (let t = 0.6; t <= 1; t += 0.05) {
  const v = waterFrontRadius(t, 100);
  assert.ok(v <= down + 1e-9, '물러나는 구간은 감소');
  down = v;
}
assert.equal(waterFrontRadius(Number.NaN, 100), 0, '물 NaN 방어');
// 호는 온전한 원이 아니다 — 2π면 파면이 아니라 충격파가 된다
assert.ok(ELEMENT_FLOURISH.water.arcSpan < Math.PI * 2, '호가 원을 다 덮지 않는다');

// 10) 빛 — 곧고 떨리지 않는다. 번개와의 구분이 여기 전부 있다.
for (const [label, fn] of [
  ['광선', (t: number) => lightRayCount(t, 'bolt')],
  ['길이', (t: number) => lightRayLength(t, 'bolt')],
] as const) {
  let prev = -Infinity;
  for (let t = 0; t <= CAP + 2; t += 0.25) {
    const v = fn(t);
    assert.ok(v >= prev, `빛 ${label} 단조 위반 at ${t}`);
    prev = v;
  }
  assert.equal(fn(CAP), fn(CAP + 10), `빛 ${label} 상한 고정`);
  assert.ok(Number.isFinite(fn(Number.NaN)), `빛 ${label} NaN 방어`);
}
assert.equal(lightRayCount(CAP, 'bolt'), ELEMENT_FLOURISH.light.maxRays, '광선 상한 도달');
// 빛은 번개보다 길다 — 같은 "방사되는 선"이라 길이로도 갈라야 한다
assert.ok(
  lightRayLength(CAP, 'bolt') > lightningReach(CAP, 'bolt'),
  '빛이 번개보다 멀리 간다',
);
// 중심을 비운다 — 0이면 중심에서 바로 시작해 "뻗어나감"이 안 읽힌다
assert.ok(ELEMENT_FLOURISH.light.innerRatio > 0, '중심을 비운다');
assert.ok(ELEMENT_FLOURISH.light.innerRatio < 0.5, '너무 비우면 광선이 짧아 보인다');

// 11) 대지 — 솟았다 **떨어진다**. 얼음(자라서 깨짐)과 궤적이 다르다.
for (const [label, fn] of [
  ['덩어리', (t: number) => earthChunkCount(t, 'bolt')],
  ['크기', (t: number) => earthChunkSize(t)],
] as const) {
  let prev = -Infinity;
  for (let t = 0; t <= CAP + 2; t += 0.25) {
    const v = fn(t);
    assert.ok(v >= prev, `대지 ${label} 단조 위반 at ${t}`);
    prev = v;
  }
  assert.equal(fn(CAP), fn(CAP + 10), `대지 ${label} 상한 고정`);
  assert.ok(Number.isFinite(fn(Number.NaN)), `대지 ${label} NaN 방어`);
}
assert.equal(earthChunkCount(CAP, 'bolt'), ELEMENT_FLOURISH.earth.maxChunks, '덩어리 상한 도달');
// **포물선** — 시작과 끝이 모두 지면 높이여야 "떨어졌다"가 된다
assert.ok(Math.abs(earthChunkAt(0, 40, 30, 0).y) < 1e-9, '시작은 지면');
assert.ok(Math.abs(earthChunkAt(0, 40, 30, 1).y) < 1e-9, '끝도 지면 — 떨어진다');
assert.ok(earthChunkAt(0, 40, 30, 0.5).y < -20, '중간엔 솟아 있다 (y 음수 = 위)');
// 수평은 단조 전진 — 되돌아오면 부메랑이다
let prevX = -Infinity;
for (let t = 0; t <= 1; t += 0.05) {
  const at = earthChunkAt(0, 40, 30, t);
  assert.ok(at.x >= prevX - 1e-9, '수평은 계속 전진');
  prevX = at.x;
}
assert.ok(Math.abs(earthChunkAt(0, 40, 30, 1).x - 40) < 1e-9, '끝은 spread만큼');
const bad = earthChunkAt(Number.NaN, Number.NaN, Number.NaN, Number.NaN);
assert.ok(Number.isFinite(bad.x) && Number.isFinite(bad.y), '대지 NaN 방어');

// 12) 암영 — **유일하게 방향이 반대다.** 이게 정체성 전부다.
for (const [label, fn] of [
  ['촉수', (t: number) => darkTendrilCount(t, 'bolt')],
  ['외곽', (t: number) => darkOuterRadius(t, 'bolt')],
] as const) {
  let prev = -Infinity;
  for (let t = 0; t <= CAP + 2; t += 0.25) {
    const v = fn(t);
    assert.ok(v >= prev, `암영 ${label} 단조 위반 at ${t}`);
    prev = v;
  }
  assert.equal(fn(CAP), fn(CAP + 10), `암영 ${label} 상한 고정`);
  assert.ok(Number.isFinite(fn(Number.NaN)), `암영 ${label} NaN 방어`);
}
assert.equal(darkTendrilCount(CAP, 'bolt'), ELEMENT_FLOURISH.dark.maxTendrils, '촉수 상한 도달');
// 촉수는 **바깥에서 시작해 중심으로 끝난다** — 다른 원소와 정반대
const tendril = tendrilPolyline(0, 50, 0.55, 8);
assert.equal(tendril.length, 9);
assert.ok(Math.hypot(tendril[0].x, tendril[0].y) > 49, '바깥에서 시작');
assert.ok(Math.hypot(tendril[8].x, tendril[8].y) < 1e-9, '중심에서 끝난다');
// 반경이 단조 **감소** — 다른 모든 원소는 증가한다
let prevR2 = Infinity;
for (const pt of tendril) {
  const r = Math.hypot(pt.x, pt.y);
  assert.ok(r <= prevR2 + 1e-9, '암영은 반경이 줄어든다 (빨려든다)');
  prevR2 = r;
}
// 나선(바람)과 방향이 정반대임을 명시적으로 확인
const windSpiral = spiralPolyline(0, 50, 1, 8);
assert.ok(
  Math.hypot(windSpiral[0].x, windSpiral[0].y) < Math.hypot(windSpiral[8].x, windSpiral[8].y),
  '바람은 밖으로',
);
assert.ok(
  Math.hypot(tendril[0].x, tendril[0].y) > Math.hypot(tendril[8].x, tendril[8].y),
  '암영은 안으로 — 방향이 정반대',
);
// 휘어짐이 없으면 그냥 축소다
assert.ok(ELEMENT_FLOURISH.dark.curl > 0, '촉수가 휘어야 축소가 아니라 빨려듦으로 읽힌다');
const straight = tendrilPolyline(0, 50, 0, 8);
assert.ok(
  straight.some((pt, i) => Math.abs(pt.y - tendril[i].y) > 1e-6),
  'curl이 형태를 바꾼다',
);
assert.ok(tendrilPolyline(Number.NaN, Number.NaN, Number.NaN, 4)
  .every((pt) => Number.isFinite(pt.x) && Number.isFinite(pt.y)), '암영 NaN 방어');

console.log('element flourish regression: 8원소전부·링상쇄·번개·찌릿·얼음·불·바람·물왕복·빛직선·대지포물선·암영역방향 12군 통과');
