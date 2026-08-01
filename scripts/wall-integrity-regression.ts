import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WALL_INTEGRITY,
  absorbChargeImpact,
  isAwakenedWall,
  wallCrystalNodes,
  wallMaxIntegrity,
  wallThickness,
  wallWear,
  wallWearRender,
} from '../src/combat-core/combat/wallIntegrity';
import { AWAKENING_CONFIG } from '../src/combat-core/run/awakening';
import { WALL_CONFIG } from '../src/combat-core/combat/persistentFormConfig';

/**
 * 장벽 내구도 회귀 (#296).
 *
 * 제보: *"장벽이 얇고 허약하게 보여... 보스가 돌진할 때 장벽을 그대로 통과합니다."*
 *
 * 이 파일이 지키는 것은 **저울**이다. 벽이 돌진을 막아야 하지만 보스전을 봉쇄하면
 * 안 된다. 어느 한쪽으로 기울면 둘 중 하나가 깨진다.
 */

// ── 1) 봉쇄 방지 하드 게이트 ────────────────────────────────────────────────
//
// ⚠️ 이 단언이 이 파일에서 가장 중요하다. 맨몸 장벽이 돌진 한 번에 반드시 부서져야
// 벽 하나로 보스전이 멈추지 않는다. perAffinity를 올리고 싶어질 때 여기가 잡는다.
{
  assert.ok(
    WALL_INTEGRITY.chargeImpactCost > WALL_INTEGRITY.base,
    `돌진 피해(${WALL_INTEGRITY.chargeImpactCost})가 기본 내구도(${WALL_INTEGRITY.base})보다`
    + ' 커야 한다 — 맨몸 장벽이 한 번에 안 부서지면 벽으로 보스전을 봉쇄할 수 있다',
  );
  const bare = absorbChargeImpact(wallMaxIntegrity(0));
  assert.equal(bare.broke, true, '친화 0 장벽은 돌진 한 번에 부서진다');
  assert.equal(bare.remaining, 0, '부서진 벽에 내구도가 남으면 안 된다');
}

// ── 2) 친화도가 실제로 결과를 바꾸는가 ──────────────────────────────────────
//
// 완료 조건: *"120% 이상 친화 장벽이 기본 장벽보다 육안으로 강하게 구분됨."*
// 두께만 키우면 결국 "굵은 선"이라, **버티느냐 부서지느냐**로 구분한다.
{
  const awakened = AWAKENING_CONFIG.threshold;
  const survived = absorbChargeImpact(wallMaxIntegrity(awakened));
  assert.equal(
    survived.broke, false,
    `각성 친화(${awakened}) 장벽은 돌진 한 번을 버텨야 한다 —`
    + ' 이게 고친화의 눈에 보이는 보상이다',
  );
  // 그러나 두 번째는 못 버틴다. 벽 수명이 2~4초라 이보다 강하면 사실상 무한 장벽이다
  const second = absorbChargeImpact(survived.remaining);
  assert.equal(
    second.broke, true,
    '각성 장벽도 돌진 두 번은 못 버텨야 한다 — 아니면 사실상 무한 장벽이다',
  );

  // 사용 누적 상한(0.45)은 아슬아슬하게 버틴다 — 중간 구간이 밋밋하지 않아야 한다
  const mid = absorbChargeImpact(wallMaxIntegrity(0.45));
  assert.equal(mid.broke, false, '사용 누적 상한 친화도 한 번은 버틴다');
  assert.equal(
    wallWear(mid.remaining, wallMaxIntegrity(0.45)), 'failing',
    '중간 친화는 버티되 붕괴 직전으로 보여야 한다',
  );
}

