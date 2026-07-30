import assert from 'node:assert/strict';
import { drawTreasureReward } from '../src/combat-core/run/treasureRewardConfig';
import { ALTAR_CONFIG } from '../src/combat-core/run/altarRewardConfig';
import {
  RISK_ORDER,
  rewardOptionCount,
  rewardScaleFor,
  totalReturn,
} from '../src/combat-core/run/roomRewardScale';

/**
 * 보물방 보상 회귀.
 *
 * ⚠️ **이 파일은 종전에 정반대를 고정하고 있었다.** 원래는
 * `assert.ok(TREASURE_CONFIG.lowFloor.scale > 1, '보물 저층 > 표준(일반방보다 메리트)')`
 * — 즉 *"무전투 방이 전투방보다 좋아야 한다"*를 회귀로 못박아 두었다. 총괄 지적
 * 2026-07-30(*"일반전투방과 보상방이 있으면 다들 보상방을 가고 싶을 거 아냐"*)이
 * 가리킨 건 버그가 아니라 **의도적으로 코드에 새겨둔 설계**였다.
 *
 * 이제 뒤집는다: 보물방은 **숫자로 이기지 않는다.** 존재 이유는 배율이 아니라
 * "지금 체력이 아깝다"이고, 안전이 값이므로 총 리턴은 싸운 방들보다 낮다.
 *
 * 깊이별 등급(2~3택 · 1.3~1.6배)도 걷어냈다 — 표가 `roomRewardScale`과 둘로 갈려
 * 포탈 힌트와 실제 추첨이 다른 값을 말하고 있었고, ×1.6 등급은 프리셋에서 도달
 * 불가였다(보물 노드는 `s1-treasure` 하나, 방 2 = 깊이 0.25).
 */

/** 결정론 PRNG — 시드 고정 재현 테스트용 (mulberry32). */
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TREASURE_SCALE = rewardScaleFor('treasure').scale;
const TREASURE_COUNT = rewardOptionCount('treasure');

// ── 1) 추첨 결과가 단일 출처 표를 따른다 ─────────────────────
{
  const drawn = drawTreasureReward(1, 8, seededRand(10));
  assert.equal(drawn.length, TREASURE_COUNT, '보물 선택지 수 = roomRewardScale');
  assert.equal(new Set(drawn.map((o) => o.kind)).size, TREASURE_COUNT, '중복 없는 종류');
  for (const o of drawn) {
    assert.ok(o.id.startsWith('treasure-'), '보물 id 접두사');
    if (o.kind !== 'spirit-haste') {
      assert.equal(o.powerScale, TREASURE_SCALE, '배율 = roomRewardScale');
    }
  }
}

// ── 2) 깊이는 더 이상 보상을 바꾸지 않는다 ────────────────────
//
// 종전엔 깊이 0.5를 넘으면 2택 ×1.3 → 3택 ×1.6으로 뛰었다. 포탈 힌트는 계속
// "2택"이라 말했으므로 #266에서 고친 "포탈이 거짓말한다"가 그대로 재발할 구조였다.
// 깊이별 강화가 필요하면 roomRewardScale에서 하고 힌트가 자동으로 따라오게 한다.
{
  const shallow = drawTreasureReward(2, 8, seededRand(7)); // 깊이 0.25
  const deep = drawTreasureReward(2, 8, seededRand(7));
  const deepRun = drawTreasureReward(7, 8, seededRand(7)); // 깊이 0.875
  assert.deepEqual(shallow, deep, '같은 시드 같은 보물 (재현성)');
  assert.equal(deepRun.length, shallow.length, '깊이가 선택지 수를 바꾸지 않는다');
  for (const o of deepRun) {
    if (o.kind !== 'spirit-haste') {
      assert.equal(o.powerScale, TREASURE_SCALE, '깊이가 배율을 바꾸지 않는다');
    }
  }
}

// ── 3) **리스크 0인 방이 싸운 방을 이기지 않는다** ──────────────
//
// 이 게임의 방 선택이 분기이려면 안전에 값이 있어야 한다. 배율만 비교하면 안 된다:
// 2택 ×1.15는 배율만 보면 전투방(3택 ×1.0)보다 크다. 카드가 한 장 적으면 원하는
// 걸 못 볼 확률이 커지므로 폭도 리턴이고, totalReturn이 둘을 함께 본다.
{
  assert.ok(
    totalReturn('treasure') < totalReturn('combat'),
    `보물(${totalReturn('treasure').toFixed(3)}) < 일반전투(${totalReturn('combat').toFixed(3)})`,
  );
  for (const risky of RISK_ORDER) {
    assert.ok(
      totalReturn('treasure') < totalReturn(risky),
      `보물이 ${risky}보다 낮아야 한다 — 무전투로 위험 보상을 넘으면 안 된다`,
    );
  }
  assert.ok(
    TREASURE_SCALE < ALTAR_CONFIG.premiumScale,
    '보물 < 제단 (최대 체력을 내고 사는 쪽이 더 세다)',
  );
  // 폭이 좁은 것이 무전투의 대가 — 3택을 주면 안전이 무료가 된다
  assert.ok(TREASURE_COUNT < 3, `보물은 3택 미만 (현재 ${TREASURE_COUNT})`);
}

// ── 4) 그래도 갈 이유는 남는다 ──────────────────────────────
//
// 총 리턴이 낮다고 배율까지 표준 아래로 내리면 "체력이 아까워 안전을 산다"는
// 동기마저 사라진다. 배율은 기준값 이상이고, 낮아진 건 **폭**이다.
{
  assert.ok(
    TREASURE_SCALE >= rewardScaleFor('combat').scale,
    '보물 배율은 표준 이상 — 안전을 사는 대가는 폭(2택)이지 카드 품질이 아니다',
  );
}

console.log('Treasure reward regression: 단일출처·깊이무관·무전투열위·잔존동기 4군 통과');
