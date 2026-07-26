import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AFFINITY_ROWS, rankAffinities } from '../src/combat-core/run/useAffinity';
import { CombatRunController } from '../src/combat-core/run/runController';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';

// ── 제보된 시나리오 그대로: 화염1 → 얼음1 → 얼음1 ────────────────────
// 총괄 제보: "첫 주문을 화염으로 하면 다음 주문을 다른 속성으로 해도 친화가 안 뜬다."
// 성장 자체(accrual·상한·원소독립)는 use-affinity-regression이 이미 지킨다. 여기서
// 지키는 건 **그 성장이 화면에 도달하는지** — 성장과 표시를 잇는 지점이다.
{
  const c = new CombatRunController({ playerState: new PlayerCombatState() });
  const shown = () => rankAffinities(c.state.elementalAffinity).map((r) => r.element);

  c.growAffinityFromUse('fire');
  assert.deepEqual(shown(), ['fire'], '첫 원소가 뜬다');

  c.growAffinityFromUse('ice');
  assert.deepEqual(shown(), ['fire', 'ice'],
    '두 번째 원소가 **주력을 넘기 전에도** 화면에 나타나야 한다 — 이게 제보된 결함');

  c.growAffinityFromUse('ice');
  assert.deepEqual(shown(), ['ice', 'fire'], '더 많이 쓴 쪽이 주력 자리로 올라온다');
}

// ── 순위: 큰 값부터, 0은 빼고, 상위 N개만 ──────────────────────────
{
  const rows = rankAffinities({ fire: 0.3, ice: 0.5, wind: 0, dark: 0.1, light: 0.4 });
  assert.equal(rows.length, AFFINITY_ROWS, '상위 N개만 세운다');
  assert.deepEqual(rows.map((r) => r.element), ['ice', 'light', 'fire'], '내림차순');
  assert.ok(!rows.some((r) => r.element === 'wind'), '0인 원소는 줄을 차지하지 않는다');
}

// ── 주력 하나만 있어도, 아무것도 없어도 안전 ────────────────────────
{
  assert.equal(rankAffinities({}).length, 0, '빈 친화 = 빈 목록');
  assert.equal(rankAffinities({ fire: 0 }).length, 0, '0만 있으면 빈 목록');
  const one = rankAffinities({ fire: 0.2 });
  assert.equal(one.length, 1, '하나면 한 줄');
  assert.equal(one[0].element, 'fire');
}

// ── 비정상 값 방어 (NaN/undefined가 섞여도 순위가 깨지지 않는다) ──────
{
  const rows = rankAffinities({ fire: Number.NaN, ice: 0.2, dark: undefined });
  assert.deepEqual(rows.map((r) => r.element), ['ice'], 'NaN·undefined는 제외');
}

// ── 동점 순서가 프레임마다 흔들리지 않는다 (깜빡임 방지) ─────────────
// 매 프레임 다시 정렬하므로 동점에서 순서가 뒤집히면 HUD가 떨린다.
{
  const a = rankAffinities({ fire: 0.2, ice: 0.2, dark: 0.2 });
  const b = rankAffinities({ dark: 0.2, ice: 0.2, fire: 0.2 });
  assert.deepEqual(
    a.map((r) => r.element),
    b.map((r) => r.element),
    '삽입 순서가 달라도 동점 순위는 같아야 한다',
  );
}

// ── HUD 배선: 씬이 최고치 하나만 그리던 옛 경로로 되돌아가지 않게 ─────
{
  const src = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(!src.includes('topAffinity('),
    'topAffinity(최고치 1개) 경로가 남아 있다 — 다시 한 줄만 보이게 된다');
  assert.ok(src.includes('rankAffinities<SpellElement>'),
    'drawAffinityBar가 rankAffinities를 쓰지 않는다');
  const at = src.indexOf('private drawAffinityBar');
  const body = src.slice(at, at + 2000);
  assert.ok(/for \(let i = 0; i < this\.affinityLabelTexts\.length/.test(body),
    '친화 바가 여러 행을 순회하지 않는다');
}

console.log(
  'Affinity rank regression: 제보시나리오·내림차순·0제외·NaN방어·동점안정·HUD배선 6군 통과',
);
