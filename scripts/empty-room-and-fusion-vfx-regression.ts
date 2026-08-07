import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FUSION_FLOURISH,
  fusionFlourishPlan,
  fusionRingBudgetRatio,
  fusionRingScale,
} from '../src/render/fusionFlourishConfig';

/**
 * 빈 방 자동 시전 · 필살기 이중 원소 연출 회귀 (총괄 제보 2026-07-31).
 *
 * 두 건을 한 파일에 묶는다. **둘 다 "연출이 나올 자리가 아닌데 나온다/안 나온다"**는
 * 같은 축의 문제다.
 *
 *  ① *"보물방처럼 몹이 없는 곳에서도 각인 마법 이펙트가 생기는 문제"*
 *  ② *"필살기 쓸 때... 얼음과 전기를 함께 쓰면 깨지는 거랑 스파크 튀는 두가지 효과가
 *     다 보이게"*
 */

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

// ── ① 적이 없으면 자동 시전 연출이 나오지 않는다 ────────────────────────────
//
// 원인은 `phase === 'combat'`이 **보물방·제단에서도 참**이라는 것이다. 전투가 없을 뿐
// 위상은 전투라, 종전 조건(생존·위상·같은 방)을 다 통과하고 허공에 주문이 터졌다.
{
  assert.ok(
    /private hasLivingEnemy\(\): boolean \{\s*return this\.enemies\.some\(\(enemy\) => enemy\.alive\);/
      .test(scene),
    '살아 있는 적 판정을 한 곳에 둬야 한다',
  );

  // 각인 — 지연 발(진화 3발)이 있으므로 **클로저 안**에서 봐야 한다.
  // 예약 시점에 적이 있었어도 마지막 적이 그 사이 죽으면 남은 발이 허공에 터진다.
  const engraveAt = scene.indexOf('private updateEngravedSpells(');
  assert.ok(engraveAt > 0, '각인 자동 시전을 찾아야 한다');
  const engrave = scene.slice(engraveAt, engraveAt + 2600);
  assert.ok(
    engrave.includes('if (!this.hasLivingEnemy()) return;'),
    '각인은 적이 없으면 쏘지 않아야 한다 (총괄 제보)',
  );
  // 조기 반환이 `cast` 클로저 안에 있는가 — 루프 밖에 두면 지연 발을 못 막는다
  const castAt = engrave.indexOf('const cast = (): void => {');
  const guardAt = engrave.indexOf('if (!this.hasLivingEnemy()) return;');
  assert.ok(
    castAt > 0 && guardAt > castAt,
    '적 검사가 cast 클로저 **안**에 있어야 한다 — 밖에 두면 지연 발이 허공에 터진다',
  );
  // 쿨다운은 그대로 돌린다 (총괄 지시: "쿨타임이 돌아도 이펙트가 생기지 않게").
  // 요청을 버리는 것이라 다음 방에서 밀린 발동이 몰아치지 않는다.
  assert.ok(
    engrave.includes('this.engraveManager.update(deltaSeconds)'),
    '쿨다운 자체는 계속 돌아야 한다 — 멈추면 방을 옮길 때마다 각인이 리셋된다',
  );

  // 정령 — 공격 정령은 **적을 확인한 뒤에** 빛나야 한다.
  // 종전엔 pulse가 검사보다 먼저라 빈 방에서 쿨다운마다 정령이 번쩍였다.
  const spiritAt = scene.indexOf('private updateSpirits(');
  const spirit = scene.slice(spiritAt, spiritAt + 2200);
  const attackAt = spirit.indexOf("if (request.kind === 'attack')");
  const nearestAt = spirit.indexOf('if (!this.nearestEnemy()) continue;');
  const pulseAt = spirit.indexOf('view?.pulse(this);', attackAt);
  assert.ok(attackAt > 0 && nearestAt > attackAt, '공격 정령이 적을 확인해야 한다');
  assert.ok(
    pulseAt > nearestAt,
    '공격 정령의 펄스가 적 검사 **뒤에** 와야 한다 — 앞이면 빈 방에서 번쩍인다',
  );
  // 치유·수호는 적과 무관하게 실제로 일하므로 계속 빛난다
  assert.ok(
    spirit.lastIndexOf('view?.pulse(this);') > spirit.indexOf("if (request.kind === 'heal')")
    || spirit.split('view?.pulse(this);').length - 1 >= 2,
    '치유·수호 정령은 적이 없어도 빛나야 한다 — 그건 허공 연출이 아니다',
  );
}

// ── ② 필살기가 두 원소를 순차로 터뜨린다 ────────────────────────────────────
{
  // 보조 원소가 있으면 단계가 둘
  const dual = fusionFlourishPlan('ice', 'lightning', 6);
  assert.equal(dual.length, 2, '이중 원소 필살기는 연출 단계가 둘이어야 한다');
  assert.equal(dual[0].element, 'ice', '주 원소가 먼저');
  assert.equal(dual[1].element, 'lightning', '보조 원소가 나중');
  assert.equal(dual[0].delayMs, 0, '주 원소는 즉시');
  assert.ok(dual[1].delayMs > 0, '보조 원소는 늦게 — 동시면 광량이 2배다');
  assert.ok(
    dual[1].intensity < dual[0].intensity,
    '보조 원소는 약하게 — 주 원소가 주인공이라는 위계를 남긴다',
  );

  // 같은 원소를 두 번 그리면 그냥 2배 밝기다 — 정확히 이 설계가 피하려던 것
  assert.equal(fusionFlourishPlan('ice', 'ice', 6).length, 1, '같은 원소면 한 번만');
  assert.equal(fusionFlourishPlan('ice', null, 6).length, 1, '보조가 없으면 한 번만');
  assert.equal(fusionFlourishPlan('ice', undefined, 6).length, 1, 'undefined도 한 번만');

  // ⚠️ 광량 예산 — 이 파일에서 가장 중요한 단언.
  // 시점을 벌려도 잔상은 겹친다(링이 560ms 산다). 그래서 공용 링을 줄여 **두 단계 합이
  // 평범한 주문 하나를 넘지 않게** 한다. 어느 값이든 올리려면 다른 쪽을 낮춰야 한다.
  const ratio = fusionRingBudgetRatio(dual);
  assert.ok(
    ratio <= 1,
    `필살기 링 총량이 단일 시전의 ${ratio.toFixed(3)}배다 — 1을 넘으면 #220 위반이다.`
    + ` ringScale(${FUSION_FLOURISH.ringScale}) × (1 + secondaryIntensityScale`
    + `(${FUSION_FLOURISH.secondaryIntensityScale})) ≤ 1 이어야 한다`,
  );
  // 단계가 하나면 줄이지 않는다 — 줄이면 필살기가 평범한 주문보다 약해 보이는 역전
  assert.equal(fusionRingScale(1), 1, '단일 단계는 링을 줄이지 않는다');
  assert.ok(fusionRingScale(2) < 1, '두 단계일 때만 링을 줄인다');
  assert.equal(fusionRingBudgetRatio(fusionFlourishPlan('ice', null, 6)), 1, '단일 시전 기준값');

  // 방어적 입력 — 강도는 친화도에서 오는 값이다
  for (const bad of [Number.NaN, -1]) {
    const plan = fusionFlourishPlan('ice', 'lightning', bad);
    assert.ok(plan.every((s) => Number.isFinite(s.intensity) && s.intensity >= 0), `강도 ${bad}`);
  }
}

// ── ③ 렌더러·씬 배선 ────────────────────────────────────────────────────────
{
  const renderer = readFileSync('src/render/spellRenderer.ts', 'utf8');

  // ⚠️ 렌더러는 `spec.element_primary`로 팔레트를 고른다. 보조 원소 단계에 원본 spec을
  // 그대로 넘기면 **주 원소 연출이 한 번 더** 나올 뿐이다 — 실제로 쉽게 저지르는 실수다
  assert.ok(
    /\{ \.\.\.spec, element_primary: step\.element \}/.test(renderer),
    '보조 원소 단계는 주 원소를 갈아끼운 사본을 넘겨야 한다 —'
    + ' 원본을 주면 같은 연출이 두 번 나온다',
  );
  assert.ok(
    /ELEMENT_FLOURISH_RENDERERS\[step\.element\]/.test(renderer),
    '단계별 원소로 연출을 골라야 한다',
  );
  // 링 배수가 실제로 적용되는가 — 계획만 세우고 안 곱하면 예산이 새어나간다
  assert.ok(
    /\* fusionRingScale\(steps\.length\)/.test(renderer),
    '공용 링에 융합 배수를 곱해야 한다 — 안 곱하면 예산 계산이 거짓이 된다',
  );
  // 지연 실행
  assert.ok(
    /scene\.time\.delayedCall\(step\.delayMs, draw\)/.test(renderer),
    '보조 원소는 지연 후 그려야 한다',
  );

  // 평범한 이중 원소 주문까지 켜지지 않는다 — 켜지면 대부분의 시전이 연출 2개가 된다
  assert.ok(
    /fusionRelease\s*=\s*false/.test(renderer),
    '기본값은 꺼짐이어야 한다 — 필살기만 특별하다',
  );

  // 일반 단일 영창을 자동 융합 방출로 격상하는 레거시 경로는 없어야 한다.
  assert.ok(
    !scene.includes('fusedSpec') && !scene.includes('fusionGauge.tryRelease'),
    '일반 단일 영창이 자동으로 게이지를 소비하면 안 된다',
  );
  // 에코·파문에는 넘기지 않는다 — 같은 시전의 **반복**이라 한 번의 필살기로 연출이 4개가 된다
  const echoAt = scene.indexOf('this.scheduleSpellEcho(effectiveSpec)');
  assert.ok(echoAt > 0, '에코 예약을 찾아야 한다');
  assert.ok(
    !scene.slice(echoAt, echoAt + 200).includes('fusionRelease'),
    '에코·파문에는 융합 연출을 넘기지 않는다 — 한 번의 필살기로 연출이 4개가 된다',
  );
}

console.log(
  'empty room & fusion vfx regression: 각인빈방·정령펄스순서·순차2단계·광량예산·사본전달·에코제외 6군 통과',
);
