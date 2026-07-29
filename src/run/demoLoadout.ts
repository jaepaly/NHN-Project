import type { RewardOption } from './runContract';
import type { SpellElement, SpellSpec } from '../spell/types';
import type { EngraveManager } from '../combat-core/engrave/engraveManager';
import type { SpiritManager } from '../combat-core/spirit/spiritManager';

/**
 * 시연 로드아웃 — "각성한 영창가로 시작" (총괄 발안 2026-07-26).
 *
 * **왜 필요한가**: 심사위원이 이 게임을 얼마나 플레이할지 우리는 모른다. 심사 방식·
 * 시연 시간에 대한 정보가 없다. 그런데 우리 자산(진화 각인·정령·친화 격상·연참)은
 * 전부 런을 여러 번 굴려야 나온다. 짧게 만지고 떠나면 **아무것도 못 본다.**
 *
 * 그래서 플레이 시간을 추측해 거기 맞추는 대신, **길이와 무관하게 보이도록** 한다 —
 * 후반 상태로 바로 시작하는 입구를 따로 낸다. 처음부터 하는 경로는 그대로 두고,
 * 이건 "계속하면 이렇게 된다"를 미리 보여주는 두 번째 문이다.
 *
 * ⚠️ 본 게임 밸런스를 건드리지 않는다. 여기 값은 **시연 전용 시작 상태**일 뿐이고,
 * 보상·성장 규칙은 손대지 않는다. 심는 방식도 실제 보상 경로(applyReward)를 그대로
 * 쓴다 — 별도 주입로를 만들면 실제로 도달 가능한 상태와 어긋날 수 있다.
 */

/**
 * 시작 방 — 7번(분기형 맵의 최종 보스 직전 엘리트).
 *
 * 1번 방에서 강하게 시작하면 잡몹을 뭉갤 뿐이라 오히려 얕아 보인다. 힘이 **필요한**
 * 자리에 떨어뜨려야 힘이 느껴진다. 분기형 맵의 마지막 엘리트에서 시작하면 진화 각인이
 * 갈라져 물고 참격이 연참으로 터지는 게 필요해서 터지는 그림이 된다.
 * 그리고 바로 다음이 최종 보스라 짧게 만져도 끝을 본다.
 */
export const DEMO_START_ROOM = 7;

/** 시연 각인 — 둘 다 Lv3까지 올린 뒤 진화시킨다 (원소 본성·3발 분산·연출 격상) */
export interface DemoEngrave {
  key: string;
  spell: SpellSpec;
  /** 진화 시 붙는 격상명 — 시연이라 LLM 호출 없이 고정한다(재현성·할당량 절약) */
  evolvedName: string;
}

const engrave = (
  key: string,
  name: string,
  element: SpellElement,
  form: SpellSpec['form'],
  power: number,
  evolvedName: string,
): DemoEngrave => ({
  key,
  evolvedName,
  spell: {
    name,
    effect: 'damage',
    target: 'enemy',
    element_primary: element,
    element_secondary: null,
    form,
    size: 'medium',
    speed: 'normal',
    status: [],
    power,
    cost: 30,
  },
});

/**
 * 각인 2종. 폼을 일부러 갈랐다 — 참격(근접 즉발)과 연쇄(다중 도약)는 화면에서
 * 완전히 다르게 읽힌다. 같은 폼 둘이면 "각인이 두 개"가 아니라 "하나가 두 번"으로 보인다.
 * wall·orbit은 각인 후보에서 제외되므로(rememberManualCast) 쓰지 않는다.
 */
export const DEMO_ENGRAVES: readonly DemoEngrave[] = [
  engrave('서리 칼날로 벤다', '서리 칼날', 'ice', 'slash', 88, '설한의 참'),
  engrave('번개가 적에서 적으로 연쇄한다', '연쇄 뇌격', 'lightning', 'chain', 84, '뇌명의 사슬'),
];

/** 시연 정령 — 공격 2체를 Lv2까지 (융합 후보가 되어 "다음"도 보인다) */
export const DEMO_SPIRITS: readonly { element: SpellElement; level: number }[] = [
  { element: 'fire', level: 2 },
  { element: 'wind', level: 2 },
];

