import assert from 'node:assert/strict';
import {
  ALTAR_OFFER_CONFIG,
  ALTAR_TIERS,
  altarPayment,
  canAffordAltarTier,
  drawAltarOffer,
} from '../src/combat-core/run/altarOffer';

const MIN = ALTAR_OFFER_CONFIG.minMaxHp;

// 1) 등급 구성 — 대가가 비내림차순이고 종류가 겹치지 않는다
//
// ⚠️ 최상위(50)가 **둘**이다 (총괄 지적 2026-07-31: 한 런에서 제단을 2회 이상 만나는
// 플레이어). 에코(시간축)와 파문(공간축)이 같은 값·같은 급이되 결이 다르다.
// 그래서 "오름차순"이 아니라 "비내림차순"이다.
assert.deepEqual(ALTAR_TIERS.map((t) => t.cost), [10, 25, 50, 50], '10 / 25 / 50 / 50');
assert.equal(
  new Set(ALTAR_TIERS.map((t) => t.kind)).size, ALTAR_TIERS.length,
  '보상 종류가 서로 다르다 — 같은 종류가 둘이면 하나는 죽은 등급이다',
);
// 대가가 줄어들면 상위 등급이 더 싸지는 셈이라 아래 등급이 죽는다
for (let i = 1; i < ALTAR_TIERS.length; i += 1) {
  assert.ok(ALTAR_TIERS[i].cost >= ALTAR_TIERS[i - 1].cost, '대가 비내림차순 (최상위 둘은 같은 값)');
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

// 4) 카드 구성 — 전 등급 + **거절 카드**
//
// 등급 수를 리터럴로 박지 않는다 — 등급이 늘 때마다 이 줄만 고치게 되고, 그러면
// "왜 이 숫자인지"가 사라진다. ALTAR_TIERS에서 파생시킨다.
const full = drawAltarOffer(100, 'fire');
assert.equal(
  full.length, ALTAR_TIERS.length + 1,
  `${ALTAR_TIERS.length}등급 + 그냥 나간다`,
);
const leave = full[full.length - 1];
assert.equal(leave.kind, 'altar-leave', '마지막은 거절');
assert.equal(leave.altar?.cost, 0, '거절은 대가 없음');
// 등급 카드는 ALTAR_TIERS 순서·값을 그대로 따른다
assert.deepEqual(
  full.slice(0, ALTAR_TIERS.length).map((o) => o.altar?.cost),
  ALTAR_TIERS.map((t) => t.cost),
);
assert.deepEqual(
  full.slice(0, ALTAR_TIERS.length).map((o) => o.kind),
  ALTAR_TIERS.map((t) => t.kind),
);
assert.equal(full[1].element, 'fire', '각성 카드는 대상 원소를 싣는다');
// id는 서로 달라야 chooseReward가 구분한다.
// ⚠️ 최상위가 둘이고 **대가가 같으므로** id에 종류가 들어가야 구분된다
assert.equal(new Set(full.map((o) => o.id)).size, full.length, 'id 중복 없음');
// 모든 카드에 제목·설명이 있다 (빈 카드가 뜨면 안 된다)
for (const option of full) {
  assert.ok(option.title.length > 0 && option.description.length > 0, `${option.id} 문구`);
}

// 5) 감당 못 하는 등급은 **빼지 않고 잠근다** — 사라지면 아낄 이유가 안 보인다
const poor = drawAltarOffer(60, 'fire');
assert.equal(poor.length, ALTAR_TIERS.length + 1, '잠겨도 카드 수는 같다');
// 최상위(50)는 **둘 다** 잠긴다 — 60 − 50 < 30
for (const [i, tier] of ALTAR_TIERS.entries()) {
  if (tier.cost !== 50) continue;
  assert.equal(poor[i].altar?.locked, true, `−${tier.cost}(${tier.kind})은 잠김`);
  assert.equal(poor[i].altar?.cost, 0, '잠긴 카드는 대가를 걷지 않는다');
  assert.equal(poor[i].kind, 'altar-leave', '잠긴 카드는 아무 효과도 없는 종류로');
}
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
// **에코가 체감되려면 원본이 끝난 뒤에 와야 한다** (총괄 제보: 250ms는 원본이 아직
// 날아가는 중이라 두 발이 한 덩어리로 읽혔다). 시퀀스 최소 지속(baseDurationMs 500)보다
// 길어야 원본이 마무리된 뒤 울린다.
assert.ok(
  ALTAR_OFFER_CONFIG.echo.delayMs >= 500,
  `에코 지연이 짧다 (${ALTAR_OFFER_CONFIG.echo.delayMs}ms) — 원본과 한 덩어리로 읽힌다`,
);
// 겹별 투명도 — 원본(1.0)보다 옅고, 뒤 겹이 앞 겹보다 더 옅다.
// 같은 밝기로 세 발이 나가면 "왜 세 번인지" 읽히지 않는다.
const { decorScales } = ALTAR_OFFER_CONFIG.echo;
assert.ok(decorScales.length >= 2, '겹마다 투명도가 있어야 한다 (2중·3중)');
assert.ok(decorScales[0] < 1, '첫 에코는 원본보다 투명하다');
for (let i = 1; i < decorScales.length; i += 1) {
  assert.ok(
    decorScales[i] < decorScales[i - 1],
    `${i + 1}번째 겹이 앞 겹보다 투명해야 한다 (${decorScales[i]} vs ${decorScales[i - 1]})`,
  );
}
assert.ok(decorScales.every((v) => v > 0), '완전히 투명하면 안 보인다 — 에코가 있었는지 모른다');
// 등급 역전 방지: 최상위 대가가 최상위 기대 이득을 가져야 한다
const echoGain = ALTAR_OFFER_CONFIG.echo.powerScale * (1 + ALTAR_OFFER_CONFIG.echo.extraChance);
assert.ok(echoGain > 0.5, `에코 기대 이득 ${echoGain} — −50 등급이 −25보다 나아야 한다`);

console.log('altar offer regression: 등급·대가·하한·감당·카드구성·잠금·각성대상·에코 7군 통과');
