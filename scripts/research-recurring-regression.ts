import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ELEMENTAL_FOCUS_ECHO_POWER_SCALE,
  VARIATION_WAVE_EVERY_SHIFTS,
  VARIATION_WAVE_POWER_SCALE,
  VARIATION_WAVE_RADIUS,
  advanceVariationWaveCharge,
  researchChargePips,
  spiritResonanceBoltElement,
  spiritResonanceBoltPower,
  SPIRIT_RESONANCE_BOLT_MANUAL_SCALE,
  SPIRIT_RESONANCE_FALLBACK_POWER,
  VARIATION_WAVE_MAX_TARGETS,
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

// ── 1) 공명탄 — 매회 발사 · 위력은 유저 영창에 공명한다 ────────────────────
//
// 충전식(3회마다 1발)은 두 겹으로 약했다: 위력 기준이 정령탄(7.5)이었고, 슬로모션이
// 정령 시계를 세워 실효 주기가 ~33초였다. 총괄 결정으로 매회 발사 + 위력 기준을
// **최근 수동 영창 평균**으로 교체 (연구주제 개편 2026-08-02).
{
  // 위력 = 평균 × 0.12
  assert.equal(
    spiritResonanceBoltPower([50, 60, 70]),
    Math.round(60 * SPIRIT_RESONANCE_BOLT_MANUAL_SCALE),
    '공명탄 위력은 최근 수동 평균의 12%',
  );
  // 창 밖의 옛 기록은 잊는다 — "지금 빌드"를 따라가야 한다
  assert.equal(
    spiritResonanceBoltPower([999, 999, 50, 50, 50, 50, 50]),
    Math.round(50 * SPIRIT_RESONANCE_BOLT_MANUAL_SCALE),
    '창(5개) 밖의 옛 위력은 평균에 안 들어간다',
  );
  // 기록이 없으면 기준 위력 — 런 초반에 0이 되면 완료 직후 공명탄이 사라진다
  assert.equal(
    spiritResonanceBoltPower([]),
    Math.round(SPIRIT_RESONANCE_FALLBACK_POWER * SPIRIT_RESONANCE_BOLT_MANUAL_SCALE),
    '기록 없음 → 기준 위력',
  );
  assert.ok(spiritResonanceBoltPower([Number.NaN, -5, 0]) >= 1, '오염 입력 방어 · 최소 1');

  // 융합 원소 교대 — 발마다 순환. 동시 이중 링은 #220을 치고, 교대는 보스 단일
  // 내성도 절반은 뚫는다(융합의 존재 이유)
  const fused = ['fire', 'ice'] as const;
  assert.equal(spiritResonanceBoltElement(fused, 0), 'fire', '1발째 주 원소');
  assert.equal(spiritResonanceBoltElement(fused, 1), 'ice', '2발째 보조 원소');
  assert.equal(spiritResonanceBoltElement(fused, 2), 'fire', '3발째 다시 주 원소');
  assert.equal(spiritResonanceBoltElement(['water'], 7), 'water', '단일 원소는 항상 그 색');
  assert.equal(spiritResonanceBoltElement([], 0), 'light', '빈 배열 방어');
  assert.equal(spiritResonanceBoltElement(fused, Number.NaN), 'fire', 'NaN 인덱스 방어');

  // ⚠️ 오토 게이트(#67) 최악 산식 — 이 부등식이 배율 상향을 잡는다.
  // 정령 2기 · 간격 6초 · 신속 하한 0.5 → 0.667발/초. 평균 위력 55, 수동 기준 16.7/s.
  const worstBoltsPerSecond = 2 / (6 * 0.5);
  const resonanceShare = (worstBoltsPerSecond * 55 * SPIRIT_RESONANCE_BOLT_MANUAL_SCALE) / 16.7;
  const totalAutoShare = 0.4 /* 각인 상한 */ + 0.3 /* 정령 풀투자 */ + resonanceShare;
  assert.ok(
    totalAutoShare < 1,
    `최악 오토 합산 ${(totalAutoShare * 100).toFixed(0)}% — 100%를 넘으면`
    + ' "어떤 빌드로도 수동을 넘지 않는다" 불변식(#67)이 깨진다',
  );
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
  assert.ok(VARIATION_WAVE_EVERY_SHIFTS >= 3, '파동 충전 하한');
  assert.ok(
    VARIATION_WAVE_MAX_TARGETS <= 4,
    '파동 대상 상한 — 정예 무리(4~6체)에서 +47~70%로 튀는 꼬리를 자른다',
  );
}

