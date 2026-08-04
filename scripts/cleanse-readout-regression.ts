import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanseHintFor, cleanseReadoutLine } from '../src/render/floorHazardReadout';
import { FLOOR_HAZARD_CONFIG } from '../src/combat-core/combat/floorHazardConfig';
import {
  FLOOR_HAZARD_KINDS,
  createFloorHazardPlayerState,
  floorHazardCleansesRemaining,
  tryCleanseFloorHazards,
} from '../src/combat-core/combat/floorHazardState';

/**
 * 위험지대 정화 안내 회귀 (총괄 지적: 정화 잔여가 화면에 없다).
 *
 * `floorHazardCleansesRemaining`은 주석에 *"HUD·안내 문구 분기에 쓴다"*라고 적힌 채
 * **어디서도 호출되지 않았다** — #239/#260에서 상태·정화 기전은 다 붙었는데 표시만
 * 빠졌다. 플레이어는 정화가 있는지도, 무엇으로 되는지도 알 수 없었다.
 */

// ── 1) 지형이 없으면 줄을 만들지 않는다 ─────────────────────────────────────
//
// HUD 컴팩트(총괄 요청)를 되돌리면 안 된다. 위험지대 방에서만 나온다.
{
  const fresh = createFloorHazardPlayerState();
  assert.equal(cleanseReadoutLine(fresh, []), null, '지형 없는 방은 줄 없음');
}

// ── 2) 남았으면 **무엇으로 정화되는지**를 말한다 ────────────────────────────
//
// `cleansesPerRoom`이 1이라 "아껴 쓸까"가 아니라 "언제 쓸까"가 결정이다. 그러면
// 잔여 숫자만으로는 부족하고 **카운터 수단**이 정보다.
{
  const fresh = createFloorHazardPlayerState();
  const lava = cleanseReadoutLine(fresh, ['lava']);
  assert.ok(lava, '용암방은 줄이 있다');
  assert.ok(lava.includes('용암'), '어떤 지형인지 말한다');
  // 카운터 목록은 **설정에서 읽어야** 한다 — 상성 표를 바꾸면 문구가 따라와야 한다
  for (const element of FLOOR_HAZARD_CONFIG.lava.counterElements) {
    const label = { water: '물', ice: '얼음' }[element as 'water' | 'ice'];
    assert.ok(lava.includes(label), `용암 카운터 원소 ${element}(${label})가 문구에 있어야 한다`);
  }
  assert.ok(lava.includes('보호막'), '용암은 shield effect로도 정화된다');

  const poison = cleanseReadoutLine(fresh, ['poison']);
  assert.ok(poison?.includes('빛') && poison.includes('회복'), '독지대 카운터는 빛·회복');

  // 방에 깔린 지형의 카운터만 적는다 — 없는 지형 상성을 적으면 소음이다
  assert.ok(!lava.includes('독지대'), '용암방에 독지대 상성을 적지 않는다');
  assert.ok(!poison.includes('용암'), '독지대방에 용암 상성을 적지 않는다');

  const both = cleanseReadoutLine(fresh, ['lava', 'poison']);
  assert.ok(both?.includes('용암') && both.includes('독지대'), '둘 다 깔리면 둘 다 적는다');
}

