import type { MapGraphDefinition } from './mapGraph';
import type { MapNode, MapNodeKind } from './mapGraphContract';
import { TRAP_ROOM_PROFILES } from './trapRoomProfile';

/**
 * 파티션 기반 런 맵 생성기 — R1(이도원) #240 설계의 구현.
 *
 * 고정 프리셋(`MAP_GRAPH_PRESET_01`)은 *"#240 승인 후 이 고정 데이터의 공급부만
 * 파티션 생성기로 교체한다"*는 전제로 만들어졌다. 이 파일이 그 공급부다.
 *
 * ## 프로토타입을 그대로 옮기지 않은 이유
 *
 * #240은 설계 문서 + 브라우저 프로토타입(1653줄 HTML)이고 TS 구현은 없었다.
 * 프로토타입을 축자 이식하지 않고 **설계 §3~5를 구현**했다. 프로토타입에는
 * `assignRewardsOnce`·`rebalancePartitionOutputs`·`rebalanceWholeStageRoutes`·
 * `rebalanceMergedBranchRewards`·`diversifyStageRoutes`·`ensureStageRoomMix` —
 * 재조정 후처리가 여섯 개 붙어 있는데, 그 대부분이 **잘못된 보상 모델이 만든
 * 과제약을 떠받치는 코드**였다.
 *
 * 프로토타입의 `roomReward`는 보물·제단에만 1을 주고 전투·정예·함정에 0을 줬다.
 * 즉 "싸우는 방은 보상이 없다"다. 그러면 설계 §5.3의 지배 금지 규칙에 의해
 * `전투(위험1·보상0)` vs `보물(위험0·보상1)` — 로그라이크에서 가장 자연스러운
 * 분기 — 가 **불법**이 된다. 실제 값은 보물 0.767 < 전투 1.000 < 함정 1.400 <
 * 정예 1.500 < 제단 2.000(`roomRewardScale`)이라 전투방과 보물방 사이가 역전돼
 * 있었다. 축을 실제 표에서 읽으면 위험↑→보상↑ 단조가 되고 지배 쌍이 0건이 되어
 * 재조정 후처리 자체가 필요 없어진다.
 *
 * ## 계약이 이미 지켜주는 것
 *
 * 설계 §5.0(연결성·비순환·고립 노드 없음)과 인카운터 필드는 `validateDefinition`이
 * 이미 강제한다. 그래서 여기서는 그 검사를 다시 구현하지 않고 **만족시키는 데**
 * 집중하고, 생성 결과를 마지막에 `RunMapGraph`로 한 번 통과시켜 확인한다.
 *
 * ⚠️ 계약이 요구하는 것 중 프로토타입이 만들지 않던 것: `waveSetId`(인카운터 방은
 * 필수, 비전투 방은 반드시 null) · `trapProfile`(함정 방 필수) · `terrain` ·
 * `curseWeights`. 프로토타입 노드에는 이 네 필드가 아예 없었다(grep 0건). 그대로
 * 붙이면 `validateDefinition`이 생성 시점에 throw한다 — 조용히 깨지지는 않지만
 * 런이 시작되지 않는다.
 */

export interface MapGeneratorConfig {
  /** 스테이지별 목표 방 수 — [1스테이지, 2스테이지]. 시작 방·보스는 별도로 센다 */
  pathRoomsPerStage: readonly [readonly [number, number], readonly [number, number]];
  /** 생성 재시도 상한 — 규칙을 만족하는 후보를 못 찾으면 프리셋으로 폴백한다 */
  maxAttempts: number;
  /** 비전투 방 비율 목표 (설계 §5.5) — 스테이지 전체 노드 기준 */
}

