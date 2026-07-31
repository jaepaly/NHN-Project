import assert from 'node:assert/strict';
import {
  ROOM_FIXTURE_CONFIG,
  ROOM_FIXTURE_GUIDE,
  ROOM_FIXTURE_LABEL,
  isWithinFixtureReach,
} from '../src/run/roomFixtureConfig';
import { PORTAL_CONFIG } from '../src/run/portalConfig';

const R = ROOM_FIXTURE_CONFIG.reachRadius;

// 1) 사거리 판정 — 경계 포함
assert.equal(isWithinFixtureReach(0, 0, 0, 0), true, '같은 자리');
assert.equal(isWithinFixtureReach(R, 0, 0, 0), true, '정확히 사거리 = 닿는다');
assert.equal(isWithinFixtureReach(R + 0.1, 0, 0, 0), false, '사거리 밖');
assert.equal(isWithinFixtureReach(0, -R, 0, 0), true, '방향 무관');
// 대각선 — 원형 판정이라 정사각형이 아니다
assert.equal(isWithinFixtureReach(R, R, 0, 0), false, '대각선 R,R은 밖 (원형 판정)');
assert.equal(isWithinFixtureReach(R * 0.7, R * 0.7, 0, 0), true, '대각선 안쪽');
// 설치물이 원점이 아니어도
assert.equal(isWithinFixtureReach(960, 640, 960, 640), true);
assert.equal(isWithinFixtureReach(960 + R - 1, 640, 960, 640), true);
assert.equal(isWithinFixtureReach(960 + R + 1, 640, 960, 640), false);

// 2) 방어 — 좌표가 이상하면 발동하지 않는다 (유령 상호작용 금지)
for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  assert.equal(isWithinFixtureReach(bad, 0, 0, 0), false, `playerX ${bad}`);
  assert.equal(isWithinFixtureReach(0, bad, 0, 0), false, `playerY ${bad}`);
  assert.equal(isWithinFixtureReach(0, 0, bad, 0), false, `fixtureX ${bad}`);
  assert.equal(isWithinFixtureReach(0, 0, 0, 0, bad), false, `radius ${bad}`);
}
assert.equal(isWithinFixtureReach(0, 0, 0, 0, -10), true, '음수 반경은 0으로 — 같은 자리만');
assert.equal(isWithinFixtureReach(1, 0, 0, 0, -10), false, '음수 반경에서 1px도 밖');

// 3) **핵심**: 상호작용 사거리가 포탈보다 넉넉하다.
//    포탈은 오입력을 막으려 시각보다 좁혔지만(enterRadius < radius), 설치물은 반대다 —
//    이 방의 유일한 목적이 상호작용이라 "닿았는데 안 열린다"가 더 나쁜 실패다.
assert.ok(
  ROOM_FIXTURE_CONFIG.reachRadius > ROOM_FIXTURE_CONFIG.radius,
  '설치물은 시각 반경보다 넉넉하게 잡는다',
);
assert.ok(
  PORTAL_CONFIG.enterRadius < PORTAL_CONFIG.radius,
  '포탈은 반대 규칙 — 이 대비가 의도적임을 고정한다',
);

// 4) 안내 반경은 사거리보다 훨씬 넓다 — 다가가는 도중에 읽혀야 한다
assert.ok(
  ROOM_FIXTURE_CONFIG.hintRadius > ROOM_FIXTURE_CONFIG.reachRadius * 2,
  '안내는 닿기 훨씬 전부터 보인다',
);
// 안내 반경이 방을 다 덮으면 안내가 상시 켜진 것과 같다 (방 폭 1920의 절반보다 작아야)
assert.ok(ROOM_FIXTURE_CONFIG.hintRadius < 960, '안내가 방 전체를 덮지 않는다');

// 5) 무장 지연 — 도착 즉시 발동을 막는다. 길면 닿았는데 안 열리는 구간이 생긴다.
assert.ok(ROOM_FIXTURE_CONFIG.armDelayMs > 0, '무장 지연이 있다');
assert.ok(
  ROOM_FIXTURE_CONFIG.armDelayMs < PORTAL_CONFIG.armDelayMs,
  '설치물 무장은 포탈보다 짧다',
);

// 6) 문구 — 두 종류 모두 라벨·안내가 있어야 한다 (빈 방에 덜렁 놓이면 뭘 할지 모른다)
for (const kind of ['treasure', 'altar'] as const) {
  assert.ok(ROOM_FIXTURE_LABEL[kind].length > 0, `${kind} 라벨`);
  assert.ok(ROOM_FIXTURE_GUIDE[kind].length > 0, `${kind} 안내`);
  assert.ok(ROOM_FIXTURE_GUIDE[kind].includes('오른쪽'), `${kind} 안내가 위치를 알려준다`);
}
assert.notEqual(ROOM_FIXTURE_LABEL.treasure, ROOM_FIXTURE_LABEL.altar, '두 라벨이 다르다');
// 제단 안내는 대가를 예고한다 — 모르고 다가가면 선택이 아니라 함정이 된다
assert.ok(ROOM_FIXTURE_GUIDE.altar.includes('대가'), '제단 안내가 대가를 예고한다');

// 7) 중앙 도착 지점에서는 닿지 않지만 안내는 보인다 — 직접 다가가야 열린다.
const ARRIVAL = { x: 960, y: 640 };
const FIXTURE = { x: ARRIVAL.x + ROOM_FIXTURE_CONFIG.offsetX, y: ARRIVAL.y };
assert.equal(
  isWithinFixtureReach(ARRIVAL.x, ARRIVAL.y, FIXTURE.x, FIXTURE.y), false,
  '도착 지점에서 즉시 열리면 종전의 팝업과 같아진다',
);
assert.equal(
  isWithinFixtureReach(
    ARRIVAL.x,
    ARRIVAL.y,
    FIXTURE.x,
    FIXTURE.y,
    ROOM_FIXTURE_CONFIG.hintRadius,
  ),
  true,
  '도착 지점에서 설치물 안내가 보여야 직접 다가갈 이유를 안다',
);

console.log('room fixture regression: 사거리·방어·포탈대비·안내반경·무장지연·문구·도착격리 7군 통과');
