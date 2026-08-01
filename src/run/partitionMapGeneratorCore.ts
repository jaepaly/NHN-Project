// @ts-nocheck
/*
 * Direct TypeScript port of the algorithm in
 * docs/prototypes/partition-map-generator.html at #240 commit 9d7e311.
 *
 * Keep this module free of MapGraph/runtime concerns. The public generator
 * adapts its output after generation so the approved prototype algorithm can
 * be compared line-for-line without game-specific rules leaking into it.
 */

export type PrototypeRoomKind = 'combat' | 'trap' | 'elite' | 'treasure' | 'altar' | 'boss';

export interface PrototypeNode {
  id: string;
  stage: number;
  depth: number;
  lane: number;
  kind: PrototypeRoomKind;
  profile: 'stable' | 'balanced' | 'volatile';
  partitionIndex: number;
  isStart?: boolean;
  isEnd?: boolean;
  isTail?: boolean;
}

export interface PrototypeGraph {
  nodes: PrototypeNode[];
  edges: Array<{ from: string; to: string }>;
  partitions: any[];
}

export interface PrototypeStage {
  start: PrototypeNode;
  boss: PrototypeNode;
  min: number;
  max: number;
  average: number;
  partitions: number;
  complexity: number;
  hasBranch: boolean;
}

export interface PrototypeGeneration {
  graph: PrototypeGraph;
  stages: [PrototypeStage, PrototypeStage];
}

