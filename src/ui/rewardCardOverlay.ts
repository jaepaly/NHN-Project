import type { RewardOption } from '../run/runContract';
import { ELEMENT_LABELS, ELEMENT_PALETTES, paletteColorToCss } from '../render/palette';

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
  position: fixed; inset: 0; z-index: 20;
  display: grid; place-items: center;
  background: radial-gradient(circle at 50% 42%, rgba(76, 102, 255, 0.10), transparent 42%),
              rgba(3, 5, 16, 0.72);
  backdrop-filter: blur(2px) saturate(0.9);
  opacity: 0; visibility: hidden; transition: opacity 180ms ease;
  font-family: 'Segoe UI', 'Malgun Gothic', sans-serif;
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
#${WRAP_ID} .reward-panel { text-align: center; max-width: min(700px, calc(100vw - 32px)); }
#${WRAP_ID} .reward-kicker {
  font-size: 12px; font-weight: 700; letter-spacing: 0.24em;
  color: #8fa4ff; text-shadow: 0 0 12px rgba(76, 102, 255, 0.8);
}
#${WRAP_ID} .reward-title { margin: 6px 0 22px; font-size: 24px; font-weight: 700; color: #eef1ff; }
#${WRAP_ID} .reward-cards { display: flex; gap: 20px; justify-content: center; }
#${WRAP_ID} .reward-card {
  --card-core: #8fa4ff; --card-glow: #4c66ff;
  position: relative; width: clamp(150px, 21vw, 200px); min-height: 218px;
  padding: 18px 14px 46px; box-sizing: border-box; text-align: center;
  border: 1px solid color-mix(in srgb, var(--card-core) 55%, #26305b);
  border-radius: 14px; cursor: pointer;
  background: linear-gradient(160deg, rgba(10, 14, 34, 0.97), rgba(15, 21, 52, 0.93));
  color: #dfe6ff; font: inherit;
  transition: transform 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}
#${WRAP_ID} .reward-card:hover, #${WRAP_ID} .reward-card.focused {
  transform: translateY(-8px) scale(1.03);
  border-color: var(--card-core);
  box-shadow: 0 0 28px color-mix(in srgb, var(--card-glow) 45%, transparent),
              0 18px 50px rgba(0, 0, 0, 0.5);
}
#${WRAP_ID} .reward-card:focus-visible { outline: 2px solid var(--card-core); outline-offset: 3px; }
/* 상위 선택지(진화·융합) — 반짝이는 금빛 테두리로 한눈에 티가 난다 */
#${WRAP_ID} .reward-card--rare {
  border-color: transparent;
  background:
    linear-gradient(160deg, rgba(14, 12, 30, 0.97), rgba(26, 18, 44, 0.95)) padding-box,
    linear-gradient(120deg, #ffe08a, #ffb347, var(--card-core), #ffd76a, #ffe08a) border-box;
  border: 2px solid transparent;
  background-size: 100% 100%, 300% 100%;
  animation: r3-rare-shimmer 2.6s linear infinite;
  box-shadow: 0 0 20px rgba(255, 196, 92, 0.28);
}
#${WRAP_ID} .reward-card--rare:hover, #${WRAP_ID} .reward-card--rare.focused {
  box-shadow: 0 0 34px rgba(255, 196, 92, 0.5), 0 18px 50px rgba(0, 0, 0, 0.5);
}
#${WRAP_ID} .card-rare-ribbon {
  position: absolute; top: 9px; right: 10px;
  font-size: 10px; font-weight: 800; letter-spacing: 0.12em;
  color: #1a1204; background: linear-gradient(120deg, #ffe08a, #ffb347);
  padding: 2px 8px; border-radius: 999px;
  box-shadow: 0 0 10px rgba(255, 196, 92, 0.6);
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
  color: #0a0e22; background: var(--card-core);
  box-shadow: 0 0 10px var(--card-glow);
}
#${WRAP_ID} .card-glyph {
  width: 52px; height: 52px; margin: 14px auto 12px; border-radius: 50%;
  background: radial-gradient(circle, var(--card-core) 18%, color-mix(in srgb, var(--card-glow) 45%, transparent) 60%, transparent 75%);
  filter: drop-shadow(0 0 14px var(--card-glow));
}
#${WRAP_ID} .card-title { font-size: 17px; font-weight: 700; color: #f4f6ff; }
#${WRAP_ID} .card-desc { margin-top: 8px; font-size: 13px; line-height: 1.5; color: #a9b4e6; }
#${WRAP_ID} .card-kind {
  position: absolute; left: 0; right: 0; bottom: 14px;
  font-size: 11px; letter-spacing: 0.18em; color: var(--card-core); opacity: 0.9;
}
#${WRAP_ID} .card-owned {
  position: absolute; top: 9px; right: 11px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.06em;
  padding: 2px 7px; border-radius: 999px;
  color: #0a0e22; background: var(--card-core); opacity: 0.92;
}
#${WRAP_ID} .reward-hint { margin-top: 20px; font-size: 12.5px; color: #7f8aba; }
#${WRAP_ID} .reward-hint b { color: #aeb9e8; font-weight: 600; }
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
  if (option.kind === 'max-hp') return { core: '#72f1a8', glow: '#1f9d5c' };
  if (option.kind === 'swift-incant') return { core: '#ffd166', glow: '#b8860b' };
  if (option.kind === 'mana-surge') return { core: '#91b7ff', glow: '#2456c4' };
  if (option.kind === 'ward-start') return { core: '#72d8ff', glow: '#1f7a9d' };
  return { core: '#8fa4ff', glow: '#4c66ff' };
}

