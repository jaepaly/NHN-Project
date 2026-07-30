import type { RewardOption } from '../../run/runContract';
import { drawRewardOptions } from './rewardConfig';
import { rewardOptionCount, rewardScaleFor } from './roomRewardScale';

/**
 * 보물방 보상 (#214) — 싸우지 않고 얻는다.
 *
 * ⚠️ **수치를 여기서 갖지 않는다.** 종전엔 `TREASURE_CONFIG`가 깊이별로 2~3택 ·
 * 1.3~1.6배를 자체 결정했고, 포탈 힌트는 `ROOM_REWARD_SCALES`를 읽었다. **표가 둘로
 * 갈려 서로 다른 값을 말하고 있었다** — 힌트는 "2택"인데 깊이 0.5 이상이면 실제로는
 * 3택 ×1.6이 나오는 구조였다. #266에서 고친 "포탈이 거짓말한다"와 같은 종류의 결함이,
 * 이번엔 데이터 중복으로 재발할 준비를 하고 있었다.
 *
 * 게다가 그 ×1.6 등급은 **현재 프리셋에서 도달 불가**였다: 보물 노드는 `s1-treasure`
 * 하나뿐이고 방 2(깊이 0.25)라 항상 저층 등급이었다. 밸런스 논의가 굴러가지도 않는
 * 숫자를 놓고 벌어질 상황이었으므로 깊이 분기 자체를 걷어낸다.
 *
 * 이제 배율·선택지 수는 `roomRewardScale`이 유일하게 정한다. 깊이별 강화가 필요해지면
 * 그 표에서 하고, 포탈 힌트가 자동으로 따라온다.
 */
export function drawTreasureReward(
  roomIndex: number,
  _maxRooms: number,
  rand: () => number,
): readonly RewardOption[] {
  return drawRewardOptions(roomIndex, rand, rewardScaleFor('treasure').scale)
    .slice(0, rewardOptionCount('treasure'))
    .map((option) => ({ ...option, id: `treasure-${option.id}` }));
}
