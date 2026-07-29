import assert from 'node:assert/strict';
import {
  TREASURE_CONFIG,
  drawTreasureReward,
} from '../src/combat-core/run/treasureRewardConfig';
import { ALTAR_CONFIG } from '../src/combat-core/run/altarRewardConfig';

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

// ── 저층(깊이<0.5): 옵션 2개 · 배율 1.3 ─────────────────────
{
  const low = drawTreasureReward(1, 6, seededRand(10)); // 깊이 0.167
  assert.equal(low.length, TREASURE_CONFIG.lowFloor.optionCount, '저층 옵션 2개');
  assert.equal(new Set(low.map((o) => o.kind)).size, 2, '저층 2종 (다양성)');
  for (const o of low) {
    assert.ok(o.id.startsWith('treasure-'), '보물 id 접두사');
    if (o.kind !== 'spirit-haste') {
      assert.equal(o.powerScale, TREASURE_CONFIG.lowFloor.scale, '저층 배율 1.3');
    }
  }
}

// ── 고층(깊이≥0.5): 옵션 3개 · 배율 1.6 ─────────────────────
{
  const high = drawTreasureReward(5, 6, seededRand(10)); // 깊이 0.833
  assert.equal(high.length, TREASURE_CONFIG.highFloor.optionCount, '고층 옵션 3개');
  assert.equal(new Set(high.map((o) => o.kind)).size, 3, '고층 3종 (다양성)');
  for (const o of high) {
    if (o.kind !== 'spirit-haste') {
      assert.equal(o.powerScale, TREASURE_CONFIG.highFloor.scale, '고층 배율 1.6');
    }
  }
}

// ── 재현성: 같은 시드 → 같은 결과 ────────────────────────
{
  const a = drawTreasureReward(2, 6, seededRand(3));
  const b = drawTreasureReward(2, 6, seededRand(3));
  assert.deepEqual(a, b, '같은 시드 같은 보물');
}

// ── 티어 순서: 일반(1.0) < 보물저(1.3) < 보물고(1.6) < 제단(2.0) ──
// 무위험이라 제단보다 짜고, 일반방보단 메리트 있게.
{
  assert.ok(TREASURE_CONFIG.lowFloor.scale > 1, '보물 저층 > 표준(일반방보다 메리트)');
  assert.ok(TREASURE_CONFIG.highFloor.scale > TREASURE_CONFIG.lowFloor.scale, '고층 > 저층');
  assert.ok(
    TREASURE_CONFIG.highFloor.scale < ALTAR_CONFIG.premiumScale,
    '보물 고층 < 제단 (고위험고보상이 더 셈)',
  );
}

console.log('Treasure reward regression: 저층2·고층3·배율스케일·재현성·티어순서 4군 통과');
