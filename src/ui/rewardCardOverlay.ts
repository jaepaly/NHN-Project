import type { RewardOption } from '../run/runContract';
import { UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL, UI_SEMANTIC } from './uiTokens';
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
  max-width: min(720px, calc(100vw - 32px));
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
  engrave: 'ENGRAVE',
  spirit: 'SPIRIT',
  evolve: 'EVOLVE',
  awaken: 'AWAKEN',
  // 제단 전용 (#214)
  'altar-leave': 'DEPART',
  'all-affinity': 'ATTUNE',
  'altar-high': 'HIGH ARCANA',
  echo: 'ECHO',
  starburst: 'STAR BURST',
  meteor: 'METEOR',
  trail: 'TRAIL',
  ripple: 'RIPPLE',
};

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
  return option.kind === 'evolve';
}

function cardColors(option: RewardOption): { core: string; glow: string } {
  if (option.element) {
    const pal = ELEMENT_PALETTES[option.element];
    return { core: paletteColorToCss(pal.core), glow: paletteColorToCss(pal.glow) };
  }
  if (option.kind === 'max-hp') return { core: UI_SEMANTIC.ok, glow: '#3f7a5f' };
  if (option.kind === 'swift-incant') return { core: UI_COLOR.warm, glow: '#8a6420' };
  if (option.kind === 'mana-surge') return { core: UI_SEMANTIC.mana, glow: '#3f5a8a' };
  if (option.kind === 'ward-start') return { core: UI_SEMANTIC.shield, glow: '#3a6f80' };
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
      <div class="reward-cards"></div>
      <div class="reward-hint"><b>A/D + Enter</b> · 숫자키 또는 카드 클릭</div>
      ${(framing.contextLines ?? []).filter(Boolean).length > 0
    ? `<div class="reward-context">${(framing.contextLines ?? [])
      .filter(Boolean).map((line) => escapeText(line)).join('<br>')}</div>`
    : ''}
    </div>`;
  const cardsEl = wrap.querySelector('.reward-cards')!;

  return new Promise<RewardOption>((resolve) => {
    let focusIdx = 0;
    const buttons: HTMLButtonElement[] = [];

    const finish = (idx: number): void => {
      cleanup();
      resolve(shown[idx]);
    };

    const setFocus = (idx: number): void => {
      focusIdx = (idx + shown.length) % shown.length;
      buttons.forEach((b, i) => b.classList.toggle('focused', i === focusIdx));
      buttons[focusIdx].focus({ preventScroll: true });
    };

    shown.forEach((option, i) => {
      const { core, glow } = cardColors(option);
      const btn = document.createElement('button');
      btn.type = 'button';
      const rare = isRareReward(option);
      btn.className = rare ? 'reward-card reward-card--rare' : 'reward-card';
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
        <div class="card-kind">${
          option.element ? `${ELEMENT_LABELS[option.element]} ${KIND_LABELS[option.kind]}` : KIND_LABELS[option.kind]
        }</div>`;
      btn.querySelector('.card-title')!.textContent = option.title;
      btn.querySelector('.card-desc')!.textContent = option.description;
      // 폼 글리프 — 씬이 알려준 카드만. 스탯 보상 등 폼이 없는 카드는 원형 그대로.
      const form = framing.formFor?.(option) ?? null;
      if (form) btn.querySelector('.card-glyph')!.innerHTML = glyphSvg(form);
      // 이미 보유 배지 — "친화를 더 쌓을까, 갈아탈까"의 근거 (게임성 ②)
      const ownedLabel = framing.ownedLabelFor?.(option) ?? null;
      if (ownedLabel) {
        const badge = document.createElement('div');
        badge.className = 'card-owned';
        badge.textContent = ownedLabel;
        btn.appendChild(badge);
      }
      btn.addEventListener('click', () => finish(i));
      btn.addEventListener('mouseenter', () => setFocus(i));
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

    const cleanup = (): void => {
      window.removeEventListener('keydown', onKeyDown, true);
      wrap.classList.remove('active');
      activeCleanup = null;
      // 페이드아웃 후 내용 제거
      window.setTimeout(() => { if (!wrap.classList.contains('active')) wrap.innerHTML = ''; }, 200);
    };
    activeCleanup = cleanup;

    // rAF는 페이드인 프레임 확보용, setTimeout은 백그라운드 탭(rAF 정지) 폴백
    let activated = false;
    const activate = (): void => {
      if (activated) return;
      activated = true;
      wrap.classList.add('active');
      setFocus(0);
    };
    requestAnimationFrame(activate);
    window.setTimeout(activate, 60);
  });
}
