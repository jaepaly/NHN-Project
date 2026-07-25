import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SLASH_CONFIG,
  slashAnchor,
  slashCutPoints,
  slashCutRadius,
  slashHitCircle,
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

// ── 배선 회귀: castSpell이 form='slash'를 실제 참격으로 보내는가 ──────
// 이 한 줄이 PR 정리 과정에서 유실된 적 있다(#189 CLOSED → #191이 DSL만 반영).
{
  const src = readFileSync('src/render/spellRenderer.ts', 'utf8');
  const at = src.indexOf("case 'slash':");
  assert.ok(at >= 0, "castSpell 스위치에 case 'slash'가 없다");
  assert.ok(src.slice(at, at + 120).includes('castSlash('),
    "case 'slash'가 castSlash를 부르지 않는다 (default→castBolt로 떨어짐)");
}

console.log('Slash form regression: 적위치 발현·사거리상한·위력반영·시각판정 정렬·가로베기·배선 6군 통과');
