import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ELEMENTAL_FOCUS_ECHO_POWER_SCALE,
  SPIRIT_RESONANCE_BOLT_EVERY_ATTACKS,
  SPIRIT_RESONANCE_BOLT_POWER_SCALE,
  VARIATION_WAVE_EVERY_SHIFTS,
  VARIATION_WAVE_POWER_SCALE,
  VARIATION_WAVE_RADIUS,
  advanceSpiritResonanceBoltCharge,
  advanceVariationWaveCharge,
  spiritResonanceUnlocked,
  startResearchContract,
  variationCastKey,
  variationWaveUnlocked,
} from '../src/meta/researchContract';

/**
 * 연구 완료 지속 보상 회귀 (총괄 결정 2026-08-01).
 *
 * 총괄 지적: *"정령 공명과 만물 변주는 연구 완료시의 이펙트 추가 or 정령 공격시의
 * 이펙트 살짝 변경만 있을 뿐, 정작 유저의 전투에는 영향이 없음."*
 *
 * 종전 상태의 문제:
 *  - 정령 공명 완료 = 융합 정령 상태이상 합집합 → **융합 정령이 없으면 0 효과**
 *  - 만물 변주 완료 = 무지개 파동 **VFX만** — 피해 코드가 없었다
 *
 * 이제 세 연구가 같은 문법(「N회마다 발동」)으로 정렬된다. 각자 다른 축을 강화한다:
 * 심화 = 같은 원소 반복(깊이) · 변주 = 매번 다른 영창(넓이) · 공명 = 정령 자동(자동화).
 */

// ── 1) 공명탄 충전 — 3회마다 발동 ───────────────────────────────────────────
{
  let charge = 0;
  const fired: number[] = [];
  for (let attack = 1; attack <= 9; attack += 1) {
    const result = advanceSpiritResonanceBoltCharge(charge);
    charge = result.charge;
    if (result.triggered) fired.push(attack);
  }
  assert.deepEqual(fired, [3, 6, 9], '정령 공격 3회마다 정확히 발동해야 한다');
  // 방어적 입력 — 카운터는 씬 필드라 리셋 타이밍에 이상값이 올 수 있다
  for (const bad of [Number.NaN, -3, 2.7]) {
    const result = advanceSpiritResonanceBoltCharge(bad);
    assert.ok(Number.isFinite(result.charge) && result.charge >= 0, `충전 ${bad} 방어`);
  }
}

// ── 2) 변주 충전 — **직전과 다른 영창만** 충전한다 ──────────────────────────
//
// ⚠️ 이 파일의 핵심 단언. 누적 종류 수로 세면 한 번 채운 뒤 같은 주문 난사로도
// 유지된다. "직전과 다른가"로 세야 계속 바꿔 써야만 돌아간다 — 변주라는 이름 그대로다.
{
  const bolt = { element_primary: 'fire', form: 'bolt' } as const;
  const beam = { element_primary: 'ice', form: 'beam' } as const;
  const nova = { element_primary: 'wind', form: 'nova' } as const;

  // 같은 주문 난사 → 첫 발만 충전, 이후 정지
  let charge = 0;
  let key: string | null = null;
  let triggers = 0;
  for (let cast = 0; cast < 10; cast += 1) {
    const result = advanceVariationWaveCharge(charge, key, variationCastKey(bolt));
    charge = result.charge; key = result.key;
    if (result.triggered) triggers += 1;
  }
  assert.equal(triggers, 0, '같은 주문 난사로는 파동이 발동하면 안 된다');
  assert.equal(charge, 1, '난사는 첫 발만 충전되고 멈춰야 한다 (깎이지도 않는다)');

  // 번갈아 쓰면 3회마다 발동
  charge = 0; key = null; triggers = 0;
  const rotation = [bolt, beam, nova, bolt, beam, nova];
  for (const spec of rotation) {
    const result = advanceVariationWaveCharge(charge, key, variationCastKey(spec));
    charge = result.charge; key = result.key;
    if (result.triggered) triggers += 1;
  }
  assert.equal(triggers, 2, '6번 바꿔 쓰면 파동 2회 (3충전마다)');

  // 두 주문 왕복도 변주다 — A→B→A→B... 매번 직전과 다르므로 충전된다
  charge = 0; key = null; triggers = 0;
  for (let cast = 0; cast < 6; cast += 1) {
    const spec = cast % 2 === 0 ? bolt : beam;
    const result = advanceVariationWaveCharge(charge, key, variationCastKey(spec));
    charge = result.charge; key = result.key;
    if (result.triggered) triggers += 1;
  }
  assert.equal(triggers, 2, '두 주문 왕복도 변주로 인정한다');

  // 원소만 달라도, 형태만 달라도 다른 쌍이다
  assert.notEqual(
    variationCastKey({ element_primary: 'fire', form: 'bolt' }),
    variationCastKey({ element_primary: 'ice', form: 'bolt' }),
    '원소가 다르면 변주',
  );
  assert.notEqual(
    variationCastKey({ element_primary: 'fire', form: 'bolt' }),
    variationCastKey({ element_primary: 'fire', form: 'beam' }),
    '형태가 다르면 변주',
  );
}

