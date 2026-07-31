import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import {
  MAP_GENERATOR_CONFIG,
  generateRunMap,
  generatedDiagonalRouteTarget,
  generatedDiagonalRouteTargetForAttempt,
  seededRandom,
} from '../src/run/mapGenerator';
import type { GeneratedMap } from '../src/run/mapGenerator';
import { RunMapGraph, maximumMapPathRooms } from '../src/run/mapGraph';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import { WAVE_SETS } from '../src/combat-core/waves/waveManager';
import {
  dominates,
  roomRewardValue,
  roomRisk,
} from '../src/combat-core/run/roomRewardScale';
import type { MapGraphDefinition } from '../src/run/mapGraph';
import type { MapNodeKind } from '../src/run/mapGraphContract';

/**
 * 파티션 맵 생성기 회귀 (#240 배선).
 *
 * 생성기는 **매 런 다른 데이터를 만든다.** 고정 프리셋이라면 눈으로 한 번 보면 되지만
 * 생성기는 어떤 시드에서 어떤 조합이 나올지 알 수 없다 — 그래서 회귀가 시드를 넓게
 * 돌려 불변식을 검사하는 것이 유일한 방어선이다.
 *
 * 특히 #283을 되풀이하지 않는 것이 목표다: 존재하지 않는 `waveSetId`를 참조한
 * 프리셋 한 줄이 방을 벽돌로 만들었다(적도 포탈도 없는 방 = 진행 불가). 생성기가
 * 그 실수를 하면 **모든 런에서** 일어난다.
 */

const SEEDS = 2000;
const MAX_GENERATION_MS = 50;
const generatedResults: GeneratedMap[] = [];
let totalGenerationMs = 0;
let worstGenerationMs = 0;
let worstGenerationSeed = 0;
for (let seed = 1; seed <= SEEDS; seed += 1) {
  const startedAt = performance.now();
  const result = generateRunMap(seed);
  const elapsedMs = performance.now() - startedAt;
  totalGenerationMs += elapsedMs;
  if (elapsedMs > worstGenerationMs) {
    worstGenerationMs = elapsedMs;
    worstGenerationSeed = seed;
  }
  if (result) generatedResults.push(result);
}
const generated: MapGraphDefinition[] = generatedResults.map((result) => result.definition);

// ── 1) 폴백이 상시 경로가 아니다 ────────────────────────────────────────────
//
// 폴백은 안전망이어야 한다. 생성 실패가 잦으면 "생성기를 붙였는데 늘 같은 맵"이
// 되고, `console.warn` 한 줄로만 드러나 아무도 모른다.
// 실측: 상한 40 → 폴백 2.2% · 80 → 0.2% · 160 → 0%. 맵당 0.8ms라 재시도는 싸다.
assert.ok(
  generated.length === SEEDS,
  `시드 ${SEEDS}개 전부 생성돼야 한다 (실패 ${SEEDS - generated.length}개)`,
);
assert.ok(MAP_GENERATOR_CONFIG.maxAttempts >= 160, '재시도 상한이 폴백률 0% 지점 이상');
assert.ok(
  worstGenerationMs < MAX_GENERATION_MS,
  `동기 맵 생성은 ${MAX_GENERATION_MS}ms 안에 끝나야 한다 `
    + `(최악 ${worstGenerationMs.toFixed(2)}ms, seed ${worstGenerationSeed})`,
);

// ── 2) 일반 생성 맵에 규모별 비대칭 대각선 2~4개 ───────────────────────────
assert.equal(generatedDiagonalRouteTarget(0), 0, '후보가 없으면 대각선 없음');
assert.equal(generatedDiagonalRouteTarget(1), 1, '후보보다 많이 요구하지 않음');
assert.equal(generatedDiagonalRouteTarget(2), 2, '작은 방 풀은 2개');
assert.equal(generatedDiagonalRouteTarget(3), 3, '중간 방 풀은 3개');
assert.equal(generatedDiagonalRouteTarget(8), 4, '큰 방 풀도 최대 4개');
assert.equal(
  generatedDiagonalRouteTargetForAttempt(4, 1),
  4,
  '큰 방 풀 순환 첫 시도는 4개',
);
assert.equal(
  generatedDiagonalRouteTargetForAttempt(4, 2),
  2,
  '큰 방 풀 순환 둘째 시도는 성립하기 쉬운 2개',
);
assert.equal(
  generatedDiagonalRouteTargetForAttempt(4, 3),
  2,
  '큰 방 풀 순환 셋째 시도도 성립하기 쉬운 2개',
);
assert.equal(
  generatedDiagonalRouteTargetForAttempt(3, 4),
  2,
  '3개 목표도 순환 넷째 시도는 2개',
);

