import type { RewardOption } from '../run/runContract';
import { scheduleOverlayActivation } from './overlayActivation';
import {
  UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL, UI_RAINBOW, UI_SEMANTIC, rainbowStops,
} from './uiTokens';
import {
  cornerFlourish, deckleMask, divider, ornamentCss, titleSigil, waxSeal,
} from './grimoireOrnament';
import type { SpellForm } from '../spell/types';
import { ELEMENT_LABELS, ELEMENT_PALETTES, paletteColorToCss } from '../render/palette';
import { glyphSvg } from '../render/formGlyphs';

/**
 * 보상 카드 3택 오버레이 — R3 소유 UI (PHASE_2 R3 P0, 계약: docs/R3_RUN_UI_CONTRACT.md)
 *
 * R1 RunController와의 결합 방식:
 *   controller.on('room-cleared', async (options) => {
 *     const chosen = await showRewardCards(options);
 *     controller.chooseReward(chosen.id);
 *   });
 *
 * - 입력: 마우스 클릭 / 1·2·3 / ←→ 이동 + Enter (키보드만으로 완주 가능 — R3 완료 기준)
 * - 열려 있는 동안 window 캡처 단계에서 키를 소비해 Phaser·영창 입력과 충돌하지 않는다
 * - 960×640 FIT 기준 카드 3장(각 ≤200px)이 HUD(좌상단)·영창 바(하단)와 겹치지 않는 중앙 배치
 * - DOM 오버레이라 전투 씬 코드를 건드리지 않는다 (index.html 변경도 없음 — 스타일 자체 주입)
 */

const STYLE_ID = 'r3-reward-style';
const WRAP_ID = 'r3-reward-wrap';

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: ${UI_LAYER.reward};
  display: grid; place-items: center;
  background: radial-gradient(circle at 50% 42%, rgba(216, 187, 114, 0.10), transparent 42%),
              rgba(6, 5, 10, 0.72);
  backdrop-filter: blur(2px) saturate(0.9);
  opacity: 0; visibility: hidden; transition: opacity 180ms ease;
  font-family: ${UI_FONT.serif};
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
${ornamentCss(WRAP_ID)}
#${WRAP_ID} .reward-panel {
  position: relative; text-align: center;
  /* 기존 content 720px + 좌우 padding 68px의 총폭을 보존하되, 선택한 상세 설명의
     고유 너비가 패널 폭을 다시 계산하지 못하게 viewport별 총폭을 명시적으로 잠근다. */
  width: min(788px, calc(100vw - 32px)); box-sizing: border-box;
  /* 장식은 currentColor를 쓴다 — 색을 여기서 한 번만 정해 팔레트와 갈리지 않게 */
  --orn: ${UI_COLOR.accent}; --seal: ${UI_COLOR.accent};
  /* 모서리 당초무늬가 놓일 자리 */
  padding: 40px 34px 28px;
  /* 손질린 종이 가장자리 — border-radius로는 못 만든다(항상 매끈한 호를 그린다).
     SVG 마스크로 변을 미세하게 흔들어야 종이가 된다. */
  -webkit-mask-image: ${deckleMask()};
  mask-image: ${deckleMask()};
  -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
  background:
    ${UI_MATERIAL.grain},
    ${UI_MATERIAL.stain},
    linear-gradient(163deg, rgba(26, 19, 30, 0.985), rgba(13, 10, 17, 0.975));
  box-shadow: ${UI_MATERIAL.paperShadow}, ${UI_MATERIAL.rule};
}
#${WRAP_ID} .reward-kicker {
  font-size: 12px; font-weight: 700; letter-spacing: 0.24em;
  color: ${UI_COLOR.accent}; text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
#${WRAP_ID} .reward-title {
  margin: 4px 0 2px; font-size: 27px; font-weight: 700;
  font-family: ${UI_FONT.serif}; letter-spacing: 0.05em;
  color: ${UI_COLOR.textBright};
  /* 머리글자와 나란히 — block flow로는 정렬이 안 맞는다 */
  display: flex; align-items: center; justify-content: center; gap: 14px;
}
/* 표제 표식 — 글자를 떼지 않는다. 한글은 음절 블록이 단어의 일부라 첫 글자만
   상자에 넣으면 단어가 쪼개진다(총괄 지적). 대신 인장을 놓는다.
   앞뒤 한 쌍으로 두어 제목을 감싼다 — 한쪽만 있으면 장식이 아니라 아이콘으로 읽힌다
   (총괄 제안). 뒤쪽은 좌우 반전해 책 끝에 마주 보는 한 쌍이 되게 한다. */
