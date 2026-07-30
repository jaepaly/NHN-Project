import type { FloorHazardKind } from '../combat-core/combat/floorHazardConfig';
import { FLOOR_HAZARD_CONFIG } from '../combat-core/combat/floorHazardConfig';
import type { FloorHazardPlayerState } from '../combat-core/combat/floorHazardState';
import { floorHazardCleansesRemaining } from '../combat-core/combat/floorHazardState';

/**
 * 위험지대 정화 안내 (총괄 지적: 정화 잔여가 화면에 없다).
 *
 * `floorHazardCleansesRemaining`은 주석에 *"HUD·안내 문구 분기에 쓴다"*라고 적힌 채로
 * **어디서도 호출되지 않았다**(#239/#260에서 상태·정화 기전은 다 붙었는데 표시만 빠졌다).
 * 그래서 플레이어는 정화라는 게 있는지도, 몇 번 남았는지도 알 수 없었다.
 *
 * ## 무엇을 보여줄 것인가
 *
 * `cleansesPerRoom`이 **1**이라 "아껴 쓸까"가 아니라 **"언제 쓸까"**가 결정이다.
 * 그러면 잔여 횟수만 적는 건 정보가 부족하다 — 정작 필요한 건 **무엇으로 정화되는가**다.
 * 카운터는 `spellCountersHazard`가 원소 또는 effect로 판정하므로
 * (용암 ← 물·얼음·보호막 / 독 ← 빛·회복), 그 목록을 그대로 읽어 문구를 만든다.
 * 설정을 읽어 만들기 때문에 상성 표를 바꾸면 문구가 자동으로 따라온다.
 *
 * ## 왜 우측 패널인가
 *
 * HUD 박스는 높이가 고정이고 친화 바·쿨다운 바가 `HUD.y + HUD.height` 기준으로 붙어
 * 있어, 행을 늘리면 그것들이 전부 밀린다 — 총괄이 제보했던 "숫자랑 바랑 겹침"과 같은
 * 부류의 사고다. 우측 패널은 이미 **방 단위 정보**(ROOM·보스 저항·웨이브)를 담고
 * 내용에 맞춰 늘어나며 미니맵이 따라 내려온다. 방 단위 자원인 정화는 거기가 맞다.
 *
 * ⚠️ **위험지대가 있는 방에서만** 나온다. HUD 컴팩트(총괄 요청)를 되돌리지 않는다.
 */

const KIND_LABEL: Record<FloorHazardKind, string> = {
  lava: '용암',
  poison: '독지대',
};

const ELEMENT_LABEL: Record<string, string> = {
  fire: '불', water: '물', lightning: '번개', ice: '얼음',
  earth: '대지', wind: '바람', light: '빛', dark: '어둠',
};

const EFFECT_LABEL: Record<string, string> = {
  shield: '보호막', heal: '회복', buff: '강화',
  damage: '공격', control: '제어', summon: '소환',
};

/** 그 지형을 정화하는 수단 목록 — 원소와 effect를 한 줄로 (설정에서 읽는다) */
export function cleanseHintFor(kind: FloorHazardKind): string {
  const hazard = FLOOR_HAZARD_CONFIG[kind];
  const means = [
    ...hazard.counterElements.map((element) => ELEMENT_LABEL[element] ?? element),
    ...hazard.counterEffects.map((effect) => EFFECT_LABEL[effect] ?? effect),
  ];
  return means.join('·');
}

/**
 * 우측 패널에 붙일 정화 줄. 지형이 없으면 **null** — 없는 방에 줄을 만들지 않는다.
 *
 * 남았으면 무엇으로 정화되는지, 썼으면 그 사실을 알린다. 면역이 도는 중이면 그게
 * 최우선 정보다 — 지금 밟아도 안 아프다는 뜻이라 행동이 달라진다.
 */
export function cleanseReadoutLine(
  state: FloorHazardPlayerState,
  presentKinds: readonly FloorHazardKind[],
): string | null {
  if (presentKinds.length === 0) return null;

  const immune = presentKinds.filter((kind) => state.immunity[kind] > 0);
  if (immune.length > 0) {
    const seconds = Math.max(...immune.map((kind) => state.immunity[kind]));
    return `정화됨 — ${immune.map((kind) => KIND_LABEL[kind]).join('·')} 면역 ${seconds.toFixed(1)}s`;
  }

  const remaining = floorHazardCleansesRemaining(state);
  if (remaining <= 0) return '정화 소진 — 이 방에서는 더 못 쓴다';

  // 방에 실제로 깔린 지형의 카운터만 적는다 — 없는 지형의 상성을 적으면 소음이다
  const hints = presentKinds.map((kind) => `${KIND_LABEL[kind]}←${cleanseHintFor(kind)}`);
  return `정화 ${remaining}회 · ${hints.join('  ')}`;
}