export function rngFromSeed(seed: number) {
  let state = (Number(seed) || 1) >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function pickWeighted(rng, rows) {
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  let cursor = rng() * total;
  for (const row of rows) {
    cursor -= row.weight;
    if (cursor <= 0) return row.value;
  }
  return rows[rows.length - 1].value;
}

function shuffle(rng, values) {
  const copy = values.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function branchProfiles(rng, count) {
  if (count === 1) return ['balanced'];
  if (count === 2) return shuffle(rng, ['stable', 'volatile']);
  return shuffle(rng, ['stable', 'balanced', 'volatile']);
}

function branchLengths(rng, count, n) {
  if (count === 1) return [n];
  if (n <= 3) return Array(count).fill(n);
  if (count === 2) return rng() < 0.5 ? [n - 1, n] : [n, n + 1];
  return rng() < 0.5 ? [n - 1, n, n] : [n, n, n + 1];
}

function lengthsByProfile(profiles, lengths) {
  const riskOrder = { stable: 0, balanced: 1, volatile: 2 };
  const safestFirst = profiles.slice().sort((left, right) => riskOrder[left] - riskOrder[right]);
  const longestFirst = lengths.slice().sort((left, right) => right - left);
  const assigned = new Map();
  safestFirst.forEach((profile, index) => assigned.set(profile, longestFirst[index]));
  return profiles.map(profile => assigned.get(profile));
}

function chooseSignature(rng, remaining, hardMax, stage) {
  const branchWeights = stage === 2
    ? [{ value: 1, weight: 10 }, { value: 2, weight: 55 }, { value: 3, weight: 35 }]
    : [{ value: 1, weight: 35 }, { value: 2, weight: 55 }, { value: 3, weight: 10 }];
  const a = pickWeighted(rng, branchWeights);
  let b = 1;
  if (a === 2) b = pickWeighted(rng, [{ value: 1, weight: 60 }, { value: 2, weight: 40 }]);
  else if (a === 3) b = pickWeighted(rng, [{ value: 1, weight: 55 }, { value: 2, weight: 30 }, { value: 3, weight: 15 }]);
  const minimumN = a === 1 ? 1 : 3;
  const maximumN = Math.min(5, remaining <= 3 ? remaining : remaining - 1);
  if (maximumN < minimumN) return { a: 1, b: 1, n: Math.max(1, remaining) };
  const n = minimumN + Math.floor(rng() * (maximumN - minimumN + 1));
  return { a, b, n: Math.min(n, hardMax) };
}

function contiguousGroups(count, groupCount) {
  const groups = [];
  let cursor = 0;
  for (let i = 0; i < groupCount; i += 1) {
    const remainingItems = count - cursor;
    const remainingGroups = groupCount - i;
    const size = Math.ceil(remainingItems / remainingGroups);
    groups.push(Array.from({ length: size }, (_, j) => cursor + j));
    cursor += size;
  }
  return groups;
}

function roomKind(rng, profile, isEndpoint, progress = 1) {
  if (isEndpoint) return 'combat';
  const baseRows = profile === 'volatile'
    ? [{ value: 'combat', weight: 20 }, { value: 'trap', weight: 35 }, { value: 'elite', weight: 25 }, { value: 'treasure', weight: 15 }, { value: 'altar', weight: 5 }]
    : profile === 'stable'
      ? [{ value: 'combat', weight: 75 }, { value: 'trap', weight: 10 }, { value: 'elite', weight: 5 }, { value: 'treasure', weight: 5 }, { value: 'altar', weight: 5 }]
      : [{ value: 'combat', weight: 50 }, { value: 'trap', weight: 20 }, { value: 'elite', weight: 15 }, { value: 'treasure', weight: 10 }, { value: 'altar', weight: 5 }];
  const specialScale = progress <= 0.25 ? 0 : progress <= 0.5 ? 0.45 : progress <= 0.75 ? 0.9 : 1.35;
  return pickWeighted(rng, baseRows.map(row => ({
    value: row.value,
    weight: row.value === 'combat' ? row.weight : row.weight * specialScale,
  })));
}

function roomRisk(kind) {
  if (kind === 'treasure') return 0;
  if (kind === 'altar') return 1;
  if (kind === 'elite' || kind === 'trap') return 2;
  return 1;
}

function roomReward(kind) { return kind === 'treasure' || kind === 'altar' ? 1 : 0; }

function contextualRoomKind(graph, stage, rng, profile, progress, isEndpoint) {
  if (isEndpoint) return 'combat';
  const kinds = ['combat', 'elite', 'trap', 'treasure', 'altar'];
  const counts = new Map(kinds.map(kind => [kind, 0]));
  graph.nodes.filter(node => node.stage === stage)
    .forEach(node => counts.set(node.kind, (counts.get(node.kind) || 0) + 1));
  const missing = kinds.find(kind => counts.get(kind) === 0);
  if (missing && progress > 0.35) return missing;
  return roomKind(rng, profile, false, progress);
}

function addNode(graph, data) {
  const node = { id: 's' + data.stage + 'n' + graph.nodes.length, ...data };
  graph.nodes.push(node);
  return node;
}

function addEdge(graph, from, to) {
  if (!from || !to) return;
  if (!graph.edges.some(edge => edge.from === from.id && edge.to === to.id)) {
    graph.edges.push({ from: from.id, to: to.id });
  }
}

function routeSignature(route) { return route.length + ':' + route.nodes.map(node => node.kind).join(','); }

function ensureDistinctRoutes(routes) {
  if (routes.length <= 1) return;
  const riskOrder = { stable: 0, balanced: 1, volatile: 2 };
  const fallbackKinds = {
    stable: ['combat'], balanced: ['combat', 'altar', 'elite'], volatile: ['elite', 'trap', 'combat'],
  };
  const allKinds = ['combat', 'trap', 'elite', 'treasure', 'altar'];
  const ordered = routes.slice().sort((left, right) => riskOrder[left.profile] - riskOrder[right.profile]);
  const used = new Set();
  ordered.forEach(route => {
    let signature = routeSignature(route);
    if (!used.has(signature)) { used.add(signature); return; }
    const lastRoom = route.nodes[route.nodes.length - 1];
    const candidates = (fallbackKinds[route.profile] || []).concat(allKinds);
    for (const kind of candidates) {
      lastRoom.kind = kind;
      signature = routeSignature(route);
      if (!used.has(signature)) break;
    }
    used.add(signature);
  });
}

function buildPartition(graph, rng, sourceNodes, signature, stage, partitionIndex, routeLanes, hardMax) {
  const startDepth = sourceNodes.length ? Math.max(...sourceNodes.map(node => node.depth)) + 1 : 0;
  const sourceLane = sourceNodes.length
    ? sourceNodes.reduce((sum, node) => sum + node.lane, 0) / sourceNodes.length : 0.5;
  const start = addNode(graph, { stage, depth: startDepth, lane: sourceLane, kind: 'combat', profile: 'balanced', partitionIndex, isStart: true });
  sourceNodes.forEach(source => addEdge(graph, source, start));
  const profiles = branchProfiles(rng, signature.a);
  const lengths = lengthsByProfile(profiles, branchLengths(rng, signature.a, signature.n));
  const maxLength = Math.max(...lengths);
  if (maxLength <= 1) {
    graph.partitions.push({ stage, index: partitionIndex, signature: signature.a + '>' + signature.b + '(' + signature.n + ')', startId: start.id, a: signature.a, b: signature.b, n: signature.n, branchSpan: 0 });
    return [start];
  }
  const routeLastNodes = [];
  for (let routeIndex = 0; routeIndex < signature.a; routeIndex += 1) {
    const length = lengths[routeIndex];
    const profile = profiles[routeIndex];
    const lane = routeLanes[routeIndex];
    let previous = start;
    const routeNodes = [];
    const interiorCount = Math.max(0, length - 2);
    for (let i = 0; i < interiorCount; i += 1) {
      const progress = (i + 1) / Math.max(1, length - 1);
      const depth = startDepth + Math.max(1, Math.round(progress * (maxLength - 1)));
      const node = addNode(graph, { stage, depth, lane, kind: contextualRoomKind(graph, stage, rng, profile, depth / Math.max(1, hardMax - 1), false), profile, partitionIndex });
      addEdge(graph, previous, node);
      routeNodes.push(node);
      previous = node;
    }
    routeLastNodes.push({ previous, profile, lane, length, nodes: routeNodes });
  }
  ensureDistinctRoutes(routeLastNodes);
  const groups = contiguousGroups(signature.a, signature.b);
  const outputs = [];
  const outputGroups = [];
  for (const routeGroup of groups) {
    const members = routeGroup.map(index => routeLastNodes[index]);
    const lane = members.reduce((sum, member) => sum + member.lane, 0) / members.length;
    const profile = members.length === 1 ? members[0].profile : 'balanced';
    const end = addNode(graph, { stage, depth: startDepth + Math.max(1, maxLength - 1), lane, kind: roomKind(rng, profile, true), profile, partitionIndex, isEnd: true });
    members.forEach(member => addEdge(graph, member.previous, end));
    outputs.push(end);
    outputGroups.push({
      endId: end.id,
      routeIndexes: routeGroup.slice(),
      nodeIds: [end.id, ...members.flatMap(member => member.nodes.map(node => node.id))],
      routes: members.map(member => [...member.nodes.map(node => node.id), end.id]),
    });
  }
  graph.partitions.push({ stage, index: partitionIndex, signature: signature.a + '>' + signature.b + '(' + signature.n + ')', startId: start.id, a: signature.a, b: signature.b, n: signature.n, outputGroups, branchSpan: Math.max(0, maxLength - 2) });
  return outputs;
}

function pathLengths(graph, startId, endIds) {
  const outgoing = new Map();
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge.to);
  }
  const targetSet = new Set(endIds);
  const values = [];
  function walk(id, count, seen) {
    if (seen.has(id)) return;
    if (targetSet.has(id)) { values.push(count); return; }
    const nextSeen = new Set(seen); nextSeen.add(id);
    for (const next of outgoing.get(id) || []) walk(next, count + 1, nextSeen);
  }
  walk(startId, 1, new Set());
  return values;
}

