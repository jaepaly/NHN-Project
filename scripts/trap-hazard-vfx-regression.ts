import assert from 'node:assert/strict';
import {
  TRAP_HAZARD_PARTICLE_VFX,
  visibleBoundaryOutlineSegments,
  visibleCircleOutlineSegments,
} from '../src/render/trapHazardVfx';

const circle = { x: 100, y: 100, radius: 50 };
const outer = [{ x: 100, y: 0, width: 100, height: 200 }];
const circleSegments = visibleCircleOutlineSegments(circle, outer, 48);
assert.ok(circleSegments.length > 0 && circleSegments.length < 48, '겹친 원형 윤곽만 제거해야 한다');
for (const [x1, y1, x2, y2] of circleSegments) {
  assert.ok((x1 + x2) / 2 < 100, '외곽 위험지대 안쪽 원형 윤곽이 남으면 안 된다');
}

const boundarySegments = visibleBoundaryOutlineSegments([[100, 0, 100, 200]], [circle], 8);
assert.ok(boundarySegments.length > 0, '원 바깥의 외곽선은 유지해야 한다');
for (const [x1, y1, x2, y2] of boundarySegments) {
  const midY = (y1 + y2) / 2;
  assert.ok(midY < 50 || midY > 150, '원 안쪽 외곽선이 남으면 안 된다');
}

assert.ok(TRAP_HAZARD_PARTICLE_VFX.speedMax < 75, '함정방 입자는 보스 위험지대보다 느려야 한다');
assert.ok(TRAP_HAZARD_PARTICLE_VFX.frequency >= 75, '함정방 입자 발생 주기는 보스보다 빨라지면 안 된다');
assert.ok(TRAP_HAZARD_PARTICLE_VFX.quantity <= 2, '한 번의 함정방 입자 발생량은 보스 이하여야 한다');
assert.ok(TRAP_HAZARD_PARTICLE_VFX.scaleStart < 0.42, '함정방 입자는 보스 위험지대보다 작아야 한다');
assert.ok(TRAP_HAZARD_PARTICLE_VFX.alphaStart < 0.8, '함정방 입자는 보스 위험지대보다 어두워야 한다');

console.log('trap hazard vfx regression: 합성 윤곽·중첩 제거·보스 하위강도 파티클 3군 통과');