// ── 3) 두께·마디가 친화도를 따라간다 ────────────────────────────────────────
{
  // 종전 고정값에서 출발한다 — 친화 0에서 화면이 달라지면 그건 별개의 변경이다
  assert.equal(
    wallThickness(0), WALL_CONFIG.thickness,
    `친화 0 두께는 종전 고정값(${WALL_CONFIG.thickness})과 같아야 한다`,
  );
  // 각성에서 약 2배. 1.5배 이하면 나란히 두지 않는 한 구별이 안 된다
  const ratio = wallThickness(AWAKENING_CONFIG.threshold) / wallThickness(0);
  assert.ok(
    ratio >= 1.8,
    `각성 장벽 두께가 기본의 ${ratio.toFixed(2)}배뿐이다 — 육안 구분에 최소 1.8배는 필요하다`,
  );
  // 마디도 늘어야 한다. 굵기만 키우면 "굵은 선"이지 구조물이 아니다
  assert.ok(
    wallCrystalNodes(AWAKENING_CONFIG.threshold) > wallCrystalNodes(0),
    '친화가 오르면 결정 마디가 늘어야 한다 — 두께만으로는 형태가 안 생긴다',
  );
  assert.ok(wallCrystalNodes(0) >= 2, '기본 장벽도 마디가 있어야 선으로 안 보인다');
  // 단조 증가 — 어느 구간에서 역전되면 성장이 손해로 보인다
  let prevThickness = -1;
  let prevNodes = -1;
  for (const a of [0, 0.15, 0.3, 0.45, 0.6, 0.9, 1.2, 1.5]) {
    assert.ok(wallThickness(a) > prevThickness, `두께가 친화 ${a}에서 역전됐다`);
    assert.ok(wallCrystalNodes(a) >= prevNodes, `마디가 친화 ${a}에서 줄었다`);
    prevThickness = wallThickness(a);
    prevNodes = wallCrystalNodes(a);
  }
  assert.equal(isAwakenedWall(AWAKENING_CONFIG.threshold), true, '문턱에서 각성 장벽');
  assert.equal(isAwakenedWall(AWAKENING_CONFIG.threshold - 0.01), false, '문턱 미만은 아니다');
}

// ── 4) 방어적 입력 ──────────────────────────────────────────────────────────
//
// 친화도는 런 상태에서 오는 값이라 리셋 직후 비어 있을 수 있다
{
  for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
    assert.ok(Number.isFinite(wallThickness(bad)), `두께가 ${bad}에서 유한해야 한다`);
    assert.ok(wallThickness(bad) > 0, `두께가 ${bad}에서 양수여야 한다`);
    assert.ok(Number.isFinite(wallMaxIntegrity(bad)), `내구도가 ${bad}에서 유한해야 한다`);
  }
  assert.equal(wallThickness(Number.NaN), wallThickness(0), 'NaN은 친화 0으로 취급');
  assert.equal(wallThickness(-1), wallThickness(0), '음수는 친화 0으로 취급');
  assert.equal(wallWear(10, 0), 'failing', '최대치가 0이면 붕괴 직전으로 본다');
}

// ── 5) 마모 표시에 애니메이션이 없다 (#220 광과민성) ────────────────────────
//
// 벽은 ADD 블렌드로 2~4초 떠 있는 **큰 밝은 물체**다. 여기에 깜빡임을 얹으면
// 광과민성 예산을 바로 넘긴다. 약해 보이게 하는 건 정지한 채로만 한다.
{
  for (const wear of ['intact', 'cracked', 'failing'] as const) {
    const render = wallWearRender(wear);
    assert.ok(render.alpha > 0 && render.alpha <= 1, `${wear} 알파 범위`);
    assert.ok(render.nodeScale > 0 && render.nodeScale <= 1, `${wear} 마디 배수 범위`);
  }
  // 단조 감소 — 약해질수록 흐려져야 한다
  assert.ok(
    wallWearRender('intact').alpha > wallWearRender('cracked').alpha
    && wallWearRender('cracked').alpha > wallWearRender('failing').alpha,
    '마모가 진행되면 흐려져야 한다',
  );
  const source = readFileSync('src/combat-core/combat/wallIntegrity.ts', 'utf8');
  for (const banned of ['tween', 'setInterval', 'requestAnimationFrame']) {
    assert.ok(
      !source.includes(banned),
      `마모 표시에 ${banned}를 쓰면 안 된다 (#220 광과민성 예산)`,
    );
  }
}