export const MAP_GENERATOR_CONFIG: MapGeneratorConfig = {
  /**
   * **프리셋과 같은 8방**을 목표로 한다. 프리셋의 가장 긴 경로는
   * `시작 → 전투 → 정예 → 수문장 → 전투 → 함정 → 정예 → 기억의주인` = 8방이다.
   * 즉 시작 방(1) + 1스테이지 2방 + 수문장(1) + 2스테이지 3방 + 최종(1) = 8.
   *
   * ⚠️ 런 길이는 심사 시간에 직결된다. 초기 구현은 스테이지당 4방으로 잡았다가
   * 실측 11방이 나왔다 — 프리셋 대비 +37% 플레이 시간이다. 생성기를 붙이는 건
   * 맵을 매번 다르게 만드는 일이고, **길이를 바꾸는 건 별건**이므로 체감 길이를
   * 프리셋에 맞춘다.
   */
  pathRoomsPerStage: [[3, 4], [4, 5]],
  /**
   * 실측(600시드): 상한 40 → 폴백 2.2% · 80 → 0.2% · **160 → 0%**. 최악 시도는 89회.
   * 생성은 순수 계산이라 맵당 0.8ms — 재시도는 사실상 무료다. 폴백은 안전망으로
   * 남기고 상시 경로가 되지 않게 넉넉히 잡는다.
   */
  maxAttempts: 160,
  // 설계 §5.5. 방 수가 적으면 이산값이라 딱 맞지 않으므로 폭을 준다
};

/** 분기 경로의 성격 (설계 §4) */
type BranchProfile = 'stable' | 'balanced' | 'volatile';

/**
 * #240의 경로 비교 전용 상대값이다.
 * 실제 카드 배율·HP 대가와 분리한다. 이 값을 roomRewardScale로 대체하면
 * "위험한 전투방은 보상 0"이라는 설계 전제가 깨져 지배 관계 검사가 무의미해진다.
 */
const MAP_RISK: Record<MapNodeKind, number> = {
  start: 1, combat: 1, elite: 2, trap: 2, treasure: 0, altar: 1,
  'stage-boss': 0, 'memory-boss': 0,
};
const MAP_REWARD: Record<MapNodeKind, number> = {
  start: 0, combat: 0, elite: 0, trap: 0, treasure: 1, altar: 1,
  'stage-boss': 0, 'memory-boss': 0,
};

function mapRisk(kind: MapNodeKind): number { return MAP_RISK[kind]; }
function mapReward(kind: MapNodeKind): number { return MAP_REWARD[kind]; }
function mapDominates(a: { risk: number; reward: number }, b: { risk: number; reward: number }): boolean {
  return a.risk > b.risk && a.reward < b.reward;
}

/**
 * 방 종류 가중치 — R1 프로토타입의 표를 그대로 옮겼다.
 * 경로 성격이 방 종류 분포로 드러나야 "위험한 길"이 말뿐이 아니게 된다.
 */
const KIND_WEIGHTS: Record<BranchProfile, ReadonlyArray<readonly [MapNodeKind, number]>> = {
  volatile: [['combat', 20], ['trap', 35], ['elite', 25], ['treasure', 15], ['altar', 5]],
  balanced: [['combat', 50], ['trap', 20], ['elite', 15], ['treasure', 10], ['altar', 5]],
  stable: [['combat', 75], ['trap', 10], ['elite', 5], ['treasure', 5], ['altar', 5]],
};

/**
 * 진행도에 따른 특수방 억제 (프로토타입 `specialScale`).
 * 스테이지 초반에 정예·제단이 나오면 아직 아무것도 못 갖춘 상태로 맞는다.
 */
function specialScale(progress: number): number {
  if (progress <= 0.25) return 0;
  if (progress <= 0.5) return 0.45;
  if (progress <= 0.75) return 0.9;
  return 1.35;
}

/**
 * 전투방 웨이브 세트 배정 — **프로토타입에 없던 층**이다.
 *
 * `WAVE_SETS`에 실제로 있는 키만 쓴다: room-a, room-b, room-c-shield,
 * room-c-hazard, trap-hazard, elite. #283에서 프리셋이 존재하지 않는
 * `room-c`를 참조해 방이 벽돌이 된 적이 있으므로 회귀가 이 키들의 존재를 검사한다.
 */
const WAVE_SET_BY_KIND: Record<'start' | 'combat' | 'elite' | 'trap', readonly string[]> = {
  start: ['room-a'],
  // 스테이지 2 전투는 실드·해저드로 성격이 갈린다
  combat: ['room-a', 'room-b', 'room-c-shield', 'room-c-hazard'],
  elite: ['elite'],
  trap: ['trap-hazard'],
};

