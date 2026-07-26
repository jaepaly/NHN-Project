import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { SpellHistory } from '../src/spell/spellHistory';
import { SEQUENCE_FIXTURE_CATALOG } from '../src/spell/sequenceFixtureCatalog';
import { sequenceEngraveCandidate } from '../src/spell/sequenceEngraveCandidate';
import {
  behaviorUsesAnyElement,
  debugSpellPlan,
  maxSequenceDurationMs,
  resolveSpellPlan,
  screenDirectionFromAngle,
  SEQUENCE_PLAN_LIMITS,
  SEQUENCE_FLOW_CONFIG,
  moveChainRoles,
  sequenceFlowTimeline,
  type FormBehavior,
  type SpellPlan,
} from '../src/spell/sequencePlan';

const dashNova = resolveSpellPlan(debugSpellPlan('#seq dash-nova')!);
assert.equal(dashNova.power, 75);
assert.equal(dashNova.manaCost, 45, 'mana cost should use the original total power');
assert.deepEqual(dashNova.sequences.map((sequence) => sequence.durationMs), [1000, 500]);
const dashNovaForm = dashNova.sequences[1].behaviors[0];
assert.equal(dashNovaForm.type, 'form');
if (dashNovaForm.type === 'form') {
  assert.equal(dashNovaForm.spec.power, 68,
    'one move should reserve 10% of total power before form allocation');
}

const duplicatePlan: SpellPlan = {
  name: 'duplicate',
  power: 50,
  durationMs: 1000,
  sequences: [{
    behaviors: [
      { type: 'wait' },
      ...debugSpellPlan('#seq single')!.sequences[0].behaviors,
      ...debugSpellPlan('#seq single')!.sequences[0].behaviors,
    ],
  }],
};
const normalizedDuplicate = resolveSpellPlan(duplicatePlan);
assert.equal(normalizedDuplicate.sequences[0].behaviors.length, 1,
  'mixed wait and exact form duplicates should be removed');
assert.equal(normalizedDuplicate.sequences[0].behaviors[0].type, 'form');

const zeroWeights: SpellPlan = {
  name: 'zero weights',
  power: 40,
  durationMs: 1200,
  sequences: [
    { durationWeight: 0, behaviors: debugSpellPlan('#seq single')!.sequences[0].behaviors },
    { durationWeight: 0, behaviors: debugSpellPlan('#seq single')!.sequences[0].behaviors },
  ],
};
assert.deepEqual(
  resolveSpellPlan(zeroWeights).sequences.map((sequence) => sequence.durationMs),
  [600, 600],
  'all-zero duration weights should fall back to equal sequence durations',
);

const capped: SpellPlan = {
  name: 'capped',
  power: 999,
  durationMs: 99999,
  sequences: Array.from({ length: 12 }, () => ({
    behaviors: debugSpellPlan('#seq single')!.sequences[0].behaviors,
  })),
};
const resolvedCapped = resolveSpellPlan(capped);
assert.equal(resolvedCapped.power, 100);
assert.equal(resolvedCapped.sequences.length, SEQUENCE_PLAN_LIMITS.maxSequences);
assert.equal(
  resolvedCapped.sequences.reduce((sum, sequence) => sum + sequence.durationMs, 0),
  SEQUENCE_PLAN_LIMITS.maxDurationMs,
);

assert.equal(maxSequenceDurationMs(0), 500);
assert.equal(maxSequenceDurationMs(10), 750);
assert.equal(maxSequenceDurationMs(50), 1750);
assert.equal(maxSequenceDurationMs(100), 3000);

const lowPowerLongSequence = resolveSpellPlan({
  name: 'low power long sequence',
  power: 10,
  durationMs: 5000,
  sequences: [{ behaviors: debugSpellPlan('#seq single')!.sequences[0].behaviors }],
});
assert.equal(
  lowPowerLongSequence.sequences.reduce((sum, sequence) => sum + sequence.durationMs, 0),
  750,
  'low-power plans must not receive the full three-second execution window',
);