const observedDiagonalCounts = new Set<number>();
let singleDiagonalFallbacks = 0;
for (const result of generatedResults) {
  const definition = result.definition;
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const byBoundary = new Map<string, number[]>();
  const stages = new Set<number>();

  assert.ok(
    result.diagonalEdges.length >= 1 && result.diagonalEdges.length <= 4,
    `생성 대각선은 1~4개여야 한다 (${result.diagonalEdges.length})`,
  );
  if (result.diagonalEdges.length === 1) singleDiagonalFallbacks += 1;
  observedDiagonalCounts.add(result.diagonalEdges.length);

  for (const edge of result.diagonalEdges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    assert.ok(from && to, `대각선이 실제 노드를 가리켜야 한다: ${edge.from} -> ${edge.to}`);
    assert.equal(from!.stage, to!.stage, '대각선은 수문장을 건너뛰지 않는다');
    assert.equal(to!.layer, from!.layer + 1, '대각선은 인접한 다음 layer만 연결');
    assert.equal(Math.abs(to!.lane - from!.lane), 1, '대각선은 인접 lane만 연결');
    assert.equal(
      definition.edges.filter((candidate) => (
        candidate.from === edge.from && candidate.to === edge.to
      )).length,
      1,
      '대각선은 실제 그래프에 정확히 한 번 들어간다',
    );
    assert.ok(
      definition.edges.filter((candidate) => candidate.from === edge.from).length <= 2,
      '대각선 출발 노드의 선택지는 직선+대각선 최대 2개',
    );

    stages.add(from!.stage);
    const boundary = `${from!.stage}:${from!.layer}`;
    byBoundary.set(boundary, [
      ...(byBoundary.get(boundary) ?? []),
      Math.sign(to!.lane - from!.lane),
    ]);
  }

  if (result.diagonalEdges.length >= 2) {
    assert.deepEqual(
      [...stages].sort(),
      [1, 2],
      '대각선이 2개 이상이면 각 스테이지에 최소 하나씩 있어야 한다',
    );
  }
  for (const directions of byBoundary.values()) {
    assert.equal(
      new Set(directions).size,
      1,
      '같은 layer 경계의 대각선은 한 방향이어야 X자로 교차하지 않는다',
    );
  }
}
assert.deepEqual(
  [...observedDiagonalCounts].sort(),
  [1, 2, 3, 4],
  '방 풀과 균형 조건에 따라 대각선 1·2·3·4개가 모두 생성돼야 한다',
);
assert.ok(
  singleDiagonalFallbacks <= Math.ceil(SEEDS * 0.02),
  `1개 폴백은 희귀해야 한다 (${singleDiagonalFallbacks}/${SEEDS})`,
);

// ── 3) 계약을 통과한다 ──────────────────────────────────────────────────────
//
// `validateDefinition`이 연결성·비순환·고립 노드·인카운터 필드를 전부 본다(설계 §5.0).
// 생성기는 그 검사를 다시 구현하지 않고 만족시킨다 — 그러니 실제로 통과하는지가
// 유일하게 중요한 검사다.
for (const definition of generated) {
  assert.doesNotThrow(() => new RunMapGraph(definition), '생성 맵이 계약을 통과해야 한다');
}

