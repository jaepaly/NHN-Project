import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveSpellPlan } from '../src/spell/sequencePlan';
import { validateJudgement } from '../src/spell/validate';

const BASELINE_PROMPT_LF_SHA256 = '1279f406bcad6c495f2ed5db2bd9fe721c56613674665f3e415a8f68602cc85b';
const SPARSE_INSTRUCTION = '   - 출력 압축은 spell_plan에만 적용한다: form spec의 element_secondary=null·size=medium·speed=normal·status=[]·power/cost는 생략하고, durationWeight/powerWeight가 1이거나 tuning 강조가 없을 때도 생략한다. 다른 필수 필드와 단일 spell은 모두 그대로 낸다.';
const FULL_EXAMPLE = '      { "durationWeight": 1, "behaviors": [ { "type": "form", "powerWeight": 1, "tuning": { "damage": 2, "radius": 2 }, "spec": { "name": "돌진 폭발", "effect": "damage", "target": "self", "element_primary": "fire", "element_secondary": null, "form": "nova", "size": "large", "speed": "normal", "status": ["burn"], "power": 0, "cost": 0 } } ] }';
const SPARSE_EXAMPLE = '      { "behaviors": [ { "type": "form", "tuning": { "damage": 2, "radius": 2 }, "spec": { "name": "돌진 폭발", "effect": "damage", "target": "self", "element_primary": "fire", "form": "nova", "size": "large", "status": ["burn"] } } ] }';

const workerSource = readFileSync(resolve(process.cwd(), 'proxy/worker.js'), 'utf8');
const promptMatch = workerSource.match(/const JUDGE_PROMPT = `([\s\S]*?)`;/);
assert(promptMatch, 'proxy/worker.js에서 JUDGE_PROMPT를 찾지 못했습니다.');
const prompt = promptMatch[1];

assert(prompt.includes(SPARSE_INSTRUCTION), 'sparse output 지시가 없습니다.');
assert(prompt.includes(SPARSE_EXAMPLE), 'sparse plan 예시가 없습니다.');

const reconstructedBaseline = prompt
  .replace(`\n${SPARSE_INSTRUCTION}`, '')
  .replace(SPARSE_EXAMPLE, FULL_EXAMPLE);
const reconstructedHash = createHash('sha256')
  .update(reconstructedBaseline.replace(/\r\n/g, '\n'))
  .digest('hex');
assert.equal(
  reconstructedHash,
  BASELINE_PROMPT_LF_SHA256,
  'sparse 지시·예시 외의 원본 v2.15 프롬프트가 변경됐습니다.',
);

const heldOutInputs = [
  '잿빛 달이 부서진 뒤 파편들이 적을 추격한다',
  '번개 고리를 펼치며 오른쪽으로 도약해 낙뢰를 꽂는다',
  '세 차례 울리는 빙결 종소리',
  '붉은 혜성의 귀환',
  '파도 위를 달리는 검무',
  '어둠이 갈라지고 그 틈에서 별빛이 쏟아진다',
  '모래 폭풍 속을 후퇴하며 불꽃 화살을 난사한다',
  '새벽을 깨우는 천둥의 행진',
  '한 개의 검은 태양',
  '고요한 수정 구체',
  '거대한 화염구',
  '굳어버린 시간의 방패',
] as const;
for (const input of heldOutInputs) {
  assert(!prompt.includes(input), `held-out 입력이 프롬프트에 유출됐습니다: ${input}`);
}

const fullPlan = {
  schema_version: 2,
  disposition: 'cast',
  spell_plan: {
    name: '돌진 폭발',
    power: 75,
    durationMs: 1500,
    sequences: [
      {
        durationWeight: 2,
        behaviors: [{ type: 'move', destination: 'target-direction', element: 'fire' }],
      },
      {
        durationWeight: 1,
        behaviors: [{
          type: 'form',
          powerWeight: 1,
          spec: {
            name: '돌진 폭발',
            effect: 'damage',
            target: 'self',
            element_primary: 'fire',
            element_secondary: null,
            form: 'nova',
            size: 'medium',
            speed: 'normal',
            status: [],
            power: 0,
            cost: 0,
          },
        }],
      },
    ],
  },
};

const sparsePlan = {
  schema_version: 2,
  disposition: 'cast',
  spell_plan: {
    name: '돌진 폭발',
    power: 75,
    durationMs: 1500,
    sequences: [
      {
        durationWeight: 2,
        behaviors: [{ type: 'move', destination: 'target-direction', element: 'fire' }],
      },
      {
        behaviors: [{
          type: 'form',
          spec: {
            name: '돌진 폭발',
            effect: 'damage',
            target: 'self',
            element_primary: 'fire',
            form: 'nova',
          },
        }],
      },
    ],
  },
};

const validatedFull = validateJudgement(fullPlan);
const validatedSparse = validateJudgement(sparsePlan);
assert(validatedFull?.disposition === 'cast' && validatedFull.plan, 'full plan 검증 실패');
assert(validatedSparse?.disposition === 'cast' && validatedSparse.plan, 'sparse plan 검증 실패');
assert.deepEqual(
  resolveSpellPlan(validatedSparse.plan),
  resolveSpellPlan(validatedFull.plan),
  '기본값 생략 전후 실행 plan이 달라졌습니다.',
);

const fullBytes = Buffer.byteLength(JSON.stringify(fullPlan));
const sparseBytes = Buffer.byteLength(JSON.stringify(sparsePlan));
const byteReduction = 1 - sparseBytes / fullBytes;
assert(byteReduction >= 0.15, `로컬 sample 응답 절감률이 15% 미만입니다: ${(byteReduction * 100).toFixed(1)}%`);

console.log(
  `sparse output regression passed: baseline prompt reconstructed ${BASELINE_PROMPT_LF_SHA256.slice(0, 8)}…; `
  + `sample ${fullBytes}B -> ${sparseBytes}B (${(byteReduction * 100).toFixed(1)}% reduction)`,
);
