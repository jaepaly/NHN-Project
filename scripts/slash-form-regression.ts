import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SLASH_CONFIG,
  slashAnchor,
  slashCrescentPolygon,
  slashCutPoints,
  slashCutAngles,
  slashCutCount,
  slashCutRadius,
  slashHitCircle,
  rotatePointsAbout,
} from '../src/combat-core/combat/slashConfig';
import { SIZES } from '../src/spell/types';

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps;
const origin = { x: 0, y: 0 };

// ── 발현 지점: **적이 있는 자리** (시전자 앞이 아니라) ──────────────
// 앞만 베면 검술이지 마법이 아니다 — 이 폼의 설계 근거(총괄 결정).
{
  const anchor = slashAnchor(origin, { x: 200, y: 0 });
  assert.ok(near(anchor.x, 200) && near(anchor.y, 0), '적 자리에 그대로 발현');
  const d = slashAnchor(origin, { x: 90, y: 120 }); // 거리 150
  assert.ok(near(d.x, 90) && near(d.y, 120), '대각선 적도 그 자리에');
}

// ── 사거리 상한: 즉발이라 무제한이면 저격이 된다 ────────────────────
{
  const anchor = slashAnchor(origin, { x: 2000, y: 0 });
  assert.ok(near(Math.hypot(anchor.x, anchor.y), SLASH_CONFIG.maxRange), '상한에서 끊긴다');
  assert.ok(anchor.x > 0, '방향은 유지');
  const scaled = slashAnchor(origin, { x: 2000, y: 0 }, 2);
  assert.ok(near(Math.hypot(scaled.x, scaled.y), SLASH_CONFIG.maxRange * 2), 'rangeScale 반영');
}

// ── 표적이 없거나 자기 자신이면 안전한 기본값 ───────────────────────
{
  for (const toward of [null, { x: 0, y: 0 }]) {
    const a = slashAnchor(origin, toward);
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y), 'NaN 좌표 없음');
    assert.ok(a.x > 0, '표적 없으면 앞쪽에 벤다');
  }
}

// ── 벤 자국 크기: 크기 단조 + **위력 반영** ─────────────────────────
// 이전 설계는 power를 무시해 위력 90짜리와 30짜리가 같은 크기였다(nova는 반영함).
{
  const radii = SIZES.map((s) => slashCutRadius(s, 50));
  for (let i = 1; i < radii.length; i += 1) {
    assert.ok(radii[i] > radii[i - 1], `크기 단조 증가: ${SIZES[i]}`);
  }
  assert.ok(
    slashCutRadius('medium', 90) > slashCutRadius('medium', 30),
    '위력이 실릴수록 크게 벤다',
  );
  assert.ok(slashCutRadius('medium', Number.NaN) > 0, 'NaN power 방어');
  assert.equal(slashCutRadius('medium', 50, 0), slashCutRadius('medium', 50), '0 배율 무시');
}

// ── 시각(호)과 판정(원)이 같은 지점에 정렬 ──────────────────────────
// 이전 설계는 호를 96px에 그리고 판정은 58px 원이라 "보이는 곳 ≠ 맞는 곳"이었다.
{
  const hit = slashHitCircle(origin, { x: 200, y: 0 }, 'medium', 50);
  assert.ok(near(hit.x, 200) && near(hit.y, 0), '판정 원이 적 자리에');
  const anchor = slashAnchor(origin, { x: 200, y: 0 });
  const pts = slashCutPoints(origin, anchor, 'medium', 50);
  assert.equal(pts.length, SLASH_CONFIG.segments + 1, '호 점 개수');
  for (const p of pts) {
    const d = Math.hypot(p.x - hit.x, p.y - hit.y);
    assert.ok(d <= hit.radius * 1.5,
      `호가 판정 원에서 너무 벗어남 (거리 ${d.toFixed(1)} / 반지름 ${hit.radius.toFixed(1)})`);
  }
}

// ── 호가 적을 '가로지른다' — 접근 축에 수직으로 벌어진다 ─────────────
{
  const anchor = slashAnchor(origin, { x: 200, y: 0 });
  const pts = slashCutPoints(origin, anchor, 'large', 60);
  const ys = pts.map((p) => p.y);
  const xs = pts.map((p) => p.x);
  assert.ok(
    (Math.max(...ys) - Math.min(...ys)) > (Math.max(...xs) - Math.min(...xs)),
    '접근 축(x)보다 가로(y)로 더 벌어져야 "가로질러 벤" 모양',
  );
}