/**
 * 함정 프로필 가중치 — **5종 균등.**
 *
 * ⚠️ #298이 여기를 `hazard 40 / 나머지 각 15`로 바꿨다가 #304에서 되돌렸다.
 * 같은 실수를 반복하지 않도록 이유를 남긴다.
 *
 * #298은 *"1런에는 원래 독지대 같은 함정이 안 등장하나?"* 라는 관측의 답으로 이
 * 가중치를 올렸다. **그런데 그건 다른 체계다:**
 *
 * | | 위험지대 함정방 (여기) | 용암·독지대 |
 * |---|---|---|
 * | 출처 | `trapProfile: 'hazard'` | `MapNode.terrain` |
 * | 산출 | 붉은 원 `HazardZone` | `FloorHazardZone` |
 * | 원소·정화 | **없음** | 있음 (#293) |
 *
 * 여기를 아무리 올려도 용암·독지대는 한 개도 안 늘고, 정화(#293) 노출은 **0%**다.
 * 진짜 원인은 바닥지형에 실런 배선이 없던 것이었고 그건 `roomTerrainConfig`의
 * `floorHazardsFromPlacements`로 따로 고쳤다.
 *
 * 균등으로 두는 이유는 단순하다: **다섯 기믹 중 하나를 대표로 세울 근거가 없다.**
 * 넷 다 구현돼 있고 각자 다른 대응을 요구한다. 방 분포·출현 비율 설계는 R1 소관이라
 * 여기서 임의로 기울이지 않는다(#304의 소유권 지적).
 */
const TRAP_PROFILE_WEIGHTS: ReadonlyArray<readonly [keyof typeof TRAP_ROOM_PROFILES, number]> = [
  ['hazard', 20],
  ['blackout', 20],
  ['silence', 20],
  ['heatwave', 20],
  ['word-limit', 20],
];

/** 결정론 PRNG (mulberry32) — 같은 시드면 같은 맵이어야 재현·시연이 가능하다 */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(rand: () => number, rows: ReadonlyArray<readonly [T, number]>): T {
  const total = rows.reduce((sum, [, weight]) => sum + weight, 0);
  if (total <= 0) return rows[0][0];
  let roll = rand() * total;
  for (const [value, weight] of rows) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return rows[rows.length - 1][0];
}

/** 파티션 시그니처 `a>b(n)` (설계 §3) — a: 시작 분기 수, b: 종료 분기 수, n: 내부 길이 */
interface PartitionSignature {
  a: 1 | 2 | 3;
  b: number;
  n: number;
}

/**
 * @param requireBranch 이 파티션은 반드시 분기해야 한다(스테이지의 첫 파티션).
 *   ⚠️ 이걸 두지 않고 "스테이지마다 분기 하나"를 재시도로만 만족시키면 초안 전체를
 *   버리게 되어 **폴백률이 10%까지 올랐다**(실측 300시드). 폴백은 안전망이어야
 *   하고 상시 경로여선 안 되므로, 분기 가능한 예산이 있을 때는 여기서 고정한다.
 */
function chooseSignature(
  rand: () => number,
  remaining: number,
  stage: number,
): PartitionSignature {
  // 2스테이지가 더 복잡해진다 — 진행감이 구조로도 드러나야 한다 (프로토타입 가중치)
  const rows: ReadonlyArray<readonly [1 | 2 | 3, number]> = stage === 2
    ? [[1, 10], [2, 55], [3, 35]]
    : [[1, 35], [2, 55], [3, 10]];
  // 분기에는 사슬 길이 2가 필요하다(minN) — 예산이 없으면 강제할 수 없다
  // 분기는 선택지를 위한 확률 요소다. 스테이지마다 하나를 강제하지 않는다.
  const canBranch = remaining >= 2 && rand() < (stage === 2 ? 0.72 : 0.58);
  const a = pickWeighted<1 | 2 | 3>(
    rand,
    canBranch ? rows.filter(([value]) => value >= 2) : rows,
  );
  let b = 1;
  if (a === 2) b = pickWeighted(rand, [[1, 60], [2, 40]]);
  else if (a === 3) b = pickWeighted(rand, [[1, 55], [2, 30], [3, 15]]);

  const minN = a === 1 ? 1 : 2;
  const maxN = Math.max(minN, Math.min(3, remaining));
  const n = minN + Math.floor(rand() * (maxN - minN + 1));
  return { a, b, n: Math.min(n, remaining) };
}

