import type { EngravedSpellSnapshot } from '../combat-core/engrave/engraveManager';
import type { SpiritSnapshot } from '../combat-core/spirit/spiritManager';
import type { SpellElement, SpellForm } from '../spell/types';
import type { AwakeningKind, AwakeningState } from '../combat-core/run/awakening';

/**
 * 빌드 칩 뷰모델 (순수) — 우하단 빌드 패널을 텍스트 2줄에서 2×2 아이콘 그리드로
 * 바꾸기 위한 데이터 변환. 렌더러(Phaser)는 이 결과를 그리기만 한다.
 *
 * 설계 근거 — 슬롯이 각인 2 + 정령 2로 **하드 고정**(maxSlots)이라는 게 지렛대다.
 * 뱀서(6+6)·RoR2(무제한)가 그리드·개수배지·툴팁을 쓴 건 N이 크고 가변이라서고,
 * N=4면 그 장치는 비용만 남는다. 대신 **4칸을 크게** 그릴 수 있다:
 * 2×2 칩(30px)은 65×65px로 기존 텍스트 2줄(229×27)보다 면적이 작으면서
 * 글리프는 11px→17px로 커진다 — 면적과 가독성을 동시에 이기는 유일한 교환.
 *
 * 인코딩 채널(텍스트 0글자):
 *  - 칩 형태: 사각=각인, 원형=정령   - 채움색: 원소색   - 글리프: 폼
 *  - 테두리: 금테=진화·융합          - 하단 3핍: 레벨   - 테두리 호: 다음 자동 시전
 *
 * 빈 슬롯도 자리를 지킨다 — "채울 수 있는 자리가 있다"는 정보 자체가 보상 선택의
 * 근거이고(기존 `0/2` 표기의 의도), 위치가 곧 정체성이 되려면 칸이 흔들리면 안 된다.
 */

export const BUILD_CHIP_CONFIG = {
  /** 슬롯 기하 — 각인 윗줄, 정령 아랫줄 (행이 곧 종류) */
  engraveSlots: 2,
  spiritSlots: 2,
} as const;

export type BuildChipKind = 'engrave' | 'spirit';

export interface BuildChip {
  kind: BuildChipKind;
  /** 행 안의 자리 (0-based) — 위치가 정체성이므로 비어도 유지된다 */
  slot: number;
  filled: boolean;
  /** 표시 이름 — 칩에는 안 그리고 ESC 검사 툴팁에서만 쓴다 */
  name: string;
  element: SpellElement | null;
  /** 이중 원소(융합 정령·부속성) — 칩 투톤용 */
  elementSecondary: SpellElement | null;
  /** 실제 주문 폼. 정령은 폼이라는 개념이 없어 null */
  form: SpellForm | null;
  /**
   * 칩에 그릴 글리프 — 각인은 자기 폼, 정령은 역할별 대표 글리프(SPIRIT_GLYPH).
   * 빈 칸은 null(글리프 없이 점선 테두리만). 도감·보상 카드와 같은 어휘를 쓴다.
   */
  glyph: SpellForm | null;
  level: number;
  /** 진화 각인·융합 정령 — 금테 */
  evolved: boolean;
  /**
   * 이 칩 원소의 각성 (없으면 null). 진화(금테)와 **다른 축**이라 표식도 달라야 한다 —
   * 진화는 그 각인 한 개의 격상이고, 각성은 그 **원소 전체**에 걸린다.
   */
  awakening: AwakeningKind | null;
  /** 다음 자동 시전까지 남은 비율 0~1 (1=방금 쐈다, 0=지금 나간다). 빈 칸은 0 */
  cooldownRatio: number;
  /** 툴팁 상세 줄 — 이름 아래에 붙는다 */
  detail: string[];
}

/** 남은 시간 → 0~1. interval이 0 이하면(즉발·미정의) 0으로 본다. */
export function cooldownRatio(remainingSeconds: number, intervalSeconds: number): number {
  const interval = Number.isFinite(intervalSeconds) ? intervalSeconds : 0;
  if (interval <= 0) return 0;
  const remaining = Number.isFinite(remainingSeconds) ? Math.max(0, remainingSeconds) : 0;
  return Math.min(1, remaining / interval);
}

const ROLE_LABELS: Record<SpiritSnapshot['role'], string> = {
  attack: '공격', heal: '치유', guard: '수호',
};