#${WRAP_ID} .reward-title .orn-sigil {
  flex: 0 0 46px; filter: ${UI_MATERIAL.gildEdge};
}
#${WRAP_ID} .reward-title .orn-sigil.mirrored { transform: scaleX(-1); }
#${WRAP_ID} .reward-detail-panel {
  display: none; margin: 14px auto 16px; max-width: 590px; min-height: 104px;
  padding: 15px 19px; box-sizing: border-box; text-align: left;
  /* 높이는 열릴 때 실측해 잠근다(lockDetailPanelHeight). 여긴 그 계산이 늦거나 어긋난
     순간에 글이 잘리지 않게 하는 최후 방어선일 뿐이다. */
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, ${UI_COLOR.accent} 52%, ${UI_COLOR.border});
  border-radius: 9px; background: rgba(11, 9, 18, 0.86);
  box-shadow: inset 0 0 28px rgba(94, 111, 225, 0.08), 0 8px 22px rgba(0, 0, 0, 0.28);
}
#${WRAP_ID} .reward-detail-panel.active { display: block; }
#${WRAP_ID} .reward-detail-title { font-size: 17px; font-weight: 700; color: ${UI_COLOR.textBright}; }
#${WRAP_ID} .reward-detail-copy { margin-top: 7px; white-space: pre-line; font-size: 14px; line-height: 1.7; color: ${UI_COLOR.textSoft}; }
#${WRAP_ID} .reward-cards { display: flex; gap: 20px; justify-content: center; }
#${WRAP_ID} .reward-card {
  --card-core: ${UI_COLOR.accent}; --card-glow: ${UI_COLOR.borderStrong};
  position: relative; width: clamp(150px, 21vw, 200px); min-height: 218px;
  padding: 18px 14px 46px; box-sizing: border-box; text-align: center;
  border: 1px solid color-mix(in srgb, var(--card-core) 42%, ${UI_COLOR.border});
  border-radius: ${UI_MATERIAL.deckle}; cursor: pointer;
  /* 재질 → 얼룩 → 바탕 순으로 얹는다. 대각 그라데이션 하나만 두면 "UI 카드"로 읽힌다 */
  background:
    ${UI_MATERIAL.grain},
    ${UI_MATERIAL.stain},
    linear-gradient(163deg, rgba(26, 19, 30, 0.97), rgba(14, 10, 18, 0.95));
  /* ⚠️ 종이는 스스로 빛나지 않는다 — 아래로 그림자를 떨어뜨린다 */
  box-shadow: ${UI_MATERIAL.paperShadow}, ${UI_MATERIAL.rule};
  color: ${UI_COLOR.text}; font-family: ${UI_FONT.serif}; font-size: inherit;
  filter: ${UI_MATERIAL.aged};
  /* 손으로 끼워 넣은 듯 미세하게 어긋나게. 균일한 3열은 그 자체가 UI 컴포넌트의 문법이다 */
  transform: rotate(var(--card-tilt, 0deg)) translateY(var(--card-lift, 0px));
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
#${WRAP_ID} .reward-card:hover, #${WRAP_ID} .reward-card.focused {
  transform: rotate(var(--card-tilt, 0deg)) translateY(calc(var(--card-lift, 0px) - 10px)) scale(1.035);
  border-color: var(--card-core);
  /* 글로우가 아니라 **더 높이 들린 종이**. 금박 윤곽만 얇게 남긴다 */
  box-shadow: ${UI_MATERIAL.paperShadowLift},
              inset 0 0 0 1px color-mix(in srgb, var(--card-core) 30%, transparent);
}
#${WRAP_ID} .reward-card:disabled {
  cursor: not-allowed; opacity: 0.42; filter: grayscale(0.72);
  transform: rotate(var(--card-tilt, 0deg)) translateY(var(--card-lift, 0px));
}
#${WRAP_ID} .reward-card:disabled:hover { border-color: color-mix(in srgb, var(--card-core) 42%, ${UI_COLOR.border}); box-shadow: ${UI_MATERIAL.paperShadow}, ${UI_MATERIAL.rule}; }
#${WRAP_ID} .reward-card:focus-visible { outline: 2px solid var(--card-core); outline-offset: 3px; }
/* 상위 선택지(진화·융합) — 반짝이는 금빛 테두리로 한눈에 티가 난다 */
#${WRAP_ID} .reward-card--rare {
  border-color: transparent;
  background:
    ${UI_MATERIAL.grain} padding-box,
    linear-gradient(163deg, rgba(30, 22, 34, 0.97), rgba(16, 12, 20, 0.95)) padding-box,
    linear-gradient(120deg, ${UI_COLOR.accentGlow}, ${UI_COLOR.warm}, var(--card-core), ${UI_COLOR.accentGlow}, ${UI_COLOR.accentGlow}) border-box;
  border: 2px solid transparent;
  background-size: 100% 100%, 300% 100%;
  animation: r3-rare-shimmer 2.6s linear infinite;
  box-shadow: ${UI_MATERIAL.paperShadow}, ${UI_MATERIAL.rule};
}
#${WRAP_ID} .reward-card--rare:hover, #${WRAP_ID} .reward-card--rare.focused {
  box-shadow: ${UI_MATERIAL.paperShadowLift},
              inset 0 0 0 1px rgba(216, 187, 114, 0.3);
}
#${WRAP_ID} .reward-card--rainbow {
  border-color: transparent;
  background:
    ${UI_MATERIAL.grain} padding-box,
    linear-gradient(163deg, rgba(30, 22, 34, 0.97), rgba(16, 12, 20, 0.95)) padding-box,
    linear-gradient(120deg, ${rainbowStops()}) border-box;
  border: 2px solid transparent;
  background-size: 100% 100%, 300% 100%;
  animation: r3-rainbow-shimmer 3.2s linear infinite;
}
#${WRAP_ID} .reward-card--rainbow .card-glyph {
  background: conic-gradient(${rainbowStops()});
  filter: drop-shadow(0 0 14px #8fcfff);
}
#${WRAP_ID} .reward-card--spirit-fusion {
  border-color: transparent;
  background:
    ${UI_MATERIAL.grain} padding-box,
    linear-gradient(163deg, rgba(30, 22, 34, 0.97), rgba(16, 12, 20, 0.95)) padding-box,
    linear-gradient(120deg, var(--spirit-spectrum)) border-box;
  border: 2px solid transparent;
  background-size: 100% 100%, 300% 100%;
  animation: r3-rainbow-shimmer 3.2s linear infinite;
}
#${WRAP_ID} .reward-card--spirit-fusion .card-glyph {
  background: conic-gradient(var(--spirit-spectrum));
  filter: drop-shadow(0 0 14px var(--card-glow));
}
@keyframes r3-rainbow-shimmer {
  from { background-position: 0 0, 0 0; }
  to { background-position: 0 0, 300% 0; }
}
/* 봉랍 — 알약 배지(border-radius: 999px)를 대체한다. 알약은 웹 UI의 문법이고,
   마도서에서 "이것이 특별하다"를 말하는 물건은 밀랍 도장이다.
   카드 위에 **눌러 찍힌** 것이라 살짝 삐져나간다 — 안에 얌전히 들어가면 그냥 배지다 */