// ── 3) 상태 전이가 문구에 드러난다 ──────────────────────────────────────────
{
  const fresh = createFloorHazardPlayerState();

  // 물로 용암 정화 → 면역이 최우선 정보다 (지금 밟아도 안 아프다 = 행동이 달라진다)
  const cleansed = tryCleanseFloorHazards(fresh, 'water', 'damage', ['lava']);
  assert.deepEqual(cleansed.cleansed, ['lava'], '물이 용암을 정화한다');
  const immuneLine = cleanseReadoutLine(cleansed.state, ['lava']);
  assert.ok(immuneLine?.includes('면역'), '면역 중에는 면역을 말한다');
  assert.ok(
    immuneLine.includes(FLOOR_HAZARD_CONFIG.immunitySeconds.toFixed(1)),
    '면역 남은 시간을 초 단위로 보여준다',
  );

  // 면역이 끝나고 횟수를 다 썼으면 그 사실을 말한다
  const spent = { ...cleansed.state, immunity: { lava: 0, poison: 0 } };
  assert.equal(floorHazardCleansesRemaining(spent), 0, '1회짜리라 한 번 쓰면 소진');
  const spentLine = cleanseReadoutLine(spent, ['lava']);
  assert.ok(spentLine?.includes('소진'), '소진을 명시한다 — 기대하고 있으면 안 된다');

  // ⚠️ 안 통하는 주문은 횟수를 **안 쓴다**(tryCleanseFloorHazards 계약).
  // 문구도 그대로여야 한다 — 줄었다고 표시되면 플레이어가 잘못 배운다.
  const wasted = tryCleanseFloorHazards(fresh, 'fire', 'damage', ['lava']);
  assert.deepEqual(wasted.cleansed, [], '불은 용암을 정화하지 못한다');
  assert.equal(
    cleanseReadoutLine(wasted.state, ['lava']),
    cleanseReadoutLine(fresh, ['lava']),
    '실패한 시전은 문구를 바꾸지 않는다',
  );
}

// ── 4) 힌트는 설정에서 파생된다 ─────────────────────────────────────────────
//
// 상성 표를 바꿨는데 문구가 옛날 값을 말하면 #266("포탈이 거짓말한다")과 같은 결함이다.
for (const kind of FLOOR_HAZARD_KINDS) {
  const hint = cleanseHintFor(kind);
  const config = FLOOR_HAZARD_CONFIG[kind];
  const expected = config.counterElements.length + config.counterEffects.length;
  assert.equal(
    hint.split('·').length, expected,
    `${kind} 힌트 항목 수가 설정(원소 ${config.counterElements.length} + effect ${config.counterEffects.length})과 같아야 한다`,
  );
  assert.ok(hint.length > 0, `${kind} 힌트가 비면 안 된다`);
}

// ── 5) 씬이 실제로 붙였는가 — 정화 안내는 우측 상태 패널에 남는가 ───────────
//
// #345에서 플레이어 HP·마나·실드는 우하단으로 이동했다. 위험지대 정화는 플레이어
// 수치가 아니라 **현재 방 상태**이므로, 이동한 상태판에 섞지 않고 우측 `waveText`
// 패널에만 남겨야 한다. 예전의 좌상단 HUD 높이(130px) 고정 단언은 이 재배치와
// 충돌하므로, 실제 정보 소속을 검증한다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(
    /cleanseReadoutLine\(\s*this\.floorHazardPlayer,/.test(scene),
    '씬이 정화 문구를 만들어야 한다',
  );
  assert.ok(
    /const withCleanse = /.test(scene),
    '분기마다 반복하지 않고 한 곳에서 조립해야 한다',
  );
  // 우측 패널의 **모든** 분기가 통과해야 한다 — 하나라도 빠지면 그 상황에서만 사라진다
  const rawSetText = scene.match(/this\.waveText\.setText\(/g) ?? [];
  const viaCleanse = scene.match(/this\.waveText\.setText\(withCleanse\(/g) ?? [];
  assert.equal(
    rawSetText.length, viaCleanse.length,
    `waveText.setText 호출 ${rawSetText.length}건 중 ${viaCleanse.length}건만 withCleanse를 거친다`
    + ' — 빠진 분기에서는 정화 줄이 사라진다',
  );
  assert.ok(viaCleanse.length >= 7, `분기가 7개 이상이어야 한다 (현재 ${viaCleanse.length})`);

  // 정화는 우측 방 상태 패널에서만 읽는다. 우하단 HP·마나·실드 판의 책임이 아니다.
  assert.ok(
    !/VITAL_HUD[\s\S]{0,500}cleanseReadoutLine|cleanseReadoutLine[\s\S]{0,500}VITAL_HUD/.test(scene),
    '정화 안내를 우하단 플레이어 상태판에 섞지 않는다',
  );
}

console.log(
  'cleanse readout regression: 공백방·카운터표시·상태전이·설정파생·씬배선 5군 통과',
);
