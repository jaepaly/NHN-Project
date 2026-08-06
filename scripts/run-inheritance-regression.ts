import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RUN_INHERITANCE,
  inheritCandidates,
  inheritedAffinity,
  mutateInheritedAffinity,
  mutateInheritedChorusAffinity,
} from '../src/combat-core/run/runInheritance';
import {
  ALTAR_OFFER_CONFIG,
  ALTAR_TIERS,
  drawAltarOffer,
} from '../src/combat-core/run/altarOffer';
import { RESISTANCE } from '../src/spell/bossMemory';
import { AWAKENING_CONFIG } from '../src/combat-core/run/awakening';

/**
 * 런 계승 · 제단 등급 회귀 (총괄 결정 2026-07-31).
 *
 * 세 가지를 고정한다:
 *  ① 제단이 **이미 가진 등급을 다시 팔지 않는다** (최대 체력만 날아간다)
 *  ② 최상위 등급이 **둘**이다 — 한 런에 제단을 두 번 만나는 경우가 있다
 *  ③ 이어가기 계승이 **마스터리 관통 문턱을 넘지 않는다**
 */

// ── ① 이미 가진 등급은 잠긴다 ──────────────────────────────────────────────
//
// 에코는 boolean이라 두 번 사도 아무 일도 안 일어나는데 대가(최대 체력 50)는 그대로
// 나간다. 실측: 한 런에 제단 2회가 3.2%, 맵에 제단 2개 이상이 21.7%.
{
  const fresh = drawAltarOffer(200, 'fire', []);
  const highFresh = fresh.find((o) => o.kind === 'altar-high');
  assert.ok(highFresh, '아무것도 없으면 고위 제단술을 고를 수 있다');
  assert.ok(!highFresh.altar?.locked, '처음엔 잠기지 않는다');

  const owned = drawAltarOffer(200, 'fire', ['echo']);
  const highOwned = owned.find((o) => o.kind === 'altar-high');
  assert.ok(highOwned && !highOwned.altar?.locked, '고위 제단술 거래는 다음 제단에도 유지된다');

  // 다른 등급은 여전히 살 수 있다
  assert.equal(owned.length, fresh.length, '저가·중가 거래도 반복 선택할 수 있다');
}