const invulnerabilityState = new PlayerCombatState();
invulnerabilityState.applyTimedBuff('ward', 0.5, 3);
invulnerabilityState.applyInvulnerability(1);
assert.deepEqual(invulnerabilityState.takeDamage(20), { hpDamage: 0, shieldDamage: 0 });
invulnerabilityState.update(1.1);
assert.deepEqual(
  invulnerabilityState.takeDamage(20),
  { hpDamage: 10, shieldDamage: 0 },
  'sequence invulnerability must expire without extending a separate ward buff',
);

assert.ok(debugSpellPlan('#seq petal-dance'));
for (const fixture of [
  'phoenix-dive',
  'thunder-hunt',
  'winter-garden',
  'eclipse-waltz',
  'last-bastion',
  'receding-tide',
  'eye-of-storm',
  'abyssal-host',
  'dawn-pilgrimage',
  'void-steps',
  'glass-star-shot',
  'octave-of-elements',
]) {
  assert.ok(debugSpellPlan(`#seq ${fixture}`), `${fixture} fixture should resolve`);
}
for (const name of [
  '불사조의 낙화',
  '뇌광의 사냥',
  '겨울 정원의 폐막',
  '일식의 왈츠',
  '최후의 성채',
  '해일의 역류',
  '폭풍의 눈',
  '심연의 군세',
  '새벽의 순례',
  '허공답보',
  '유리별의 사격',
  '팔원소 대합창',
]) {
  assert.equal(debugSpellPlan(name)?.name, name, `${name} should resolve by its display name`);
}
assert.equal(debugSpellPlan('일반적인 화염구'), null,
  'ordinary incantations must continue to the judge');
assert.equal(debugSpellPlan('#seq unknown'), null);

assert.ok(SEQUENCE_FIXTURE_CATALOG.length >= 18,
  'the R1→R2 executable fixture catalog should cover a broad schema surface');
for (const fixture of SEQUENCE_FIXTURE_CATALOG) {
  assert.equal(debugSpellPlan(fixture.input)?.name, fixture.input,
    `${fixture.input} should run by its incantation name`);
  assert.equal(debugSpellPlan(`#seq ${fixture.key}`)?.name, fixture.input,
    `${fixture.key} should run by its debug key`);
  const resolved = resolveSpellPlan(fixture.plan);
  assert.ok(resolved.sequences.length > 0, `${fixture.key} should retain a runnable sequence`);
  assert.ok(resolved.sequences.length <= SEQUENCE_PLAN_LIMITS.maxSequences);
  assert.ok(resolved.sequences.every(
    (sequence) => sequence.behaviors.length <= SEQUENCE_PLAN_LIMITS.maxBehaviorsPerSequence,
  ));
}

const retreatPlan = resolveSpellPlan({
  name: 'retreat schema fixture',
  power: 40,
  durationMs: 1000,
  sequences: [{ behaviors: [{
    type: 'move',
    destination: 'away-from-target',
    element: 'wind',
    distance: 180,
  }] }],
});
assert.deepEqual(retreatPlan.sequences[0].behaviors[0], {
  type: 'move',
  destination: 'away-from-target',
  element: 'wind',
  distance: 180,
});
assert.equal(
  behaviorUsesAnyElement(retreatPlan.sequences[0].behaviors[0], ['wind']),
  true,
  'elemental move behaviors qualify for element-affinity curse effects',
);
assert.equal(
  behaviorUsesAnyElement(retreatPlan.sequences[0].behaviors[0], ['light', 'fire']),
  false,
  'unrelated move elements do not trigger another affinity',
);
assert.equal(
  behaviorUsesAnyElement({ type: 'wait' }, ['wind']),
  false,
  'wait behaviors never carry an elemental affinity',
);

