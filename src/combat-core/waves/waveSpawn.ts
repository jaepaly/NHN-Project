export interface SpawnBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface WaveSpawnRequest {
  playerX: number;
  playerY: number;
  count: number;
  minDistance: number;
  maxDistance: number;
  bounds: SpawnBounds;
  seed: number;
  minimumSeparation?: number;
  isAllowed?: (point: WaveSpawnPoint) => boolean;
}

export interface WaveSpawnPoint {
  x: number;
  y: number;
}

const ANGLE_JITTER_RATIO = 0.34;
const CANDIDATE_ATTEMPTS = 28;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function randomFromSeed(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
  };
}

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function waveSpawnSeed(
  mapSeed: number,
  encounterId: string,
  waveNumber: number,
): number {
  return (
    (mapSeed >>> 0)
    ^ hashText(encounterId)
    ^ Math.imul(Math.max(1, waveNumber), 0x9e3779b1)
  ) >>> 0;
}

function insideBounds(point: WaveSpawnPoint, bounds: SpawnBounds): boolean {
  return point.x >= bounds.left
    && point.x <= bounds.right
    && point.y >= bounds.top
    && point.y <= bounds.bottom;
}

function separated(
  point: WaveSpawnPoint,
  placed: readonly WaveSpawnPoint[],
  minimumSeparation: number,
): boolean {
  const separationSq = minimumSeparation * minimumSeparation;
  return placed.every((other) => {
    const dx = point.x - other.x;
    const dy = point.y - other.y;
    return dx * dx + dy * dy >= separationSq;
  });
}

/**
 * 플레이어 주변 띠 영역에 웨이브를 배치한다.
 *
 * 첫 후보는 적 수만큼 나눈 각도 구역 안에서 흔들어 완전한 원형 배열을 피한다.
 * 경계 밖이면 단순 clamp로 최소 거리를 깨지 않고, 결정론적인 다른 각도·거리 후보를
 * 찾는다. 같은 맵·방·웨이브·플레이어 위치에는 같은 결과가 나온다.
 */
export function waveSpawnPositions(request: WaveSpawnRequest): WaveSpawnPoint[] {
  const count = Math.max(0, Math.floor(request.count));
  if (count === 0) return [];
  const minDistance = Math.max(0, Math.min(request.minDistance, request.maxDistance));
  const maxDistance = Math.max(minDistance, request.maxDistance);
  const minimumSeparation = Math.max(0, request.minimumSeparation ?? 70);
  const random = randomFromSeed(request.seed);
  const sector = Math.PI * 2 / count;
  const phase = random() * Math.PI * 2;
  const points: WaveSpawnPoint[] = [];

  for (let index = 0; index < count; index += 1) {
    const sectorCenter = phase + sector * index;
    let best: WaveSpawnPoint | null = null;
    for (let attempt = 0; attempt < CANDIDATE_ATTEMPTS; attempt += 1) {
      const preferredAttempt = attempt < 8;
      const angle = preferredAttempt
        ? sectorCenter + (random() * 2 - 1) * sector * ANGLE_JITTER_RATIO
        : sectorCenter + GOLDEN_ANGLE * (attempt - 7) + (random() - 0.5) * 0.12;
      const distance = minDistance + random() * (maxDistance - minDistance);
      const candidate = {
        x: request.playerX + Math.cos(angle) * distance,
        y: request.playerY + Math.sin(angle) * distance,
      };
      if (!insideBounds(candidate, request.bounds)) continue;
      if (request.isAllowed && !request.isAllowed(candidate)) continue;
      best = candidate;
      if (separated(candidate, points, minimumSeparation)) break;
    }

    if (!best) {
      // 유효 띠가 극단적으로 좁은 잘못된 입력에서도 월드 밖 스폰은 만들지 않는다.
      best = {
        x: Math.max(request.bounds.left, Math.min(request.bounds.right, request.playerX)),
        y: Math.max(request.bounds.top, Math.min(request.bounds.bottom, request.playerY)),
      };
    }
    points.push(best);
  }
  return points;
}
