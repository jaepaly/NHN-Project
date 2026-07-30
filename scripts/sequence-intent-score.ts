import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type JsonRecord = Record<string, unknown>;
type CheckState = 'pass' | 'fail' | 'manual' | 'not_applicable';

interface IntentExpectation {
  id: number;
  input: string;
  legacyStatus: string;
  recommendation: {
    mode: 'single_preferred' | 'sequence_preferred' | 'sequence_required' | 'either';
    confidence: string;
  };
  anchors: {
    requiredElements?: string[];
    optionalElements?: string[];
    minimumDistinctElements?: number;
    requiredBehaviorTypes?: string[];
    allowedFormsAnyOf?: string[];
    allowedEffectsAnyOf?: string[];
    forbiddenEffects?: string[];
    allowedSpeedsAnyOf?: string[];
  };
  relations: {
    required: string[];
    optional: string[];
    forbidden: string[];
  };
  structure: {
    sequenceRangeIfPlan: [number, number];
    requiresParallel: boolean;
    requiresFinale: boolean;
    forbidDecorativeMove?: boolean;
    preferredDurationMsRange?: [number, number];
    minimumParallelBehaviors?: number;
    requiredRepetitionCount?: number;
    minimumMoveCount?: number;
    maximumMoveCount?: number;
    minimumFormCount?: number;
    maximumFormCount?: number;
  };
  visualIntent: string;
}

interface ExpectationsFile {
  globalHardRules: {
    maxSequences: number;
    maxBehaviorsPerSequence: number;
    behaviorTypes: string[];
    waitMustBeAlone: boolean;
    moveRequiresElement: boolean;
    specPowerMustBeZero: boolean;
    specCostMustBeZero: boolean;
  };
  cases: IntentExpectation[];
}

interface BaselineResult {
  index: number;
  key: string;
  input: string;
  actual: unknown;
}

interface BaselineFile {
  workerUrl: string;
  generatedAt: string;
  results: BaselineResult[];
}

interface Check {
  id: string;
  state: CheckState;
  weight: number;
  detail: string;
}