/** 같은 3택 UI를 다른 맥락(방 클리어 보상 / 주문서 유산)으로 재사용하기 위한 문구 */
export interface CardFraming {
  kicker?: string;
  title?: string;
  /** 카드별 "이미 보유" 라벨 (게임성 ②) — null이면 배지 없음 */
  ownedLabelFor?: (option: RewardOption) => string | null;
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
 * 보상 카드를 표시하고 플레이어의 선택을 기다린다.
 * 반드시 하나를 고르게 한다 — 닫기/취소 없음 (선택 전 다음 방 진행 금지 계약).
 */
export function showRewardCards(
  options: RewardOption[],
  framing: CardFraming = {},
): Promise<RewardOption> {
  if (activeCleanup) throw new Error('reward overlay already open');
  const shown = options.slice(0, 3);
  const wrap = ensureDom();

  wrap.innerHTML = `
    <div class="reward-panel">
      <div class="reward-kicker">${escapeText(framing.kicker ?? 'ROOM CLEAR')}</div>
      <div class="reward-title">${escapeText(framing.title ?? '공명의 대가를 선택하라')}</div>
      <div class="reward-cards"></div>
      <div class="reward-hint"><b>1·2·3</b> 또는 <b>←→ + Enter</b> · 마우스 클릭</div>
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
      btn.innerHTML = `
        <span class="card-hotkey">${i + 1}</span>
        ${rare ? '<div class="card-rare-ribbon">격상</div>' : ''}
        <div class="card-glyph"></div>
        <div class="card-title"></div>
        <div class="card-desc"></div>
        <div class="card-kind">${
          option.element ? `${ELEMENT_LABELS[option.element]} ${KIND_LABELS[option.kind]}` : KIND_LABELS[option.kind]
        }</div>`;
      btn.querySelector('.card-title')!.textContent = option.title;
      btn.querySelector('.card-desc')!.textContent = option.description;
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
      const hotkey = ['1', '2', '3'].indexOf(e.key);
      if (hotkey !== -1 && hotkey < shown.length) {
        e.preventDefault(); e.stopImmediatePropagation();
        finish(hotkey);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); e.stopImmediatePropagation();
        setFocus(focusIdx + (e.key === 'ArrowRight' ? 1 : -1));
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
