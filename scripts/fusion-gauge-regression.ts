import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FUSION_CONFIG, FusionGauge } from '../src/combat-core/player/fusionGauge';
import { applyFusionReleaseToPlan } from '../src/spell/sequencePlan';
import type { FormBehavior, ResolvedSpellPlan } from '../src/spell/sequencePlan';
import type { SpellSpec } from '../src/spell/types';

const dual: SpellSpec = {
  name: '증기 폭발',
  effect: 'damage',
  target: 'area',
  element_primary: 'fire',
  element_secondary: 'water',
  form: 'nova',
  size: 'medium',
  speed: 'normal',
  status: [],
  power: 55,
  cost: 33,
};
const single: SpellSpec = { ...dual, name: '화염구', element_secondary: null };

// 1) 충전 — 수동 지불 마나 누적, 만충 도달 신호는 정확히 1회
const gauge = new FusionGauge();
assert.equal(gauge.ready, false);
assert.equal(gauge.charge(50), false);
assert.equal(gauge.charge(50), false);
assert.equal(gauge.charge(50), true, '만충 도달 그 호출에서만 true (안내 1회용)');
assert.equal(gauge.ready, true);
assert.equal(gauge.charge(50), false, '이미 만충이면 도달 신호 없음');
assert.equal(gauge.ratio, 1, '상한 클램프');
assert.equal(new FusionGauge().charge(Number.NaN), false, 'NaN 방어');

// 2) 방출 게이트 — 만충 + 이중 원소일 때만
const notReady = new FusionGauge();
notReady.charge(60);
assert.equal(notReady.tryRelease(dual), null, '미만충이면 방출 없음');
assert.equal(gauge.tryRelease(single), null, '단일 원소는 방출 없음');
assert.equal(gauge.ready, true, '단일 원소 시전이 게이지를 소모하면 안 된다 (만충 낭비 방지)');

// 3) 격상 내용 — backlog 설계 그대로: huge · 위력 상한 · 두 원소 상태이상 동시
const released = gauge.tryRelease(dual);
assert.ok(released, '만충+이중 원소면 방출');
assert.equal(released!.size, 'huge');
assert.equal(released!.power, FUSION_CONFIG.releasePower);
assert.ok(released!.status.includes('burn'), '주원소(fire) 상태이상');
assert.ok(released!.status.includes('knockback'), '부원소(water) 상태이상');
assert.ok(released!.status.length <= FUSION_CONFIG.maxStatuses, '상태이상 상한');
assert.equal(released!.name, '증기 폭발', '이름·형태는 판정 그대로 (유저의 말 보존)');
assert.equal(released!.form, 'nova');

// 4) 방출 후 게이지 소모 + 재충전 사이클
assert.equal(gauge.ready, false, '방출이 게이지를 비운다');
assert.equal(gauge.ratio, 0);
assert.equal(gauge.tryRelease(dual), null, '빈 게이지는 방출 불가');

// 5) 기존 상태이상과 합집합 — 중복 없이
const g2 = new FusionGauge();
g2.charge(FUSION_CONFIG.fullCharge);
const withStatus = g2.tryRelease({ ...dual, status: ['burn', 'weaken'] });
assert.ok(withStatus);
assert.equal(new Set(withStatus!.status).size, withStatus!.status.length, '중복 상태이상 없음');
assert.ok(withStatus!.status.length <= FUSION_CONFIG.maxStatuses);

// 6) 리셋 (새 런)
const g3 = new FusionGauge();
g3.charge(FUSION_CONFIG.fullCharge);
g3.reset();
assert.equal(g3.ready, false);
assert.equal(g3.ratio, 0);

// 7) 밸런스 각서 — 방출은 수동 시전 전용이므로 오토 게이트(#67)와 무관하다.
//    만충 기준이 지나치게 낮으면 상시 필살기가 된다 — 중형 주문(≈30) 서너 발 이상.
assert.ok(FUSION_CONFIG.fullCharge >= 90, '만충 기준이 중형 주문 3발 미만으로 내려가면 재검토');

