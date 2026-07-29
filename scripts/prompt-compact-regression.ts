import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASELINE_CHARS = 7016;
const MAX_COMPACT_CHARS = Math.floor(BASELINE_CHARS * 0.75);

const workerSource = readFileSync(resolve(process.cwd(), 'proxy/worker.js'), 'utf8');
const promptMatch = workerSource.match(/const JUDGE_PROMPT = `([\s\S]*?)`;/);
assert(promptMatch, 'proxy/worker.js에서 JUDGE_PROMPT를 찾지 못했습니다.');

const prompt = promptMatch[1];
const reduction = 1 - prompt.length / BASELINE_CHARS;

assert(
  prompt.length <= MAX_COMPACT_CHARS,
  `compact prompt가 25% 축소선(${MAX_COMPACT_CHARS}자)을 넘었습니다: ${prompt.length}자`,
);

const requiredContracts = [
  'damage|heal|shield|buff|control|summon',
  'enemy|self|area',
  'fire|water|lightning|ice|earth|wind|light|dark',
  'bolt|beam|slash|wave|nova|rain|wall|cage|orbit|summon|buff|zone|chain',
  'small|medium|large|huge',
  'slow|normal|fast',
  'burn|freeze|shock|slow|knockback|weaken',
  'cast-point|target-direction|away-from-target|random-direction|arena-center|custom-vector',
  '명시된 동작·변화·반복 횟수 > 정적 명사 예외',
  '두 모드는 상호배타적',
  '입력에 없는 heal/shield/buff를 추가하지 않는다',
  'sequence 3·각 behavior 1~2',
  '위0·오른쪽90·아래180·왼쪽-90·위왼쪽-45·위오른쪽45',
  '"spell_plan"',
  '"schema_version":2',
] as const;

for (const contract of requiredContracts) {
  assert(prompt.includes(contract), `compact 과정에서 필수 계약이 사라졌습니다: ${contract}`);
}

for (const behaviorKind of ['orbit(', 'chase(', 'dash(', 'zigzag(', 'hold(', 'retreat(']) {
  assert(prompt.includes(behaviorKind), `summon behavior enum이 사라졌습니다: ${behaviorKind}`);
}

for (const shapeKind of ['arc(', 'line(', 'zigzag(', 'wave(', 'ring(', 'polygon(']) {
  assert(prompt.includes(shapeKind), `wall shape enum이 사라졌습니다: ${shapeKind}`);
}

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

console.log(
  `prompt compact regression passed: ${BASELINE_CHARS} -> ${prompt.length} chars `
  + `(${(reduction * 100).toFixed(1)}% reduction)`,
);
