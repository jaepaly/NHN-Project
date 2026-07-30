import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateJudgement } from '../src/spell/validate';
import { resolveSpellPlan } from '../src/spell/sequencePlan';

interface FewShotCase {
  id: string;
  input: string;
  boundary: string;
  expected: {
    disposition: string;
    spell?: unknown;
    spell_plan?: unknown;
  };
}

const fixture = JSON.parse(
  readFileSync('docs/SEQUENCE_JUDGE_FEWSHOT_CASES.json', 'utf8'),
) as { schemaVersion: number; cases: FewShotCase[] };

assert.equal(fixture.schemaVersion, 1);
assert.equal(fixture.cases.length, 9);
assert.equal(new Set(fixture.cases.map((item) => item.id)).size, 9);
assert.equal(new Set(fixture.cases.map((item) => item.input)).size, 9);

let singles = 0;
let plans = 0;
for (const item of fixture.cases) {
  assert.ok(item.boundary.trim(), `${item.id}: boundary`);
  const judged = validateJudgement(item.expected);
  assert.ok(judged, `${item.id}: validateJudgement`);
  assert.equal(judged.disposition, 'cast', `${item.id}: cast`);
  if (judged.disposition !== 'cast') continue;

  if (item.expected.spell_plan) {
    plans += 1;
    assert.ok(judged.plan, `${item.id}: plan preserved`);
    const resolved = resolveSpellPlan(judged.plan!);
    assert.ok(resolved.sequences.length > 0, `${item.id}: resolved sequences`);
    assert.ok(
      resolved.sequences.every((sequence) => sequence.behaviors.length > 0),
      `${item.id}: resolved behaviors`,
    );
  } else {
    singles += 1;
    assert.equal(judged.plan, undefined, `${item.id}: remains single`);
  }
}

assert.equal(singles, 3);
assert.equal(plans, 6);
console.log(`Sequence few-shot regression: ${fixture.cases.length}종 계약 통과 (single ${singles}, plan ${plans})`);
