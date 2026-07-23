import assert from 'node:assert/strict';
import { SHAPE_LIMITS, validateSpellShape } from '../src/spell/spellShape';
import type { ShapeKind } from '../src/spell/spellShape';
import {
  WALL_CONFIG,
  shapedWallPoints,
  wallArcPoints,
  wallFrontage,
  sweepIntersectsPolyline,
} from '../src/combat-core/combat/persistentFormConfig';
import type { FormPoint } from '../src/combat-core/combat/persistentFormConfig';

const origin: FormPoint = { x: 0, y: 0 };
const target: FormPoint = { x: 300, y: 0 };

function length(points: readonly FormPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

// 1) 검증기 — 화이트리스트 밖은 거부(기본형 폴백), 수치는 클램프
assert.equal(validateSpellShape(null), null, 'null 방어');
assert.equal(validateSpellShape({ kind: 'spiral' }), null, '미허용 종류는 거부');
assert.equal(validateSpellShape({ kind: 'ring' })?.kind, 'ring');
assert.equal(
  validateSpellShape({ kind: 'zigzag', amplitude: 9999 })?.amplitude,
  SHAPE_LIMITS.maxAmplitude,
  '진폭 상한 클램프',
);
assert.equal(
  validateSpellShape({ kind: 'polygon', sides: 99 })?.sides,
  SHAPE_LIMITS.maxSides,
  '변 수 상한 클램프',
);
assert.equal(
  validateSpellShape({ kind: 'polygon', sides: 1 })?.sides,
  SHAPE_LIMITS.minSides,
  '변 수 하한 클램프(삼각형 미만 없음)',
);

// 2) 기본 동작 불변 — shape 없음/arc는 기존 원호와 완전히 동일해야 한다
for (const size of ['small', 'medium', 'large', 'huge'] as const) {
  const legacy = wallArcPoints(origin, target, size);
  assert.deepEqual(shapedWallPoints(origin, target, size), legacy, `${size}: shape 없음 = 기존 원호`);
  assert.deepEqual(
    shapedWallPoints(origin, target, size, 1, { kind: 'arc' }),
    legacy,
    `${size}: arc = 기존 원호`,
  );
}

// 3) 핵심 불변식 — 형상은 표현이지 위력이 아니다.
//    열린 형상 = 정면폭 고정 (막는 통로 폭이 벽의 세기) / 닫힌 형상 = 둘레 고정 (360° 차단 상쇄)
function frontage(points: readonly FormPoint[]): number {
  // 목표 방향이 +x이므로 정면폭은 y축 폭
  const ys = points.map((p) => p.y);
  return Math.max(...ys) - Math.min(...ys);
}
for (const size of ['small', 'medium', 'large', 'huge'] as const) {
  // 열린 형상 기준 = 기본 원호(arc)의 실효 정면폭 — 오탐(arc↔line 스왑)이 세기를 못 바꾸게
  const expectedFrontage = wallFrontage(size);
  const arcFrontage = frontage(wallArcPoints(origin, target, size));
  assert.ok(
    Math.abs(expectedFrontage - arcFrontage) < 0.5,
    `${size}: wallFrontage 공식이 실제 arc 정면폭과 일치해야 한다`,
  );
  for (const kind of ['line', 'zigzag', 'wave'] as const) {
    for (const amplitude of [1, 30, 60, 100]) {
      const points = shapedWallPoints(origin, target, size, 1, { kind, amplitude });
      const actual = frontage(points);
      assert.ok(
        Math.abs(actual - expectedFrontage) < 0.5,
        `${size}/${kind}(진폭${amplitude}): 정면폭 ${actual.toFixed(1)} ≈ arc ${expectedFrontage.toFixed(1)}`
        + ' — 오탐으로 형상이 바뀌어도 막는 폭이 변하면 숨은 버프다',
      );
    }
  }
  for (const kind of ['ring', 'polygon'] as const) {
    const points = shapedWallPoints(origin, target, size, 1, { kind, sides: 3 });
    const actual = length(points);
    assert.ok(
      Math.abs(actual - WALL_CONFIG.lengths[size]) < 0.5,
      `${size}/${kind}: 둘레 ${actual.toFixed(1)} ≈ ${WALL_CONFIG.lengths[size]} (360° 차단은 반경으로 상쇄)`,
    );
  }
}

// 3-b) 굴곡은 정면폭을 건드리지 않는다 — 진폭이 커져도 막는 폭은 같다
const flat = shapedWallPoints(origin, target, 'large', 1, { kind: 'zigzag', amplitude: 1 });
const deep = shapedWallPoints(origin, target, 'large', 1, { kind: 'zigzag', amplitude: 100 });
assert.ok(Math.abs(frontage(flat) - frontage(deep)) < 0.5, '진폭이 정면폭을 바꾸면 안 된다');
assert.ok(length(deep) > length(flat) * 1.5, '진폭이 크면 접힌 길이는 늘어난다(모양이 실제로 변함)');

// 4) 형상이 실제로 서로 달라야 한다 (모양이 이름뿐이면 의미 없다)
const shapes: ShapeKind[] = ['line', 'zigzag', 'wave', 'ring', 'polygon'];
const signatures = shapes.map((kind) => JSON.stringify(
  shapedWallPoints(origin, target, 'large', 1, { kind, amplitude: 60, sides: 3 })
    .map((p) => [Math.round(p.x), Math.round(p.y)]),
));
assert.equal(new Set(signatures).size, shapes.length, '형상마다 실제 좌표가 달라야 한다');

// 5) 닫힌 도형은 시전자를 감싼다 — 사방이 막혀야 "둘러싸기"가 성립
for (const kind of ['ring', 'polygon'] as const) {
  const points = shapedWallPoints(origin, target, 'large', 1, { kind, sides: 3 });
  const first = points[0];
  const last = points[points.length - 1];
  assert.ok(
    Math.hypot(last.x - first.x, last.y - first.y) < 1,
    `${kind}: 시작점과 끝점이 만나 닫혀야 한다`,
  );
  // 시전자에서 밖으로 나가는 어느 방향이든 벽을 지난다
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 1.1, -2.4]) {
    const far = { x: Math.cos(angle) * 500, y: Math.sin(angle) * 500 };
    assert.ok(
      sweepIntersectsPolyline(origin, far, 1, points),
      `${kind}: ${angle.toFixed(1)}rad 탈출 경로도 막아야 한다`,
    );
  }
}

// 6) 열린 형상은 뒤를 막지 않는다 (닫힌 도형과의 차이가 실제로 존재)
const line = shapedWallPoints(origin, target, 'large', 1, { kind: 'line' });
assert.ok(
  !sweepIntersectsPolyline(origin, { x: -500, y: 0 }, 1, line),
  'line: 목표 반대편은 열려 있어야 한다',
);

// 7) 폴리라인 충돌이 형상과 무관하게 작동 (판정 자동 승계)
for (const kind of shapes) {
  const points = shapedWallPoints(origin, target, 'large', 1, { kind, amplitude: 60, sides: 3 });
  assert.ok(points.length >= 4, `${kind}: 판정 가능한 선분 수`);
  assert.ok(
    points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    `${kind}: 좌표가 유한해야 한다`,
  );
}

console.log('spell shape regression: 검증기·기본불변·정면폭/둘레 불변식·형상차이·닫힘·충돌 8군 통과');