export function enumeratePrototypeStagePaths(graph, startId, bossId) {
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
  const outgoing = new Map();
  for (const edge of graph.edges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge.to);
  }
  const paths = [];
  function walk(id, path, seen) {
    if (seen.has(id)) return;
    const node = nodeById.get(id); if (!node) return;
    const nextPath = path.concat(node);
    if (id === bossId) { paths.push(nextPath); return; }
    const nextSeen = new Set(seen); nextSeen.add(id);
    for (const nextId of outgoing.get(id) || []) walk(nextId, nextPath, nextSeen);
  }
  walk(startId, [], new Set());
  return paths;
}

function ensureStageRoomMix(graph, stage, rng, startId, bossId, hasBranch) {
  const rewardKinds = new Set(['treasure', 'altar']);
  const paths = enumeratePrototypeStagePaths(graph, startId, bossId);
  const rooms = graph.nodes.filter(node => node.stage === stage && node.id !== bossId);
  const useCount = new Map();
  paths.forEach(path => path.forEach(node => useCount.set(node.id, (useCount.get(node.id) || 0) + 1)));
  const start = graph.nodes.find(node => node.id === startId);
  if (start) start.kind = 'combat';
  rooms.forEach(node => { if (node.id !== startId) node.kind = 'combat'; });
  const uniqueByPath = paths.map(path => {
    const unique = path.filter(node => node.id !== startId && node.id !== bossId && useCount.get(node.id) === 1);
    const later = unique.filter(node => node.depth >= 2);
    return later.length ? later : unique;
  });
  const hasShortSplit = graph.partitions.some(partition => partition.stage === stage && partition.b === 1 && partition.n === 3);
  const isSingleNodeBranch = hasShortSplit && uniqueByPath.length >= 2 && uniqueByPath.every(nodes => nodes.length === 1);
  if (isSingleNodeBranch) {
    const rewardMode = uniqueByPath.length <= 2 && rooms.filter(node => node.id !== startId).length >= 4 && rng() < 0.5;
    uniqueByPath.forEach((nodes, index) => {
      const node = nodes[0];
      if (rewardMode) node.kind = index === 0 ? 'treasure' : index === 1 ? 'altar' : 'treasure';
      else node.kind = index === 0 ? 'elite' : index === 1 ? 'trap' : 'combat';
    });
    return;
  }
  const ranked = uniqueByPath.map((nodes, index) => ({
    index, nodes: nodes.slice().sort((a, b) => a.depth - b.depth), risk: nodes.length, tie: rng(),
  })).sort((a, b) => a.risk - b.risk || a.tie - b.tie);
  const reserve = rooms.filter(node => node.id !== startId).length >= 6;
  if (ranked.length >= 2) {
    const lowRoute = ranked[0];
    const highRoute = ranked[ranked.length - 1];
    const low = lowRoute.nodes.find(node => node.kind === 'combat');
    const high = highRoute.nodes.find(node => node.kind === 'combat');
    if (low) low.kind = rng() < 0.5 ? 'elite' : 'trap';
    if (high && high.id !== low?.id) high.kind = 'treasure';
    if (reserve) {
      const altarRoute = ranked.length > 2 ? ranked[1] : lowRoute;
      const altar = altarRoute.nodes.find(node => node.kind === 'combat');
      if (altar && altar.id !== high?.id && altar.id !== low?.id) altar.kind = 'altar';
    }
  }
  const plainRoute = uniqueByPath.find(nodes => nodes.length > 1 && nodes.every(node => node.kind === 'combat'));
  if (plainRoute) {
    const sourceRoute = uniqueByPath.find(nodes => nodes !== plainRoute && nodes.some(node => rewardKinds.has(node.kind)));
    const target = plainRoute[plainRoute.length - 1];
    const source = sourceRoute?.find(node => rewardKinds.has(node.kind));
    if (target && source) { const rewardKind = source.kind; source.kind = 'combat'; target.kind = rewardKind; }
  }
  const remaining = uniqueByPath.flat().filter(node => node.kind === 'combat');
  if (!graph.nodes.some(node => node.stage === stage && node.kind === 'elite') && remaining[0]) remaining[0].kind = 'elite';
  if (!graph.nodes.some(node => node.stage === stage && node.kind === 'trap') && remaining[1]) remaining[1].kind = 'trap';
}

function ensureStageRewardMinimum(graph, stage) {
  const rewards = new Set(['treasure', 'altar']);
  const stageNumber = typeof stage === 'number' ? stage : stage.start.stage;
  const stageRooms = graph.nodes.filter(node => node.stage === stageNumber && node.id !== stage.start.id && node.id !== stage.boss.id);
  if (stageRooms.some(node => rewards.has(node.kind))) return;
  const target = stageRooms.filter(node => node.kind === 'combat').sort((a, b) => (b.depth || 0) - (a.depth || 0))[0];
  if (target) target.kind = 'treasure';
}

function ensureStageNonCombatQuota(graph, stage) {
  const stageNumber = typeof stage === 'number' ? stage : stage.start.stage;
  const rooms = graph.nodes.filter(node => node.stage === stageNumber && node.id !== stage.start.id && node.id !== stage.boss.id);
  const nonCombat = new Set(['treasure', 'altar']);
  const targetCount = Math.max(1, Math.round(rooms.length * 0.25));
  let current = rooms.filter(node => nonCombat.has(node.kind)).length;
  if (current >= targetCount) return;
  const candidates = rooms.filter(node => node.kind === 'combat').sort((a, b) => (b.depth || 0) - (a.depth || 0));
  for (const node of candidates) {
    if (current >= targetCount) break;
    node.kind = current % 2 === 0 ? 'treasure' : 'altar';
    current += 1;
  }
}

