import assert from 'node:assert/strict';
import { bossDamageTelemetry } from '../src/combat-core/combat/damageTelemetry';
import { flooredResistMultiplier } from '../src/combat-core/combat/debuffFloor';

interface Case {
  name: string;
  effectivePower: number;
  escalation: number;
  rawBossResist: number;
  expectedApplied: number;
  expectedCombined: number;
  expectedFinal: number;
  legacyFinal: number;
}

const cases: Case[] = [
  {
    name: '보스 내성만',
    effectivePower: 100,
    escalation: 1,
    rawBossResist: 0.3,
    expectedApplied: 0.5,
    expectedCombined: 0.5,
    expectedFinal: 50,
    legacyFinal: 30,
  },
  {
    name: '격상 0.4 + 보스 내성 0.3',
    // effectivePower에는 격상 0.4가 이미 반영되어 있다.
    effectivePower: 40,
    escalation: 0.4,
    rawBossResist: 0.3,
    expectedApplied: 1.25,
    expectedCombined: 0.5,
    expectedFinal: 50,
    legacyFinal: 12,
  },
  {
    name: '반복 하한 0.6 + 격상 0.4 + 보스 내성 0.3',
    // base 100 × repeat 0.6 × escalation 0.4 = effectivePower 24.
    effectivePower: 24,
    escalation: 0.4,
    rawBossResist: 0.3,
    expectedApplied: 1.25,
    expectedCombined: 0.5,
    expectedFinal: 30,
    legacyFinal: 7,
  },
  {
    name: '합산 하한 위',
    effectivePower: 90,
    escalation: 0.9,
    rawBossResist: 0.8,
    expectedApplied: 0.8,
    expectedCombined: 0.72,
    expectedFinal: 72,
    legacyFinal: 72,
  },
];

for (const testCase of cases) {
  const result = bossDamageTelemetry(
    testCase.effectivePower,
    testCase.escalation,
    testCase.rawBossResist,
  );
  const engineMultiplier = flooredResistMultiplier(
    testCase.escalation,
    testCase.rawBossResist,
  );

  assert.ok(
    Math.abs(result.appliedBossMultiplier - testCase.expectedApplied) < 1e-9,
    `${testCase.name}: 실제 적용 배수`,
  );
  assert.ok(
    Math.abs(result.combinedDebuff - testCase.expectedCombined) < 1e-9,
    `${testCase.name}: 합산 감쇠`,
  );
  assert.equal(result.finalVsBoss, testCase.expectedFinal, `${testCase.name}: 최종 로그`);
  assert.equal(
    result.finalVsBoss,
    Math.round(testCase.effectivePower * engineMultiplier),
    `${testCase.name}: 전투 엔진 공식과 로그가 같아야 한다`,
  );
  assert.equal(
    Math.round(testCase.effectivePower * testCase.rawBossResist),
    testCase.legacyFinal,
    `${testCase.name}: 수정 전 로그 기준선`,
  );
}

assert.deepEqual(
  bossDamageTelemetry(Number.NaN, Number.NaN, Number.NaN),
  {
    rawBossResist: 1,
    appliedBossMultiplier: 1,
    combinedDebuff: 1,
    finalVsBoss: 0,
  },
  '비정상 계측 입력은 안전한 중립값으로 정규화',
);

console.table(cases.map((testCase) => {
  const result = bossDamageTelemetry(
    testCase.effectivePower,
    testCase.escalation,
    testCase.rawBossResist,
  );
  return {
    case: testCase.name,
    legacyLog: testCase.legacyFinal,
    correctedLog: result.finalVsBoss,
    engineApplied: Number(result.appliedBossMultiplier.toFixed(2)),
    combinedDebuff: Number(result.combinedDebuff.toFixed(2)),
  };
}));
console.log('damage telemetry regression: 엔진 공식 동기화·기준선·방어 5군 통과');