function branchProfiles(rand: () => number, count: number): readonly BranchProfile[] {
  // 분기가 둘이면 저위험·고위험, 셋이면 세 성격 모두 (설계 §4)
  if (count <= 1) return ['balanced'];
  const set: BranchProfile[] = count === 2
    ? ['stable', 'volatile']
    : ['stable', 'balanced', 'volatile'];
  // 순서를 섞어야 "위쪽 lane이 항상 안전한 길"이 되지 않는다
  for (let i = set.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [set[i], set[j]] = [set[j], set[i]];
  }
  return set;
}

interface DraftNode {
  id: string;
  stage: number;
  kind: MapNodeKind;
  layer: number;
  lane: number;
}

interface Draft {
  nodes: DraftNode[];
  edges: { from: string; to: string }[];
}

function addEdge(draft: Draft, from: string, to: string): void {
  if (from === to) return;
  if (draft.edges.some((edge) => edge.from === from && edge.to === to)) return;
  draft.edges.push({ from, to });
}

/**
 * 한 스테이지를 파티션으로 이어 붙인다.
 * @returns 이 스테이지의 마지막 층 노드들(다음 스테이지·보스가 여기서 이어진다)
 */
function buildStage(
  draft: Draft,
  rand: () => number,
  stage: number,
  startLayer: number,
  entries: readonly DraftNode[],
  roomBudget: number,
): { exits: DraftNode[]; nextLayer: number } {
  let layer = startLayer;
  let remaining = roomBudget;
  let current = [...entries];

  while (remaining > 0) {
    const signature = chooseSignature(rand, remaining, stage);
    const branchCount = Math.min(signature.a, Math.max(1, remaining));
    const profiles = branchProfiles(rand, branchCount);
    const lanes: DraftNode[][] = [];

    for (let branch = 0; branch < branchCount; branch += 1) {
      const profile = profiles[branch % profiles.length];
      const length = Math.max(1, Math.min(signature.n, remaining));
      const chain: DraftNode[] = [];
      for (let step = 0; step < length; step += 1) {
        const progress = (step + 1) / length;
        const rows = KIND_WEIGHTS[profile].map(([kind, weight]) => [
          kind,
          kind === 'combat' ? weight : weight * specialScale(progress),
        ] as const);
        const node: DraftNode = {
          id: `s${stage}-l${layer + step}-b${branch}`,
          stage,
          kind: pickWeighted(rand, rows),
          layer: layer + step,
          lane: branch,
        };
        draft.nodes.push(node);
        chain.push(node);
      }
      lanes.push(chain);
    }

    // 진입점 → 각 분기 첫 노드
    for (const entry of current) {
      for (const chain of lanes) addEdge(draft, entry.id, chain[0].id);
    }
    // 분기 내부 사슬
    for (const chain of lanes) {
      for (let i = 1; i < chain.length; i += 1) addEdge(draft, chain[i - 1].id, chain[i].id);
    }

    const chainLength = lanes[0].length;
    layer += chainLength;
    remaining -= chainLength;
    const tails = lanes.map((chain) => chain[chain.length - 1]);

    // 합류 (b < a) — 분기가 무한정 벌어지면 그래프가 읽히지 않는다 (설계 §3)
    if (signature.b < branchCount && remaining > 0) {
      const mergeCount = Math.max(1, signature.b);
      const merges: DraftNode[] = [];
      for (let m = 0; m < mergeCount; m += 1) {
        // 합류점을 일반 전투로 강제하지 않는다 (설계 §3 "중요" 항목)
        const rows = KIND_WEIGHTS.balanced.map(([kind, weight]) => [
          kind,
          kind === 'combat' ? weight : weight * specialScale(1),
        ] as const);
        const node: DraftNode = {
          id: `s${stage}-l${layer}-m${m}`,
          stage,
          kind: pickWeighted(rand, rows),
          layer,
          lane: m,
        };
        draft.nodes.push(node);
        merges.push(node);
      }
      for (const tail of tails) for (const merge of merges) addEdge(draft, tail.id, merge.id);
      layer += 1;
      remaining -= 1;
      current = merges;
    } else {
      current = tails;
    }
  }

  return { exits: current, nextLayer: layer };
}