function diversifyPartitionStarts(graph, stage) {
  const stageNumber = typeof stage === 'number' ? stage : stage.start.stage;
  const starts = graph.nodes.filter(node => node.stage === stageNumber && node.isStart && node.id !== stage.start.id && node.kind === 'combat')
    .sort((a, b) => (a.depth || 0) - (b.depth || 0));
  if (!starts.length) return;
  const stageRooms = graph.nodes.filter(node => node.stage === stageNumber);
  const hasElite = stageRooms.some(node => node.kind === 'elite');
  const hasTrap = stageRooms.some(node => node.kind === 'trap');
  if (!hasElite) starts[0].kind = 'elite';
  else if (!hasTrap) starts[0].kind = 'trap';
}

function buildStage(graph, rng, stage, minRooms, hardMax) {
  const stageStartNodeIndex = graph.nodes.length;
  let frontiers = [];
  let partitionIndex = 0;
  let shouldContinue = true;
  while (shouldContinue && partitionIndex < 4) {
    const currentMax = frontiers.length ? Math.max(...frontiers.map(node => node.depth + 1)) : 0;
    const remaining = Math.max(1, hardMax - currentMax);
    const sourceGroups = frontiers.length === 0 ? [[]] : (() => {
      const ordered = frontiers.slice().sort((a, b) => a.lane - b.lane);
      const groupCount = Math.max(1, Math.min(ordered.length, rng() < 0.55 ? 1 : ordered.length));
      return contiguousGroups(ordered.length, groupCount).map(group => group.map(index => ordered[index]));
    })();
    const plans = [];
    let branchCapacity = 3;
    sourceGroups.forEach((sources, groupIndex) => {
      const signature = chooseSignature(rng, remaining, hardMax, stage);
      const remainingGroups = sourceGroups.length - groupIndex - 1;
      const maxForThisGroup = Math.max(1, branchCapacity - remainingGroups);
      signature.a = Math.max(1, Math.min(signature.a, maxForThisGroup));
      signature.b = Math.min(signature.b, signature.a);
      branchCapacity -= signature.a;
      plans.push({ sources, signature });
    });
    const nextFrontiers = [];
    const sourceNodes = plans.flatMap(plan => plan.sources);
    const sourceCenter = sourceNodes.length > 0 ? sourceNodes.reduce((sum, node) => sum + node.lane, 0) / sourceNodes.length : 0.5;
    const totalRouteCount = plans.reduce((sum, plan) => sum + plan.signature.a, 0);
    let laneCursor = sourceCenter - (totalRouteCount - 1) / 2;
    for (const plan of plans) {
      const routeLanes = Array.from({ length: plan.signature.a }, (_, index) => laneCursor + index);
      laneCursor += plan.signature.a;
      nextFrontiers.push(...buildPartition(graph, rng, plan.sources, plan.signature, stage, partitionIndex, routeLanes, hardMax));
    }
    frontiers = nextFrontiers.slice(0, 3);
    partitionIndex += 1;
    const startNode = graph.nodes[stageStartNodeIndex];
    const lengths = pathLengths(graph, startNode.id, frontiers.map(node => node.id));
    const shortest = Math.min(...lengths);
    const longest = Math.max(...lengths);
    if (longest >= hardMax) shouldContinue = false;
    else if (shortest < minRooms) shouldContinue = true;
    else shouldContinue = rng() >= 0.7;
  }
  const startNode = graph.nodes[stageStartNodeIndex];
  const paddedFrontiers = [];
  frontiers.forEach(frontier => {
    const routeLengths = pathLengths(graph, startNode.id, [frontier.id]);
    const currentLength = routeLengths.length > 0 ? Math.min(...routeLengths) : minRooms;
    const needed = Math.max(0, minRooms - currentLength);
    let previous = frontier;
    for (let i = 0; i < needed; i += 1) {
      const tail = addNode(graph, { stage, depth: previous.depth + 1, lane: previous.lane, kind: 'combat', profile: 'balanced', partitionIndex, isTail: true });
      addEdge(graph, previous, tail); previous = tail;
    }
    paddedFrontiers.push(previous);
  });
  const bossDepth = Math.max(...paddedFrontiers.map(node => node.depth)) + 1;
  const boss = addNode(graph, { stage, depth: bossDepth, lane: paddedFrontiers.reduce((sum, node) => sum + node.lane, 0) / paddedFrontiers.length, kind: 'boss', profile: 'balanced', partitionIndex: -1 });
  paddedFrontiers.forEach(frontier => addEdge(graph, frontier, boss));
  const finalLengths = pathLengths(graph, startNode.id, [boss.id]);
  const stagePartitions = graph.partitions.filter(partition => partition.stage === stage);
  const complexity = stagePartitions.reduce((sum, partition) => sum + Math.max(0, partition.a - 1) * 2 + Math.max(0, partition.b - 1) + (partition.a > 1 ? 1 : 0) + Math.max(0, partition.a - 1) * partition.branchSpan, 0);
  return { start: startNode, boss, min: Math.min(...finalLengths), max: Math.max(...finalLengths), average: finalLengths.reduce((sum, value) => sum + value, 0) / finalLengths.length, partitions: partitionIndex, complexity, hasBranch: stagePartitions.some(partition => partition.a >= 2) };
}

function partitionRouteGroups(graph, stage) {
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]));
  const stageIndex = typeof stage === 'number' ? stage : stage.index ?? stage.start?.stage;
  return graph.partitions.filter(item => item.stage === stageIndex && item.outputGroups?.length).map(partition => ({
    partition,
    groups: partition.outputGroups.map(group => ({
      endId: group.endId,
      paths: (group.routes || [group.nodeIds]).map(route => route.map(id => nodeById.get(id)).filter(Boolean)),
    })),
  }));
}