// ── 3) **경로 길이가 프리셋과 같다** ────────────────────────────────────────
//
// ⚠️ 컨트롤러의 `maxRooms`는 readonly라 런 중에 바꿀 수 없고, 씬은
// `maximumMapPathRooms(MAP_GRAPH_PRESET_01)`을 넘긴다. 생성 맵의 길이가 다르면
// `ROOM x/8` 표시와 보스 판정(`roomIndex >= maxRooms`)이 어긋난다 — #272에서
// 미니맵·포탈 라벨이 상수 2칸 어긋난 것과 같은 결합이다.
//
// 한 맵 안에서 경로 길이가 갈리는 것도 안 된다: 짧은 경로로 가면 보스가 일찍
// 발동하거나 방 번호가 틀린다.
const presetRooms = maximumMapPathRooms(MAP_GRAPH_PRESET_01);
for (const definition of generated) {
  const boss = definition.nodes.find((node) => node.kind === 'memory-boss');
  assert.ok(boss, '최종 보스가 있어야 한다');
  const next = new Map<string, string[]>();
  for (const edge of definition.edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }
  const lengths = new Set<number>();
  const walk = (id: string, length: number): void => {
    if (id === boss.id) { lengths.add(length); return; }
    for (const child of next.get(id) ?? []) walk(child, length + 1);
  };
  walk(definition.startNodeId, 1);
  assert.equal(lengths.size, 1, `한 맵의 모든 경로 길이가 같아야 한다 (${[...lengths]})`);
  assert.equal([...lengths][0], presetRooms, `경로 길이가 프리셋과 같아야 한다 (${presetRooms}방)`);
  assert.equal(maximumMapPathRooms(definition), presetRooms, 'maxRooms 일치');
}

// ── 4) **웨이브 세트가 실제로 존재하는 키다** (#283 재발 방지) ───────────────
//
// 프리셋이 존재하지 않는 `room-c`를 참조해 `startRoom`이 `clearCombatRoom()` 뒤에
// throw했고, 적도 포탈도 없는 방이 되어 진행이 막혔다. 생성기가 같은 실수를 하면
// 모든 런에서 일어난다.
const ENCOUNTER_KINDS: readonly MapNodeKind[] = ['start', 'combat', 'elite', 'trap'];
const usedWaveKeys = new Set<string>();
for (const definition of generated) {
  for (const node of definition.nodes) {
    if (ENCOUNTER_KINDS.includes(node.kind)) {
      assert.ok(
        typeof node.waveSetId === 'string' && node.waveSetId.length > 0,
        `${node.kind} 방은 waveSetId가 필요하다: ${node.id}`,
      );
      assert.ok(
        WAVE_SETS[node.waveSetId!] !== undefined,
        `존재하지 않는 웨이브 세트: ${node.waveSetId} (${node.id})`,
      );
      usedWaveKeys.add(node.waveSetId!);
    } else {
      // 계약은 비전투 방의 waveSetId가 **반드시 null**이길 요구한다 (undefined도 실패)
      assert.equal(node.waveSetId, null, `비전투 방은 waveSetId가 null: ${node.id}`);
    }
    // 함정 방은 프로필 필수, 나머지는 금지 — 계약이 양방향으로 검사한다
    if (node.kind === 'trap') {
      assert.ok(node.trapProfile, `함정 방은 프로필이 필요하다: ${node.id}`);
    } else {
      assert.ok(!node.trapProfile, `함정이 아닌 방에 프로필이 붙었다: ${node.id}`);
    }
  }
}
assert.ok(usedWaveKeys.size >= 4, `웨이브 세트가 다양해야 한다 (${[...usedWaveKeys]})`);