const rainbowSpear = resolveSpellPlan(debugSpellPlan('#seq rainbow-spear')!);
const rainbowBehavior = rainbowSpear.sequences[0].behaviors[0];
assert.equal(rainbowBehavior.type, 'form');
assert.equal(
  behaviorUsesAnyElement(rainbowBehavior, ['lightning']),
  true,
  'secondary form elements qualify for element-affinity curse effects',
);
assert.equal(
  behaviorUsesAnyElement(rainbowBehavior, ['light']),
  true,
  'primary form elements continue to qualify for element-affinity curse effects',
);

const sequenceHistory = new SpellHistory();
const phoenix = resolveSpellPlan(debugSpellPlan('불사조의 낙화')!);
const phoenixBehaviors = phoenix.sequences.flatMap((sequence) => (
  sequence.behaviors
    .filter((behavior): behavior is FormBehavior => behavior.type === 'form')
    .map((behavior) => behavior.spec)
));
sequenceHistory.recordSequence({
  rawText: '불사조의 낙화',
  name: phoenix.name,
  elements: ['fire', 'wind'],
  power: phoenix.power,
  cost: phoenix.manaCost,
  source: 'local',
  castAt: 1000,
});
for (const behavior of phoenixBehaviors) sequenceHistory.recordBehaviorUsage(behavior, 1000);
assert.equal(sequenceHistory.size, 1, 'a multi-behavior sequence is one player cast');
assert.equal(sequenceHistory.allBehaviorUsages.length, 2,
  'move and wait are excluded while both form behaviors are counted');
assert.equal(sequenceHistory.bossMemory().dominantElement, 'fire');
assert.equal(sequenceHistory.bossMemory().totalCasts, 1);
assert.deepEqual(sequenceHistory.bossMemory().recentSpellNames, ['불사조의 낙화']);

const movementOnly = resolveSpellPlan(debugSpellPlan('허공답보')!);
sequenceHistory.recordSequence({
  rawText: '허공답보',
  name: movementOnly.name,
  elements: [],
  power: movementOnly.power,
  cost: movementOnly.manaCost,
  source: 'local',
  castAt: 2000,
});
assert.equal(sequenceHistory.size, 2, 'elementless movement plans still count as casts');
assert.equal(sequenceHistory.allBehaviorUsages.length, 2,
  'movement-only plans must not add element or form counter samples');

const phoenixEngrave = sequenceEngraveCandidate(phoenix);
assert.ok(phoenixEngrave);
assert.equal(phoenixEngrave.form, 'nova', 'the stronger finisher supplies the projected form');
assert.equal(
  phoenixEngrave.power,
  phoenixBehaviors.reduce((sum, spell) => sum + spell.power, 0),
  'engraving pools all eligible damage power instead of scaling one split twice',
);
assert.equal(sequenceEngraveCandidate(movementOnly), null,
  'movement-only incantations must not become engrave candidates');
assert.equal(
  sequenceEngraveCandidate(resolveSpellPlan(debugSpellPlan('최후의 성채')!)),
  null,
  'shield and control-only sequences must not become damage engravings',
);
const barrageEngrave = sequenceEngraveCandidate(
  resolveSpellPlan(debugSpellPlan('사방의 포화')!),
);
assert.ok(barrageEngrave);
assert.equal(barrageEngrave.form, 'rain',
  'equal-power candidates prefer the latest eligible finisher while wall remains excluded');
assert.equal(barrageEngrave.power, 80,
  'four eligible attacks pool their budget while the excluded wall contributes nothing');