function hasAcceptableRouteBalance(graph, stage) {
  const paths = enumeratePrototypeStagePaths(graph, stage.start.id, stage.boss.id);
  if (paths.length < 2) return true;
  const rewards = new Set(['treasure', 'altar']);
  const scores = paths.map(path => path.filter(node => node.id !== stage.boss.id).reduce((sum, node) => sum + roomRisk(node.kind), 0));
  const rewardCount = graph.nodes.filter(node => node.stage === stage.index && rewards.has(node.kind)).length;
  for (const partitionGroup of partitionRouteGroups(graph, stage)) {
    const groupScores = partitionGroup.groups.map(group => {
      const pathScores = group.paths.map(path => ({ risk: path.reduce((sum, node) => sum + roomRisk(node.kind), 0), reward: path.reduce((sum, node) => sum + roomReward(node.kind), 0) }));
      return { risk: pathScores.reduce((sum, score) => sum + score.risk, 0) / pathScores.length, reward: pathScores.reduce((sum, score) => sum + score.reward, 0) / pathScores.length };
    });
    for (let i = 0; i < groupScores.length; i += 1) for (let j = i + 1; j < groupScores.length; j += 1) {
      if (groupScores[i].risk > groupScores[j].risk && groupScores[i].reward < groupScores[j].reward) return false;
      if (groupScores[j].risk > groupScores[i].risk && groupScores[j].reward < groupScores[i].reward) return false;
    }
  }
  if (rewardCount > 0) {
    const routeScores = paths.map(path => {
      const playable = path.filter(node => node.id !== stage.boss.id);
      return { risk: playable.reduce((sum, node) => sum + roomRisk(node.kind), 0), reward: playable.reduce((sum, node) => sum + roomReward(node.kind), 0) };
    });
    for (let i = 0; i < routeScores.length; i += 1) for (let j = i + 1; j < routeScores.length; j += 1) {
      if (routeScores[i].risk > routeScores[j].risk && routeScores[i].reward < routeScores[j].reward) return false;
      if (routeScores[j].risk > routeScores[i].risk && routeScores[j].reward < routeScores[i].reward) return false;
    }
    return true;
  }
  return Math.max(...scores) - Math.min(...scores) <= 1;
}

function rebalancePartitionOutputs(graph, stage) {
  const rewards = new Set(['treasure', 'altar']);
  for (const entry of partitionRouteGroups(graph, stage)) {
    if (entry.partition.b <= 1 || entry.partition.n !== 3 || entry.groups.length < 2) continue;
    const scored = entry.groups.map(group => {
      const nodes = [...new Map(group.paths.flat().map(node => [node.id, node])).values()];
      return { nodes, risk: group.paths.reduce((sum, path) => sum + path.reduce((inner, node) => inner + roomRisk(node.kind), 0), 0) / group.paths.length, reward: nodes.reduce((sum, node) => sum + roomReward(node.kind), 0) };
    });
    const high = scored.slice().sort((a, b) => b.risk - a.risk)[0];
    const low = scored.slice().sort((a, b) => a.risk - b.risk)[0];
    if (!high || !low || high === low || high.reward >= low.reward) continue;
    const source = low.nodes.find(node => rewards.has(node.kind));
    const target = high.nodes.find(node => node.kind === 'combat');
    if (!source || !target) continue;
    target.kind = source.kind; source.kind = 'combat';
  }
}

function rebalanceWholeStageRoutes(graph, stage) {
  const paths = enumeratePrototypeStagePaths(graph, stage.start.id, stage.boss.id);
  if (paths.length < 2) return;
  const useCount = new Map();
  paths.forEach(path => path.forEach(node => useCount.set(node.id, (useCount.get(node.id) || 0) + 1)));
  for (let pass = 0; pass < 4; pass += 1) {
    const scored = paths.map(path => ({
      nodes: path.filter(node => node.id !== stage.boss.id && useCount.get(node.id) === 1),
      risk: path.filter(node => node.id !== stage.boss.id).reduce((sum, node) => sum + roomRisk(node.kind), 0),
      reward: path.reduce((sum, node) => sum + roomReward(node.kind), 0),
    }));
    const high = scored.slice().sort((a, b) => b.risk - a.risk)[0];
    const low = scored.slice().sort((a, b) => a.risk - b.risk)[0];
    if (!high || !low || high === low || high.risk <= low.risk || high.reward >= low.reward) return;
    const source = low.nodes.filter(node => node.kind === 'treasure' || node.kind === 'altar').sort((a, b) => roomReward(b.kind) - roomReward(a.kind))[0];
    const highRiskNode = high.nodes.find(node => node.kind === 'elite' || node.kind === 'trap');
    const lowCombatNode = low.nodes.find(node => node.kind === 'combat');
    if (highRiskNode && source && lowCombatNode) {
      const riskKind = highRiskNode.kind; highRiskNode.kind = 'combat'; lowCombatNode.kind = riskKind; continue;
    }
    const target = high.nodes.find(node => node.kind === 'combat') || high.nodes.find(node => node.kind !== 'treasure' && node.kind !== 'altar');
    if (!source || !target) return;
    const targetKind = target.kind; target.kind = source.kind; source.kind = targetKind;
    high.reward += roomReward(target.kind) - roomReward(targetKind);
    low.reward += roomReward(targetKind) - roomReward(source.kind);
  }
}