// ── 5) 씬 배선 ──────────────────────────────────────────────────────────────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

  // 공명탄 — 정령 공격 분기 안에서, 완료 게이트를 거쳐, 매회 발사로
  // ⚠️ 'power: ' 접두가 필요하다 — 같은 함수를 특성 요약 문구도 부르므로, 접두 없이
  // 찾으면 indexOf가 그쪽(HUD 텍스트)을 잡아 아래 블록 검사가 전부 헛짚는다.
  // 실제로 이 회귀를 처음 돌렸을 때 그렇게 실패했다.
  const boltAnchor = 'power: spiritResonanceBoltPower(this.recentManualPowers),';
  assert.ok(
    scene.includes(boltAnchor),
    '공명탄 위력이 최근 수동 영창 평균에서 와야 한다 — 정령탄 기준이면 다시 1/10로 약해진다',
  );
  const boltAt = scene.indexOf(boltAnchor);
  // ⚠️ 창이 넉넉해야 한다. 주석이 늘면 앵커에서 게이트까지 거리가 벌어져 조용히
  // 헛짚는다 — 실제로 beam 전환 때 2200으로는 게이트를 놓쳤다.
  const boltBlock = scene.slice(boltAt - 3200, boltAt + 900);
  assert.ok(
    boltBlock.includes('spiritResonanceUnlocked('),
    '공명탄은 완료 게이트를 거쳐야 한다',
  );
  assert.ok(
    !boltBlock.includes('advanceSpiritResonanceBoltCharge'),
    '충전식이 남아 있으면 안 된다 — 매회 발사로 개편됐다',
  );
  assert.ok(
    boltBlock.includes('spiritResonanceBoltElement('),
    '융합 정령은 발마다 원소를 교대해야 한다',
  );
  // ⚠️ 교대 인덱스는 **정령별**이어야 한다. 전역 카운터 하나면 정령이 둘일 때
  // 매 라운드 2씩 올라가 융합체가 항상 짝수 인덱스 → `elements[0]` 하나로 굳는다
  // (총괄 제보로 실측된 실패: 융합체 공명탄 3발이 전부 fire, 물은 0발).
  assert.ok(
    boltBlock.includes('this.spiritResonanceShotIndex.get(request.spiritId)'),
    '교대 인덱스를 정령별로 읽어야 한다 — 전역 카운터면 정령이 늘 때 한 원소로 굳는다',
  );
  assert.ok(
    boltBlock.includes('this.spiritResonanceShotIndex.set(request.spiritId, shotIndex + 1);'),
    '교대 인덱스가 그 정령 기준으로 전진해야 한다',
  );
  assert.ok(
    scene.includes('private readonly spiritResonanceShotIndex = new Map<string, number>();'),
    '교대 인덱스는 정령별 Map이어야 한다',
  );
  assert.ok(
    boltBlock.includes('!this.hasLivingEnemy()) return;'),
    '공명탄 지연 발도 발사 시점에 적을 다시 봐야 한다',
  );
  // ⚠️ 총괄 제보로 실측된 실패: 본탄과 같은 대상·같은 위치·비슷한 시점이면 궤적이
  // 겹쳐 **안 보인다**. 2순위 적을 노려 갈라져 나가야 "공명이 퍼진다"가 읽힌다.
  assert.ok(
    boltBlock.includes('this.nthNearestEnemy(1)'),
    '공명탄은 본탄과 다른 적(2순위 근접)을 노려야 한다 — 같은 대상이면 잔상에 묻힌다',
  );
  assert.ok(
    boltBlock.includes('sequenceTarget: { lockedEnemy: spreadTarget'),
    '분산 대상이 실제 조준으로 전달돼야 한다',
  );
  // 본탄(0ms)·융합 파편(150ms)과 다른 박자여야 한다 — 180ms는 파편과 겹쳤다
  assert.ok(
    boltBlock.includes('this.time.delayedCall(280,'),
    '공명탄은 세 번째 박자(280ms)로 나가야 한다 — 본탄·파편과 겹치면 안 보인다',
  );
  // ⚠️ 총괄 제보 2차 — 박자·궤적을 갈라도 여전히 안 보였다. bolt는 정령 본탄과
  // **같은 문법**이라 "한 발 더 쐈다"로 처리되고 넘어간다. 선(beam)은 화면을
  // 가로질러 작아도 눈에 걸리고, 정령↔적을 잇는 선은 이 게임에 이것뿐이라
  // 새 어휘로 읽힌다. 다시 bolt로 돌리면 같은 제보가 반복된다.
  assert.ok(
    boltBlock.includes("form: 'beam',"),
    '공명탄은 beam이어야 한다 — bolt면 정령 본탄과 같은 문법이라 묻힌다',
  );
  assert.ok(
    boltBlock.includes('decorVfxScale: 0.6,'),
    '빔은 선 길이만큼 면적을 차지한다 — 볼트보다 밝기를 낮춰 광량을 상쇄해야 한다',
  );
  assert.ok(
    boltBlock.includes('this.playResonanceHitRing('),
    '적중 고리가 있어야 한다 — 선은 "어디서 어디로", 고리는 "여기 맞았다"',
  );
  // 적중 고리는 반복 연출이라 채움 없이 선만 (#220)
  const ringAt = scene.indexOf('private playResonanceHitRing(');
  assert.ok(ringAt > 0, '적중 고리 메서드가 있어야 한다');
  const ringBody = scene.slice(ringAt, ringAt + 900);
  assert.ok(
    !ringBody.includes('fillStyle') && !ringBody.includes('fillCircle'),
    '적중 고리는 채움 없이 선만 써야 한다 — 매 공격마다 나오는 연출이다 (#220)',
  );
  // 수동 위력 기록 — 단일·시퀀스 두 경로 모두. 한쪽이 빠지면 그 빌드에서 위력이 굳는다
  const recordCalls = scene.match(/this\.recordManualPowerForResonance\(/g) ?? [];
  assert.ok(
    recordCalls.length >= 2,
    `수동 위력 기록 호출이 ${recordCalls.length}곳 — 단일 시전·시퀀스 두 경로 다 있어야 한다.`
    + ' 한쪽이 빠지면 그 방식으로만 영창하는 빌드에서 공명탄 위력이 굳는다',
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
    waveBody.includes('.slice(0, VARIATION_WAVE_MAX_TARGETS)'),
    '파동은 가까운 순으로 상한까지만 때려야 한다 — 정예 무리 스파이크 가드',
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
  const powerResets = scene.match(/this\.recentManualPowers = \[\];/g) ?? [];
  const shotResets = scene.match(/this\.spiritResonanceShotIndex\.clear\(\);/g) ?? [];
  assert.ok(
    shotResets.length >= 2,
    `교대 인덱스 리셋이 ${shotResets.length}곳 — 런 리셋에서 비워야 지난 런 상태가 안 남는다`,
  );
  const waveResets = scene.match(/this\.variationWaveCharge = 0;/g) ?? [];
  const keyResets = scene.match(/this\.variationWaveLastKey = null;/g) ?? [];
  assert.ok(
    powerResets.length >= 2 && waveResets.length >= 2 && keyResets.length >= 2,
    `카운터 리셋이 부족하다 (위력창 ${powerResets.length} · 파동 ${waveResets.length} ·`
    + ` 키 ${keyResets.length}) — 런 리셋에서 비워야 지난 런 위력이 이월되지 않는다`,
  );
}

// ── 6) 충전 핍 모델 (총괄 제보: "발동 타이밍을 알기 어려움") ────────────────
{
  const spirit = { ...startResearchContract({ id: 'spirit-resonance' }, []), completed: true };
  const variation = { ...startResearchContract({ id: 'variation-study' }, []), completed: true };
  const focus = {
    ...startResearchContract({ id: 'elemental-focus', element: 'ice' }, []),
    completed: true,
  };

  // 완료 전엔 null — 진행도는 HUD의 ●○○가 이미 보여주므로 겹치면 소음이다
  assert.equal(
    researchChargePips(startResearchContract({ id: 'variation-study' }, []),
      { echo: 0, wave: 2 }),
    null,
    '미완료 연구는 핍을 만들지 않는다',
  );
  assert.equal(researchChargePips(null, { echo: 0, wave: 0 }), null, '연구 없음');

  // 공명은 매회 발사(주기 없음)로 개편 — 핍이 없어야 한다. 충전이 없는데 원을
  // 그리면 "언젠가 찬다"는 거짓 신호가 된다
  assert.equal(
    researchChargePips(spirit, { echo: 2, wave: 2 }),
    null,
    '완료된 공명도 핍이 없다 — 주기가 없는데 원을 그리면 거짓 신호다',
  );
  const wavePips = researchChargePips(variation, { echo: 2, wave: 2 });
  assert.equal(wavePips?.filled, 2, '변주 핍은 wave 카운터만 읽는다');
  const echoPips = researchChargePips(focus, { echo: 1, wave: 2 });
  assert.equal(echoPips?.filled, 1, '심화 핍은 echo 카운터만 읽는다');
  assert.equal(echoPips?.element, 'ice', '심화 핍은 원소를 실어야 한다 (핍 색이 원소색)');

  // 방어적 입력 — 카운터는 씬 필드다
  const dirty = researchChargePips(focus, { echo: Number.NaN, wave: 0 });
  assert.equal(dirty?.filled, 0, 'NaN 카운터는 0으로');
  const over = researchChargePips(variation, { echo: 0, wave: 99 });
  assert.equal(over?.filled, VARIATION_WAVE_EVERY_SHIFTS, '상한 클램프');
}

// ── 8) 핍 씬 배선 ───────────────────────────────────────────────────────────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(
    scene.includes('private updateResearchChargePips():'),
    '핍 그리기 경로가 있어야 한다',
  );
  assert.ok(
    scene.includes('this.updateResearchChargePips();'),
    'update 루프가 핍을 갱신해야 한다',
  );
  // 발동 순간 플래시 — 세 발동 지점 전부. 충전이 발동과 동시에 0이 되므로 플래시가
  // 없으면 세 번째 원이 차는 모습을 영영 못 본다
  const flashes = scene.match(/this\.researchChargeFlashUntil = this\.time\.now \+ 340;/g) ?? [];
  assert.equal(
    flashes.length, 2,
    `발동 플래시가 ${flashes.length}곳 — 메아리·파동 두 지점이다 (공명은 매회 발사라 주기 플래시가 없다)`,
  );
  // ⚠️ #220: 항상 떠 있는 요소라 애니메이션·ADD 금지, 상태 변화 시에만 재작화
  const pipsAt = scene.indexOf('private updateResearchChargePips():');
  const pipsBody = scene.slice(pipsAt, scene.indexOf('private ', pipsAt + 10));
  for (const banned of ['tweens.add', 'setBlendMode', 'delayedCall']) {
    assert.ok(
      !pipsBody.includes(banned),
      `핍 그리기에 ${banned} 금지 — 항상 떠 있는 요소다 (#220)`,
    );
  }
  assert.ok(
    pipsBody.includes('if (key === this.researchChargePipsKey) return;'),
    '상태가 같으면 다시 그리지 않아야 한다 — 매 프레임 재작화는 낭비다',
  );
  // 씬 재시작 시 참조 정리 — 늦은 생성 객체라 낡은 참조가 남으면 죽은 객체를 만진다
  assert.ok(
    scene.includes('this.researchChargePipsGfx = null;'),
    '씬 재시작 시 핍 참조를 끊어야 한다',
  );
}

console.log(
  'research recurring regression: 공명탄매회·변주판별·잠금게이트·오토상한·씬배선'
  + '·충전핍·핍배선 7군 통과',
);