// ── 3) 잠금 게이트 — 완료한 해당 연구만 연다 ────────────────────────────────
{
  const spirit = startResearchContract({ id: 'spirit-resonance' }, []);
  const variation = startResearchContract({ id: 'variation-study' }, []);
  assert.equal(spiritResonanceUnlocked(spirit), false, '미완료 공명은 잠김');
  assert.equal(variationWaveUnlocked(variation), false, '미완료 변주는 잠김');
  assert.equal(spiritResonanceUnlocked({ ...spirit, completed: true }), true, '완료 공명');
  assert.equal(variationWaveUnlocked({ ...variation, completed: true }), true, '완료 변주');
  // 서로의 완료로는 안 열린다 — 연구 선택이 곧 빌드 선택이어야 한다
  assert.equal(variationWaveUnlocked({ ...spirit, completed: true }), false, '교차 잠금');
  assert.equal(spiritResonanceUnlocked({ ...variation, completed: true }), false, '교차 잠금');
  assert.equal(spiritResonanceUnlocked(null), false, '연구 없음');
  assert.equal(variationWaveUnlocked(null), false, '연구 없음');
}

// ── 4) 오토 DPS 게이트 (#67) — 위력 배율 상한 ───────────────────────────────
//
// 셋 다 자동 피해다. 원 시전의 절반을 넘으면 자동 비중 40% 상한을 위협한다.
{
  for (const [label, scale] of [
    ['원소 심화 메아리', ELEMENTAL_FOCUS_ECHO_POWER_SCALE],
    ['정령 공명탄', SPIRIT_RESONANCE_BOLT_POWER_SCALE],
    ['변주 파동', VARIATION_WAVE_POWER_SCALE],
  ] as const) {
    assert.ok(
      scale > 0 && scale <= 0.5,
      `${label} 위력 배율 ${scale}이 (0, 0.5] 밖이다 — 자동 피해라 절반을 넘으면 #67 위협`,
    );
  }
  assert.ok(
    VARIATION_WAVE_RADIUS <= 500,
    '파동 반경이 방 절반을 넘으면 조준 없는 전멸기가 된다',
  );
  assert.ok(SPIRIT_RESONANCE_BOLT_EVERY_ATTACKS >= 3, '공명탄 주기 하한');
  assert.ok(VARIATION_WAVE_EVERY_SHIFTS >= 3, '파동 충전 하한');
}