// ── 초승달 테이퍼: 가운데는 두껍고 양 끝은 뾰족해야 한다 ──────────────
// 폭이 일정한 호는 '기하 도형'으로 보인다(총괄 지적: "너무 가지런한 호").
{
  const anchor = slashAnchor(origin, { x: 200, y: 0 });
  const poly = slashCrescentPolygon(origin, anchor, 'medium', 60);
  assert.equal(poly.length, (SLASH_CONFIG.segments + 1) * 2, '바깥+안쪽 윤곽');

  const half = poly.length / 2;
  // 같은 인덱스의 바깥/안쪽 점 사이 거리 = 그 지점의 날 두께
  const thickness = (i: number) => {
    const outer = poly[i];
    const inner = poly[poly.length - 1 - i];
    return Math.hypot(outer.x - inner.x, outer.y - inner.y);
  };
  const tipStart = thickness(0);
  const tipEnd = thickness(half - 1);
  const middle = Math.max(...Array.from({ length: half }, (_, i) => thickness(i)));

  assert.ok(middle > 0, '가운데는 두께가 있어야 한다');
  assert.ok(tipStart < middle * 0.25, `시작 팁이 뾰족하지 않다 (${tipStart.toFixed(1)} vs ${middle.toFixed(1)})`);
  assert.ok(tipEnd < middle * 0.25, `끝 팁이 뾰족하지 않다 (${tipEnd.toFixed(1)} vs ${middle.toFixed(1)})`);

  // 두께 정점이 정중앙이 아니어야 기계적으로 안 보인다(bulgeBias)
  let peak = 0;
  for (let i = 1; i < half; i += 1) if (thickness(i) > thickness(peak)) peak = i;
  assert.notEqual(peak, Math.floor((half - 1) / 2), '두께 정점이 정확히 중앙 — 대칭이라 기계적');

  // 위력이 크면 날도 두꺼워진다
  const strong = slashCrescentPolygon(origin, anchor, 'medium', 95);
  const strongMid = Math.hypot(
    strong[Math.floor(half / 2)].x - strong[strong.length - 1 - Math.floor(half / 2)].x,
    strong[Math.floor(half / 2)].y - strong[strong.length - 1 - Math.floor(half / 2)].y,
  );
  assert.ok(strongMid > thickness(Math.floor(half / 2)), '위력이 실리면 날이 두꺼워진다');
}


// ── 연참: 위력이 오를수록 더 많이 벤다 ──────────────────────────────
// 이 게임의 보상은 "말을 잘 벼리면 강해진다"인데 위력이 화면에 드러나는 건
// 크기·셰이크뿐이라 차이가 안 읽혔다. 벤 횟수는 세어지는 값이라 한눈에 다르다.
// MockJudge 실측: "벤다" 27 · "검으로 적을 벤다" 40 · 공들인 영창 78~84.
{
  assert.equal(slashCutCount(27), 1, '"벤다" 수준은 한 번');
  assert.equal(slashCutCount(40), 1, '짧은 영창은 한 번');
  assert.equal(slashCutCount(78), 2, '공들인 영창은 두 번');
  assert.equal(slashCutCount(84), 3, '더 벼린 영창은 세 번');
  assert.equal(slashCutCount(100), 3, '최대 3회 — 그 이상은 화면이 지저분해진다');
  assert.equal(slashCutCount(undefined), 1, 'power 없으면 한 번');
  assert.equal(slashCutCount(Number.NaN), 1, 'NaN 방어');
  assert.equal(slashCutCount(-50), 1, '음수 방어');

  // 단조: 위력이 오르는데 횟수가 줄면 안 된다
  let prev = 0;
  for (let p = 0; p <= 100; p += 1) {
    const n = slashCutCount(p);
    assert.ok(n >= prev, `위력 ${p}에서 연참 횟수가 줄었다`);
    prev = n;
  }
}

// ── 연참 각도: 좌우 대칭이고 서로 겹쳐 '교차'로 읽혀야 한다 ───────────
{
  assert.deepEqual(slashCutAngles(20), [0], '1회는 축 그대로');
  for (const power of [60, 90]) {
    const angles = slashCutAngles(power);
    assert.equal(angles.length, slashCutCount(power), '횟수와 각도 수가 같다');
    const sum = angles.reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum) < 1e-9, `위력 ${power}: 좌우 대칭이 아니다 (합 ${sum})`);
    // 호가 arcDegrees를 덮으므로 이웃 간 간격이 그보다 작아야 서로 겹쳐 교차로 보인다
    for (let i = 1; i < angles.length; i += 1) {
      assert.ok(angles[i] - angles[i - 1] < SLASH_CONFIG.arcDegrees,
        '참격 간격이 호보다 넓다 — 교차가 아니라 따로 논다');
    }
  }
}

