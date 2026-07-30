import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RISK_ORDER,
  ROOM_REWARD_SCALES,
  SAFE_BELOW_COMBAT,
  rewardOptionCount,
  rewardScaleFor,
  totalReturn,
} from '../src/combat-core/run/roomRewardScale';
import { drawRewardOptions } from '../src/combat-core/run/rewardConfig';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import type { MapNodeKind } from '../src/run/mapGraphContract';

const KINDS: readonly MapNodeKind[] = [
  'start', 'combat', 'elite', 'stage-boss', 'memory-boss', 'treasure', 'altar', 'trap',
];

// 1) 여덟 종류 전부 배율이 있다 — 빠지면 그 방이 undefined 배율로 떨어진다
assert.equal(Object.keys(ROOM_REWARD_SCALES).length, KINDS.length);
for (const kind of KINDS) {
  const entry = rewardScaleFor(kind);
  assert.ok(entry, `${kind} 배율 없음`);
  assert.ok(entry.scale > 0, `${kind} 배율은 양수`);
  assert.ok(typeof entry.hint === 'string', `${kind} 힌트`);
}

// 2) ══ 핵심 불변식: **위험한 방이 더 준다** ══
// 총괄 지적("누가 함정방을 선택하겠어")의 근본 원인이 이 부등식의 부재였다.
// 종전엔 combat·elite·trap이 전부 배율 1로 동일해 더 위험한 방을 고를 이유가 없었다.
for (let i = 1; i < RISK_ORDER.length; i += 1) {
  const safer = rewardScaleFor(RISK_ORDER[i - 1]).scale;
  const riskier = rewardScaleFor(RISK_ORDER[i]).scale;
  assert.ok(
    riskier > safer,
    `${RISK_ORDER[i]}(${riskier})가 ${RISK_ORDER[i - 1]}(${safer})보다 많이 줘야 한다`,
  );
}
// 일반 전투가 기준값 1 — 다른 방들이 이보다 나은지로 읽힌다
assert.equal(rewardScaleFor('combat').scale, 1, '일반 전투가 기준값');
// 함정·정예는 확실히 이득이어야 한다 (오차 수준이면 체감이 없다)
for (const kind of ['trap', 'elite'] as const) {
  assert.ok(
    rewardScaleFor(kind).scale >= 1.2,
    `${kind} 배율이 너무 작다 (${rewardScaleFor(kind).scale}) — 위험을 감수할 이유가 안 된다`,
  );
}

// 3) 무전투 방은 **선택 폭**으로 대가를 치른다
//
// ⚠️ 이 군은 처음에 `optionCount === 2`만 봤고 **곱을 본 적이 없었다.** 그래서
// 배율 ×1.3(리스크 0인데 함정 근처)에서도 그대로 통과했다 — 총괄이 지적한
// "다들 보상방을 가고 싶을 거 아냐"가 회귀를 통과하고 있었던 것이다.
// 총합 비교는 아래 SAFE_BELOW_COMBAT 군이 한다. 여기는 폭만 본다.
assert.equal(rewardScaleFor('treasure').optionCount, 2, '보물은 2택 — 안전한 대가');
assert.ok(
  (rewardScaleFor('treasure').optionCount ?? 3) < 3,
  '보물이 배율도 높고 선택지도 많으면 다른 방을 고를 이유가 없다',
);
assert.equal(rewardScaleFor('combat').optionCount, undefined, '일반은 기본 3택');

// 4) 힌트가 고르기 전에 정보를 준다 — 이게 없으면 배율을 올려도 모른다
for (const kind of ['combat', 'elite', 'trap', 'treasure', 'altar'] as const) {
  assert.ok(rewardScaleFor(kind).hint.length > 0, `${kind} 힌트가 비었다`);
}
// 배율이 있는 방은 힌트에 그 수치가 드러난다
for (const kind of ['elite', 'trap'] as const) {
  const { scale, hint } = rewardScaleFor(kind);
  assert.ok(
    hint.includes(String(scale)),
    `${kind} 힌트에 배율이 안 보인다 ("${hint}") — 정보 없는 선택은 제비뽑기다`,
  );
}
// 힌트가 서로 달라야 포탈 두 개를 비교할 수 있다
const hints = ['combat', 'elite', 'trap', 'treasure', 'altar'].map(
  (k) => rewardScaleFor(k as MapNodeKind).hint,
);
assert.equal(new Set(hints).size, hints.length, '힌트가 겹치는 방 종류가 있다');

// 5) 배율이 실제 카드에 반영된다 — 설정만 있고 안 쓰이면 의미가 없다
const rand = (() => { let i = 0; return () => { i += 1; return (i * 0.37) % 1; }; })();
const base = drawRewardOptions(1, rand, 1);
const scaled = drawRewardOptions(1, (() => {
  let i = 0; return () => { i += 1; return (i * 0.37) % 1; };
})(), rewardScaleFor('elite').scale);
assert.equal(base.length, scaled.length, '같은 시드면 같은 장수');
const scaledWithPower = scaled.filter((o) => (o.powerScale ?? 1) > 1);
assert.ok(scaledWithPower.length > 0, '정예 배율이 카드의 powerScale에 실려야 한다');
for (const option of scaledWithPower) {
  assert.equal(option.powerScale, rewardScaleFor('elite').scale, 'powerScale이 배율과 일치');
}
// 기준값에서는 powerScale이 붙지 않는다 (1을 명시할 이유가 없다)
assert.ok(
  base.every((o) => (o.powerScale ?? 1) === 1),
  '기준 배율에서는 powerScale이 1',
);