// ── 6) 씬 배선 ──────────────────────────────────────────────────────────────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

  // ⚠️ 위치만 되돌리면 startCharge가 미리 계산해 둔 남은 시간이 그대로라
  // **다음 프레임에 다시 밀고 들어온다.** cancelCharge가 반드시 있어야 한다
  assert.ok(
    scene.includes('enemy.cancelCharge()'),
    '돌진을 실제로 중단시켜야 한다 — 위치만 되돌리면 다음 프레임에 재개된다',
  );
  const boss = readFileSync('src/combat-core/boss/bossEnemy.ts', 'utf8');
  const cancelAt = boss.indexOf('cancelCharge(): void');
  assert.ok(cancelAt > 0, 'BossEnemy에 cancelCharge가 있어야 한다');
  const cancelBody = boss.slice(cancelAt, cancelAt + 200);
  assert.ok(cancelBody.includes('chargeRemaining = 0'), '남은 돌진 시간을 0으로');
  assert.ok(cancelBody.includes('chargeVelocity.set(0, 0)'), '속도 벡터도 비운다');

  // 돌진 중일 때만 잡는다 — 걸어오는 보스까지 막으면 봉쇄가 된다.
  //
  // ⚠️ `enemy instanceof BossEnemy && enemy.charging`만으로 찾으면 안 된다. 그 문자열은
  // 이 파일에 이미 3번 더 있어서(적 투사체·피격 판정 등) `indexOf`가 엉뚱한 곳을
  // 잡는다 — 실제로 이 회귀를 처음 돌렸을 때 그렇게 헛짚었다. 벽 충돌만의 형태로
  // 앵커를 좁힌다.
  const chargeGuard = 'enemy instanceof BossEnemy && enemy.charging && !startedTouching';
  assert.ok(
    scene.includes(chargeGuard),
    '돌진 중인 보스만 막아야 한다 — 걸어오는 보스까지 막으면 봉쇄다',
  );
  // 이미 벽에 닿은 채 시작한 경우는 제외한다(`!startedTouching`). 없으면 벽 안에서
  // 생성된 보스가 매 프레임 휘청여 영영 못 움직인다
  assert.ok(
    scene.indexOf(chargeGuard) === scene.lastIndexOf(chargeGuard),
    '벽 충돌 돌진 가드는 한 곳뿐이어야 한다',
  );

  // 휘청임과 일반 둔화가 겹치면 안 된다.
  // applySlow는 배수 min·지속 max로 합치므로 둘 다 걸면 0.15배가 1.5초 유지된다
  const chargeBlock = scene.slice(scene.indexOf(chargeGuard), scene.indexOf(chargeGuard) + 1600);
  assert.ok(
    chargeBlock.includes('wall.slowedBosses.add(enemy)'),
    '휘청임을 걸었으면 일반 둔화를 건너뛰어야 한다 —'
    + ' applySlow가 배수 min·지속 max로 합쳐 사실상 정지가 된다',
  );
  assert.ok(
    chargeBlock.includes('WALL_INTEGRITY.staggerSeconds')
    && chargeBlock.includes('WALL_INTEGRITY.staggerMovementMultiplier'),
    '휘청임 수치는 설정에서 가져와야 한다',
  );

  // 충돌 반경이 두께를 따라가는가 — 상수를 쓰면 굵은 벽이 눈에만 굵다
  assert.ok(
    scene.includes('const halfThickness = wallThickness(wall.affinity) / 2;'),
    '충돌 반경이 친화도 두께를 따라가야 한다 — 상수면 굵은 벽이 눈에만 굵다',
  );
  assert.ok(
    !scene.includes('enemy.collisionRadius + WALL_CONFIG.thickness'),
    '고정 두께로 충돌 반경을 잡는 자리가 남으면 안 된다',
  );

  // 부서지면 실제로 사라진다
  assert.ok(
    /if \(broke\) \{\s*this\.clearActiveWall\(wall\);/.test(scene),
    '내구도가 다하면 부서진 해당 벽만 사라져야 한다',
  );
  // 렌더가 친화도를 읽는다 — 종전엔 상수라 친화가 화면에 닿지 않았다
  assert.ok(
    scene.includes('elementalAffinity[spec.element_primary] ?? 0'),
    '장벽이 세운 원소의 친화도를 읽어야 한다',
  );
}

console.log(
  'wall integrity regression: 봉쇄방지·각성보상·두께마디단조·방어입력·무애니메이션·씬배선 6군 통과',
);