function diversifyStageRoutes(graph, stage) {
  const paths = enumeratePrototypeStagePaths(graph, stage.start.id, stage.boss.id);
  if (paths.length < 2) return;
  const useCount = new Map();
  paths.forEach(path => path.forEach(node => useCount.set(node.id, (useCount.get(node.id) || 0) + 1)));
  const routes = paths.map(path => path.filter(node => node.id !== stage.boss.id && useCount.get(node.id) === 1));
  const plain = routes.find(route => route.length > 1 && route.every(node => node.kind === 'combat'));
  const sourceRoute = routes.find(route => route !== plain && route.some(node => node.kind === 'treasure' || node.kind === 'altar'));
  if (!plain || !sourceRoute) return;
  const targets = plain.slice(-2);
  const source = sourceRoute.find(node => node.kind === 'treasure' || node.kind === 'altar');
  const sourceRisk = sourceRoute.find(node => node.kind === 'elite' || node.kind === 'trap');
  if (!targets.length || !source) return;
  const rewardKind = source.kind; source.kind = 'combat'; targets[targets.length - 1].kind = rewardKind;
  if (sourceRisk && targets.length > 1) { const riskKind = sourceRisk.kind; sourceRisk.kind = 'combat'; targets[0].kind = riskKind; }
}

function rebalanceMergedBranchRewards(graph, stage) {
  for (const entry of partitionRouteGroups(graph, stage)) {
    if (entry.partition.b !== 1 || entry.groups.length !== 1) continue;
    const branches = entry.groups[0].paths.map(path => path.slice(0, -1));
    if (branches.length < 2) continue;
    const scored = branches.map(nodes => ({ nodes, risk: nodes.reduce((sum, node) => sum + roomRisk(node.kind), 0), reward: nodes.reduce((sum, node) => sum + roomReward(node.kind), 0) }));
    const low = scored.slice().sort((a, b) => a.risk - b.risk)[0];
    const high = scored.slice().sort((a, b) => b.risk - a.risk)[0];
    if (!low || !high || low === high || low.reward <= high.reward) continue;
    const extraReward = low.nodes.find(node => node.kind === 'treasure' || node.kind === 'altar');
    if (extraReward) extraReward.kind = 'combat';
  }
}

function ensureStageRoomVariety(graph, stage) {
  const stageNumber = typeof stage === 'number' ? stage : stage.start.stage;
  const rooms = graph.nodes.filter(node => node.stage === stageNumber && node.id !== stage.start.id && node.id !== stage.boss.id);
  if (rooms.length < 4) return;
  const kinds = new Set(rooms.map(node => node.kind));
  const useCount = new Map();
  const paths = enumeratePrototypeStagePaths(graph, stage.start.id, stage.boss.id);
  paths.forEach(path => path.forEach(node => useCount.set(node.id, (useCount.get(node.id) || 0) + 1)));
  for (const missing of ['elite', 'trap', 'treasure', 'altar']) {
    if (kinds.has(missing)) continue;
    const target = rooms.filter(node => node.kind === 'combat').sort((a, b) => {
      const sharedA = (useCount.get(a.id) || 0) > 1 ? 0 : 1;
      const sharedB = (useCount.get(b.id) || 0) > 1 ? 0 : 1;
      return sharedA - sharedB || (b.depth || 0) - (a.depth || 0);
    })[0];
    if (!target) continue;
    target.kind = missing; kinds.add(missing);
  }
}

function repairDominatedRoutes(graph, stage) {
  const paths = enumeratePrototypeStagePaths(graph, stage.start.id, stage.boss.id);
  if (paths.length < 2) return;
  const useCount = new Map();
  paths.forEach(path => path.forEach(node => useCount.set(node.id, (useCount.get(node.id) || 0) + 1)));
  const score = path => {
    const playable = path.filter(node => node.id !== stage.boss.id);
    return { risk: playable.reduce((sum, node) => sum + roomRisk(node.kind), 0), reward: playable.reduce((sum, node) => sum + roomReward(node.kind), 0) };
  };
  const dominatedCount = () => {
    const scores = paths.map(score);
    return scores.reduce((count, a, i) => count + (scores.some((b, j) => i !== j && a.risk > b.risk && a.reward < b.reward) ? 1 : 0), 0);
  };
  for (let pass = 0; pass < 8; pass += 1) {
    const before = dominatedCount(); if (!before) return;
    let best = null;
    for (let i = 0; i < paths.length; i += 1) for (let j = i + 1; j < paths.length; j += 1) {
      const left = paths[i].filter(node => node.id !== stage.boss.id && useCount.get(node.id) === 1);
      const right = paths[j].filter(node => node.id !== stage.boss.id && useCount.get(node.id) === 1);
      for (const a of left) for (const b of right) {
        if (a.kind === b.kind) continue;
        const oldA = a.kind; const oldB = b.kind; a.kind = oldB; b.kind = oldA;
        const after = dominatedCount(); a.kind = oldA; b.kind = oldB;
        if (after < before && (!best || after < best.after)) best = { a, b, oldA, oldB, after };
      }
    }
    if (!best) return;
    best.a.kind = best.oldB; best.b.kind = best.oldA;
  }
}

