import type { RunStateSnapshot } from '../run/runContract';

/**
 * 런 진행 HUD (ROOM n/m) — R3 소유 UI (PHASE_2 R3 P0)
 * R1 결합: 'reward-applied'/'room-started' 이벤트에서 updateRunHud(state) 호출.
 * 우상단 고정 DOM 칩 — 좌상단 전투 HUD(HP/마나, ~y150)와 겹치지 않는다.
 *
 * 원소 친화는 좌상단 친화 경험치 바(#173)로 일원화했다 — 우상단 친화 칩은
 * 중복 표시라 제거(총괄 피드백: "좌상단에 친화 바 생겼으니 우상단 친화는 빼도 될듯").
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
  wrap.innerHTML = `<div class="run-room">ROOM ${state.roomIndex}/${state.maxRooms}</div>`;
  positionOverGameHud(wrap);
}

/** 런 종료 등에서 HUD를 감춘다. */
export function clearRunHud(): void {
  document.getElementById(WRAP_ID)?.remove();
}
