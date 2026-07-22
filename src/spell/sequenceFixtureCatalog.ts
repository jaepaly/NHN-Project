import type {
  BehaviorTuning,
  FormBehavior,
  SpellPlan,
} from './sequencePlan';
import type {
  SpellEffect,
  SpellElement,
  SpellForm,
  SpellSpec,
  SpellStatus,
  SpellTarget,
} from './types';

/**
 * Executable R1→R2 sequence examples.
 *
 * These are not expected LLM outputs verbatim. They document the semantic
 * range the future schema must be able to express, while remaining runnable
 * through the local prototype. Enter `input` as an incantation in DEV mode or
 * use `#seq <key>`.
 */
export interface SequenceFixtureDefinition {
  key: string;
  input: string;
  intent: string;
  schemaFocus: readonly string[];
  plan: SpellPlan;
}

function spell(
  name: string,
  form: SpellForm,
  element: SpellElement,
  effect: SpellEffect = 'damage',
  target: SpellTarget = 'enemy',
  status: SpellStatus[] = [],
  secondary: SpellElement | null = null,
): SpellSpec {
  return {
    name,
    effect,
    target,
    element_primary: element,
    element_secondary: secondary,
    form,
    size: 'medium',
    speed: 'normal',
    status,
    power: 0,
    cost: 0,
  };
}

function form(
  spec: SpellSpec,
  powerWeight = 1,
  tuning?: BehaviorTuning,
): FormBehavior {
  return { type: 'form', spec, powerWeight, tuning };
}

