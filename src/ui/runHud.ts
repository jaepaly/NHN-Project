import type { RunStateSnapshot } from '../run/runContract';
import type { SpellElement } from '../spell/types';
import { ELEMENT_LABELS, ELEMENT_PALETTES, paletteColorToCss } from '../render/palette';

/**
 * 런 진행 HUD (ROOM n/m + 원소 친화 요약) — R3 소유 UI (PHASE_2 R3 P0)
 * R1 결합: 'reward-applied'/'room-started' 이벤트에서 updateRunHud(state) 호출.
 * 우상단 고정 DOM 칩 — 좌상단 전투 HUD(HP/마나, ~y150)와 겹치지 않는다.
 */

const STYLE_ID = 'r3-runhud-style';
const WRAP_ID = 'r3-runhud';
let resizeBound = false;

const CSS = `
#${WRAP_ID} {
  position: fixed; top: 12px; right: 14px; z-index: 15;
  display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
  font-family: 'Consolas', 'Segoe UI', monospace;
  pointer-events: none;
  transform-origin: top right;
}
#${WRAP_ID} .run-room {
  padding: 6px 12px; border-radius: 8px;
  border: 1px solid #3a4a8f;
  background: rgba(8, 11, 28, 0.85);
  font-size: 14px; font-weight: 700; letter-spacing: 0.12em; color: #dfe6ff;
  text-shadow: 0 0 10px rgba(76, 102, 255, 0.7);
}
#${WRAP_ID} .run-affinity {
  display: flex; gap: 5px; margin-top: 76px;
}
#${WRAP_ID} .affinity-chip {
  padding: 3px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 700;
  background: rgba(8, 11, 28, 0.85);
  border: 1px solid currentColor;
}
`;

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
    wrap.setAttribute('aria-hidden', 'true');
    document.body.appendChild(wrap);
  }
  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener('resize', () => {
      const current = document.getElementById(WRAP_ID);
      if (current) positionOverGameHud(current);
    });
  }
  return wrap;
}

function positionOverGameHud(wrap: HTMLElement): void {
  const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
  if (!canvas) return;
  const bounds = canvas.getBoundingClientRect();
  const scale = bounds.width / canvas.width;
  wrap.style.top = `${bounds.top + 18 * scale}px`;
  wrap.style.right = `${window.innerWidth - bounds.right + 18 * scale}px`;
  wrap.style.transform = `scale(${scale})`;
}

/** 런 상태를 HUD에 반영한다. 매 프레임이 아니라 상태 변화 시에만 호출하면 된다. */
export function updateRunHud(state: RunStateSnapshot): void {
  const wrap = ensureDom();
  const affinities = (Object.entries(state.elementalAffinity) as [SpellElement, number][])
    .filter(([, bonus]) => bonus > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  wrap.innerHTML = `
    <div class="run-room">ROOM ${state.roomIndex}/${state.maxRooms}</div>
    ${affinities.length ? '<div class="run-affinity"></div>' : ''}`;
  positionOverGameHud(wrap);

  const affinityEl = wrap.querySelector('.run-affinity');
  if (affinityEl) {
    for (const [element, bonus] of affinities) {
      const chip = document.createElement('span');
      chip.className = 'affinity-chip';
      chip.style.color = paletteColorToCss(ELEMENT_PALETTES[element].core);
      chip.textContent = `${ELEMENT_LABELS[element]} +${Math.round(bonus * 100)}%`;
      affinityEl.appendChild(chip);
    }
  }
}

/** 런 종료 등에서 HUD를 감춘다. */
export function clearRunHud(): void {
  document.getElementById(WRAP_ID)?.remove();
}