// ── 5) 위험/보상 축이 단조다 — 지배 쌍이 없다 ───────────────────────────────
//
// ⚠️ #240 프로토타입의 `roomReward`는 보물·제단에만 1, 전투·정예·함정에 **0**을 줬다.
// 즉 "싸우는 방은 보상이 없다". 그러면 설계 §5.3의 지배 금지 규칙에 걸려
// `전투(위험1·보상0)`이 `보물(위험0·보상1)`에 지배당해 가장 자연스러운 로그라이크
// 분기가 불법이 된다. 프로토타입에 재조정 후처리가 여섯 개 붙은 이유가 이것이다.
//
// 축을 `roomRewardScale`에서 읽으면 위험↑→보상↑ 단조가 되고 지배 쌍이 0건이 된다.
{
  const KINDS: readonly MapNodeKind[] = ['treasure', 'combat', 'trap', 'elite', 'altar'];
  for (const a of KINDS) {
    for (const b of KINDS) {
      if (a === b) continue;
      assert.ok(
        !dominates(
          { risk: roomRisk(a), reward: roomRewardValue(a) },
          { risk: roomRisk(b), reward: roomRewardValue(b) },
        ),
        `${a}가 ${b}에 지배된다 — 그 분기는 생성 불가가 된다`,
      );
    }
  }
  // 위험이 오르면 보상도 올라야 한다 (보물 < 전투 < 함정 < 정예 < 제단)
  const ordered: readonly MapNodeKind[] = ['treasure', 'combat', 'trap', 'elite', 'altar'];
  for (let i = 1; i < ordered.length; i += 1) {
    assert.ok(
      roomRewardValue(ordered[i]) > roomRewardValue(ordered[i - 1]),
      `${ordered[i]} 보상이 ${ordered[i - 1]}보다 커야 한다`,
    );
    assert.ok(
      roomRisk(ordered[i]) >= roomRisk(ordered[i - 1]),
      `${ordered[i]} 위험이 ${ordered[i - 1]} 이상이어야 한다`,
    );
  }
  // 제단 위험도는 2 이상 — 최대 체력을 영구히 깎는다. 1로 두면 제단이 정예를 지배한다
  assert.ok(roomRisk('altar') >= roomRisk('elite'), '제단 위험 >= 정예 (영구 최대체력 대가)');
}

// ── 6) 경로 규칙 (설계 §5.0 마지막 항 · §5.2 · §5.3) ────────────────────────
for (const definition of generated) {
  const boss = definition.nodes.find((node) => node.kind === 'memory-boss')!;
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const next = new Map<string, string[]>();
  for (const edge of definition.edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }
  const paths: MapNodeKind[][] = [];
  const walk = (id: string, trail: MapNodeKind[]): void => {
    const kind = byId.get(id)!.kind;
    const here = [...trail, kind];
    if (id === boss.id) { paths.push(here); return; }
    for (const child of next.get(id) ?? []) walk(child, here);
  };
  walk(definition.startNodeId, []);

  // 선택 가능한 전체 경로의 방 시퀀스가 중복되지 않는다 — 같으면 분기가 가짜다
  const signatures = paths.map((path) => path.join(','));
  assert.equal(new Set(signatures).size, signatures.length, '경로 시퀀스 중복 금지');

  // 스테이지마다 보상 방이 최소 하나 (§5.2)
  for (const stage of [1, 2]) {
    assert.ok(
      definition.nodes.some(
        (node) => node.stage === stage && (node.kind === 'treasure' || node.kind === 'altar'),
      ),
      `스테이지 ${stage}에 보상 방이 있어야 한다`,
    );
  }

  // 경로 간 지배 관계 금지 (§5.3). 보스는 비교에서 제외 (설계 §2)
  const scored = paths.map((path) => {
    const playable = path.filter((kind) => kind !== 'memory-boss' && kind !== 'stage-boss');
    return {
      risk: playable.reduce((sum, kind) => sum + roomRisk(kind), 0),
      reward: playable.reduce((sum, kind) => sum + roomRewardValue(kind), 0),
    };
  });
  for (let i = 0; i < scored.length; i += 1) {
    for (let j = i + 1; j < scored.length; j += 1) {
      assert.ok(!dominates(scored[i], scored[j]), '경로 지배 금지');
      assert.ok(!dominates(scored[j], scored[i]), '경로 지배 금지');
    }
  }
}