export const SEQUENCE_FIXTURE_CATALOG: readonly SequenceFixtureDefinition[] = [
  {
    key: 'silent-flash',
    input: '적막을 가르는 섬광',
    intent: '적에게 접근하며 관통한 뒤 반대편으로 빠져나오는 일격 이탈형 영창.',
    schemaFocus: ['parallel move+form', 'target-direction', 'away-from-target', 'lock-on'],
    plan: {
      name: '적막을 가르는 섬광', power: 84, durationMs: 2300,
      sequences: [
        { durationWeight: 2, behaviors: [
          { type: 'move', destination: 'target-direction', element: 'light', distance: 190 },
          form(spell('접근 섬광', 'beam', 'light'), 2, { range: 3, damage: 2 }),
        ] },
        { durationWeight: 1, behaviors: [{ type: 'wait' }] },
        { durationWeight: 1, behaviors: [
          { type: 'move', destination: 'away-from-target', element: 'light', distance: 170 },
        ] },
      ],
    },
  },
  {
    key: 'fleeing-star',
    input: '도망치는 별',
    intent: '후퇴하면서 견제 사격을 남기고 다른 방향에서 별비를 내리는 원거리 회피 영창.',
    schemaFocus: ['retreat while attacking', 'random-direction', 'persistent rain'],
    plan: {
      name: '도망치는 별', power: 78, durationMs: 2100,
      sequences: [
        { durationWeight: 2, behaviors: [
          { type: 'move', destination: 'away-from-target', element: 'light', distance: 200 },
          form(spell('후퇴의 별빛', 'bolt', 'light'), 1),
        ] },
        { durationWeight: 1, behaviors: [
          { type: 'move', destination: 'random-direction', element: 'light', distance: 130 },
        ] },
        { durationWeight: 2, behaviors: [
          form(spell('도주로의 별비', 'rain', 'light'), 3, { radius: 3, damage: 2 }),
        ] },
      ],
    },
  },
  {
    key: 'waking-volcano',
    input: '화산맥의 기상',
    intent: '대지로 전장을 가른 뒤 불비와 폭발로 지형 전체를 압박하는 복합 원소 영창.',
    schemaFocus: ['multi-element plan', 'wall persistence', 'rain persistence', 'nova finisher'],
    plan: {
      name: '화산맥의 기상', power: 96, durationMs: 2900,
      sequences: [
        { durationWeight: 2, behaviors: [
          form(spell('솟아오른 화산맥', 'wall', 'earth', 'control', 'area', ['knockback']), 2,
            { range: 3, duration: 2, strength: 1 }),
          form(spell('화산재의 비', 'rain', 'fire'), 2, { radius: 3, damage: 2 }),
        ] },
        { durationWeight: 1, behaviors: [{ type: 'wait' }] },
        { durationWeight: 2, behaviors: [
          form(spell('분화', 'nova', 'fire'), 3, { radius: 3, damage: 3 }),
        ] },
      ],
    },
  },
  {
    key: 'frost-mirror',
    input: '서리 거울',
    intent: '보호막으로 공격을 받아낸 뒤 공격자를 얼리고 반사광으로 마무리하는 대응형 영창.',
    schemaFocus: ['shield', 'control', 'sequential defensive counterattack'],
    plan: {
      name: '서리 거울', power: 82, durationMs: 2200,
      sequences: [
        { durationWeight: 1, behaviors: [
          form(spell('얼음 거울', 'buff', 'ice', 'shield', 'self'), 1,
            { amount: 3, duration: 1 }),
        ] },
        { durationWeight: 2, behaviors: [
          form(spell('거울 속 감옥', 'cage', 'ice', 'control', 'enemy', ['freeze']), 2,
            { duration: 3, strength: 2 }),
        ] },
        { durationWeight: 1, behaviors: [
          form(spell('굴절된 서광', 'beam', 'light'), 2, { range: 3, damage: 2 }),
        ] },
      ],
    },
  },
  {
    key: 'breaking-current',
    input: '사슬을 끊는 파도',
    intent: '적을 밀어내 공간을 만든 뒤 후퇴하고 회복하는 생존 중심 영창.',
    schemaFocus: ['control wave', 'away-from-target', 'self heal', 'non-damage payoff'],
    plan: {
      name: '사슬을 끊는 파도', power: 74, durationMs: 2000,
      sequences: [
        { durationWeight: 2, behaviors: [
          form(spell('해방의 파도', 'wave', 'water', 'control', 'area', ['knockback']), 2,
            { range: 3, strength: 3 }),
        ] },
        { durationWeight: 1, behaviors: [
          { type: 'move', destination: 'away-from-target', element: 'water', distance: 180 },
        ] },
        { durationWeight: 1, behaviors: [
          form(spell('고요한 숨', 'buff', 'water', 'heal', 'self'), 1,
            { amount: 3, duration: 1 }),
        ] },
      ],
    },
  },
  {
    key: 'thunderbird-flight',
    input: '천둥새의 비행',
    intent: '임의의 적에게 번개처럼 날아들어 연쇄 공격 후 방향을 틀어 빠지는 고속 영창.',
    schemaFocus: ['random-enemy', 'chain', 'random-direction', 'multiple moves'],
    plan: {
      name: '천둥새의 비행', power: 88, durationMs: 2600,
      sequences: [
        { durationWeight: 1, behaviors: [
          { type: 'move', destination: 'random-enemy', element: 'lightning', distance: 200 },
        ] },
        { durationWeight: 2, behaviors: [
          form(spell('천둥새의 발톱', 'chain', 'lightning', 'damage', 'enemy', ['shock']), 3,
            { range: 3, damage: 2 }),
        ] },
        { durationWeight: 1, behaviors: [
          { type: 'move', destination: 'random-direction', element: 'lightning', distance: 170 },
          form(spell('꼬리 번개', 'bolt', 'lightning'), 1),
        ] },
      ],
    },
  },
  {
    key: 'typhoon-corridor',
    input: '태풍의 회랑',
    intent: '좌우로 궤적을 그리며 벽과 회전체로 적의 진로를 재구성하는 공간 제어 영창.',
    schemaFocus: ['custom-vector', 'wall+orbit persistence', 'parallel movement'],
    plan: {
      name: '태풍의 회랑', power: 86, durationMs: 2500,
      sequences: [
        { durationWeight: 2, behaviors: [
          { type: 'move', destination: 'custom-vector', element: 'wind', distance: 150, angle: -70 },
          form(spell('왼바람의 벽', 'wall', 'wind', 'control', 'area', ['knockback']), 2),
        ] },
        { durationWeight: 2, behaviors: [
          { type: 'move', destination: 'custom-vector', element: 'wind', distance: 170, angle: 110 },
          form(spell('회랑의 회오리', 'orbit', 'wind'), 3),
        ] },
      ],
    },
  },
  {
    key: 'shadow-stitching',
    input: '그림자 바느질',
    intent: '첫 타격으로 대상을 꿰고 감금한 뒤 주변 적까지 어둠의 실로 잇는 추적 영창.',
    schemaFocus: ['first-hit lock', 'cage', 'chain retarget'],
    plan: {
      name: '그림자 바느질', power: 80, durationMs: 2200,
      sequences: [
        { durationWeight: 1, behaviors: [form(spell('첫 땀', 'bolt', 'dark'), 1)] },
        { durationWeight: 1, behaviors: [
          form(spell('매듭', 'cage', 'dark', 'control', 'enemy', ['slow']), 2),
        ] },
        { durationWeight: 2, behaviors: [
          form(spell('이어진 그림자', 'chain', 'dark'), 3, { range: 3, damage: 2 }),
        ] },
      ],
    },
  },
  {
    key: 'white-night-sanctuary',
    input: '백야의 성역',
    intent: '중앙을 선점하고 회복·보호·지속 피해를 한 장소에 겹치는 거점형 영창.',
    schemaFocus: ['arena-center', 'heal+shield parallel', 'persistent zone'],
    plan: {
      name: '백야의 성역', power: 90, durationMs: 2700,
      sequences: [
        { durationWeight: 1, behaviors: [{ type: 'move', destination: 'arena-center', element: 'light', distance: 0 }] },
        { durationWeight: 2, behaviors: [
          form(spell('백야의 치유', 'buff', 'light', 'heal', 'self'), 1, { amount: 3 }),
          form(spell('성역의 가호', 'buff', 'earth', 'shield', 'self'), 1, { amount: 3 }),
        ] },
        { durationWeight: 2, behaviors: [
          form(spell('백야의 경계', 'zone', 'light'), 3, { radius: 3, duration: 2, damage: 1 }),
        ] },
      ],
    },
  },
  {
    key: 'hourglass-guardian',
    input: '모래시계의 수호',
    intent: '방어를 먼저 얻고 잠시 버틴 후 벽을 세워 시간을 벌며 다시 보호하는 지연 영창.',
    schemaFocus: ['repeated form across sequences', 'wait timing', 'defensive choreography'],
    plan: {
      name: '모래시계의 수호', power: 78, durationMs: 2300,
      sequences: [
        { durationWeight: 1, behaviors: [
          form(spell('첫 모래층', 'buff', 'earth', 'shield', 'self'), 1, { amount: 2 }),
        ] },
        { durationWeight: 1, behaviors: [{ type: 'wait' }] },
        { durationWeight: 2, behaviors: [
          form(spell('멈춰 선 모래벽', 'wall', 'earth', 'control', 'area', ['slow']), 2),
        ] },
        { durationWeight: 1, behaviors: [
          form(spell('마지막 모래층', 'buff', 'earth', 'shield', 'self'), 1, { amount: 3 }),
        ] },
      ],
    },
  },
  {
    key: 'instant-crossing',
    input: '찰나의 전이',
    intent: '시간을 소비하지 않는 이동과 폭발을 같은 순간에 실행하는 순간 행동 영창.',
    schemaFocus: ['zero total duration', 'teleport semantics', 'parallel instant form'],
    plan: {
      name: '찰나의 전이', power: 70, durationMs: 0,
      sequences: [{ durationWeight: 1, behaviors: [
        { type: 'move', destination: 'cast-point', element: 'lightning', distance: 0 },
        form(spell('전이 충격', 'nova', 'lightning'), 2, { radius: 2, damage: 2 }),
      ] }],
    },
  },
  {
    key: 'fourfold-barrage',
    input: '사방의 포화',
    intent: '하나의 시퀀스에서 허용 최대치인 다섯 behavior를 동시에 펼치는 포화 영창.',
    schemaFocus: ['five parallel behaviors', 'parallel form cap', 'many elements at one timestamp'],
    plan: {
      name: '사방의 포화', power: 100, durationMs: 1800,
      sequences: [{ durationWeight: 1, behaviors: [
        form(spell('화염탄', 'bolt', 'fire'), 1),
        form(spell('빙결광', 'beam', 'ice'), 1),
        form(spell('폭풍파', 'wave', 'wind'), 1),
        form(spell('해일비', 'rain', 'water'), 1),
        form(spell('대지벽', 'wall', 'earth', 'control', 'area', ['knockback']), 1),
      ] }],
    },
  },
  {
    key: 'against-meteor-rain',
    input: '유성우를 거슬러',
    intent: '후퇴하며 유성우를 깔고 곧바로 적진에 재진입해 폭발하는 역방향 전개 영창.',
    schemaFocus: ['away then approach', 'rain remains after sequence', 'nova re-entry'],
    plan: {
      name: '유성우를 거슬러', power: 92, durationMs: 2750,
      sequences: [
        { durationWeight: 2, behaviors: [
          { type: 'move', destination: 'away-from-target', element: 'fire', distance: 210 },
          form(spell('후퇴의 유성우', 'rain', 'fire'), 2),
        ] },
        { durationWeight: 1, behaviors: [{ type: 'wait' }] },
        { durationWeight: 2, behaviors: [
          { type: 'move', destination: 'target-direction', element: 'fire', distance: 230 },
          form(spell('역행 충돌', 'nova', 'fire'), 3, { radius: 3, damage: 2 }),
        ] },
      ],
    },
  },
  {
    key: 'frozen-chase',
    input: '얼어붙은 추격전',
    intent: '표적을 얼리며 접근하고 감금한 다음 다시 거리를 벌리는 단일 대상 추격 영창.',
    schemaFocus: ['random-enemy', 'freeze', 'away-from-target', 'lock survives movement'],
    plan: {
      name: '얼어붙은 추격전', power: 83, durationMs: 2350,
      sequences: [
        { durationWeight: 1, behaviors: [form(spell('서리 표식', 'bolt', 'ice'), 1)] },
        { durationWeight: 1, behaviors: [{ type: 'move', destination: 'random-enemy', element: 'ice', distance: 170 }] },
        { durationWeight: 1, behaviors: [
          form(spell('추격의 감옥', 'cage', 'ice', 'control', 'enemy', ['freeze']), 2),
        ] },
        { durationWeight: 1, behaviors: [{ type: 'move', destination: 'away-from-target', element: 'ice', distance: 160 }] },
      ],
    },
  },
  {
    key: 'sleeping-dragon-mountain',
    input: '용이 잠든 산',
    intent: '정적 뒤에 대지의 권속을 깨우고 화염 폭발로 잠을 끝내는 추상 서사 영창.',
    schemaFocus: ['abstract prompt decomposition', 'wait-first', 'summon then cross-element finisher'],
    plan: {
      name: '용이 잠든 산', power: 91, durationMs: 2800,
      sequences: [
        { durationWeight: 1, behaviors: [{ type: 'wait' }] },
        { durationWeight: 2, behaviors: [
          form(spell('깨어나는 산의 용', 'summon', 'earth', 'summon', 'area'), 2),
        ] },
        { durationWeight: 2, behaviors: [
          form(spell('용의 첫 숨', 'wave', 'fire'), 2),
          form(spell('깨어진 봉우리', 'nova', 'earth'), 2),
        ] },
      ],
    },
  },
  {
    key: 'two-heartbeats',
    input: '심장이 두 번 뛰는 동안',
    intent: '두 번의 명확한 박자 사이에 서로 다른 형태의 충격을 배치하는 시간 은유 영창.',
    schemaFocus: ['abstract time ratio', 'wait-only sequence', 'repeated dramatic beats'],
    plan: {
      name: '심장이 두 번 뛰는 동안', power: 86, durationMs: 2400,
      sequences: [
        { durationWeight: 1, behaviors: [{ type: 'wait' }] },
        { durationWeight: 1, behaviors: [
          form(spell('첫 번째 고동', 'nova', 'fire'), 2, { radius: 2, damage: 2 }),
        ] },
        { durationWeight: 1, behaviors: [{ type: 'wait' }] },
        { durationWeight: 1, behaviors: [
          form(spell('두 번째 고동', 'wave', 'lightning', 'damage', 'area', ['shock']), 3),
        ] },
      ],
    },
  },
  {
    key: 'constellation-seam',
    input: '별자리를 꿰매는 바늘',
    intent: '빛의 첫 점을 기준으로 어둠의 선을 연결해 별자리 형태를 완성하는 창의 영창.',
    schemaFocus: ['creative lock-on', 'light+dark', 'bolt to chain to beam'],
    plan: {
      name: '별자리를 꿰매는 바늘', power: 89, durationMs: 2650,
      sequences: [
        { durationWeight: 1, behaviors: [form(spell('첫 번째 별', 'bolt', 'light'), 1)] },
        { durationWeight: 2, behaviors: [
          form(spell('별을 잇는 검은 실', 'chain', 'dark'), 2, { range: 3, damage: 1 }),
        ] },
        { durationWeight: 1, behaviors: [
          form(spell('완성된 별자리', 'beam', 'light'), 3, { range: 3, damage: 2 }),
        ] },
      ],
    },
  },
  {
    key: 'rainbow-spear',
    input: '무지개를 한 자루 창으로',
    intent: '한 behavior 안에 두 원소를 명시하여 복합 원소 표현과 카운터 집계를 보여주는 영창.',
    schemaFocus: ['element_secondary', 'dual-element counter samples', 'single behavior composition'],
    plan: {
      name: '무지개를 한 자루 창으로', power: 81, durationMs: 1600,
      sequences: [{ durationWeight: 1, behaviors: [
        form(spell('극광의 창', 'beam', 'light', 'damage', 'enemy', ['shock'], 'lightning'), 1,
          { range: 3, damage: 3 }),
      ] }],
    },
  },
];

export function catalogSequenceFixture(keyword: string): SpellPlan | null {
  const raw = keyword.trim().toLowerCase();
  const key = raw.replace(/^#seq\s+/, '');
  const fixture = SEQUENCE_FIXTURE_CATALOG.find((entry) => (
    entry.key === key || entry.input.toLowerCase() === raw
  ));
  return fixture?.plan ?? null;
}