const BASELINE_SOURCE = process.env.BASELINE_PATH ?? 'docs/SEQUENCE_FIXTURE_ALIGNMENT_BASELINE.json';
const EXPECTATIONS_SOURCE = process.env.EXPECTATIONS_PATH ?? 'docs/SEQUENCE_JUDGE_EXPECTATIONS.json';
const JSON_OUTPUT_SOURCE = process.env.SCORE_OUTPUT_PATH ?? 'docs/SEQUENCE_JUDGE_INTENT_SCORE_BASELINE.json';
const REPORT_OUTPUT_SOURCE = process.env.SCORE_REPORT_PATH ?? 'docs/SEQUENCE_JUDGE_INTENT_SCORE_REPORT.md';
const BASELINE_PATH = resolve(BASELINE_SOURCE);
const EXPECTATIONS_PATH = resolve(EXPECTATIONS_SOURCE);
const JSON_OUTPUT_PATH = resolve(JSON_OUTPUT_SOURCE);
const REPORT_OUTPUT_PATH = resolve(REPORT_OUTPUT_SOURCE);
const VALID_ELEMENTS = new Set(['fire', 'water', 'lightning', 'ice', 'earth', 'wind', 'light', 'dark']);
const VALID_FORMS = new Set([
  'bolt', 'beam', 'slash', 'wave', 'nova', 'rain', 'wall',
  'cage', 'orbit', 'summon', 'buff', 'zone', 'chain',
]);
const VALID_EFFECTS = new Set(['damage', 'heal', 'shield', 'buff', 'control', 'summon']);
const VALID_TARGETS = new Set(['enemy', 'self', 'area']);

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function string(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extract(actual: unknown): {
  mode: 'single' | 'sequence' | 'none';
  spell: JsonRecord | null;
  plan: JsonRecord | null;
  sequences: JsonRecord[];
  behaviors: JsonRecord[];
  specs: JsonRecord[];
} {
  const root = record(actual);
  const plan = record(root?.spell_plan);
  const single = record(root?.spell);
  const sequences = array(plan?.sequences).map(record).filter((item): item is JsonRecord => item !== null);
  const behaviors = sequences.flatMap((sequence) =>
    array(sequence.behaviors).map(record).filter((item): item is JsonRecord => item !== null));
  const specs = [
    ...(single ? [single] : []),
    ...behaviors.map((behavior) => record(behavior.spec)).filter((item): item is JsonRecord => item !== null),
  ];
  return {
    mode: plan ? 'sequence' : single ? 'single' : 'none',
    spell: single,
    plan,
    sequences,
    behaviors,
    specs,
  };
}

function modeCheck(expected: IntentExpectation, actualMode: 'single' | 'sequence' | 'none'): Check {
  if (actualMode === 'none') {
    return { id: 'mode', state: 'fail', weight: 2, detail: 'cast 결과에 spell 또는 spell_plan이 없다.' };
  }
  const mode = expected.recommendation.mode;
  if (mode === 'either') {
    return { id: 'mode', state: 'pass', weight: 2, detail: `${actualMode} 허용` };
  }
  const wantsSequence = mode === 'sequence_required' || mode === 'sequence_preferred';
  const matched = wantsSequence ? actualMode === 'sequence' : actualMode === 'single';
  if (!matched && mode !== 'sequence_required') {
    return {
      id: 'mode',
      state: 'manual',
      weight: 0,
      detail: `선호 ${mode}, 실제 ${actualMode} — 핵심 이미지와 사건 역할 보존 여부를 수동 판정`,
    };
  }
  return {
    id: 'mode',
    state: matched ? 'pass' : 'fail',
    weight: mode === 'sequence_required' ? 3 : 2,
    detail: `기대 ${mode}, 실제 ${actualMode}`,
  };
}

function relationDetected(
  relation: string,
  sequences: JsonRecord[],
  behaviors: JsonRecord[],
  expectation: IntentExpectation,
): boolean | null {
  const types = behaviors.map((behavior) => string(behavior.type));
  switch (relation) {
    case 'order':
      return sequences.length >= 2;
    case 'parallel':
      return sequences.some((sequence) =>
        array(sequence.behaviors).length >= (expectation.structure.minimumParallelBehaviors ?? 2));
    case 'delay':
      return types.includes('wait');
    case 'movement':
      return types.includes('move');
    case 'repetition': {
      const signatures = behaviors.map((behavior) => {
        const spec = record(behavior.spec);
        return JSON.stringify([
          string(behavior.type),
          string(spec?.element_primary),
          string(spec?.form),
          string(behavior.destination),
        ]);
      });
      const counts = new Map<string, number>();
      for (const signature of signatures) counts.set(signature, (counts.get(signature) ?? 0) + 1);
      return Math.max(0, ...counts.values()) >= (expectation.structure.requiredRepetitionCount ?? 2);
    }
    case 'finale':
      return sequences.length >= 2 && array(sequences.at(-1)?.behaviors).some((item) => {
        const behavior = record(item);
        return string(behavior?.type) === 'form';
      });
    case 'causality':
    case 'transition':
    case 'accumulation':
    case 'persistence':
      return null;
    default:
      return null;
  }
}

function scoreCase(
  expected: IntentExpectation,
  baseline: BaselineResult,
  rules: ExpectationsFile['globalHardRules'],
) {
  const actual = extract(baseline.actual);
  const checks: Check[] = [modeCheck(expected, actual.mode)];
  const elements = new Set([
    ...actual.specs.flatMap((spec) =>
      [string(spec.element_primary), string(spec.element_secondary)]
        .filter((item): item is string => item !== null)),
    ...actual.behaviors
      .filter((behavior) => string(behavior.type) === 'move')
      .map((behavior) => string(behavior.element))
      .filter((item): item is string => item !== null),
  ]);
  const forms = new Set(actual.specs.map((spec) => string(spec.form)).filter((item): item is string => item !== null));
  const effects = new Set(actual.specs.map((spec) => string(spec.effect)).filter((item): item is string => item !== null));
  const speeds = new Set(actual.specs.map((spec) => string(spec.speed)).filter((item): item is string => item !== null));
  const behaviorTypes = new Set(actual.behaviors.map((behavior) => string(behavior.type))
    .filter((item): item is string => item !== null));
  const requiredElements = expected.anchors.requiredElements ?? [];
  const requiredBehaviorTypes = expected.anchors.requiredBehaviorTypes ?? [];
  const allowedFormsAnyOf = expected.anchors.allowedFormsAnyOf ?? [];
  if (actual.mode === 'single') behaviorTypes.add('form');

  for (const element of requiredElements) {
    checks.push({
      id: `element:${element}`,
      state: elements.has(element) ? 'pass' : 'fail',
      weight: 2,
      detail: elements.has(element) ? `필수 원소 ${element} 보존` : `필수 원소 ${element} 누락`,
    });
  }
  const minimumDistinctElements = expected.anchors.minimumDistinctElements ?? 1;
  checks.push({
    id: 'element-diversity',
    state: elements.size >= minimumDistinctElements ? 'pass' : 'fail',
    weight: 1,
    detail: `서로 다른 원소 ${elements.size}/${minimumDistinctElements}`,
  });
  for (const behavior of requiredBehaviorTypes) {
    checks.push({
      id: `behavior:${behavior}`,
      state: behaviorTypes.has(behavior) ? 'pass' : 'fail',
      weight: 2,
      detail: behaviorTypes.has(behavior) ? `필수 행동 ${behavior} 존재` : `필수 행동 ${behavior} 누락`,
    });
  }
  if (allowedFormsAnyOf.length > 0) {
    const matched = allowedFormsAnyOf.some((form) => forms.has(form));
    checks.push({
      id: 'allowed-form',
      state: matched ? 'pass' : 'fail',
      weight: 2,
      detail: `허용 형태 ${allowedFormsAnyOf.join('/')} 중 실제 ${[...forms].join('/') || '없음'}`,
    });
  }
  if (expected.anchors.allowedEffectsAnyOf && expected.anchors.allowedEffectsAnyOf.length > 0) {
    const matched = expected.anchors.allowedEffectsAnyOf.some((effect) => effects.has(effect));
    checks.push({
      id: 'allowed-effect',
      state: matched ? 'pass' : 'fail',
      weight: 2,
      detail: `허용 효과 ${expected.anchors.allowedEffectsAnyOf.join('/')} 중 실제 ${[...effects].join('/') || '없음'}`,
    });
  }
  if (expected.anchors.forbiddenEffects && expected.anchors.forbiddenEffects.length > 0) {
    const forbidden = expected.anchors.forbiddenEffects.filter((effect) => effects.has(effect));
    checks.push({
      id: 'forbidden-effect',
      state: forbidden.length === 0 ? 'pass' : 'fail',
      weight: 2,
      detail: forbidden.length === 0
        ? `금지 효과 ${expected.anchors.forbiddenEffects.join('/')} 없음`
        : `금지 효과 ${forbidden.join('/')} 검출`,
    });
  }
  if (expected.anchors.allowedSpeedsAnyOf && expected.anchors.allowedSpeedsAnyOf.length > 0) {
    const matched = expected.anchors.allowedSpeedsAnyOf.some((speed) => speeds.has(speed));
    checks.push({
      id: 'allowed-speed',
      state: matched ? 'pass' : 'fail',
      weight: 1,
      detail: `허용 속도 ${expected.anchors.allowedSpeedsAnyOf.join('/')} 중 실제 ${[...speeds].join('/') || '없음'}`,
    });
  }

  for (const relation of expected.relations.required) {
    const detected = relationDetected(relation, actual.sequences, actual.behaviors, expected);
    checks.push({
      id: `relation:${relation}`,
      state: detected === null ? 'manual' : detected ? 'pass' : 'fail',
      weight: 2,
      detail: detected === null ? `${relation} 의미 보존은 수동 판정 필요` : `${relation} ${detected ? '검출' : '미검출'}`,
    });
  }
  for (const relation of expected.relations.forbidden) {
    const detected = relationDetected(relation, actual.sequences, actual.behaviors, expected);
    checks.push({
      id: `forbidden:${relation}`,
      state: detected === null ? 'manual' : detected ? 'fail' : 'pass',
      weight: 1,
      detail: detected === null ? `금지 ${relation} 여부는 수동 판정 필요` : `금지 ${relation} ${detected ? '검출' : '없음'}`,
    });
  }

  if (actual.mode === 'sequence') {
    const [minimum, maximum] = expected.structure.sequenceRangeIfPlan;
    checks.push({
      id: 'sequence-range',
      state: actual.sequences.length >= minimum && actual.sequences.length <= maximum ? 'pass' : 'fail',
      weight: 2,
      detail: `시퀀스 ${actual.sequences.length}, 허용 ${minimum}~${maximum}`,
    });
    if (expected.structure.preferredDurationMsRange) {
      const duration = number(actual.plan?.durationMs);
      const [minimumDuration, maximumDuration] = expected.structure.preferredDurationMsRange;
      checks.push({
        id: 'duration-range',
        state: duration !== null && duration >= minimumDuration && duration <= maximumDuration ? 'pass' : 'fail',
        weight: 1,
        detail: `durationMs ${duration ?? '없음'}, 선호 ${minimumDuration}~${maximumDuration}`,
      });
    }
    if (expected.structure.minimumMoveCount !== undefined) {
      const moveCount = actual.behaviors.filter((behavior) => string(behavior.type) === 'move').length;
      checks.push({
        id: 'minimum-move-count',
        state: moveCount >= expected.structure.minimumMoveCount ? 'pass' : 'fail',
        weight: 1,
        detail: `move ${moveCount}/${expected.structure.minimumMoveCount}`,
      });
    }
    if (expected.structure.maximumMoveCount !== undefined) {
      const moveCount = actual.behaviors.filter((behavior) => string(behavior.type) === 'move').length;
      checks.push({
        id: 'maximum-move-count',
        state: moveCount <= expected.structure.maximumMoveCount ? 'pass' : 'fail',
        weight: 1,
        detail: `move ${moveCount}/${expected.structure.maximumMoveCount} 이하`,
      });
    }
    if (expected.structure.minimumFormCount !== undefined) {
      const formCount = actual.behaviors.filter((behavior) => string(behavior.type) === 'form').length;
      checks.push({
        id: 'minimum-form-count',
        state: formCount >= expected.structure.minimumFormCount ? 'pass' : 'fail',
        weight: 1,
        detail: `form ${formCount}/${expected.structure.minimumFormCount} 이상`,
      });
    }
    if (expected.structure.maximumFormCount !== undefined) {
      const formCount = actual.behaviors.filter((behavior) => string(behavior.type) === 'form').length;
      checks.push({
        id: 'maximum-form-count',
        state: formCount <= expected.structure.maximumFormCount ? 'pass' : 'fail',
        weight: 1,
        detail: `form ${formCount}/${expected.structure.maximumFormCount} 이하`,
      });
    }
  }

  if (actual.sequences.length > rules.maxSequences) {
    checks.push({ id: 'contract:max-sequences', state: 'fail', weight: 3, detail: `최대 시퀀스 ${rules.maxSequences} 초과` });
  }
  actual.sequences.forEach((sequence, index) => {
    const sequenceBehaviors = array(sequence.behaviors).map(record)
      .filter((item): item is JsonRecord => item !== null);
    if (sequenceBehaviors.length > rules.maxBehaviorsPerSequence) {
      checks.push({
        id: `contract:max-behaviors:${index + 1}`,
        state: 'fail',
        weight: 3,
        detail: `${index + 1}단계 행동 ${sequenceBehaviors.length}/${rules.maxBehaviorsPerSequence}`,
      });
    }
    const hasWait = sequenceBehaviors.some((behavior) => string(behavior.type) === 'wait');
    if (rules.waitMustBeAlone && hasWait && sequenceBehaviors.length !== 1) {
      checks.push({
        id: `contract:wait-alone:${index + 1}`,
        state: 'fail',
        weight: 3,
        detail: `${index + 1}단계 wait가 다른 행동과 병렬 배치됨`,
      });
    }
  });
  actual.behaviors.forEach((behavior, index) => {
    const type = string(behavior.type);
    if (type && !rules.behaviorTypes.includes(type)) {
      checks.push({ id: `contract:behavior:${index + 1}`, state: 'fail', weight: 3, detail: `지원하지 않는 행동 ${type}` });
    }
    if (rules.moveRequiresElement && type === 'move' && !string(behavior.element)) {
      checks.push({ id: `contract:move-element:${index + 1}`, state: 'fail', weight: 3, detail: 'move element 누락' });
    }
    const spec = record(behavior.spec);
    if (rules.specPowerMustBeZero && spec && number(spec.power) !== 0) {
      checks.push({ id: `contract:spec-power:${index + 1}`, state: 'fail', weight: 3, detail: `spec.power ${number(spec.power)}` });
    }
    if (rules.specCostMustBeZero && spec && number(spec.cost) !== 0) {
      checks.push({ id: `contract:spec-cost:${index + 1}`, state: 'fail', weight: 3, detail: `spec.cost ${number(spec.cost)}` });
    }
  });
  actual.specs.forEach((spec, index) => {
    const primary = string(spec.element_primary);
    const secondary = string(spec.element_secondary);
    const form = string(spec.form);
    const effect = string(spec.effect);
    const target = string(spec.target);
    if (primary === null || !VALID_ELEMENTS.has(primary)) {
      checks.push({ id: `contract:element-primary:${index + 1}`, state: 'fail', weight: 3, detail: `지원하지 않는 주 원소 ${primary ?? '없음'}` });
    }
    if (secondary !== null && !VALID_ELEMENTS.has(secondary)) {
      checks.push({ id: `contract:element-secondary:${index + 1}`, state: 'fail', weight: 3, detail: `지원하지 않는 보조 원소 ${secondary}` });
    }
    if (form === null || !VALID_FORMS.has(form)) {
      checks.push({ id: `contract:form:${index + 1}`, state: 'fail', weight: 3, detail: `지원하지 않는 form ${form ?? '없음'}` });
    }
    if (effect === null || !VALID_EFFECTS.has(effect)) {
      checks.push({ id: `contract:effect:${index + 1}`, state: 'fail', weight: 3, detail: `지원하지 않는 effect ${effect ?? '없음'}` });
    }
    if (target === null || !VALID_TARGETS.has(target)) {
      checks.push({ id: `contract:target:${index + 1}`, state: 'fail', weight: 3, detail: `지원하지 않는 target ${target ?? '없음'}` });
    }
  });

  if (expected.structure.forbidDecorativeMove && actual.behaviors.some((behavior) => string(behavior.type) === 'move')) {
    checks.push({
      id: 'manual:decorative-move',
      state: 'manual',
      weight: 0,
      detail: 'move가 의미적 사건인지 장식용인지 수동 판정 필요',
    });
  }
  checks.push({
    id: 'manual:visual-intent',
    state: 'manual',
    weight: 0,
    detail: expected.visualIntent,
  });

  const automatic = checks.filter((check) => check.state === 'pass' || check.state === 'fail');
  const earned = automatic.reduce((sum, check) => sum + (check.state === 'pass' ? check.weight : 0), 0);
  const possible = automatic.reduce((sum, check) => sum + check.weight, 0);
  const score = possible === 0 ? 0 : Math.round((earned / possible) * 100);
  return {
    id: expected.id,
    key: baseline.key,
    input: expected.input,
    legacyStatus: expected.legacyStatus,
    expectedMode: expected.recommendation.mode,
    actualMode: actual.mode,
    automaticScore: score,
    passed: automatic.filter((check) => check.state === 'pass').length,
    failed: automatic.filter((check) => check.state === 'fail').length,
    manualPending: checks.filter((check) => check.state === 'manual').length,
    checks,
  };
}

function markdownReport(
  baseline: BaselineFile,
  results: ReturnType<typeof scoreCase>[],
): string {
  const mean = results.length === 0
    ? 0
    : Math.round(results.reduce((sum, result) => sum + result.automaticScore, 0) / results.length);
  const perfect = results.filter((result) => result.automaticScore === 100).length;
  const failures = results.reduce((sum, result) => sum + result.failed, 0);
  const failureCases = results.filter((result) => result.failed > 0).length;
  const manual = results.reduce((sum, result) => sum + result.manualPending, 0);
  const modeMatches = results.filter((result) =>
    result.expectedMode === 'either'
    || (result.expectedMode.startsWith('sequence') && result.actualMode === 'sequence')
    || (result.expectedMode === 'single_preferred' && result.actualMode === 'single')).length;
  const lines = [
    '# 영창 Judge 의도 기준선 자동 채점',
    '',
    `> 기준 응답: \`${BASELINE_SOURCE.replaceAll('\\', '/')}\`  `,
    `> 기대값: \`${EXPECTATIONS_SOURCE.replaceAll('\\', '/')}\`  `,
    `> Worker: ${baseline.workerUrl}  `,
    `> 응답 수집: ${baseline.generatedAt}`,
    '',
    '## 요약',
    '',
    `- 자동 점수 평균: **${mean}/100**`,
    `- 자동 항목 만점: **${perfect}/${results.length}**`,
    `- 권장 모드 일치: **${modeMatches}/${results.length}**`,
    `- 자동 실패 항목: **${failures}개**`,
    `- 수동 판정 대기 항목: **${manual}개**`,
    '',
    '자동 점수는 스키마에서 관찰 가능한 anchor·구조·관계만 평가한다. 시각적 만족도, 인과성, 전환의 자연스러움, 장식용 이동 여부는 점수에 포함하지 않고 수동 판정으로 남긴다.',
    '',
    '## 해석',
    '',
    `- **${mean}점은 전체 품질 점수가 아니다.** 원소·형태·필수 구조처럼 스키마에서 관찰 가능한 표면 계약의 보존율이다.`,
    `- 자동 항목만으로도 ${failureCases}종에서 실패가 발생했지만, 현행 출력의 핵심 문제인 비슷한 \`move → form\` 반복과 장면의 재미는 자동 점수에 거의 반영되지 않는다.`,
    '- 따라서 이 수치는 프롬프트가 최소 계약을 훼손하는지 감시하는 하한선으로 사용하고, 최종 채택은 아래 수동 시각 평가를 함께 통과해야 한다.',
    '',
    '## 사례별 결과',
    '',
    '| # | 입력 | 기대/실제 | 자동 점수 | 실패 | 수동 |',
    '|---:|---|---|---:|---:|---:|',
    ...results.map((result) =>
      `| ${result.id} | ${result.input} | \`${result.expectedMode}\` / \`${result.actualMode}\` | ${result.automaticScore} | ${result.failed} | ${result.manualPending} |`),
    '',
    '## 자동 실패 상세',
    '',
  ];
  for (const result of results.filter((item) => item.failed > 0)) {
    lines.push(`### ${result.id}. ${result.input}`, '');
    for (const check of result.checks.filter((item) => item.state === 'fail')) {
      lines.push(`- \`${check.id}\`: ${check.detail}`);
    }
    lines.push('');
  }
  lines.push(
    '## 수동 평가 시 확인할 것',
    '',
    '- 입력에서 기대한 사건과 장면 전개가 실제 출력에서 읽히는가',
    '- 단계마다 역할이 구분되고 앞뒤 사건의 인과가 자연스러운가',
    '- 병렬 행동이 하나의 장면을 만들며 불필요한 `move`가 끼어들지 않는가',
    '- 3초 내외의 실행에서 결과가 과밀하거나 지나치게 단조롭지 않은가',
    '- 정확한 legacy JSON과 다르더라도 더 재미있고 설득력 있는 대안인가',
  );
  return `${lines.join('\n')}\n`;
}

function main(): void {
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as BaselineFile;
  const expectations = JSON.parse(readFileSync(EXPECTATIONS_PATH, 'utf8')) as ExpectationsFile;
  const baselineByInput = new Map(baseline.results.map((result) => [result.input, result]));
  const missing = expectations.cases.filter((item) => !baselineByInput.has(item.input));
  if (missing.length > 0) {
    throw new Error(`Missing baseline results: ${missing.map((item) => item.input).join(', ')}`);
  }
  const results = expectations.cases.map((expected) =>
    scoreCase(expected, baselineByInput.get(expected.input)!, expectations.globalHardRules));
  const output = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    baselinePath: BASELINE_SOURCE,
    expectationsPath: EXPECTATIONS_SOURCE,
    workerUrl: baseline.workerUrl,
    results,
  };
  writeFileSync(JSON_OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  writeFileSync(REPORT_OUTPUT_PATH, markdownReport(baseline, results), 'utf8');
  console.log(`scored ${results.length} cases: ${JSON_OUTPUT_PATH}`);
  console.log(`report: ${REPORT_OUTPUT_PATH}`);
}

main();