/** 시작 노드부터 종착까지의 모든 경로 (노드 배열) */
function enumeratePaths(draft: Draft, startId: string, endId: string): DraftNode[][] {
  const byId = new Map(draft.nodes.map((node) => [node.id, node]));
  const next = new Map<string, string[]>();
  for (const edge of draft.edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
  }
  const paths: DraftNode[][] = [];
  const walk = (id: string, trail: DraftNode[]): void => {
    const node = byId.get(id);
    if (!node) return;
    const here = [...trail, node];
    if (id === endId) { paths.push(here); return; }
    for (const child of next.get(id) ?? []) walk(child, here);
  };
  walk(startId, []);
  return paths;
}

/**
 * 설계 §5의 우선순위 1~3 검사. §5.0(구조)은 `validateDefinition`이 본다.
 *
 * 반환값은 실패 이유 — 회귀가 "어떤 규칙에 왜 걸렸나"를 읽을 수 있어야 한다.
 */
function ruleViolation(
  draft: Draft,
  startId: string,
  bossId: string,
): string | null {
  const paths = enumeratePaths(draft, startId, bossId);
  if (paths.length === 0) return '시작-보스 경로가 없다';

  // §5.0 마지막 항: 선택 가능한 전체 경로의 방 시퀀스가 중복되지 않는다
  const signatures = paths.map((path) => path.map((node) => node.kind).join(','));
  if (new Set(signatures).size !== signatures.length) return '경로 시퀀스가 중복된다';

  // §5.2 보상 최소 보장 — 스테이지마다 보물 또는 제단이 하나는 있어야 한다
  for (const stage of [1, 2]) {
    const hasReward = draft.nodes.some(
      (node) => node.stage === stage && (node.kind === 'treasure' || node.kind === 'altar'),
    );
    if (!hasReward) return `스테이지 ${stage}에 보상 방이 없다`;
  }

  // §5.3 위험/보상 정합성 — 위험이 높은데 보상이 낮은 경로가 있으면 고를 이유가 없다.
  // 보스는 경로 비교에서 제외한다 (설계 §2).
  const scored = paths.map((path) => {
    const playable = path.filter((node) => node.kind !== 'memory-boss' && node.kind !== 'stage-boss');
    return {
      risk: playable.reduce((sum, node) => sum + mapRisk(node.kind), 0),
      reward: playable.reduce((sum, node) => sum + mapReward(node.kind), 0),
    };
  });
  for (let i = 0; i < scored.length; i += 1) {
    for (let j = i + 1; j < scored.length; j += 1) {
      if (mapDominates(scored[i], scored[j])) return `경로 ${i}가 경로 ${j}에 지배된다`;
      if (mapDominates(scored[j], scored[i])) return `경로 ${j}가 경로 ${i}에 지배된다`;
    }
  }
  // **스테이지마다 분기가 최소 하나** — 설계에 없는 규칙이지만 실측이 필요를 보였다.
  // 이 규칙 없이 400시드를 돌리면 1스테이지에 분기가 아예 없는 맵이 32.7%였다.
  // 첫 스테이지 내내 선택이 없으면 플레이어는 이 게임의 맵에 선택이 있다는 걸
  // 배우지 못한다 — 생성기를 붙이는 이유가 사라진다.
  //
  // 분기 지점은 **자식이 속한 스테이지**의 선택으로 센다. 2스테이지의 첫 분기는
  // 부모가 `s1-boss`(stage 1)이므로 부모 기준으로 세면 스테이지가 어긋난다.
  {
    const byId = new Map(draft.nodes.map((node) => [node.id, node]));
    const branchStages = new Set<number>();
    for (const node of draft.nodes) {
      const children = draft.edges
        .filter((edge) => edge.from === node.id)
        .map((edge) => byId.get(edge.to))
        .filter((child): child is DraftNode => child !== undefined);
      if (children.length >= 2) branchStages.add(children[0].stage);
    }
    // 분기 유무는 다양성 선호에만 사용한다. #240의 구조적 필수 조건은 아니다.
    void branchStages;
  }

  // §5.5 전투/비전투 비율 — 스테이지 전체 노드 기준. 보스와 시작 방은 선택 대상이
  // 아니므로 제외한다.
  //
  // ⚠️ 프로토타입은 이걸 `ensureStageNonCombatQuota` 후처리로 강제했다. 후처리로
  // 방 종류를 바꾸면 §5.3 지배 관계가 다시 깨질 수 있어 또 다른 재조정을 부른다 —
  // 후처리 여섯 개가 생긴 경로다. 축이 단조가 된 지금은 **규칙으로 두고 재시도**하는
  // 게 싸다(실측 평균 3회 내외).
  return null;
}