/**
 * 정령 역할 → 대표 글리프. 정령엔 폼이 없지만 칩은 형태로 읽혀야 하므로,
 * 기존 폼 글리프에서 의미가 맞는 것을 빌려 쓴다 (새 아이콘을 만들지 않는다):
 * 공격=소환수, 치유=상승 화살(버프), 수호=벽.
 */
export const SPIRIT_GLYPH: Record<SpiritSnapshot['role'], SpellForm> = {
  attack: 'summon', heal: 'buff', guard: 'wall',
};

/**
 * 역할별 대표 원소 폴백 — 치유·수호 정령은 element가 없어 칩 색이 빈다.
 * 월드 오브(ProtoScene)가 이미 쓰는 매핑과 같은 값이라 새 규칙이 아니다.
 */
export function spiritFallbackElement(role: SpiritSnapshot['role']): SpellElement {
  return role === 'heal' ? 'light' : 'earth';
}

function emptyChip(kind: BuildChipKind, slot: number): BuildChip {
  return {
    kind,
    slot,
    filled: false,
    name: kind === 'engrave' ? '빈 각인 슬롯' : '빈 정령 슬롯',
    element: null,
    elementSecondary: null,
    form: null,
    glyph: null,
    level: 0,
    evolved: false,
    awakening: null,
    cooldownRatio: 0,
    detail: [kind === 'engrave'
      ? '수동으로 외운 주문을 보상에서 각인할 수 있다'
      : '보상에서 정령을 얻을 수 있다'],
  };
}

function engraveChip(
  entry: EngravedSpellSnapshot, slot: number, awakenings: AwakeningState,
): BuildChip {
  const spell = entry.spell;
  const detail = [
    `위력 ${spell.power} · ${entry.shotCount}발`,
    `${entry.intervalSeconds.toFixed(1)}초마다 자동 시전`,
  ];
  if (entry.evolved) detail.push('진화 — 격상된 각인');
  return {
    kind: 'engrave',
    slot,
    filled: true,
    name: spell.name,
    element: spell.element_primary,
    elementSecondary: spell.element_secondary ?? null,
    form: spell.form,
    glyph: spell.form,
    level: entry.level,
    evolved: entry.evolved,
    awakening: awakenings[spell.element_primary] ?? null,
    cooldownRatio: cooldownRatio(entry.remainingSeconds, entry.intervalSeconds),
    detail,
  };
}

function spiritChip(
  entry: SpiritSnapshot, slot: number, awakenings: AwakeningState,
): BuildChip {
  const roleLabel = ROLE_LABELS[entry.role];
  const element = entry.element ?? spiritFallbackElement(entry.role);
  const detail = [`${roleLabel} 정령 · ${entry.intervalSeconds.toFixed(1)}초마다 발동`];
  if (entry.fused) detail.push('융합 — 두 정령이 하나로');
  return {
    kind: 'spirit',
    slot,
    filled: true,
    name: entry.fusedName ?? `${roleLabel} 정령`,
    element,
    elementSecondary: entry.elementSecondary ?? null,
    form: null,
    glyph: SPIRIT_GLYPH[entry.role],
    level: entry.level,
    evolved: entry.fused,
    awakening: element ? awakenings[element] ?? null : null,
    cooldownRatio: cooldownRatio(entry.remainingSeconds, entry.intervalSeconds),
    detail,
  };
}

/**
 * 스냅샷 → 칩 4개 (항상 정확히 engraveSlots + spiritSlots개, 순서 고정).
 * 슬롯 수를 넘는 항목은 버린다 — 칸이 늘면 위치=정체성이 깨진다.
 */
export function buildChipModel(
  engraves: readonly EngravedSpellSnapshot[],
  spirits: readonly SpiritSnapshot[],
  awakenings: AwakeningState = {},
): BuildChip[] {
  const chips: BuildChip[] = [];
  for (let slot = 0; slot < BUILD_CHIP_CONFIG.engraveSlots; slot += 1) {
    const entry = engraves[slot];
    chips.push(entry ? engraveChip(entry, slot, awakenings) : emptyChip('engrave', slot));
  }
  for (let slot = 0; slot < BUILD_CHIP_CONFIG.spiritSlots; slot += 1) {
    const entry = spirits[slot];
    chips.push(entry ? spiritChip(entry, slot, awakenings) : emptyChip('spirit', slot));
  }
  return chips;
}