/**
 * 시연 친화 — 각인 원소에 맞춰 깊게.
 *
 * affinityVfx는 강도 = 친화 / 0.15다. 0.9면 강도 6 → 마스터리 섬광까지 켜지고,
 * 0.45면 강도 3 → 엠버 잔광이 켜진다. 둘을 다르게 준 건 **깊이 차이가 화면에서
 * 구분된다**는 걸 보여주기 위해서다 — 하나만 주면 비교 대상이 없다.
 *
 * ice를 정확히 0.9(각성 이정표 = 마스터리 면역 임계)로 둔 이유: 심사위원이 빙결을
 * 3회 이상 치면 기억 보스가 빙결 내성을 걸어오는데, 그 순간 **"마스터리 관통 —
 * 빙결은 이미 나의 것이다"**가 뜨며 내성이 무효화된다. 보스의 기억 적응과
 * 플레이어의 숙련 보상이 한 장면에서 충돌하는, 이 게임에서 가장 밀도 높은 순간이다.
 */
export const DEMO_AFFINITY: Readonly<Partial<Record<SpellElement, number>>> = {
  ice: 0.9,
  lightning: 0.45,
};

/** 심사위원이 뭘 쳐야 할지 모르면 아무 일도 안 일어난다 — 입구에서 예시를 준다 */
export const DEMO_SAMPLE_INCANTATIONS: readonly string[] = [
  '서리 칼날로 적을 벤다',
  '분신을 만들어서 지그재그로 돌진시켜라',
  '번개가 적에서 적으로 연쇄한다',
];

const engraveCard = (key: string, level: number): RewardOption => ({
  id: `demo-engrave-${key}-${level}`,
  kind: 'engrave',
  title: '시연 각인',
  description: '시연 로드아웃',
  engrave: { spellKey: key, level: level as 1 | 2 | 3 },
});

// 정령 ID는 `attack-<원소>` 규칙 (spiritManager DEFINITIONS) — 정의에 없는 id는 거부된다.
const spiritCard = (element: SpellElement, level: number): RewardOption => ({
  id: `demo-spirit-${element}-${level}`,
  kind: 'spirit',
  element,
  title: '시연 정령',
  description: '시연 로드아웃',
  spirit: { spiritId: `attack-${element}`, role: 'attack', level: level as 1 | 2 | 3 },
});

/**
 * 시연 상태를 심는다. **실제 보상 경로(applyReward)를 그대로 쓴다** — 별도 주입로를
 * 만들면 실제로는 도달 불가능한 상태를 보여주게 되고, 그건 심사위원에게 거짓말이다.
 *
 * 순수 함수가 아니라 매니저를 변형한다. 대신 매니저를 인자로 받아 씬 없이 테스트된다.
 */
export function applyDemoLoadout(
  engraveManager: EngraveManager,
  spiritManager: SpiritManager,
  // 컨트롤러 전체가 아니라 필요한 입구만 받는다 — 테스트에서 가짜를 넘기기 쉽다.
  affinitySink: { seedAffinity(affinity: Readonly<Partial<Record<SpellElement, number>>>): void },
): void {
  for (const entry of DEMO_ENGRAVES) {
    engraveManager.rememberManualCast(entry.key, entry.spell);
    for (const level of [1, 2, 3]) {
      engraveManager.applyReward(engraveCard(entry.key, level));
    }
    engraveManager.evolve(entry.key, entry.evolvedName);
  }
  for (const spirit of DEMO_SPIRITS) {
    for (let level = 1; level <= spirit.level; level += 1) {
      spiritManager.applyReward(spiritCard(spirit.element, level));
    }
  }
  affinitySink.seedAffinity(DEMO_AFFINITY);
}

/**
 * 타이틀 → 전투 씬으로 "시연으로 시작"을 전달하는 1회성 플래그.
 *
 * 왜 씬 데이터가 아니라 모듈 변수인가: ProtoScene은 CombatRunController를 **필드
 * 초기화자**로 만든다(부팅 시 1회). init(data)는 그 뒤에 돌아서 생성자 옵션을 못 바꾼다.
 * 반면 이 플래그는 create()에서 읽어 처리하므로 생성 시점과 무관하다.
 * 1회성이라 다음 런(타이틀에서 일반 시작)에 새지 않는다.
 */
let demoRunRequested = false;

export function requestDemoRun(): void {
  demoRunRequested = true;
}

/** 요청을 읽고 **비운다**. 두 번째 create에서 다시 시연으로 시작하면 안 된다. */
export function consumeDemoRunRequest(): boolean {
  const requested = demoRunRequested;
  demoRunRequested = false;
  return requested;
}