// custom-vector 화면 절대 방향 매핑 (버그 수정: 표적 상대 → 화면 절대)
// 위=0 기준 시계방향. "왼쪽"은 표적 위치와 무관하게 항상 화면 왼쪽이어야 한다.
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
const dirCases: Array<[number, number, number, string]> = [
  [0, 0, -1, '위(0) → (0,-1)'],
  [90, 1, 0, '오른쪽(90) → (1,0)'],
  [180, 0, 1, '아래(180) → (0,1)'],
  [-90, -1, 0, '왼쪽(-90) → (-1,0)'],
  [45, Math.SQRT1_2, -Math.SQRT1_2, '비스듬 위-오른쪽(45)'],
  [-45, -Math.SQRT1_2, -Math.SQRT1_2, '비스듬 위-왼쪽(-45)'],
];
for (const [deg, ex, ey, label] of dirCases) {
  const d = screenDirectionFromAngle(deg);
  assert.ok(near(d.x, ex) && near(d.y, ey),
    `screenDirectionFromAngle: ${label} 이어야 하는데 (${d.x.toFixed(3)},${d.y.toFixed(3)})`);
}
// 단위 벡터 보존
for (const deg of [0, 33, 90, 137, 180, -12, -90, 271]) {
  const d = screenDirectionFromAngle(deg);
  assert.ok(near(Math.hypot(d.x, d.y), 1), `방향 벡터는 단위여야 함 (angle=${deg})`);
}

console.info('spell sequence regression: normalization, budgets, and debug fixtures passed');
console.info('custom-vector 화면 절대 방향 매핑: 6방향 + 단위벡터 통과');// ── 시퀀스 흐름 오버랩 (총괄 발안 07-26) — "완결 대기"의 답답함 제거 ─────
{
  const seq = (durationMs: number, type: 'form' | 'wait' = 'form') => ({
    durationMs,
    behaviors: type === 'form'
      ? [{ type: 'form' as const, form: 'bolt' as const, element: 'fire' as const }]
      : [{ type: 'wait' as const }],
  });

  // 기본: 마지막 빼고 70%만 기다린다 → 다음 행동이 70% 시점에 겹쳐 발동
  const t3 = sequenceFlowTimeline([seq(1000), seq(1000), seq(1000)]);
  assert.deepEqual(t3.waitsMs, [700, 700, 1000], '앞 시퀀스는 70%, 마지막은 온전');
  assert.equal(t3.totalMs, 2400, '실효 총 시간 = 3000 → 2400 (20% 단축)');
  assert.deepEqual(
    t3.boundaries.map((b) => +b.toFixed(4)),
    [+(700 / 2400).toFixed(4), +(1400 / 2400).toFixed(4)],
    '진행바 경계 = 실제 발동 시점 — 화면과 발동이 어긋나면 안 된다',
  );

  // wait 전용 시퀀스는 오버랩 금지 — "심장이 두 번 뛰는 동안"의 간격은 내용이다
  const tw = sequenceFlowTimeline([seq(1000), seq(800, 'wait'), seq(1000)]);
  assert.deepEqual(tw.waitsMs, [700, 800, 1000], 'wait 시퀀스는 온전히 기다린다');

  // 단일 시퀀스 = 오버랩 대상 없음
  const t1 = sequenceFlowTimeline([seq(900)]);
  assert.deepEqual(t1.waitsMs, [900]);
  assert.deepEqual(t1.boundaries, [], '단일이면 경계 없음');

  // 방어: 빈 배열·0 duration
  assert.deepEqual(sequenceFlowTimeline([]), { waitsMs: [], totalMs: 0, boundaries: [] });
  assert.equal(sequenceFlowTimeline([seq(0), seq(0)]).totalMs, 0, '0 duration 안전');

  // 상수 가드 — 0.5 밑이면 연출이 뭉개지고, 1이면 오버랩이 없다
  assert.ok(
    SEQUENCE_FLOW_CONFIG.overlapStart >= 0.5 && SEQUENCE_FLOW_CONFIG.overlapStart < 1,
    'overlapStart 범위(0.5~1) 이탈',
  );

  // 씬 배선 — 루프가 durationMs가 아니라 타임라인 waits로 기다리는가
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(scene.includes('sequenceFlowTimeline(plan.sequences)'),
    '씬이 타임라인을 만들지 않는다');
  assert.ok(scene.includes('timeline.waitsMs[sequenceIndex]'),
    '루프가 여전히 완결 대기(durationMs)로 기다린다');
  assert.ok(scene.includes('this.playerState.applyInvulnerability(timeline.totalMs / 1000)'),
    '무적이 실효 시간과 어긋난다 — 오버랩 후 무적이 연출보다 길게 남는다');
  assert.ok(scene.includes('[...timeline.boundaries]'),
    '진행바 경계가 실효 타임라인을 쓰지 않는다');
}

