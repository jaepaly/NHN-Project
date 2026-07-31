
import { UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL } from './uiTokens';
import {
  cornerFlourish, deckleMask, divider, ornamentCss,
} from './grimoireOrnament';/**
 * 런 요약 오버레이 — 승리(RUN COMPLETE)·패배(YOU DIED) 공용, "이번 런의 주문서" (GDD §2 사망 흐름)
 * R3 소유 자립형 DOM 오버레이 — 씬은 데이터만 넘기고 Enter/클릭으로 재도전을 resolve받는다.
 */

const STYLE_ID = 'r3-summary-style';
const WRAP_ID = 'r3-summary-wrap';

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: ${UI_LAYER.summary};
  display: grid; place-items: center;
  background: rgba(3, 5, 16, 0.88);
  opacity: 0; visibility: hidden; transition: opacity 240ms ease;
  font-family: ${UI_FONT.sans};
  text-align: center;
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
#${WRAP_ID} .summary-title {
  font-size: clamp(34px, 6vw, 52px); font-weight: 800; letter-spacing: 0.22em;
}
#${WRAP_ID} .summary-panel {
  position: relative; text-align: center;
  --orn: ${UI_COLOR.accent};
  max-width: min(760px, calc(100vw - 32px));
  padding: 40px 36px 30px;
  -webkit-mask-image: ${deckleMask()};
  mask-image: ${deckleMask()};
  -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
  background:
    ${UI_MATERIAL.grain},
    ${UI_MATERIAL.stain},
    linear-gradient(163deg, rgba(26, 19, 30, 0.985), rgba(13, 10, 17, 0.975));
  box-shadow: ${UI_MATERIAL.paperShadow}, ${UI_MATERIAL.rule};
  border: 1px solid ${UI_COLOR.border};
}
${ornamentCss(WRAP_ID)}
#${WRAP_ID}.victory .summary-title { color: ${UI_COLOR.positive}; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6); }
#${WRAP_ID}.defeat .summary-title { color: ${UI_COLOR.danger}; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6); }
#${WRAP_ID} .summary-sub { margin-top: 6px; font-size: 13px; letter-spacing: 0.14em; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .summary-book {
  margin: 22px auto 0; padding: 14px 22px; min-width: 260px; max-width: min(420px, 84vw);
  border: 1px solid #3a4a8f; border-radius: 12px;
  background: rgba(8, 11, 28, 0.92);
}
#${WRAP_ID} .book-title { font-size: 12px; letter-spacing: 0.2em; color: ${UI_COLOR.accent}; margin-bottom: 8px; }
#${WRAP_ID} .book-row { font-size: 13.5px; color: ${UI_COLOR.textSoft}; line-height: 1.7; }
#${WRAP_ID} .book-row b { color: ${UI_COLOR.textBright}; font-weight: 600; }
#${WRAP_ID} .summary-hint { margin-top: 20px; font-size: 13px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .summary-hint b { color: ${UI_COLOR.text}; }
`;

export interface RunSummaryData {
  result: 'victory' | 'defeat';
  roomIndex: number;
  maxRooms: number;
  totalCasts: number;
  /** 최다 사용 원소 한글 라벨 (없으면 null) */
  dominantElementLabel: string | null;
  recentSpellNames: string[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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
    document.body.appendChild(wrap);
  }
  return wrap;
}

let open = false;
let current: Promise<void> | null = null;

/**
 * 요약을 표시하고 플레이어가 Enter/클릭으로 재도전을 선택할 때까지 기다린다.
 * 이미 열려 있으면 진행 중인 Promise를 공유한다 — 즉시 resolve로 뒤에서
 * 재시작이 실행되는 사고 방지 (호출측도 승/패 선점 가드를 함께 둔다).
 */
export function showRunSummaryOverlay(data: RunSummaryData): Promise<void> {
  if (current) return current;
  open = true;
  const wrap = ensureDom();
  const victory = data.result === 'victory';
  wrap.className = victory ? 'victory' : 'defeat';

  const spells = data.recentSpellNames.length
    ? data.recentSpellNames.map((name) => `『${escapeHtml(name)}』`).join(' · ')
    : '기록 없음';
  wrap.innerHTML = `
    <div class="ui-panel summary-panel">
      ${cornerFlourish().replace('orn-corner', 'orn-corner tl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner tr')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner bl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner br')}
      <div class="summary-title">${victory ? 'RUN COMPLETE' : 'YOU DIED'}</div>
      ${divider()}
      <div class="summary-sub">${victory
        ? '모든 방을 정화했다'
        : `ROOM ${data.roomIndex}/${data.maxRooms} 에서 쓰러졌다`}</div>
      <div class="summary-book">
        <div class="book-title">이번 런의 주문서</div>
        <div class="book-row">영창 <b>${data.totalCasts}</b>회${
          data.dominantElementLabel ? ` · 주력 원소 <b>${data.dominantElementLabel}</b>` : ''}</div>
        <div class="book-row">${spells}</div>
      </div>
      <div class="summary-hint"><b>Enter</b> — 새로운 런 (보스는 이번 런을 기억한다…)</div>
    </div>`;

  current = new Promise<void>((resolve) => {
    const finish = (): void => {
      window.removeEventListener('keydown', onKeyDown, true);
      wrap.classList.remove('active');
      open = false;
      current = null;
      window.setTimeout(() => { if (!open) wrap.innerHTML = ''; }, 260);
      resolve();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); e.stopImmediatePropagation();
      finish();
    };
    window.addEventListener('keydown', onKeyDown, true);
    wrap.addEventListener('click', finish, { once: true });

    let activated = false;
    const activate = (): void => {
      if (activated) return;
      activated = true;
      wrap.classList.add('active');
    };
    requestAnimationFrame(activate);
    window.setTimeout(activate, 60);
  });
  return current;
}