// ── ② 최상위가 둘이고, 값이 같고, 결이 다르다 ──────────────────────────────
{
  const top = ALTAR_TIERS.filter((t) => t.cost === 50);
  assert.equal(top.length, 1, '최상위는 고위 제단술 선택 하나로 묶인다');
  assert.equal(top[0].kind, 'altar-high', '최상위 거래가 후속 4택을 연다');
  // 같은 급이려면 값이 같아야 한다 — 하나가 싸면 그쪽만 고른다
  assert.equal(top[0].cost, 50, '고위 제단술의 대가는 최대 생명 50이다');

  // 파문이 에코보다 위력이 낮은 이유: 대상이 늘어난다. 다만 적이 둘 이상일 때만
  // 발동하므로 보스전에서는 논다 — 그 상황 의존성이 균형을 잡는다.
  assert.ok(
    ALTAR_OFFER_CONFIG.ripple.powerScale < ALTAR_OFFER_CONFIG.echo.powerScale,
    '파문은 대상이 늘어나므로 개당 위력이 낮아야 한다',
  );
  assert.ok(ALTAR_OFFER_CONFIG.ripple.maxTargets >= 2, '하나만 번지면 에코와 구분이 안 된다');
  assert.ok(
    ALTAR_OFFER_CONFIG.ripple.radius > 0 && ALTAR_OFFER_CONFIG.ripple.radius <= 600,
    '번지는 거리가 화면을 넘으면 무슨 일인지 안 읽힌다',
  );

  // 씬이 실제로 구현했는가 — 등급만 추가하고 효과가 없으면 대가만 받는 사기가 된다
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(/private scheduleSpellRipple/.test(scene), '파문 구현이 있어야 한다');
  assert.ok(/this\.scheduleSpellRipple\(/.test(scene), '시전 경로가 파문을 불러야 한다');
  assert.ok(/this\.ownedAltarKinds/.test(scene), '산 등급을 기록해야 잠글 수 있다');
  assert.ok(
    /drawAltarOffer\([\s\S]{0,120}this\.ownedAltarKinds/.test(scene),
    '제단 제안에 소유 목록을 넘겨야 한다',
  );
}

// ── ③ 계승이 마스터리 관통 문턱을 넘지 않는다 ──────────────────────────────
//
// ⚠️ 이게 이 회귀의 핵심이다. 런 끝 주력 원소는 대개 0.9 근처(사용 상한 0.45 +
// 카드 3장 0.45)다. 그대로 계승하면 다음 런을 **보스 저항 무시** 상태로 시작해
// 저항 퍼즐과 #171의 관통 연출이 함께 사라진다.
{
  assert.ok(
    RUN_INHERITANCE.affinityCap < RESISTANCE.masteryImmunityAffinity,
    `계승 상한 ${RUN_INHERITANCE.affinityCap}가 마스터리 관통 문턱`
    + ` ${RESISTANCE.masteryImmunityAffinity} 이상이다 — 다음 런이 저항 퍼즐 없이 시작한다`,
  );
  assert.ok(
    RUN_INHERITANCE.affinityCap < AWAKENING_CONFIG.threshold,
    '계승만으로 각성 임계에 닿으면 매 루프 재각성 파밍이 된다',
  );
  assert.ok(
    RUN_INHERITANCE.affinityRatio > 0 && RUN_INHERITANCE.affinityRatio < 1,
    '전부 계승하면 누적이고, 0이면 박탈이다',
  );

  // 어떤 입력을 넣어도 문턱을 못 넘는다
  for (const value of [0.15, 0.45, 0.9, 1.2, 3, 99]) {
    const got = inheritedAffinity(value);
    assert.ok(
      got < RESISTANCE.masteryImmunityAffinity,
      `친화 ${value}를 계승하면 ${got} — 관통 문턱을 넘는다`,
    );
    assert.ok(got <= value, '계승이 원래보다 크면 안 된다');
  }
  assert.equal(inheritedAffinity(0), 0);
  assert.equal(inheritedAffinity(Number.NaN), 0, '잘못된 값이 게임을 멈추면 안 된다');

  // 후보는 **키운 원소만** — 0인 원소를 보여주면 선택이 무의미해진다
  const candidates = inheritCandidates({ fire: 0.9, ice: 0.3, water: 0 });
  assert.equal(candidates.length, 2, '친화 0인 원소는 후보에서 뺀다');
  assert.equal(candidates[0].element, 'fire', '높은 순으로 정렬');
  assert.deepEqual(inheritCandidates({}), [], '아무것도 안 키웠으면 후보가 없다');
  const mutation = mutateInheritedAffinity({ fire: 0.9, ice: 0.3 }, 12345);
  assert.ok(mutation, '최고 친화가 있으면 자동 계승 변이가 생긴다');
  assert.equal(mutation.source, 'fire', '최고 친화가 자동 계승의 원천이다');
  assert.notEqual(mutation.element, mutation.source, '계승 친화는 같은 원소로 돌아오지 않는다');
  assert.equal(mutation.value, inheritedAffinity(0.9), '계승량은 최고 친화의 일부다');
  const chorusMutation = mutateInheritedAffinity({ fire: 0.9, ice: 0.3, water: 0.3 }, 12345);
  assert.ok(chorusMutation && chorusMutation.echoes.length === 1, '합주 1단계는 다음 런에 작은 잔향 하나를 더 남긴다');
  assert.ok(chorusMutation?.echoes.every((echo) => echo.element !== chorusMutation.element), '잔향은 주 변이 원소와 겹치지 않는다');
  assert.ok(chorusMutation?.echoes.every((echo) => echo.value < chorusMutation.value), '다중 잔향은 주 계승보다 작다');
  assert.deepEqual(
    mutateInheritedAffinity({ fire: 0.9, ice: 0.3 }, 12345), mutation,
    '동률·변이 대상은 시드가 같으면 재현된다',
  );
  const continuedChorus = mutateInheritedChorusAffinity(0.3, 12345);
  assert.ok(continuedChorus, '합주 친화도도 다음 런 계승 대상으로 변환된다');
  assert.equal(continuedChorus?.value, inheritedAffinity(0.3));
  assert.equal(continuedChorus?.echoes.length, 3, '합주 3단계는 다중 잔향 3개를 남긴다');
}

// ── ④ 이어가기가 실제로 빌드를 비우는가 ────────────────────────────────────
//
// 계승만 만들고 비우지 않으면 종전과 같다(누적).
{
  const controller = readFileSync('src/combat-core/run/runController.ts', 'utf8');
  const i = controller.indexOf('continueRun(');
  const body = controller.slice(i, i + 900);
  for (const field of ['this.rewards = []', 'this.elementalAffinity = {}', 'this.useAffinityAdded = {}']) {
    assert.ok(body.includes(field), `continueRun이 ${field}로 비워야 한다`);
  }

  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  const j = scene.indexOf('private continueToNextLoop(');
  // ⚠️ 창을 넉넉히. 1600으로는 리셋 항목이 두 줄만 늘어도 마지막 단언이 밖으로
  // 밀려 조용히 실패한다 — 실제로 #349의 방 계측 두 줄에 1593자→창 밖이 됐다.
  const loop = scene.slice(j, j + 2600);
  for (const call of ['engraveManager.reset()', 'spiritManager.reset()', 'playerState.reset()']) {
    assert.ok(loop.includes(call), `이어가기가 ${call}을 해야 한다 — 각인·정령은 씬 소유다`);
  }
  // 제단 능력도 비운다 — 그래야 다음 런 제단이 다시 의미를 갖는다
  assert.ok(/this\.echoUnlocked = false/.test(loop), '이어가기가 에코를 비워야 한다');
  assert.ok(/this\.rippleUnlocked = false/.test(loop), '이어가기가 파문을 비워야 한다');
  // 계승 선택을 실제로 묻는가
  assert.ok(
    /chooseInheritedAffinity\(\)/.test(scene),
    '이어가기 전에 무엇을 남길지 물어야 한다',
  );
}

// ── ⑤ 수문장과 기억의 주인이 구분되는가 ────────────────────────────────────
//
// 총괄 지적: *"스테이지 1의 보스를 클리어하면 런을 끝낸 것처럼 대사와 화면이 뜬다."*
// 종전엔 둘 다 배너가 '보스의 방', 우측 패널이 'BOSS'로 완전히 동일했다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(
    !/title: '보스의 방'/.test(scene),
    '두 보스가 같은 배너를 쓰면 수문장이 런의 종착점으로 읽힌다',
  );
  assert.ok(/'수문장'/.test(scene) && /'기억의 주인'/.test(scene), '둘을 이름으로 구분한다');
  assert.ok(
    /수문장을 넘었다/.test(scene),
    '수문장을 넘으면 절반임을 알려야 한다 — 없으면 최종 보스와 구분이 안 된다',
  );
  assert.ok(
    /이 런의 절반/.test(scene),
    '"절반"이라고 명시해야 진행도가 읽힌다',
  );
}

console.log('run inheritance regression: 소유잠금·최상위둘·관통문턱·빌드비움·보스구분 5군 통과');
