import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FLOOR_HAZARD_CONFIG,
  canCleanseFloorHazard,
  floorHazardTickDamage,
  floorHazardLingerSeconds,
  isInFloorHazard,
  spellCountersHazard,
  type FloorHazardZone,
} from '../src/combat-core/combat/floorHazardConfig';

// ── 틱 피해 = 초당 피해 × 틱 간격 ─────────────────────────
{
  for (const kind of ['lava', 'poison'] as const) {
    const tickDamage = floorHazardTickDamage(kind);
    assert.equal(
      tickDamage / FLOOR_HAZARD_CONFIG.tickIntervalSeconds,
      FLOOR_HAZARD_CONFIG[kind].damagePerSecond,
      `${kind}: 틱 변환 뒤에도 실효 DPS 보존`,
    );
    assert.ok(tickDamage >= 1, `${kind}: 틱 피해가 0이 되어 무해한 장판이 되면 안 됨`);
  }
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

// ── 카운터(정화) 판정: 원소 상성 OR 보호 effect ──────────
{
  // 용암(fire) ← water·ice 원소 / shield effect. fire·light·heal은 카운터 아님.
  assert.ok(spellCountersHazard('water', 'damage', 'lava'), '물 → 용암 카운터');
  assert.ok(spellCountersHazard('ice', 'damage', 'lava'), '얼음 → 용암 카운터');
  assert.ok(spellCountersHazard('fire', 'shield', 'lava'), '보호막 effect → 용암 카운터');
  assert.ok(!spellCountersHazard('fire', 'damage', 'lava'), '불 → 용암 카운터 아님');
  assert.ok(!spellCountersHazard('light', 'heal', 'lava'), '빛·회복 → 용암 카운터 아님');

  // 독지대(dark) ← light 원소 / heal effect. dark·water·shield는 카운터 아님.
  assert.ok(spellCountersHazard('light', 'damage', 'poison'), '빛 → 독지대 카운터');
  assert.ok(spellCountersHazard('fire', 'heal', 'poison'), '회복/해독 effect → 독지대 카운터');
  assert.ok(!spellCountersHazard('dark', 'damage', 'poison'), '어둠 → 독지대 카운터 아님');
  assert.ok(!spellCountersHazard('water', 'shield', 'poison'), '물·보호막 → 독지대 카운터 아님');
}

// ── 정화 남발 방지: 실제 차단 동작 ───────────────────────
{
  // 방 진입 직후(0회 사용)엔 정화 가능. 씬도 이 헬퍼로 게이트한다(같은 판정).
  assert.ok(canCleanseFloorHazard(0), '방 진입 직후엔 정화 가능');
  // 허용 횟수를 다 쓰면 그 다음 시전은 상성이 맞아도 막힌다("한 방에 한 번" 남발 방지).
  assert.ok(
    !canCleanseFloorHazard(FLOOR_HAZARD_CONFIG.cleansesPerRoom),
    '허용 횟수 다 쓰면 정화 차단',
  );
  assert.ok(
    !canCleanseFloorHazard(FLOOR_HAZARD_CONFIG.cleansesPerRoom + 3),
    '초과 사용도 계속 차단(음수 여유 없음)',
  );
  assert.ok(FLOOR_HAZARD_CONFIG.immunitySeconds > 0, '정화 후 면역 시간 있음');
}

// ── 씬 배선 (과거 배선 유실 방지) ─────────────────────────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  for (const [needle, why] of [
    ['this.updateFloorHazards(d)', '스케일된 게임 시간 루프에서 바닥지형을 갱신해야 함'],
    ['isInFloorHazard(this.player.x, this.player.y, zone)', '플레이어 위치와 지형 존을 판정해야 함'],
    ['this.clearFloorHazards()', '방 전환 시 바닥지형을 비워야 함'],
    ['this.floorHazardTickCooldown = Math.max(', '틱 쿨다운을 게임 시간으로 감산해야 함'],
  ] as const) {
    assert.ok(scene.includes(needle), `${why} (누락: ${needle})`);
  }

  const tickBody = scene.slice(
    scene.indexOf('private tickFloorHazards'),
    scene.indexOf('private tryFloorHazardCleanse'),
  );
  assert.ok(tickBody.length > 200, '전제: tickFloorHazards 본문을 찾아야 함');
  assert.ok(
    tickBody.includes('this.isCombatActive()'),
    '비전투·방 전환 중에는 바닥지형 피해를 적용하면 안 됨',
  );
}

console.log('Floor hazard regression: 틱피해·설계불변식·원형존판정·카운터정화·정화차단 5군 통과');
