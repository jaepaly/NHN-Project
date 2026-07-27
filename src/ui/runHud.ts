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
let observedCanvas: HTMLCanvasElement | null = null;

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
  bindReposition();
  return wrap;
}

/**
 * 리사이즈 재배치 재시도 지연 (#216 항목3) — 같은 resize 이벤트를 Phaser(FIT)보다
 * 먼저 받으면 캔버스 CSS 갱신 전의 크기로 자리를 잡아, 창을 늘려도 ROOM 칩만
 * 작게 화면 안쪽에 남았다. Phaser의 갱신은 이벤트 직후일 수도, 폴링
 * (resizeInterval 500ms) 뒤일 수도 있어 늦은 경우까지 덮도록 몇 차례 재시도한다.
 * rAF가 아니라 setTimeout인 이유: 백그라운드 탭에선 rAF가 멈춰 영영 밀린다.
 */
const REPOSITION_RETRY_DELAYS_MS = [32, 300, 700] as const;

function scheduleReposition(): void {
  for (const delay of REPOSITION_RETRY_DELAYS_MS) {
    window.setTimeout(() => {
      const current = document.getElementById(WRAP_ID);
      if (current) positionOverGameHud(current);
    }, delay);
  }
}

function bindReposition(): void {
  if (!resizeBound) {
    resizeBound = true;
    window.addEventListener('resize', scheduleReposition);
  }
  // 캔버스 박스 자체를 관찰 — 전체화면 진입·해제, Phaser의 지연 갱신(resizeInterval)
  // 등 window resize와 어긋나는 변화까지 순서 경쟁 없이 따라간다.
  const canvas = document.querySelector<HTMLCanvasElement>('#game-root canvas');
  if (canvas && canvas !== observedCanvas && typeof ResizeObserver !== 'undefined') {
    observedCanvas = canvas;
    new ResizeObserver(scheduleReposition).observe(canvas);
  }
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