function maximizeStageSpecialVariety(graph, stage) {
  const stageNodes = graph.nodes.filter(node => node.stage === stage.start.stage && node.id !== stage.boss.id);
  const slots = stageNodes.filter(node => node.id !== stage.start.id);
  if (slots.length < 4 || slots.length > 6) return;
  const specialKinds = ['elite', 'trap', 'treasure', 'altar'];
  const allKinds = ['combat', ...specialKinds];
  const paths = enumeratePrototypeStagePaths(graph, stage.start.id, stage.boss.id);
  const specialScore = () => new Set(stageNodes.filter(node => specialKinds.includes(node.kind)).map(node => node.kind)).size;
  const hasExtraCombat = () => stageNodes.some(node => node.id !== stage.start.id && node.kind === 'combat');
  const isHigherPriorityValid = () => {
    const signatures = paths.map(path => path.filter(node => node.id !== stage.boss.id).map(node => node.kind).join('|'));
    if (new Set(signatures).size !== signatures.length) return false;
    if (!stageNodes.some(node => node.kind === 'treasure' || node.kind === 'altar')) return false;
    const scores = paths.map(path => {
      const playable = path.filter(node => node.id !== stage.boss.id);
      return { risk: playable.reduce((sum, node) => sum + roomRisk(node.kind), 0), reward: playable.reduce((sum, node) => sum + roomReward(node.kind), 0) };
    });
    return !scores.some((left, li) => scores.some((right, ri) => li !== ri && left.risk > right.risk && left.reward < right.reward));
  };
  const baseline = specialScore(); const baselineExtraCombat = hasExtraCombat();
  if ((baseline === specialKinds.length && baselineExtraCombat) || !isHigherPriorityValid()) return;
  const original = slots.map(node => node.kind); let best = null;
  const search = index => {
    if (index === slots.length) {
      const score = specialScore(); const extraCombat = hasExtraCombat();
      const improvesVariety = score > baseline || (score === baseline && !baselineExtraCombat && extraCombat);
      if (improvesVariety && isHigherPriorityValid() && (!best || score > best.score || (score === best.score && Number(extraCombat) > Number(best.extraCombat)))) {
        best = { score, extraCombat, assignment: slots.map(node => node.kind) };
      }
      return;
    }
    for (const kind of allKinds) { slots[index].kind = kind; search(index + 1); }
  };
  search(0);
  const assignment = best ? best.assignment : original;
  slots.forEach((node, index) => { node.kind = assignment[index]; });
}

function optimizeMergedPartitionSlots(graph, stage) {
  const paths = enumeratePrototypeStagePaths(graph, stage.start.id, stage.boss.id);
  if (paths.length < 2) return;
  const scoreRoutes = () => {
    const scores = paths.map(path => {
      const playable = path.filter(node => node.id !== stage.boss.id);
      return { risk: playable.reduce((sum, node) => sum + roomRisk(node.kind), 0), reward: playable.reduce((sum, node) => sum + roomReward(node.kind), 0) };
    });
    const dominated = scores.reduce((count, a, i) => count + (scores.some((b, j) => i !== j && a.risk > b.risk && a.reward < b.reward) ? 1 : 0), 0);
    return { scores, dominated };
  };
  const varietyScore = () => new Set(graph.nodes.filter(node => node.stage === stage.start.stage && node.kind !== 'boss').map(node => node.kind)).size;
  const hasExtraCombat = () => graph.nodes.some(node => node.stage === stage.start.stage && node.id !== stage.start.id && node.id !== stage.boss.id && node.kind === 'combat');
  for (const entry of partitionRouteGroups(graph, stage)) {
    const allPaths = entry.groups.flatMap(group => group.paths); if (allPaths.length < 3) continue;
    const slots = allPaths.slice(0, 3).map(path => path[path.length - 2]); if (slots.some(node => !node)) continue;
    const kinds = ['combat', 'elite', 'trap', 'treasure', 'altar'];
    const before = scoreRoutes().dominated; let best = null;
    const beforeVariety = varietyScore(); const beforeExtraCombat = hasExtraCombat();
    for (const a of kinds) for (const b of kinds) for (const c of kinds) {
      const assignment = [a, b, c]; const old = slots.map(node => node.kind);
      slots.forEach((node, index) => { node.kind = assignment[index]; });
      const after = scoreRoutes().dominated;
      const signatures = paths.map(path => path.filter(node => node.id !== stage.boss.id).map(node => node.kind).join('|'));
      const uniqueRoutes = new Set(signatures).size === signatures.length;
      const hasReward = graph.nodes.some(node => node.stage === stage.start.stage && (node.kind === 'treasure' || node.kind === 'altar'));
      const variety = varietyScore(); const extraCombat = hasExtraCombat();
      const improvesSoftGoals = (!beforeExtraCombat && extraCombat) || variety > beforeVariety || after < before;
      if (hasReward && uniqueRoutes && after <= before && variety >= beforeVariety && improvesSoftGoals
        && (!best || after < best.after || (after === best.after && Number(extraCombat) > Number(best.extraCombat)) || (after === best.after && extraCombat === best.extraCombat && variety > best.variety))) {
        best = { assignment, after, variety, extraCombat };
      }
      slots.forEach((node, index) => { node.kind = old[index]; });
    }
    if (best && (best.after <= before || best.variety >= beforeVariety || best.extraCombat)) slots.forEach((node, index) => { node.kind = best.assignment[index]; });
  }
}