#${WRAP_ID} .card-rare-seal {
  position: absolute; top: -12px; right: -10px;
  transform: rotate(-9deg);
  filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.55));
}
@keyframes r3-rare-shimmer {
  from { background-position: 0 0, 0 0; }
  to { background-position: 0 0, 300% 0; }
}
@media (prefers-reduced-motion: reduce) {
  #${WRAP_ID} .reward-card--rare { animation: none; }
}
#${WRAP_ID} .card-hotkey {
  position: absolute; top: 10px; left: 12px;
  font: 700 12px/1.6 'Consolas', monospace;
  width: 20px; height: 20px; border-radius: 5px;
  color: ${UI_COLOR.ink}; background: var(--card-core);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  filter: ${UI_MATERIAL.gildEdge};
}
#${WRAP_ID} .card-glyph {
  width: 52px; height: 52px; margin: 14px auto 12px; border-radius: 50%;
  background: radial-gradient(circle, var(--card-core) 18%, color-mix(in srgb, var(--card-glow) 45%, transparent) 60%, transparent 75%);
  filter: drop-shadow(0 0 14px var(--card-glow));
  display: grid; place-items: center;
}
/* 폼이 있는 카드는 원형 위에 형태 글리프를 얹는다 — 빌드 HUD 칩과 같은 어휘 */
#${WRAP_ID} .card-glyph svg { width: 30px; height: 30px; color: ${UI_COLOR.textBright}; }
#${WRAP_ID} .card-title {
  font-size: 17px; font-weight: 700; font-family: ${UI_FONT.serif};
  letter-spacing: 0.03em; color: ${UI_COLOR.textBright};
}
#${WRAP_ID} .card-desc {
  margin-top: 8px; font-size: 13px; line-height: 1.5; color: #a9b4e6;
  /* 설명의 의도된 구획(시작/목표/단계)을 카드에서도 보존한다. */
  white-space: pre-line;
}
#${WRAP_ID} .card-detail {
  position: absolute; z-index: 4; left: 50%; bottom: 38px; width: 224px;
  padding: 10px 12px; box-sizing: border-box; border: 1px solid var(--card-core);
  border-radius: 7px; background: rgba(10, 8, 17, .97); color: ${UI_COLOR.textSoft};
  box-shadow: 0 7px 18px rgba(0, 0, 0, .5); font-size: 12px; line-height: 1.55;
  opacity: 0; pointer-events: none; transform: translate(-50%, 8px); transition: opacity 120ms ease, transform 120ms ease;
}
#${WRAP_ID} .reward-card:hover .card-detail, #${WRAP_ID} .reward-card:focus .card-detail, #${WRAP_ID} .reward-card.focused .card-detail {
  opacity: 1; transform: translate(-50%, 0);
}
#${WRAP_ID} .card-kind {
  position: absolute; left: 0; right: 0; bottom: 14px;
  font-size: 11px; letter-spacing: 0.18em; color: var(--card-core); opacity: 0.9;
}
#${WRAP_ID} .card-owned {
  position: absolute; top: 9px; right: 11px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em;
  padding: 2px 7px; border-radius: 999px;
  color: ${UI_COLOR.ink}; background: var(--card-core); opacity: 0.92;
}
#${WRAP_ID} .reward-hint { margin-top: 20px; font-size: 12.5px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .reward-hint b { color: ${UI_COLOR.textSoft}; font-weight: 600; }
/* 이번 런 누적 — 전투 HUD에서 옮겨온 자리. "지금 뭘 쌓았나 → 뭘 더할까"의 근거 */
#${WRAP_ID} .reward-context {
  margin: 20px auto 0; padding-top: 14px; max-width: 560px;
  border-top: 1px solid #232c52;
  font-size: 12px; line-height: 1.7; color: ${UI_COLOR.textMuted};
}
#${WRAP_ID} .reward-context b { color: ${UI_COLOR.textSoft}; font-weight: 600; }
@media (prefers-reduced-motion: reduce) {
  #${WRAP_ID}, #${WRAP_ID} .reward-card { transition: none; }
}
`;

const KIND_LABELS: Record<RewardOption['kind'], string> = {
  'max-hp': 'VITALITY',
  'max-mana': 'MANA',
  affinity: 'AFFINITY',
  'swift-incant': 'TEMPO',
  'mana-surge': 'FLOW',
  'ward-start': 'WARD',
  'spirit-haste': 'TEMPO',
  'spirit-recovery': 'RECOVERY',
  'spirit-guard': 'GUARD',
  engrave: 'ENGRAVE',
  spirit: 'SPIRIT',
  evolve: 'EVOLVE',
  awaken: 'AWAKEN',
  // 제단 전용 (#214)
  'altar-leave': 'DEPART',
  'legacy-skip': 'BLANK PAGE',
  'all-affinity': 'ATTUNE',
  'altar-high': 'HIGH ARCANA',
  echo: 'ECHO',
  starburst: 'STAR BURST',
  meteor: 'METEOR',
  trail: 'TRAIL',
  'chorus-awaken': 'ASCENDANT CHORUS',
  ripple: 'RIPPLE',
};

function altarGlyph(kind: RewardOption['kind']): string | null {
  if (kind === 'chorus-awaken') {
    return `<span aria-label="무지개 합주 룬" style="font-size:31px;background:linear-gradient(135deg,${UI_RAINBOW.map((color, index) => `${color} ${[0, 22, 43, 63, 82, 100][index]}%`).join(',')});-webkit-background-clip:text;background-clip:text;color:transparent">✦</span>`;
  }
  const icons: Partial<Record<RewardOption['kind'], string>> = {
    'all-affinity': '✦', awaken: '☽', 'altar-high': '✥', echo: '♙',
    starburst: '✹', meteor: '☄', trail: '⌁',
  };
  const icon = icons[kind];
  return icon ? `<span style="font-size:31px;color:#fff">${icon}</span>` : null;
}

function ensureDom(): HTMLElement {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  let wrap = document.getElementById(WRAP_ID);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', '보상 선택');
    document.body.appendChild(wrap);
  }
  return wrap;
}

/**
 * 상위 선택지 여부 — 진화·정령 융합(둘 다 kind 'evolve')은 판을 바꾸는 격상 보상이라
 * 반짝이는 금빛 테두리로 한눈에 티가 나게 한다 (총괄 요청).
 */
export function isRareReward(option: RewardOption): boolean {
  // 빌드 프리셋은 보상의 희귀도가 아니라 출발 방식 선택이다.
  if (option.id.startsWith('demo-build-')) return false;
  return option.kind === 'evolve' || option.kind === 'chorus-awaken';
}

function cardColors(option: RewardOption): { core: string; glow: string } {
  if (option.id.endsWith('-chorus')) return { core: '#ed8cff', glow: '#72cfff' };
  if (option.element) {
    const pal = ELEMENT_PALETTES[option.element];
    return { core: paletteColorToCss(pal.core), glow: paletteColorToCss(pal.glow) };
  }
  if (option.kind === 'max-hp') return { core: UI_SEMANTIC.ok, glow: '#3f7a5f' };
  if (option.kind === 'swift-incant') return { core: UI_COLOR.warm, glow: '#8a6420' };
  if (option.kind === 'mana-surge') return { core: UI_SEMANTIC.mana, glow: '#3f5a8a' };
  if (option.kind === 'ward-start') return { core: UI_SEMANTIC.shield, glow: '#3a6f80' };
  if (option.kind === 'chorus-awaken') return { core: '#b68cff', glow: '#5ed9c9' };
  return { core: UI_COLOR.accent, glow: UI_COLOR.borderStrong };
}

/** 같은 3택 UI를 다른 맥락(방 클리어 보상 / 주문서 유산)으로 재사용하기 위한 문구 */
export interface CardFraming {
  kicker?: string;
  title?: string;
  /** 카드별 "이미 보유" 라벨 (게임성 ②) — null이면 배지 없음 */
  ownedLabelFor?: (option: RewardOption) => string | null;
  /**
   * 카드가 가리키는 주문의 폼 (있으면 원형 대신 폼 글리프를 그린다).
   * RewardOption 계약(runContract)에는 폼이 없고 spellKey만 있으므로, 키→스펙을 아는
   * 씬이 여기로 넘긴다 — 공용 계약을 건드리지 않고 R3 안에서 해결한다.
   * 획득 순간에 글리프를 배워야 빌드 HUD 칩이 의미를 갖는다 (학습 루프).
   */
  formFor?: (option: RewardOption) => SpellForm | null;
  /**
   * 이번 런 누적 맥락 (강화 목록·주문서 보유 등) — 전투 HUD 빌드 패널에서 옮겨온 정보.
   * 전투 중엔 행동을 바꾸지 않는데 패널 높이만 가변으로 만들던 줄들이라, 실제로
   * 쓰이는 순간(무엇을 더할지 고르는 방 클리어 화면)으로 자리를 옮겼다.
   */
  contextLines?: string[];
  /** 카드 본문을 가리지 않는 호버 상세. 각성처럼 수치·조건 설명이 긴 선택지에 쓴다. */
  detailFor?: (option: RewardOption) => string | null;
  /** 선택 카드의 상세를 패널로 크게 보여 준다. 연구처럼 설명이 긴 3택에 사용한다. */
  detailPanelFor?: (option: RewardOption) => string | null;
  /** 잠긴 제단 거래처럼 표시만 하고 선택할 수 없는 카드. */
  disabledFor?: (option: RewardOption) => boolean;
}

function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch
  ));
}

let activeCleanup: (() => void) | null = null;

/** 오버레이가 열려 있는지 (R1이 phase 게이트와 별개로 참고 가능) */
export function isRewardOverlayOpen(): boolean {
  return activeCleanup !== null;
}

/**
 * 카드 이동 입력 — **게임 이동키와 같은 A/D** (R2, #306).
 *
 * ⚠️ `event.key`가 아니라 `event.code`를 본다. 이 게임은 한글로 영창하므로 IME가
 * 켜진 채 보상 화면이 뜨고, 그러면 `key`는 `'ㅁ'`·`'ㅇ'`으로 온다. 물리 키 위치를
 * 보는 `code`만 IME와 무관하게 동작한다.
 *
 * 방향키는 받지 않는다 — 조작을 이동키 하나로 모으자는 결정이다.
 */
export function rewardCardFocusDirection(
  input: Pick<KeyboardEvent, 'code'>,
): -1 | 0 | 1 {
  if (input.code === 'KeyA') return -1;
  if (input.code === 'KeyD') return 1;
  return 0;
}

/**
 * 보상 카드를 표시하고 플레이어의 선택을 기다린다.
 * 반드시 하나를 고르게 한다 — 닫기/취소 없음 (선택 전 다음 방 진행 금지 계약).
 */
export function showRewardCards(
  options: RewardOption[],
  framing: CardFraming = {},
): Promise<RewardOption> {
  if (activeCleanup) throw new Error('reward overlay already open');
  const shown = options.slice(0, 4);
  const wrap = ensureDom();

  const titleText = framing.title ?? '공명의 대가를 선택하라';
  wrap.innerHTML = `
    <div class="reward-panel">
      ${cornerFlourish().replace('orn-corner', 'orn-corner tl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner tr')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner bl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner br')}
      <div class="reward-kicker">${escapeText(framing.kicker ?? 'ROOM CLEAR')}</div>
      <h2 class="reward-title">
        ${titleSigil()}<span>${escapeText(titleText)}</span>${titleSigil().replace('orn-sigil', 'orn-sigil mirrored')}
      </h2>
      ${divider()}
      <section class="reward-detail-panel" aria-live="polite">
        <div class="reward-detail-title"></div>
        <div class="reward-detail-copy"></div>
      </section>
      <div class="reward-cards"></div>
      <div class="reward-hint"><b>A/D + Enter</b> · 숫자키 또는 카드 클릭</div>
      ${(framing.contextLines ?? []).filter(Boolean).length > 0
    ? `<div class="reward-context">${(framing.contextLines ?? [])
      .filter(Boolean).map((line) => escapeText(line)).join('<br>')}</div>`
    : ''}
    </div>`;
  const cardsEl = wrap.querySelector('.reward-cards')!;
  const detailPanel = wrap.querySelector<HTMLElement>('.reward-detail-panel')!;
  const detailPanelTitle = detailPanel.querySelector<HTMLElement>('.reward-detail-title')!;
  const detailPanelCopy = detailPanel.querySelector<HTMLElement>('.reward-detail-copy')!;

  return new Promise<RewardOption>((resolve) => {
    let focusIdx = 0;
    let detailPanelLocked = false;
    const buttons: HTMLButtonElement[] = [];

    /**
     * 상세 패널 높이를 **이 화면에 실제로 뜰 글 중 가장 큰 것**에 맞춰 잠근다.
     *
     * 총괄 지적: *"설명 양이 많고 작은지에 따라 박스 크기가 달라져서 선택지 칸이 움직임."*
     * 패널은 카드 **위**에 있어서, 높이가 줄면 카드가 통째로 위로 올라온다. 카드를 눈으로
     * 훑는 동안 카드가 계속 움직이면 읽기도 어렵고, 마우스로 고르는 중이면 **커서 아래 카드가
     * 바뀐다** — 오선택으로 이어진다.
     *
     * 고정 픽셀을 박지 않은 이유: 같은 글도 창 폭에 따라 줄 수가 달라진다. 좁은 창에서는
     * 넘치고 넓은 창에서는 빈 공간이 남는다. 그래서 숫자를 정하지 않고 **직접 재서** 가장
     * 큰 값을 쓴다. 세 장뿐이라 비용도 없고, 폭이나 글이 바뀌어도 저절로 맞는다.
     */
    const lockDetailPanelHeight = (): void => {
      if (!framing.detailPanelFor) return;
      const details = shown.map((option) => framing.detailPanelFor!(option));
      if (details.every((detail) => detail === null)) return;
      // display:none이면 잴 수 없다. 재는 동안만 펴 두고, 실제 표시는 setFocus가 정한다.
      detailPanel.style.height = 'auto';
      detailPanel.classList.add('active');
      let tallest = 0;
      shown.forEach((option, i) => {
        if (details[i] === null) return;
        detailPanelTitle.textContent = option.title;
        detailPanelCopy.textContent = details[i]!;
        tallest = Math.max(tallest, detailPanel.getBoundingClientRect().height);
      });
      if (tallest <= 0) return;
      detailPanel.style.height = `${Math.ceil(tallest)}px`;
      detailPanelLocked = true;
    };

    const isDisabled = (idx: number): boolean => Boolean(framing.disabledFor?.(shown[idx]));
    const finish = (idx: number): void => {
      if (isDisabled(idx)) return;
      cleanup();
      resolve(shown[idx]);
    };

    const setFocus = (idx: number): void => {
      let candidate = (idx + shown.length) % shown.length;
      for (let attempts = 0; attempts < shown.length && isDisabled(candidate); attempts += 1) {
        candidate = (candidate + 1) % shown.length;
      }
      focusIdx = candidate;
      buttons.forEach((b, i) => b.classList.toggle('focused', i === focusIdx));
      const detail = framing.detailPanelFor?.(shown[focusIdx]) ?? null;
      // 한 장이라도 설명이 있으면 패널을 **계속** 띄운다. 설명 없는 카드에서만 접으면
      // 그 카드로 옮길 때 패널이 사라져 카드가 통째로 밀려 올라간다 (총괄 지적).
      detailPanel.classList.toggle('active', detailPanelLocked || detail !== null);
      detailPanelTitle.textContent = detail ? shown[focusIdx].title : '';
      detailPanelCopy.textContent = detail ?? '';
      buttons[focusIdx].focus({ preventScroll: true });
    };

    shown.forEach((option, i) => {
      const { core, glow } = cardColors(option);
      const btn = document.createElement('button');
      btn.type = 'button';
      const rare = isRareReward(option);
      btn.className = rare ? 'reward-card reward-card--rare' : 'reward-card';
      if (option.id.endsWith('-chorus')) btn.classList.add('reward-card--rainbow');
      const fusionElements = option.evolve?.target === 'spirit-fuse'
        ? option.evolve.elements
        : [];
      if (fusionElements.length > 1) {
        btn.classList.add('reward-card--spirit-fusion');
        btn.style.setProperty(
          '--spirit-spectrum',
          fusionElements.map((element) => paletteColorToCss(ELEMENT_PALETTES[element].core)).join(', '),
        );
      }
      const disabled = isDisabled(i);
      btn.disabled = disabled;
      btn.style.setProperty('--card-core', core);
      btn.style.setProperty('--card-glow', glow);
      // 각도는 아주 작게(0.6도 안쪽) — 크면 장난스러워진다
      btn.style.setProperty('--card-tilt', `${[-0.55, 0.35, -0.25, 0.5][i % 4]}deg`);
      btn.style.setProperty('--card-lift', `${[0, 5, 2, 6][i % 4]}px`);
      btn.innerHTML = `
        <span class="card-hotkey">${i + 1}</span>
        ${rare ? `<div class="card-rare-seal" title="격상">${waxSeal('격')}</div>` : ''}
        <div class="card-glyph"></div>
        <div class="card-title"></div>
        <div class="card-desc"></div>
        <div class="card-detail" role="tooltip"></div>
        <div class="card-kind">${
          option.element ? `${ELEMENT_LABELS[option.element]} ${KIND_LABELS[option.kind]}` : KIND_LABELS[option.kind]
        }</div>`;
      btn.querySelector('.card-title')!.textContent = option.title;
      btn.querySelector('.card-desc')!.textContent = option.description;
      const detail = framing.detailFor?.(option) ?? null;
      const detailEl = btn.querySelector<HTMLElement>('.card-detail')!;
      if (detail) detailEl.textContent = detail;
      else detailEl.remove();
      // 폼 글리프 — 씬이 알려준 카드만. 스탯 보상 등 폼이 없는 카드는 원형 그대로.
      const form = framing.formFor?.(option) ?? null;
      const altarIcon = altarGlyph(option.kind);
      if (form) btn.querySelector('.card-glyph')!.innerHTML = glyphSvg(form);
      else if (altarIcon) btn.querySelector('.card-glyph')!.innerHTML = altarIcon;
      // 이미 보유 배지 — "친화를 더 쌓을까, 갈아탈까"의 근거 (게임성 ②)
      const ownedLabel = framing.ownedLabelFor?.(option) ?? null;
      if (ownedLabel) {
        const badge = document.createElement('div');
        badge.className = 'card-owned';
        badge.textContent = ownedLabel;
        btn.appendChild(badge);
      }
      if (!disabled) {
        btn.addEventListener('click', () => finish(i));
        btn.addEventListener('mouseenter', () => setFocus(i));
      }
      cardsEl.appendChild(btn);
      buttons.push(btn);
    });

    // 캡처 단계에서 키를 소비 — Phaser(window 버블 리스너)·영창 바와 충돌 방지
    const onKeyDown = (e: KeyboardEvent): void => {
      const hotkey = ['1', '2', '3', '4'].indexOf(e.key);
      if (hotkey !== -1 && hotkey < shown.length) {
        e.preventDefault(); e.stopImmediatePropagation();
        finish(hotkey);
        return;
      }
      const focusDirection = rewardCardFocusDirection(e);
      if (focusDirection !== 0) {
        e.preventDefault(); e.stopImmediatePropagation();
        setFocus(focusIdx + focusDirection);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopImmediatePropagation();
        finish(focusIdx);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);

    // 창 크기가 바뀌면 줄 수가 달라져 잠근 높이가 틀린다 — 다시 잰다. 안 하면 좁아졌을 때
    // 글이 잘린다(CSS의 overflow-y: auto가 최후 방어선이지만, 스크롤은 답이 아니다).
    const onResize = (): void => {
      lockDetailPanelHeight();
      setFocus(focusIdx);
    };
    window.addEventListener('resize', onResize);

    let activation: { cancel(): void } | null = null;
    const cleanup = (): void => {
      activation?.cancel();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onResize);
      wrap.classList.remove('active');
      activeCleanup = null;
      // 페이드아웃 후 내용 제거
      window.setTimeout(() => { if (!wrap.classList.contains('active')) wrap.innerHTML = ''; }, 200);
    };
    activeCleanup = cleanup;

    // rAF는 페이드인 프레임 확보용, setTimeout은 백그라운드 탭(rAF 정지) 폴백
    // 닫힘이 예약을 이긴다 — 취소하지 않으면 뜨기 전에 닫은 오버레이가 화면에 남는다.
    activation = scheduleOverlayActivation((): void => {
      wrap.classList.add('active');
      // 카드가 다 붙고 wrap이 펴진 뒤라야 실제 폭으로 잴 수 있다. setFocus보다 먼저 —
      // 첫 카드를 그린 뒤에 높이를 잡으면 그 한 번이 눈에 보이는 흔들림이 된다.
      lockDetailPanelHeight();
      setFocus(0);
    });
  });
}