// ── 5) 씬 배선 ──────────────────────────────────────────────────────────────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

  // 공명탄 — 정령 공격 분기 안에서, 완료 게이트를 거쳐, 자동 시전으로
  assert.ok(
    scene.includes('advanceSpiritResonanceBoltCharge(this.spiritResonanceBoltCharge)'),
    '정령 공격이 공명탄 충전을 진행해야 한다',
  );
  const boltAt = scene.indexOf('advanceSpiritResonanceBoltCharge(this.spiritResonanceBoltCharge)');
  const boltBlock = scene.slice(boltAt - 400, boltAt + 1600);
  assert.ok(
    boltBlock.includes('spiritResonanceUnlocked('),
    '공명탄은 완료 게이트를 거쳐야 한다',
  );
  assert.ok(
    /SPIRIT_RESONANCE_BOLT_POWER_SCALE/.test(boltBlock),
    '공명탄 위력은 상수에서 와야 한다',
  );
  assert.ok(
    boltBlock.includes('!this.hasLivingEnemy()) return;'),
    '공명탄 지연 발도 발사 시점에 적을 다시 봐야 한다 — 예약 후 마지막 적이 죽으면 허공',
  );

  // 변주 파동 — 두 시전 경로 모두에서, 실피해가 있어야 한다
  const waveCalls = scene.match(/this\.scheduleVariationWave\(/g) ?? [];
  assert.ok(
    waveCalls.length >= 2,
    `scheduleVariationWave 호출이 ${waveCalls.length}곳 — 단일 시전·시퀀스 두 경로 다 있어야 한다`,
  );
  const waveAt = scene.indexOf('private scheduleVariationWave(');
  const waveBody = scene.slice(waveAt, waveAt + 2400);
  assert.ok(
    waveBody.includes('variationWaveUnlocked('),
    '파동은 완료 게이트를 거쳐야 한다',
  );
  // ⚠️ 종전 실패가 정확히 이것이었다 — 파동이 VFX만 있고 피해가 없었다
  assert.ok(
    waveBody.includes('this.damageEnemy('),
    '파동은 실제 피해를 줘야 한다 — VFX만 있으면 총괄 지적 그대로다',
  );
  assert.ok(
    waveBody.includes('this.spellDamageAgainst(enemy, spec, damage)'),
    '파동 피해도 원소 내성을 거쳐야 한다 — 보스 내성을 우회하면 안 된다',
  );
  assert.ok(
    waveBody.includes('VARIATION_WAVE_RADIUS'),
    '파동 반경은 상수에서 와야 한다',
  );
  assert.ok(
    waveBody.includes('if (!this.hasLivingEnemy()) return;'),
    '빈 방에서는 파동이 침묵해야 한다 — 각인·정령과 같은 규칙',
  );
  // 시퀀스는 첫 스펙 하나만 — 여러 스펙을 다 세면 시퀀스 하나로 3충전을 채운다
  assert.ok(
    scene.includes('if (executedSpecs[0]) this.scheduleVariationWave(executedSpecs[0]);'),
    '시퀀스는 한 번의 영창이다 — 변주 판별은 첫 스펙 하나로만',
  );

  // 반복 발동용 파동 연출은 완료 연출(5겹)보다 얇아야 한다 (#220)
  const vfxAt = scene.indexOf('private playVariationWaveVfx(');
  assert.ok(vfxAt > 0, '반복 발동용 파동 연출이 따로 있어야 한다');
  const vfxBody = scene.slice(vfxAt, vfxAt + 1200);
  const vfxColors = vfxBody.match(/0x[0-9a-f]{6}/g) ?? [];
  assert.ok(
    vfxColors.length <= 4,
    `반복 파동이 ${vfxColors.length}색 — 완료 연출(5겹)보다 얇아야 한다 (#220)`,
  );

  // 카운터 리셋 — 런 리셋 2곳 모두에서. 남으면 새 런에서 이전 런의 충전이 이월된다
  const resets = scene.match(/this\.spiritResonanceBoltCharge = 0;/g) ?? [];
  const waveResets = scene.match(/this\.variationWaveCharge = 0;/g) ?? [];
  const keyResets = scene.match(/this\.variationWaveLastKey = null;/g) ?? [];
  assert.ok(
    resets.length >= 2 && waveResets.length >= 2 && keyResets.length >= 2,
    `카운터 리셋이 부족하다 (공명탄 ${resets.length} · 파동 ${waveResets.length} ·`
    + ` 키 ${keyResets.length}) — 런 리셋 2곳 모두에서 비워야 이월이 없다`,
  );
}

console.log(
  'research recurring regression: 공명탄주기·변주판별·잠금게이트·오토상한·씬배선 5군 통과',
);