// 6) 프리셋의 모든 노드가 배율을 받는다
for (const node of MAP_GRAPH_PRESET_01.nodes) {
  assert.ok(rewardScaleFor(node.kind), `${node.id}(${node.kind}) 배율 없음`);
}
// 프리셋에 실제로 위험한 방이 있어야 이 체계가 의미가 있다
const risky = MAP_GRAPH_PRESET_01.nodes.filter(
  (n) => rewardScaleFor(n.kind).scale > 1 && n.kind !== 'treasure' && n.kind !== 'altar',
);
assert.ok(risky.length > 0, '프리셋에 위험–보상 방이 없다');

// ── 리스크 0인 방이 싸운 방을 이기면 안 된다 ────────────────────────────────
//
// 총괄 지적 2026-07-30: *"일반전투방과 보상방이 있으면 다들 보상방을 가고 싶을 거 아냐."*
// 위 RISK_ORDER는 **전투방들 사이의** 순서만 봤다. 무전투 방이 그 축을 우회해
// 제일 좋은 노드가 되는 경우를 잡지 못했다 — 실제로 그랬다(2택 ×1.3, 리스크 0).
//
// 배율만 비교하면 안 된다: 2택 ×1.3은 배율만 보면 전투방(3택 ×1.0)보다 크다. 카드가
// 한 장 적으면 원하는 걸 못 볼 확률이 커지므로 **폭도 리턴**이다. totalReturn이 둘을
// 함께 본다.
for (const safe of SAFE_BELOW_COMBAT) {
  assert.ok(
    totalReturn(safe) < totalReturn('combat'),
    `${safe}(총리턴 ${totalReturn(safe).toFixed(3)})는 일반전투(${totalReturn('combat').toFixed(3)})보다 낮아야 한다 — 리스크 0인 방이 이기면 분기가 정답이 된다`,
  );
  // 그리고 싸우는 방 전부보다 낮아야 한다 — 정예·함정을 무전투로 넘으면 더 심각하다
  for (const risky of RISK_ORDER) {
    assert.ok(
      totalReturn(safe) < totalReturn(risky),
      `${safe}가 ${risky}보다 낮아야 한다`,
    );
  }
  // 폭이 좁은 것이 무전투의 대가다 — 3택을 주면 안전이 무료가 된다
  assert.ok(
    rewardOptionCount(safe) < 3,
    `${safe}는 선택지가 3택 미만이어야 한다 (현재 ${rewardOptionCount(safe)})`,
  );
}

// ── 보물 수치의 유일한 출처는 이 표다 ──────────────────────────────────────
//
// 종전엔 treasureRewardConfig가 깊이별 2~3택 · 1.3~1.6배를 **자체 결정**했고 포탈
// 힌트만 이 표를 읽었다. 표가 둘로 갈려 서로 다른 값을 말하는 상태였다 — 힌트는
// "2택"인데 깊이 0.5 이상이면 3택 ×1.6이 나오는 구조. #266에서 고친 "포탈이
// 거짓말한다"가 데이터 중복으로 재발할 준비를 하고 있었다.
{
  const treasureSrc = readFileSync('src/combat-core/run/treasureRewardConfig.ts', 'utf8');
  // 선언을 잡는다 — 왜 걷어냈는지 설명하는 주석의 언급까지 막으면 기록이 사라진다
  assert.ok(
    !/(?:export\s+)?const\s+TREASURE_CONFIG/.test(treasureSrc),
    'treasureRewardConfig는 자체 수치표를 선언하지 않는다 (roomRewardScale이 유일한 출처)',
  );
  assert.ok(
    /rewardScaleFor\('treasure'\)/.test(treasureSrc)
      && /rewardOptionCount\('treasure'\)/.test(treasureSrc),
    'treasureRewardConfig는 배율·선택지 수를 roomRewardScale에서 읽어야 한다',
  );
  // 깊이 분기가 남아 있으면 힌트가 다시 어긋난다 (그리고 그 등급은 현재 프리셋에서
  // 도달 불가였다 — 보물 노드는 s1-treasure 하나, 방 2 = 깊이 0.25)
  assert.ok(
    !/(?:high|low)Floor\s*[:.]/.test(treasureSrc),
    '보물방 깊이별 등급은 걷어냈다 — 필요하면 roomRewardScale에서 하고 힌트가 따라오게',
  );
}

// ── 힌트가 총 리턴을 말해야 한다 ───────────────────────────────────────────
//
// 배율만 적으면 "2택 ×1.3"과 "3택 ×1.0" 중 뭐가 나은지 알 수 없다. 선택지 수를
// 함께 적어 포탈 앞에서 비교가 되게 한다. 전투방은 배율이 기준값(×1.0)이라 적을
// 게 없으니 **친화 성장**을 적는다 — 캐스트 0회인 보물방이 못 얻는 실재 리턴이다.
for (const kind of [...RISK_ORDER, ...SAFE_BELOW_COMBAT]) {
  const { hint } = ROOM_REWARD_SCALES[kind];
  assert.ok(hint.includes('택'), `${kind} 힌트는 선택지 수를 말해야 한다: "${hint}"`);
}
assert.ok(
  ROOM_REWARD_SCALES.combat.hint.includes('성장'),
  '전투방 힌트는 친화 성장을 말해야 한다 — 무전투 방이 못 얻는 리턴이다',
);
assert.ok(
  ROOM_REWARD_SCALES.treasure.hint.includes('성장 없음'),
  '보물방 힌트는 성장이 없다는 걸 말해야 한다 (캐스트 0회 = 사용 친화도·인그레이브 후보 0)',
);

console.log('room reward scale regression: 전종류·위험보상·무전투대가·힌트·카드반영·프리셋·무전투열위·단일출처·힌트총합 9군 통과');