// 8) 필살기 마나 무소모 (총괄 결정 2026-07-26) — 씬 배선 검사
// 방출 판정이 마나 검사보다 **앞**이어야 한다. 순서가 반대면 마나가 바닥일 때
// 만충 필살기가 거부되는 모순이 생긴다 — 다 떨어졌을 때 뒤집는 한 방이 존재 이유다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  const body = scene.slice(
    scene.indexOf('private async castFromText'),
    scene.indexOf('private currentJudgeSource'),
  );
  const releaseAt = body.indexOf('this.fusionGauge.tryRelease(spec)');
  const manaPlanAt = body.indexOf('degradedCastPlan(spec.cost');
  assert.ok(releaseAt >= 0 && manaPlanAt >= 0, '전제: 두 지점을 못 찾음 — 회귀가 헛돈다');
  assert.ok(releaseAt < manaPlanAt,
    '방출 판정이 마나 검사 뒤에 있다 — 마나 바닥이면 만충 필살기가 거부된다');
  assert.ok(body.includes('{ spend: 0, ratio: 1 }'),
    '방출 시전이 마나를 낸다 — 필살기는 마나 무소모(spend 0)여야 한다');
}

// 9) all-plan 시퀀스 경로도 같은 규칙을 지킨다.
// 최신 Judge는 단순 주문에도 spell_plan을 줄 수 있다. 이 경로가 먼저 return하므로
// runSequenceCast 안에서 방출을 검사하지 않으면 만충이어도 마나 부족으로 거부된다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  const sequenceBody = scene.slice(
    scene.indexOf('private async runSequenceCast'),
    scene.indexOf('// ── 판정 → 렌더링 사이클'),
  );
  const releaseAt = sequenceBody.indexOf('this.fusionGauge.tryRelease(representativeSpec)');
  const spendAt = sequenceBody.indexOf('this.playerState.trySpendMana');
  assert.ok(releaseAt >= 0 && spendAt >= 0, '시퀀스 방출·마나 지점을 못 찾음');
  assert.ok(releaseAt < spendAt,
    '시퀀스 방출 판정이 마나 검사 뒤에 있다 — all-plan 필살기가 마나 0에서 거부된다');
  assert.ok(sequenceBody.includes('fusedSpec ? 0 : plan.manaCost'),
    '시퀀스 필살기의 실제 소모 마나는 0이어야 한다');
  assert.match(
    scene,
    /runSequenceCast\(\s*judgement\.plan,\s*text,\s*this\.currentJudgeSource\(\),\s*judgement\.spell,\s*\)/s,
    '시퀀스 경로가 판정 대표 주문을 넘겨야 이중 원소 필살기 조건을 확인할 수 있다',
  );
}

// 10) 시퀀스 의미 보존 — 가장 강한 form 하나만 격상하고 이동·다른 form·기록 비용은 유지.
{
  const plan: ResolvedSpellPlan = {
    name: '증기 돌진',
    power: 70,
    manaCost: 42,
    sequences: [
      {
        durationMs: 400,
        behaviors: [
          { type: 'move', destination: 'target-direction', element: 'wind', distance: 120 },
          { type: 'form', spec: { ...single, power: 40 } },
        ],
      },
      {
        durationMs: 300,
        behaviors: [{ type: 'form', spec: { ...dual, power: 70 } }],
      },
    ],
  };
  const releaseGauge = new FusionGauge();
  releaseGauge.charge(FUSION_CONFIG.fullCharge);
  const fused = releaseGauge.tryRelease(dual);
  assert.ok(fused);
  const elevated = applyFusionReleaseToPlan(plan, fused!);
  const forms = elevated.sequences
    .flatMap((sequence) => sequence.behaviors)
    .filter((behavior): behavior is FormBehavior => behavior.type === 'form');
  assert.equal(elevated.manaCost, plan.manaCost, '기록용 원래 비용은 보존');
  assert.equal(elevated.sequences[0].behaviors[0].type, 'move', '이동 행동 보존');
  assert.equal(forms[0].spec.power, 40, '대표가 아닌 form은 그대로');
  assert.equal(forms[1].spec, fused, '가장 강한 피날레 form만 방출 스펙으로 교체');
  assert.equal(elevated.power, FUSION_CONFIG.releasePower, '진행 표시용 plan 위력도 방출 상한');
}

console.log('fusion gauge regression: 충전·방출게이트·격상내용·소모/보존·합집합·리셋·마나무소모·all-plan·시퀀스보존 10군 통과');