// ── 회전: 형상이 앵커 기준으로 돌되 모양은 보존된다 ──────────────────
{
  const anchor = slashAnchor(origin, { x: 200, y: 0 });
  const poly = slashCrescentPolygon(origin, anchor, 'medium', 60);
  const spun = rotatePointsAbout(poly, anchor, 34);

  assert.equal(spun.length, poly.length, '점 개수 보존');
  // 앵커로부터의 거리가 모두 그대로여야 회전이다(찌그러지면 다른 변형)
  for (let i = 0; i < poly.length; i += 1) {
    const before = Math.hypot(poly[i].x - anchor.x, poly[i].y - anchor.y);
    const after = Math.hypot(spun[i].x - anchor.x, spun[i].y - anchor.y);
    assert.ok(near(before, after, 1e-9), `회전이 형상을 찌그러뜨렸다 (i=${i})`);
  }
  // 실제로 움직이긴 해야 한다
  assert.ok(!near(spun[0].x, poly[0].x) || !near(spun[0].y, poly[0].y), '회전이 안 먹었다');
  // 0도는 그대로, 그리고 원본을 건드리지 않는다(새 배열)
  const same = rotatePointsAbout(poly, anchor, 0);
  assert.ok(near(same[3].x, poly[3].x) && near(same[3].y, poly[3].y), '0도는 항등');
  same[3].x = 12345;
  assert.ok(!near(poly[3].x, 12345), '원본 배열을 공유하면 안 된다');
  // 360도 되돌리기
  const round = rotatePointsAbout(rotatePointsAbout(poly, anchor, 120), anchor, -120);
  assert.ok(near(round[5].x, poly[5].x, 1e-6) && near(round[5].y, poly[5].y, 1e-6), '왕복 복원');
}

// ── 연참은 **순수 연출** — 판정은 그대로 하나 ────────────────────────
// 화면만 화려해져야 한다. 여기가 무너지면 위력 높은 영창이 몰래 여러 번 때린다.
{
  const weak = slashHitCircle(origin, { x: 200, y: 0 }, 'medium', 20);
  const strong = slashHitCircle(origin, { x: 200, y: 0 }, 'medium', 95);
  assert.ok(slashCutCount(95) > slashCutCount(20), '전제: 위력이 높으면 연참');
  assert.ok(near(weak.x, strong.x) && near(weak.y, strong.y), '판정 위치는 연참과 무관');
  const src = readFileSync('src/render/spellRenderer.ts', 'utf8');
  const at = src.indexOf('export function castSlash');
  const body = src.slice(at, src.indexOf('function castNova'));
  assert.equal((body.match(/ctx\.onHit\?\.\(/g) ?? []).length, 1,
    'castSlash가 onHit를 두 번 이상 부른다 — 연참이 피해를 늘리면 안 된다');
  // runCut 본문(= 획 하나를 그리는 함수) 안에 onHit이 있으면 획마다 때리게 된다.
  const runCutBody = body.slice(
    body.indexOf('const runCut ='),
    body.indexOf('slashCutAngles(spec.power).forEach'),
  );
  assert.ok(runCutBody.length > 200, '전제: runCut 본문을 못 찾았다 — 회귀가 헛돈다');
  assert.ok(!runCutBody.includes('ctx.onHit'),
    'onHit가 runCut(획 하나) 안에 있다 — 연참이 피해를 여러 번 준다');
}

// ── 배선 회귀: castSpell이 form='slash'를 실제 참격으로 보내는가 ──────
// 이 한 줄이 PR 정리 과정에서 유실된 적 있다(#189 CLOSED → #191이 DSL만 반영).
{
  const src = readFileSync('src/render/spellRenderer.ts', 'utf8');
  const at = src.indexOf("case 'slash':");
  assert.ok(at >= 0, "castSpell 스위치에 case 'slash'가 없다");
  assert.ok(src.slice(at, at + 120).includes('castSlash('),
    "case 'slash'가 castSlash를 부르지 않는다 (default→castBolt로 떨어짐)");
}

console.log('Slash form regression: 적위치 발현·사거리상한·위력반영·시각판정 정렬·가로베기·연참·회전·판정불변·배선 9군 통과');