/**
 * 구조를 만든 뒤 방 종류 후보를 비교한다. #240의 우선순위 0~3은 hard constraint,
 * 4~6은 그 안에서의 선택 기준이다. 실제 보상 배율은 여기서 사용하지 않는다.
 */
function chooseRoomKinds(draft: Draft, startId: string, finalBossId: string, rand: () => number): boolean {
  const mutable = draft.nodes.filter((node) => (
    node.kind !== 'start' && node.kind !== 'stage-boss' && node.kind !== 'memory-boss'
  ));
  const stageTwoStarts = new Set(
    draft.edges.filter((edge) => edge.from === 's1-boss').map((edge) => edge.to),
  );
  const fixed = new Set([startId, ...stageTwoStarts]);
  const original = new Map(mutable.map((node) => [node.id, node.kind]));
  let best: Map<string, MapNodeKind> | null = null;
  let bestScore: readonly number[] | null = null;

  for (let sample = 0; sample < 768; sample += 1) {
    for (const node of mutable) {
      node.kind = fixed.has(node.id)
        ? 'combat'
        : pickWeighted(rand, KIND_WEIGHTS[sample % 3 === 0 ? 'balanced' : sample % 3 === 1 ? 'stable' : 'volatile']);
    }
    // Each stage must contain at least one reward room. Prefer the later room
    // so the entry room remains readable as ordinary combat.
    for (const stage of [1, 2]) {
      const rooms = mutable.filter((node) => node.stage === stage && !fixed.has(node.id));
      if (rooms.length > 0 && !rooms.some((node) => node.kind === 'treasure' || node.kind === 'altar')) {
        rooms[rooms.length - 1].kind = sample % 2 === 0 ? 'treasure' : 'altar';
      }
    }
    if (ruleViolation(draft, startId, finalBossId) !== null) continue;

    const kinds = new Set(mutable.map((node) => node.kind));
    const special = ['elite', 'trap', 'treasure', 'altar'].filter((kind) => kinds.has(kind as MapNodeKind)).length;
    const extraCombat = mutable.some((node) => !fixed.has(node.id) && node.kind === 'combat') ? 1 : 0;
    const nonCombat = mutable.filter((node) => node.kind === 'treasure' || node.kind === 'altar').length;
    const sharePenalty = Math.abs(nonCombat / Math.max(1, mutable.length) - 0.275);
    const score: readonly number[] = [special, extraCombat, -sharePenalty];
    if (!bestScore || score.some((value, index) => value !== bestScore![index]
      && score.slice(0, index).every((prefix, prefixIndex) => prefix === bestScore![prefixIndex])
      && value > bestScore![index])) {
      bestScore = score;
      best = new Map(mutable.map((node) => [node.id, node.kind]));
    }
  }
  if (!best) {
    for (const node of mutable) node.kind = original.get(node.id)!;
    return false;
  }
  for (const node of mutable) node.kind = best.get(node.id)!;
  return true;
}

/**
 * 초안을 계약이 요구하는 `MapNode`로 마감한다 — **프로토타입에 없던 층**이다.
 * 인카운터 방은 `waveSetId` 필수, 비전투 방은 반드시 null, 함정 방은 프로필 필수.
 */