export function generatePrototypeMap(seed: number): PrototypeGeneration {
  const stage1Min = 3; const stage1Max = 4; const stage2Min = 4; const stage2Max = 5;
  const rng = rngFromSeed(seed);
  let stage1Graph = null; let stage1 = null; let simplestStage1 = null;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidateGraph = { nodes: [], edges: [], partitions: [] };
    const candidate = buildStage(candidateGraph, rng, 1, stage1Min, stage1Max);
    ensureStageRoomMix(candidateGraph, 1, rng, candidate.start.id, candidate.boss.id, candidate.hasBranch);
    ensureStageRewardMinimum(candidateGraph, candidate);
    ensureStageNonCombatQuota(candidateGraph, candidate);
    diversifyPartitionStarts(candidateGraph, candidate);
    rebalancePartitionOutputs(candidateGraph, candidate);
    const withinStage1Budget = candidate.min >= stage1Min + 1 && candidate.max <= stage1Max + 1;
    if (withinStage1Budget && hasAcceptableRouteBalance(candidateGraph, candidate)
      && (!simplestStage1 || candidate.complexity < simplestStage1.stage.complexity)) simplestStage1 = { graph: candidateGraph, stage: candidate };
    if (withinStage1Budget && candidate.complexity <= 8 && hasAcceptableRouteBalance(candidateGraph, candidate)) {
      stage1Graph = candidateGraph; stage1 = candidate; break;
    }
  }
  if (!stage1Graph) { stage1Graph = simplestStage1.graph; stage1 = simplestStage1.stage; }

  let stage2Graph = null; let stage2 = null; let bestCandidate = null;
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidateGraph = { nodes: [], edges: [], partitions: [] };
    const candidate = buildStage(candidateGraph, rng, 2, stage2Min, stage2Max);
    ensureStageRoomMix(candidateGraph, 2, rng, candidate.start.id, candidate.boss.id, candidate.hasBranch);
    ensureStageRewardMinimum(candidateGraph, candidate);
    ensureStageNonCombatQuota(candidateGraph, candidate);
    diversifyPartitionStarts(candidateGraph, candidate);
    rebalancePartitionOutputs(candidateGraph, candidate);
    const withinStage2Budget = candidate.min >= stage2Min + 1 && candidate.max <= stage2Max + 1;
    if (withinStage2Budget && hasAcceptableRouteBalance(candidateGraph, candidate)
      && (!bestCandidate || candidate.complexity > bestCandidate.stage.complexity)) bestCandidate = { graph: candidateGraph, stage: candidate };
    if (withinStage2Budget && candidate.hasBranch && hasAcceptableRouteBalance(candidateGraph, candidate) && candidate.complexity >= stage1.complexity) {
      stage2Graph = candidateGraph; stage2 = candidate; break;
    }
  }
  if (!stage2Graph) { stage2Graph = bestCandidate.graph; stage2 = bestCandidate.stage; }

  ensureStageRewardMinimum(stage1Graph, stage1); ensureStageRewardMinimum(stage2Graph, stage2);
  ensureStageNonCombatQuota(stage1Graph, stage1); ensureStageNonCombatQuota(stage2Graph, stage2);
  diversifyPartitionStarts(stage1Graph, stage1); diversifyPartitionStarts(stage2Graph, stage2);
  const graph = {
    nodes: stage1Graph.nodes.concat(stage2Graph.nodes),
    edges: stage1Graph.edges.concat(stage2Graph.edges),
    partitions: stage1Graph.partitions.concat(stage2Graph.partitions),
  };
  ensureStageRoomVariety(graph, stage1); ensureStageRoomVariety(graph, stage2);
  rebalanceWholeStageRoutes(graph, stage1); rebalanceWholeStageRoutes(graph, stage2);
  rebalanceMergedBranchRewards(graph, stage1); rebalanceMergedBranchRewards(graph, stage2);
  diversifyStageRoutes(graph, stage1); diversifyStageRoutes(graph, stage2);
  rebalanceWholeStageRoutes(graph, stage1); rebalanceWholeStageRoutes(graph, stage2);
  optimizeMergedPartitionSlots(graph, stage1); optimizeMergedPartitionSlots(graph, stage2);
  repairDominatedRoutes(graph, stage1); repairDominatedRoutes(graph, stage2);
  maximizeStageSpecialVariety(graph, stage1); maximizeStageSpecialVariety(graph, stage2);
  return { graph, stages: [stage1, stage2] };
}

export const PROTOTYPE_RUNTIME_SECONDS = {
  combat: 47, trap: 54, elite: 60, treasure: 20, altar: 20,
  stageBoss: 78, finalBoss: 90, postCombatChoice: 9, portalSelection: 3, roomTransition: 1,
} as const;

export function prototypeAverageRouteMix(graph, stages) {
  const combatKinds = new Set(['combat', 'trap', 'elite', 'boss']);
  let combat = 0; let nonCombat = 0; let runtimeSeconds = 0; let roomCount = 0;
  for (const stage of stages) {
    const paths = enumeratePrototypeStagePaths(graph, stage.start.id, stage.boss.id);
    if (paths.length === 0) continue;
    const totals = paths.reduce((sum, path) => {
      const pathCombatCount = path.filter(node => combatKinds.has(node.kind)).length;
      sum.combat += pathCombatCount;
      sum.nonCombat += path.filter(node => node.kind === 'treasure' || node.kind === 'altar').length;
      sum.rooms += path.length;
      sum.runtimeSeconds += path.reduce((pathTotal, node) => pathTotal + (node.kind === 'boss'
        ? (node.stage === 1 ? PROTOTYPE_RUNTIME_SECONDS.stageBoss : PROTOTYPE_RUNTIME_SECONDS.finalBoss)
        : PROTOTYPE_RUNTIME_SECONDS[node.kind]), 0) + pathCombatCount * PROTOTYPE_RUNTIME_SECONDS.postCombatChoice;
      return sum;
    }, { combat: 0, nonCombat: 0, rooms: 0, runtimeSeconds: 0 });
    combat += totals.combat / paths.length; nonCombat += totals.nonCombat / paths.length;
    roomCount += totals.rooms / paths.length; runtimeSeconds += totals.runtimeSeconds / paths.length;
  }
  const transitionCount = Math.max(0, roomCount - 1);
  runtimeSeconds += transitionCount * (PROTOTYPE_RUNTIME_SECONDS.portalSelection + PROTOTYPE_RUNTIME_SECONDS.roomTransition);
  return { combat, nonCombat, runtimeSeconds, ratio: nonCombat > 0 ? combat / nonCombat : Infinity };
}

export const __prototypeTesting = {
  roomRisk, roomReward, pathLengths, hasAcceptableRouteBalance,
};