// ── move 체인 이징 (총괄 피드백 2차: "아직 스무스하지 않다") ──────────
// 오버랩만으론 부족 — easeInOut 연쇄가 매 인계마다 정지·재가속했다.
{
  const mv = (durationMs: number) => ({
    durationMs,
    behaviors: [{ type: 'move' as const, destination: 'target-direction' as const }],
  });
  const fm = (durationMs: number) => ({
    durationMs,
    behaviors: [{ type: 'form' as const, form: 'bolt' as const, element: 'fire' as const }],
  });
  const wt = (durationMs: number) => ({
    durationMs,
    behaviors: [{ type: 'wait' as const }],
  });

  assert.deepEqual(moveChainRoles([mv(500)]), ['solo'], '혼자면 solo');
  assert.deepEqual(
    moveChainRoles([mv(500), mv(500), mv(500)]),
    ['lead', 'mid', 'tail'],
    '3연속 이동 = 가속·등속·감속 — 이게 "슥슥"의 정체',
  );
  assert.deepEqual(
    moveChainRoles([mv(500), fm(500), mv(500)]),
    ['solo', null, 'solo'],
    'move 아닌 시퀀스가 끼면 체인 아님',
  );
  assert.deepEqual(
    moveChainRoles([mv(500), wt(300), mv(500)]),
    ['solo', null, 'solo'],
    'wait는 체인을 끊는다 — 정지가 의도인 자리',
  );
  assert.deepEqual(moveChainRoles([]), [], '빈 배열 안전');

  // 씬 배선 — 역할이 실제 이징으로 이어지는가
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(scene.includes('moveChainRoles(plan.sequences)'), '씬이 체인 역할을 계산하지 않는다');
  assert.ok(scene.includes("chainRole === 'lead'"), '이징 분기가 없다');
  assert.ok(scene.includes("? 'Linear'"),
    '중간 이동이 등속(Linear)이 아니다 — 인계 순간 속도가 끊긴다');

  // 인계 1프레임 정지 방지 — 새 트윈이 다음 틱부터 움직이므로, 이전 트윈을
  // 같은 프레임에 stop하면 인계 프레임 속도 0 + 다음 프레임 스파이크(실측 7.07).
  // 이전 트윈은 살려두고 나중 add가 위치를 덮어쓰게 한다.
  const moveBody = scene.slice(
    scene.indexOf('private executeSequenceMove'),
    scene.indexOf('private applySpellEffect'),
  );
  assert.ok(moveBody.length > 500, '전제: executeSequenceMove 본문을 못 찾음');
  assert.ok(scene.includes('sequenceMoveTweens.push(tween)'),
    '이동 트윈이 배열로 추적되지 않는다 — 시퀀스 종료 시 잔여 트윈이 안 멈춘다');
  // stop은 즉시 이동(durationMs <= 0) 분기 안에만 허용 — 트윈 경로 직전 stop 금지
  const instantAt = moveBody.indexOf('durationMs <= 0');
  const tweenAddAt = moveBody.indexOf('this.tweens.add');
  const beforeInstant = moveBody.slice(0, instantAt);
  assert.ok(!beforeInstant.includes('.stop()'),
    '트윈 인계 전에 이전 트윈을 멈춘다 — 인계 1프레임 정지가 재발한다');
  assert.ok(instantAt >= 0 && tweenAddAt > instantAt, '전제: 분기 순서가 바뀜 — 검사 갱신 필요');
}


