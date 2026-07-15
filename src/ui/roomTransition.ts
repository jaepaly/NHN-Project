/**
 * 방 전환 연출 — R3 소유 UI (PHASE_2 R3 P0)
 * R1 결합: controller.on('room-transition', (state, durationMs) =>
 *            playRoomTransition(`ROOM ${state.roomIndex + 1}`, durationMs));
 * DOM 오버레이 — 전투 씬 코드·index.html을 건드리지 않는다.
 */

const STYLE_ID = 'r3-transition-style';
const WRAP_ID = 'r3-transition-wrap';

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: 30;
  display: grid; place-items: center;
  background: #04050f;
  opacity: 0; visibility: hidden; pointer-events: none;
  font-family: 'Segoe UI', 'Malgun Gothic', sans-serif;
}
#${WRAP_ID}.active { visibility: visible; }
#${WRAP_ID} .transition-label {
  font-size: clamp(30px, 5vw, 46px); font-weight: 800; letter-spacing: 0.3em;
  color: #eef1ff; text-shadow: 0 0 26px rgba(76, 102, 255, 0.9);
  transform: translateX(0.15em); /* letter-spacing 시각 중앙 보정 */
}
#${WRAP_ID} .transition-sub {
  margin-top: 10px; text-align: center;
  font-size: 13px; letter-spacing: 0.2em; color: #6b7bd6;
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
  return wrap;
}

let running: Promise<void> | null = null;

/**
 * 페이드 인 → 라벨 표시 → 페이드 아웃. durationMs는 계약상 500~1000 권장 (기본 700).
 * 중복 호출 시 진행 중인 연출 Promise를 그대로 반환한다.
 */
export function playRoomTransition(label: string, durationMs = 700, subLabel = ''): Promise<void> {
  if (running) return running;
  const wrap = ensureDom();
  const clamped = Math.min(1000, Math.max(500, durationMs));
  const fadeMs = Math.round(clamped * 0.3);
  const holdMs = clamped - fadeMs * 2;

  wrap.innerHTML = `
    <div>
      <div class="transition-label"></div>
      ${subLabel ? '<div class="transition-sub"></div>' : ''}
    </div>`;
  wrap.querySelector('.transition-label')!.textContent = label;
  if (subLabel) wrap.querySelector('.transition-sub')!.textContent = subLabel;

  wrap.style.transition = `opacity ${fadeMs}ms ease`;
  wrap.classList.add('active');

  running = new Promise<void>((resolve) => {
    // rAF는 페이드인 프레임 확보용, setTimeout은 백그라운드 탭(rAF 정지) 폴백
    let started = false;
    const start = (): void => {
      if (started) return;
      started = true;
      wrap.style.opacity = '1';
      window.setTimeout(() => {
        wrap.style.opacity = '0';
        window.setTimeout(() => {
          wrap.classList.remove('active');
          wrap.innerHTML = '';
          running = null;
          resolve();
        }, fadeMs);
      }, fadeMs + holdMs);
    };
    requestAnimationFrame(start);
    window.setTimeout(start, 60);
  });
  return running;
}