// ── 7) **스테이지마다 분기가 있다** ─────────────────────────────────────────
//
// 설계에 없는 규칙이지만 실측이 필요를 보였다: 이 규칙 없이 400시드를 돌리면
// 1스테이지에 분기가 아예 없는 맵이 32.7%였다. 첫 스테이지 내내 선택이 없으면
// 플레이어는 이 게임의 맵에 선택이 있다는 걸 배우지 못한다.
//
// 분기 지점은 **자식이 속한 스테이지**로 센다 — 2스테이지의 첫 분기는 부모가
// `s1-boss`(stage 1)이므로 부모 기준으로 세면 스테이지가 어긋난다.
for (const definition of generated) {
  const byId = new Map(definition.nodes.map((node) => [node.id, node]));
  const branchStages = new Set<number>();
  for (const node of definition.nodes) {
    const children = definition.edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => byId.get(edge.to)!);
    if (children.length >= 2) branchStages.add(children[0].stage);
  }
  for (const stage of [1, 2]) {
    assert.ok(branchStages.has(stage), `스테이지 ${stage}에 분기가 있어야 한다`);
  }
}

// ── 8) 전투/비전투 비율 (설계 §5.5) ────────────────────────────────────────
{
  let combat = 0;
  let nonCombat = 0;
  for (const definition of generated) {
    for (const node of definition.nodes) {
      if (node.kind === 'start' || node.kind === 'stage-boss' || node.kind === 'memory-boss') continue;
      if (node.kind === 'treasure' || node.kind === 'altar') nonCombat += 1;
      else combat += 1;
    }
  }
  const share = nonCombat / (combat + nonCombat);
  assert.ok(
    share >= MAP_GENERATOR_CONFIG.nonCombatShare.min
      && share <= MAP_GENERATOR_CONFIG.nonCombatShare.max,
    `비전투 비율 ${(share * 100).toFixed(1)}%가 목표 범위 안이어야 한다`,
  );
}

// ── 9) 시드 재현성 ─────────────────────────────────────────────────────────
//
// 같은 시드가 같은 맵이어야 버그를 재현할 수 있다. 시연에서 특정 판을 다시
// 띄우는 것도 이게 있어야 가능하다.
{
  const a = generateRunMap(4242);
  const b = generateRunMap(4242);
  const c = generateRunMap(4243);
  assert.ok(a && b && c, '재현성 검사용 시드 생성');
  assert.deepEqual(a!.definition, b!.definition, '같은 시드 같은 맵');
  assert.notDeepEqual(a!.definition, c!.definition, '다른 시드 다른 맵');
  // PRNG 자체도 결정론이어야 한다
  const r1 = seededRandom(7);
  const r2 = seededRandom(7);
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()], 'PRNG 결정론');
}

// ── 10) **시연 로드아웃은 프리셋을 쓴다** ───────────────────────────────────
//
// 심사자가 하는 판은 고정 판이어야 한다. 매번 다른 맵을 뽑으면 시연 중에만 드러나는
// 조합을 만날 수 있고, 심사 자리에서 "다시 뽑아보자"를 할 수는 없다.
//
// 씬은 `resetMapGraph(initialNodeId)`에 프리셋 노드 id를 넘겨 이 경로를 탄다 —
// 생성 맵에는 그 id가 없으므로 넘기는 것 자체가 프리셋 선택이다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(
    /runMapDefinition\(initialNodeId === null\)/.test(scene),
    '시작 노드가 지정되면(시연) 프리셋을 써야 한다',
  );
  assert.ok(
    /resetMapGraph\(MAP_GRAPH_PRESET_01\.lastBeforeBossNodeId, DEMO_START_ROOM\)/.test(scene),
    '시연 로드아웃은 프리셋 노드 id를 넘긴다',
  );
  assert.ok(
    /고정 프리셋으로 폴백/.test(scene),
    '생성 실패는 console.warn으로 드러나야 한다 — 조용히 넘어가면 아무도 모른다',
  );
}