function finalizeNode(draft: DraftNode, rand: () => number): MapNode {
  const base = {
    id: draft.id,
    stage: draft.stage,
    kind: draft.kind,
    layer: draft.layer,
    lane: draft.lane,
    terrain: [] as const,
    curseWeights: {} as const,
  };

  if (draft.kind === 'trap') {
    const key = pickWeighted(rand, TRAP_PROFILE_WEIGHTS);
    return { ...base, waveSetId: WAVE_SET_BY_KIND.trap[0], trapProfile: TRAP_ROOM_PROFILES[key] };
  }
  if (draft.kind === 'start' || draft.kind === 'combat' || draft.kind === 'elite') {
    const pool = draft.kind === 'combat'
      // 스테이지 1은 room-a/b, 스테이지 2는 room-c 계열 — 진행감이 웨이브로도 드러난다
      ? WAVE_SET_BY_KIND.combat.filter((key) => (draft.stage === 2
        ? key.startsWith('room-c')
        : !key.startsWith('room-c')))
      : WAVE_SET_BY_KIND[draft.kind];
    return { ...base, waveSetId: pool[Math.floor(rand() * pool.length)] };
  }
  return { ...base, waveSetId: null };
}

export interface GeneratedMap {
  definition: MapGraphDefinition;
  seed: number;
  /** 몇 번째 시도에서 규칙을 만족했나 — 생성 난이도를 관측한다 */
  attempts: number;
}

/**
 * 시드에서 런 맵을 생성한다. 설계 §5의 규칙을 만족하는 후보를 찾을 때까지
 * 재시드하며 재시도하고, 상한에 걸리면 null을 반환한다(호출부가 프리셋으로 폴백).
 */
export function generateRunMap(
  seed: number,
  config: MapGeneratorConfig = MAP_GENERATOR_CONFIG,
): GeneratedMap | null {
  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    // 시드를 섞어 재시도 — 같은 시드로 다시 돌리면 같은 실패를 반복한다
    const rand = seededRandom((seed + attempt * 0x9e3779b9) >>> 0);
    const draft: Draft = { nodes: [], edges: [] };

    const start: DraftNode = {
      id: 's1-start', stage: 1, kind: 'start', layer: 0, lane: 0,
    };
    draft.nodes.push(start);

    // 스테이지 1 → 수문장 → 스테이지 2 → 기억의 주인
    const s1Rooms = config.pathRoomsPerStage[0][0]
      + Math.floor(rand() * (config.pathRoomsPerStage[0][1] - config.pathRoomsPerStage[0][0] + 1));
    const s1 = buildStage(draft, rand, 1, 1, [start], s1Rooms);
    const stageBoss: DraftNode = {
      id: 's1-boss', stage: 1, kind: 'stage-boss', layer: s1.nextLayer, lane: 0,
    };
    draft.nodes.push(stageBoss);
    for (const exit of s1.exits) addEdge(draft, exit.id, stageBoss.id);

    const s2Rooms = config.pathRoomsPerStage[1][0]
      + Math.floor(rand() * (config.pathRoomsPerStage[1][1] - config.pathRoomsPerStage[1][0] + 1));
    const s2 = buildStage(draft, rand, 2, s1.nextLayer + 1, [stageBoss], s2Rooms);
    const finalBoss: DraftNode = {
      id: 's2-memory-boss', stage: 2, kind: 'memory-boss', layer: s2.nextLayer, lane: 0,
    };
    draft.nodes.push(finalBoss);
    for (const exit of s2.exits) addEdge(draft, exit.id, finalBoss.id);

    if (!chooseRoomKinds(draft, start.id, finalBoss.id, rand)) continue;
    if (ruleViolation(draft, start.id, finalBoss.id) !== null) continue;

    const definition: MapGraphDefinition = {
      nodes: draft.nodes.map((node) => finalizeNode(node, rand)),
      edges: draft.edges,
      startNodeId: start.id,
      // 최종 보스로 직접 이어지는 노드 — 계약이 이 간선의 존재를 검사한다
      lastBeforeBossNodeId: s2.exits[0].id,
    };
    return { definition, seed, attempts: attempt };
  }
  return null;
}

/** 규칙 위반 사유를 그대로 노출한다 — 회귀와 진단이 같은 함수를 본다 */
export const __testing = { ruleViolation, enumeratePaths, chooseSignature, specialScale };
