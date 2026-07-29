import assert from 'node:assert/strict';
import {
  ALTAR_OFFER_CONFIG,
  ALTAR_TIERS,
  altarPayment,
  canAffordAltarTier,
  drawAltarOffer,
} from '../src/combat-core/run/altarOffer';

const MIN = ALTAR_OFFER_CONFIG.minMaxHp;

// 1) 등급 구성 — 대가가 오름차순이고 종류가 겹치지 않는다
assert.deepEqual(ALTAR_TIERS.map((t) => t.cost), [10, 25, 50], '10 / 25 / 50');
assert.equal(new Set(ALTAR_TIERS.map((t) => t.kind)).size, 3, '보상 종류가 서로 다르다');
for (let i = 1; i < ALTAR_TIERS.length; i += 1) {
  assert.ok(ALTAR_TIERS[i].cost > ALTAR_TIERS[i - 1].cost, '대가 오름차순');
}

// 2) 대가는 **최대 체력**을 깎는다 — 회복으로 되돌릴 수 없어야 진짜 대가다
assert.deepEqual(altarPayment(100, 100, 25), { maxHp: 75, hp: 75 }, '만피: 최대·현재 함께 내려간다');
assert.deepEqual(altarPayment(100, 80, 25), { maxHp: 75, hp: 75 }, '현재가 새 최대보다 크면 클램프');
// **총괄 지정 케이스**: 현재 체력이 대가보다 적어도 거부하지 않는다
assert.deepEqual(altarPayment(100, 30, 50), { maxHp: 50, hp: 30 }, '최대만 깎고 현재는 그대로');
assert.deepEqual(altarPayment(100, 10, 50), { maxHp: 50, hp: 10 });
// 하한 — 0으로 내려가면 HP 바가 0/0이 되어 비율 계산이 깨진다
assert.equal(altarPayment(50, 50, 50).maxHp, MIN, `최대 체력 하한 ${MIN}`);
assert.equal(altarPayment(MIN, MIN, 50).maxHp, MIN, '하한 아래로는 안 내려간다');
assert.ok(altarPayment(1000, 1000, 999).maxHp >= MIN, '어떤 대가도 하한을 못 뚫는다');
// 방어
assert.equal(altarPayment(Number.NaN, Number.NaN, Number.NaN).maxHp, MIN, 'NaN 방어');
assert.equal(altarPayment(100, -5, 10).hp, 0, '음수 현재 체력 방어');
// 어떤 조합에서도 현재 ≤ 최대, 그리고 최대 ≥ 하한
for (let maxHp = MIN; maxHp <= 300; maxHp += 7) {
  for (const cost of ALTAR_TIERS.map((t) => t.cost)) {
    for (const hp of [0, 1, Math.floor(maxHp / 2), maxHp]) {
      const next = altarPayment(maxHp, hp, cost);
      assert.ok(next.hp <= next.maxHp, `현재 > 최대 (maxHp ${maxHp}, hp ${hp}, cost ${cost})`);
      assert.ok(next.maxHp >= MIN, `하한 위반 (maxHp ${maxHp}, cost ${cost})`);
    }
  }
}

// 3) 감당 판정 — 경계 포함
assert.equal(canAffordAltarTier(MIN + 10, 10), true, '정확히 하한이 되면 살 수 있다');
assert.equal(canAffordAltarTier(MIN + 9, 10), false, '하한 아래가 되면 못 산다');
assert.equal(canAffordAltarTier(100, 50), true);
assert.equal(canAffordAltarTier(70, 50), false);
assert.equal(canAffordAltarTier(Number.NaN, 10), false, 'NaN 방어');
// 최대 체력이 늘수록 감당 가능은 단조 (줄어드는 구간이 없다)
for (const cost of [10, 25, 50]) {
  let prev = false;
  for (let maxHp = 0; maxHp <= 200; maxHp += 1) {
    const now = canAffordAltarTier(maxHp, cost);
    assert.ok(!(prev && !now), `감당 판정이 뒤집혔다 (cost ${cost}, maxHp ${maxHp})`);
    prev = now;
  }
}

