/**
 * 방 설치물 설정 (#214) — 보물상자·제단. Phaser 비의존 순수 상수 (회귀가 직접 import).
 * 렌더·접촉 로직은 src/render/roomFixture.ts.
 *
 * **왜 필요한가** (총괄 지적): 무전투 방(보물·제단)이 들어가는 순간 보상을 띄워서
 * **방이 아니라 팝업**이었다. 다음 방 중앙으로 바로 이동하는 흐름에서도 설치물을
 * 플레이어와 겹치지 않게 두어, 짧게나마 직접 다가가 상호작용하게 한다.
 *
 * 흐름: 중앙 도착 → 오른쪽 설치물로 이동 → 상호작용 → 보상 선택
 *
 * 제단도 같이 바꾼다 — 대가를 치르는 방인데 그냥 뜨면 무게가 없다.
 */

export type RoomFixtureKind = 'treasure' | 'altar';

export const ROOM_FIXTURE_CONFIG = {
  /** 시각 반경 */
  radius: 30,
  /**
   * 플레이어 중앙 진입점에서 오른쪽으로 떨어뜨리는 거리.
   * 안내 반경 안이되 상호작용 반경 밖이라, 보이지만 가만히 있으면 열리지 않는다.
   */
  offsetX: 150,
  /**
   * 상호작용 판정 반경 — 시각보다 넉넉하게 둔다. 포탈은 오입력을 막으려 안쪽으로
   * 좁혔지만(enterRadius < radius), 여긴 반대다: 이 방의 유일한 목적이 상호작용이라
   * "닿았는데 안 열린다"가 더 나쁜 실패다.
   */
  reachRadius: 44,
  /**
   * 등장 후 이 시간 동안은 무시. 시연 로드아웃처럼 스폰 지점이 바뀌는 경로가 있어
   * 겹침·로드 직후 발동을 막는 마지막 안전장치로 남긴다.
   */
  armDelayMs: 400,
  /** 이 거리 안에 들면 안내 문구를 띄운다 — 뭘 해야 할지 모르는 상태를 막는다 */
  hintRadius: 160,
} as const;

export const ROOM_FIXTURE_LABEL: Record<RoomFixtureKind, string> = {
  treasure: '보물상자',
  altar: '제단',
};

/** 방에 들어선 직후 띄우는 안내 — 빈 방에 덜렁 놓이면 뭘 할지 모른다 */
export const ROOM_FIXTURE_GUIDE: Record<RoomFixtureKind, string> = {
  treasure: '오른쪽의 보물상자로 다가가라',
  altar: '오른쪽의 제단으로 다가가라 — 대가는 그때 정한다',
};

/** 상호작용 사거리 안인가 (순수). 좌표가 이상하면 false — 유령 발동을 막는다. */
export function isWithinFixtureReach(
  playerX: number,
  playerY: number,
  fixtureX: number,
  fixtureY: number,
  reachRadius: number = ROOM_FIXTURE_CONFIG.reachRadius,
): boolean {
  const values = [playerX, playerY, fixtureX, fixtureY, reachRadius];
  if (values.some((v) => !Number.isFinite(v))) return false;
  const dx = playerX - fixtureX;
  const dy = playerY - fixtureY;
  const r = Math.max(0, reachRadius);
  return dx * dx + dy * dy <= r * r;
}
