import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SLASH_CONFIG,
  slashArcPoints,
  slashHitCircle,
  slashReach,
} from '../src/combat-core/combat/slashConfig';
import { SIZES } from '../src/spell/types';

const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const origin = { x: 0, y: 0 };

// ── 사거리: 크기에 따라 단조 증가, 배율 반영 ─────────────────────
{
  const reaches = SIZES.map((s) => slashReach(s));
  for (let i = 1; i < reaches.length; i += 1) {
    assert.ok(reaches[i] > reaches[i - 1], `사거리는 크기에 따라 커져야 함: ${SIZES[i]}`);
  }
  assert.equal(slashReach('medium', 2), SLASH_CONFIG.reach.medium * 2, 'rangeScale 반영');
  // 비정상 배율은 1로 (0·음수·NaN이 사거리를 0으로 접지 않게)
  assert.equal(slashReach('medium', 0), SLASH_CONFIG.reach.medium, '0 배율은 무시');
  assert.equal(slashReach('medium', Number.NaN), SLASH_CONFIG.reach.medium, 'NaN 배율은 무시');
}

// ── 호: 모든 점이 사거리 위에 있고, 표적 방향을 중심으로 arcDegrees를 덮는다 ──
{
  const toward = { x: 100, y: 0 }; // 오른쪽
  const pts = slashArcPoints(origin, toward, 'medium');
  const r = slashReach('medium');

  assert.equal(pts.length, SLASH_CONFIG.segments + 1, '선분 수 + 1개의 점');
  for (const p of pts) {
    assert.ok(near(Math.hypot(p.x, p.y), r, 1e-6), '모든 점이 사거리 위');
  }

  // 중앙 점은 조준 축 위 (y≈0, x≈r)
  const mid = pts[Math.floor(pts.length / 2)];
  assert.ok(near(mid.y, 0, 1e-6) && near(mid.x, r, 1e-6), '호 중앙이 조준 방향');

  // 양 끝이 정확히 arcDegrees만큼 벌어진다
  const a0 = Math.atan2(pts[0].y, pts[0].x);
  const a1 = Math.atan2(pts[pts.length - 1].y, pts[pts.length - 1].x);
  const spanDeg = ((a1 - a0) * 180) / Math.PI;
  assert.ok(near(spanDeg, SLASH_CONFIG.arcDegrees, 1e-6), `호 각도 ${spanDeg}`);
}

// ── 조준 방향을 따라간다 (아래쪽 표적이면 호도 아래로) ──────────────
{
  const pts = slashArcPoints(origin, { x: 0, y: 100 }, 'medium');
  const mid = pts[Math.floor(pts.length / 2)];
  assert.ok(mid.y > 0 && near(mid.x, 0, 1e-6), '아래 표적 → 호도 아래');
}

// ── 표적이 없거나 자기 자신이면 안전한 기본 방향 ────────────────────
{
  for (const toward of [null, { x: 0, y: 0 }]) {
    const pts = slashArcPoints(origin, toward, 'medium');
    assert.equal(pts.length, SLASH_CONFIG.segments + 1, '표적 없어도 호는 나온다');
    for (const p of pts) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), 'NaN 좌표 없음');
    }
  }
}

// ── 타격 원: 전방에 있고, **플레이어 자신은 원 밖** ─────────────────
// 근접인데 등 뒤까지 맞으면 방향성이 무의미해진다 — 이 불변식이 핵심.
{
  for (const size of SIZES) {
    const toward = { x: 100, y: 0 };
    const c = slashHitCircle(origin, toward, size);
    assert.ok(c.x > 0 && near(c.y, 0, 1e-6), `${size}: 원 중심이 조준 방향 앞`);
    const distanceToPlayer = Math.hypot(c.x, c.y);
    assert.ok(
      distanceToPlayer > c.radius,
      `${size}: 시전자가 타격 원 안에 들어감 (거리 ${distanceToPlayer} ≤ 반지름 ${c.radius})`,
    );
    // 원이 사거리를 크게 넘지 않는다 (근접이 원거리처럼 보이지 않게)
    assert.ok(
      distanceToPlayer + c.radius <= slashReach(size) * 1.2,
      `${size}: 타격 범위가 사거리를 과도하게 초과`,
    );
  }
}

// ── 원거리 폼과 확실히 구분되는 스케일 (근접다움) ────────────────────
{
  // nova 기본 반경(120*scale + power)과 비교해도 확연히 짧아야 한다
  assert.ok(slashReach('huge') < 200, '최대 크기도 근접 사거리 유지');
  assert.ok(slashReach('small') < slashReach('huge'), '크기 스케일 유효');
}

// ── 배선 회귀: castSpell이 form='slash'를 실제 참격으로 보내는가 ──────────
// 이 한 줄(case 'slash')이 PR 정리 과정에서 유실됐다(#189 CLOSED → #191이 DSL만 반영).
// 유실되면 판정은 slash인데 화면은 default→castBolt가 나가 "칼로 벤다가 탄환"이 재발한다.
{
  const src = readFileSync('src/render/spellRenderer.ts', 'utf8');
  const at = src.indexOf("case 'slash':");
  assert.ok(at >= 0, "castSpell 스위치에 case 'slash'가 없다");
  assert.ok(
    src.slice(at, at + 120).includes('castSlash('),
    "case 'slash'가 castSlash를 부르지 않는다 (default→castBolt로 떨어짐)",
  );
}

console.log('Slash form regression: 사거리·호 기하·조준 추종·전방 타격원(시전자 제외) 5군 통과');
