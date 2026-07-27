import assert from 'node:assert/strict';
import {
  FLOOR_HAZARD_CONFIG,
  floorHazardTickDamage,
  floorHazardLingerSeconds,
  isInFloorHazard,
  type FloorHazardZone,
} from '../src/combat-core/combat/floorHazardConfig';

// ── 틱 피해 = 초당 피해 × 틱 간격 ─────────────────────────
{
  const dt = FLOOR_HAZARD_CONFIG.tickIntervalSeconds;
  assert.equal(
    floorHazardTickDamage('lava'),
    Math.round(FLOOR_HAZARD_CONFIG.lava.damagePerSecond * dt),
    '용암 틱 피해 = 초당×간격',
  );
  assert.equal(
    floorHazardTickDamage('poison'),
    Math.round(FLOOR_HAZARD_CONFIG.poison.damagePerSecond * dt),
    '독지대 틱 피해 = 초당×간격',
  );
}

// ── 설계 불변식: 용암이 독지대보다 아프고, 독지대는 잔류한다 ──
{
  assert.ok(
    floorHazardTickDamage('lava') > floorHazardTickDamage('poison'),
    '용암 > 독지대 (밟으면 확실히 빠지게)',
  );
  assert.equal(floorHazardLingerSeconds('lava'), 0, '용암은 이탈 시 즉시 멈춤');
  assert.ok(
    floorHazardLingerSeconds('poison') > 0,
    '독지대는 이탈 후 도트 잔류(특성)',
  );
  assert.ok(
    floorHazardLingerSeconds('poison') > floorHazardLingerSeconds('lava'),
    '잔류: 독지대 > 용암',
  );
}

// ── 원형 존 판정: 안·밖·경계 ─────────────────────────────
{
  const zone: FloorHazardZone = { kind: 'lava', x: 100, y: 100, radius: 40 };
  assert.ok(isInFloorHazard(100, 100, zone), '중심 = 안');
  assert.ok(isInFloorHazard(130, 100, zone), '반경 안(30<40) = 안');
  assert.ok(isInFloorHazard(140, 100, zone), '경계(=반경) = 안(포함)');
  assert.ok(!isInFloorHazard(141, 100, zone), '반경 밖 = 밖');
  assert.ok(!isInFloorHazard(200, 200, zone), '멀리 = 밖');
}

console.log('Floor hazard regression: 틱피해·설계불변식(용암>독·독잔류)·원형존판정 3군 통과');