// 4) 카드 구성 — 3등급 + **거절 카드**
const full = drawAltarOffer(100, 'fire');
assert.equal(full.length, 4, '3등급 + 그냥 나간다');
assert.equal(full[3].kind, 'altar-leave', '마지막은 거절');
assert.equal(full[3].altar?.cost, 0, '거절은 대가 없음');
assert.deepEqual(full.slice(0, 3).map((o) => o.altar?.cost), [10, 25, 50]);
assert.deepEqual(full.slice(0, 3).map((o) => o.kind), ['all-affinity', 'awaken', 'echo']);
assert.equal(full[1].element, 'fire', '각성 카드는 대상 원소를 싣는다');
// id는 서로 달라야 chooseReward가 구분한다
assert.equal(new Set(full.map((o) => o.id)).size, 4, 'id 중복 없음');
// 모든 카드에 제목·설명이 있다 (빈 카드가 뜨면 안 된다)
for (const option of full) {
  assert.ok(option.title.length > 0 && option.description.length > 0, `${option.id} 문구`);
}

// 5) 감당 못 하는 등급은 **빼지 않고 잠근다** — 사라지면 아낄 이유가 안 보인다
const poor = drawAltarOffer(60, 'fire');
assert.equal(poor.length, 4, '잠겨도 카드 수는 같다');
assert.equal(poor[2].altar?.locked, true, '−50은 잠김 (60 − 50 < 30)');
assert.equal(poor[2].altar?.cost, 0, '잠긴 카드는 대가를 걷지 않는다');
assert.equal(poor[2].kind, 'altar-leave', '잠긴 카드는 아무 효과도 없는 종류로');
assert.equal(poor[0].altar?.locked, false, '−10은 아직 가능 (60 − 10 ≥ 30)');
// 잠금 여부가 canAfford와 일치한다
for (const maxHp of [30, 35, 40, 60, 75, 100, 200]) {
  const offer = drawAltarOffer(maxHp, 'fire');
  ALTAR_TIERS.forEach((tier, i) => {
    assert.equal(
      offer[i].altar?.locked, !canAffordAltarTier(maxHp, tier.cost),
      `maxHp ${maxHp} · cost ${tier.cost} 잠금 불일치`,
    );
  });
}

// 6) 각성 대상이 없으면 그 등급만 잠긴다 — 아무 원소나 주면 대가만 날린다
const noElement = drawAltarOffer(100, null);
assert.equal(noElement[1].altar?.locked, true, '각성 대상 없음 → 잠김');
assert.equal(noElement[0].altar?.locked, false, '나머지 등급은 영향 없음');
assert.equal(noElement[2].altar?.locked, false);
assert.ok(noElement[1].description.includes('영창'), '왜 잠겼는지 알려준다');

// 7) 에코 설정 — 확정 1회 + 위쪽 확률
assert.ok(ALTAR_OFFER_CONFIG.echo.powerScale > 0 && ALTAR_OFFER_CONFIG.echo.powerScale < 1,
  '에코는 원본보다 약하다 (같으면 그냥 2연발)');
assert.ok(ALTAR_OFFER_CONFIG.echo.extraChance > 0 && ALTAR_OFFER_CONFIG.echo.extraChance < 0.5,
  '3중 울림은 드물게');
assert.ok(ALTAR_OFFER_CONFIG.echo.delayMs > 0, '동시에 겹치면 버그처럼 보인다 — 지연 필수');
// 등급 역전 방지: 최상위 대가가 최상위 기대 이득을 가져야 한다
const echoGain = ALTAR_OFFER_CONFIG.echo.powerScale * (1 + ALTAR_OFFER_CONFIG.echo.extraChance);
assert.ok(echoGain > 0.5, `에코 기대 이득 ${echoGain} — −50 등급이 −25보다 나아야 한다`);

console.log('altar offer regression: 등급·대가·하한·감당·카드구성·잠금·각성대상·에코 7군 통과');