// ── 12) **위험지대가 충분히 자주 나온다** ──────────────────────────────────
//
// 팀원 제보: *"1런에는 원래 독지대 같은 함정이 안 등장하나? 몇 번 플레이해봤는데
// 못 본 거 같은데."* 실측으로 확인된 관측이었다(수정 전 1000런):
//
//   함정방 존재 85.0% · 그 중 독지대 28.0% · **실제로 밟는 비율 14.1%**
//
// 원인은 함정 프로필 5종 균등 추첨이었다 — 바닥 장판을 까는 건 `hazard` 하나뿐인데
// 1/5 확률이라 7런에 한 번꼴이었다. 정화 안내(#293)를 볼 기회도 그만큼 없었다.
{
  let withHazard = 0;
  const profiles = new Map<string, number>();
  for (const definition of generated) {
    const traps = definition.nodes.filter((node) => node.kind === 'trap');
    for (const trap of traps) {
      const kind = trap.trapProfile!.kind;
      profiles.set(kind, (profiles.get(kind) ?? 0) + 1);
    }
    if (traps.some((trap) => trap.trapProfile?.kind === 'hazard')) withHazard += 1;
  }
  const share = withHazard / generated.length;
  assert.ok(
    share >= 0.4,
    `독지대가 있는 맵이 ${(share * 100).toFixed(1)}%로 너무 적다 — 못 보고 지나가는 기믹이 된다`,
  );

  // ⚠️ 나머지 넷을 0으로 만들지 않는다 — 함정방이 늘 같은 기믹이면 그것대로 단조롭고,
  // 넷 다 이미 구현돼 있어 안 쓰는 게 낭비다.
  for (const kind of ['blackout', 'silence', 'heatwave', 'word-limit'] as const) {
    assert.ok(
      (profiles.get(kind) ?? 0) > 0,
      `${kind} 프로필이 한 번도 안 나온다 — 구현해 두고 안 쓰는 셈이다`,
    );
  }
  // hazard가 대표이되 독점은 아니다
  const hazardShare = (profiles.get('hazard') ?? 0)
    / [...profiles.values()].reduce((sum, n) => sum + n, 0);
  assert.ok(
    hazardShare > 0.3 && hazardShare < 0.7,
    `hazard 비중 ${(hazardShare * 100).toFixed(0)}%가 범위를 벗어났다 (대표이되 독점은 아니어야 한다)`,
  );
}

// ── 13) 프리셋 1스테이지에도 함정이 있다 ───────────────────────────────────
//
// 생성 맵을 고쳐도 **프리셋에는 1스테이지 함정이 0개**였다(유일한 함정이 `s2-trap`).
// 시연 로드아웃이 쓰는 판이라 여기가 비면 그 경로에서는 영영 안 나온다.
{
  const s1Traps = MAP_GRAPH_PRESET_01.nodes.filter(
    (node) => node.stage === 1 && node.kind === 'trap',
  );
  assert.ok(s1Traps.length > 0, '프리셋 1스테이지에 함정방이 있어야 한다');
  assert.ok(
    s1Traps.some((node) => node.trapProfile?.kind === 'hazard'),
    '1스테이지 함정 중 하나는 위험지대여야 한다 — 다른 프로필은 바닥 장판을 깔지 않는다',
  );
  // ⚠️ 노드를 **추가**하면 경로가 9방이 되어 maxRooms(8)와 어긋난다. 위 3군이
  // 생성 맵과 프리셋의 일치를 검사하므로 여기가 깨지면 그쪽도 같이 깨진다.
  assert.equal(
    maximumMapPathRooms(MAP_GRAPH_PRESET_01), presetRooms,
    '함정을 넣느라 경로 길이를 늘리면 안 된다 — 교체여야 한다',
  );
}

console.log(
  `map generator regression: 시드 ${generated.length}개 · `
  + `평균 ${(totalGenerationMs / SEEDS).toFixed(2)}ms · `
  + `최악 ${worstGenerationMs.toFixed(2)}ms(seed ${worstGenerationSeed}) · `
  + `대각선1개 ${singleDiagonalFallbacks}/${SEEDS} · `
  + '폴백률·계약·경로길이·웨이브키·축단조·경로규칙·분기보장·전투비율·재현성·시연프리셋'
  + '·독지대빈도·프리셋1스테이지함정 12군 통과',
);
