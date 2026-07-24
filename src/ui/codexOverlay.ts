import type { CodexEntry } from '../spell/spellCodex';
import { sortCodexForDisplay } from '../spell/spellCodex';
import { ELEMENT_PALETTES, paletteColorToCss } from '../render/palette';

/**
 * 주문 도감 오버레이 — 타이틀 화면의 도감 탭에서 연다 (게임성 분석 ③).
 * R3 소유 자립형 DOM 오버레이 — runSummaryOverlay와 같은 패턴.
 * 씬은 항목 배열만 넘기고, 닫힘(Esc·닫기·바깥 클릭)을 Promise로 돌려받는다.
 */

const STYLE_ID = 'r3-codex-style';
const WRAP_ID = 'r3-codex-wrap';

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: 44;
  display: grid; place-items: center;
  background: rgba(3, 5, 16, 0.9);
  opacity: 0; visibility: hidden; transition: opacity 200ms ease;
  font-family: 'Segoe UI', 'Malgun Gothic', sans-serif;
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
#${WRAP_ID} .codex-panel {
  width: min(560px, 92vw); max-height: min(640px, 86vh);
  display: flex; flex-direction: column;
  border: 1px solid #3a4a8f; border-radius: 14px;
  background: rgba(8, 11, 28, 0.96);
  box-shadow: 0 0 42px rgba(83, 109, 255, 0.18);
  padding: 20px 22px 16px;
}
#${WRAP_ID} .codex-title {
  font-size: 20px; font-weight: 800; letter-spacing: 0.3em; color: #eef1ff;
  text-align: center;
}
#${WRAP_ID} .codex-sub { margin-top: 4px; text-align: center; font-size: 12px; color: #7f8aba; }
#${WRAP_ID} .codex-list {
  margin-top: 14px; overflow-y: auto; flex: 1; min-height: 120px;
  scrollbar-width: thin; scrollbar-color: #3a4a8f transparent;
}
#${WRAP_ID} .codex-row {
  padding: 10px 12px; border-bottom: 1px solid rgba(58, 74, 143, 0.35);
  text-align: left;
}
#${WRAP_ID} .codex-row:last-child { border-bottom: none; }
#${WRAP_ID} .codex-name { font-size: 15px; font-weight: 700; }
#${WRAP_ID} .codex-count { font-size: 11.5px; color: #7f8aba; margin-left: 8px; font-weight: 400; }
#${WRAP_ID} .codex-summary { margin-top: 3px; font-size: 12.5px; color: #aeb9e8; line-height: 1.55; }
#${WRAP_ID} .codex-flavor { margin-top: 2px; font-size: 12px; color: #8a93bd; font-style: italic; }
#${WRAP_ID} .codex-empty {
  display: grid; place-items: center; height: 150px;
  font-size: 13.5px; color: #7f8aba; line-height: 1.9; text-align: center;
}
#${WRAP_ID} .codex-hint { margin-top: 12px; text-align: center; font-size: 12px; color: #7f8aba; }
#${WRAP_ID} .codex-hint b { color: #dfe6ff; }
`;

function ensureDom(): { wrap: HTMLDivElement; panel: HTMLDivElement } {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  let wrap = document.getElementById(WRAP_ID) as HTMLDivElement | null;
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.setAttribute('aria-hidden', 'true');
    document.body.appendChild(wrap);
  }
  wrap.innerHTML = '<div class="codex-panel" role="dialog" aria-label="주문 도감"></div>';
  return { wrap, panel: wrap.firstElementChild as HTMLDivElement };
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch
  ));
}

function renderRows(entries: readonly CodexEntry[]): string {
  if (entries.length === 0) {
    return `<div class="codex-empty">아직 기록된 주문이 없다.<br>
      전투에서 <b>Enter</b>를 눌러 첫 문장을 영창하라 —<br>당신이 만든 마법이 여기 새겨진다.</div>`;
  }
  return sortCodexForDisplay(entries).map((entry) => {
    const color = paletteColorToCss(ELEMENT_PALETTES[entry.element]?.core ?? 0x8fa4ff);
    const count = entry.castCount > 1 ? `<span class="codex-count">×${entry.castCount}</span>` : '';
    const flavor = entry.flavor
      ? `<div class="codex-flavor">“${escapeHtml(entry.flavor)}”</div>` : '';
    return `<div class="codex-row">
      <div class="codex-name" style="color:${color}">${escapeHtml(entry.name)}${count}</div>
      <div class="codex-summary">${escapeHtml(entry.summary)}</div>
      ${flavor}
    </div>`;
  }).join('');
}

/** 도감을 연다. 닫힐 때 resolve — Esc·바깥 클릭으로 닫는다. */
export function showCodexOverlay(entries: readonly CodexEntry[]): Promise<void> {
  const { wrap, panel } = ensureDom();
  panel.innerHTML = `
    <div class="codex-title">주문 도감</div>
    <div class="codex-sub">${entries.length > 0 ? `새겨진 주문 ${entries.length}종` : '비어 있는 책'}</div>
    <div class="codex-list">${renderRows(entries)}</div>
    <div class="codex-hint"><b>ESC</b> 또는 바깥을 클릭해 닫기</div>
  `;

  return new Promise((resolve) => {
    const close = (): void => {
      window.removeEventListener('keydown', onKey, true);
      wrap!.classList.remove('active');
      wrap!.setAttribute('aria-hidden', 'true');
      resolve();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    // 바깥(배경) 클릭만 닫기 — 패널 내부 클릭·스크롤은 유지
    wrap.onclick = (event) => { if (event.target === wrap) close(); };
    window.addEventListener('keydown', onKey, true);
    // rAF 대신 강제 리플로우 후 동기 추가 — 숨김 탭에서도 열리고 트랜지션도 산다
    void wrap.offsetWidth;
    wrap.classList.add('active');
    wrap.setAttribute('aria-hidden', 'false');
  });
}
