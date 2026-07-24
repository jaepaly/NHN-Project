import type { CodexEntry, CodexSortMode } from '../spell/spellCodex';
import { sortCodex } from '../spell/spellCodex';
import type { SpellForm } from '../spell/types';
import { ELEMENT_LABELS, ELEMENT_PALETTES, FORM_LABELS, paletteColorToCss } from '../render/palette';

/**
 * 주문 도감 오버레이 — 타이틀의 도감 탭에서 연다 (게임성 분석 ③).
 * 리스트가 아니라 **인벤토리 그리드**: 각 주문을 속성×폼 아이콘 타일로 보여주고
 * 위력·발견일·속성·폼으로 정렬한다 (총괄 요청). 수집의 손맛.
 * R3 자립형 DOM 오버레이 — 씬은 항목만 넘기고 닫힘을 Promise로 받는다.
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
  width: min(720px, 94vw); max-height: min(88vh, 720px);
  display: flex; flex-direction: column;
  border: 1px solid #3a4a8f; border-radius: 14px;
  background: rgba(8, 11, 28, 0.97);
  box-shadow: 0 0 42px rgba(83, 109, 255, 0.18);
  padding: 20px 22px 14px;
}
#${WRAP_ID} .codex-head { display: flex; align-items: baseline; gap: 12px; }
#${WRAP_ID} .codex-title { font-size: 19px; font-weight: 800; letter-spacing: 0.28em; color: #eef1ff; }
#${WRAP_ID} .codex-sub { font-size: 12px; color: #7f8aba; }
#${WRAP_ID} .codex-sortbar { margin-top: 12px; display: flex; gap: 6px; flex-wrap: wrap; }
#${WRAP_ID} .codex-sortbtn {
  font: inherit; font-size: 12px; cursor: pointer;
  padding: 4px 12px; border-radius: 999px;
  border: 1px solid #33447f; background: transparent; color: #9aa4d4;
  transition: background 120ms, color 120ms, border-color 120ms;
}
#${WRAP_ID} .codex-sortbtn:hover { color: #c7d0ff; border-color: #4c66ff; }
#${WRAP_ID} .codex-sortbtn.active { background: #4c66ff; color: #fff; border-color: #4c66ff; }
#${WRAP_ID} .codex-grid {
  margin-top: 14px; overflow-y: auto; flex: 1; min-height: 140px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 10px; padding: 2px;
  scrollbar-width: thin; scrollbar-color: #3a4a8f transparent;
}
#${WRAP_ID} .codex-tile {
  position: relative; cursor: pointer; text-align: center;
  border: 1px solid rgba(58, 74, 143, 0.5); border-radius: 10px;
  background: rgba(12, 16, 36, 0.6); padding: 8px 6px 7px;
  transition: transform 120ms, border-color 120ms, box-shadow 120ms;
}
#${WRAP_ID} .codex-tile:hover, #${WRAP_ID} .codex-tile.selected {
  transform: translateY(-3px); border-color: var(--tile-core);
  box-shadow: 0 0 18px color-mix(in srgb, var(--tile-glow) 50%, transparent);
}
#${WRAP_ID} .codex-icon {
  width: 54px; height: 54px; margin: 0 auto 6px; border-radius: 10px;
  display: grid; place-items: center;
  background: linear-gradient(145deg, var(--tile-core), var(--tile-glow));
  box-shadow: inset 0 0 12px rgba(0,0,0,0.35);
}
#${WRAP_ID} .codex-icon svg { width: 30px; height: 30px; color: #f4f6ff; }
#${WRAP_ID} .codex-tile-name {
  font-size: 11.5px; color: #dfe6ff; line-height: 1.25;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#${WRAP_ID} .codex-tile-pow { font-size: 10px; color: #8a93bd; margin-top: 1px; }
#${WRAP_ID} .codex-count {
  position: absolute; top: 5px; right: 6px;
  font-size: 9.5px; font-weight: 700; color: #0a0e22;
  background: var(--tile-core); border-radius: 999px; padding: 0 5px;
}
#${WRAP_ID} .codex-detail {
  margin-top: 12px; padding: 10px 12px; min-height: 46px;
  border-top: 1px solid rgba(58, 74, 143, 0.4);
}
#${WRAP_ID} .codex-detail-name { font-size: 14px; font-weight: 700; }
#${WRAP_ID} .codex-detail-sum { margin-top: 3px; font-size: 12.5px; color: #aeb9e8; }
#${WRAP_ID} .codex-detail-flavor { margin-top: 2px; font-size: 12px; color: #8a93bd; font-style: italic; }
#${WRAP_ID} .codex-detail-meta { margin-top: 3px; font-size: 11px; color: #6f7aa8; }
#${WRAP_ID} .codex-detail-hint { font-size: 12.5px; color: #7f8aba; text-align: center; }
#${WRAP_ID} .codex-empty {
  grid-column: 1 / -1; display: grid; place-items: center; height: 150px;
  font-size: 13.5px; color: #7f8aba; line-height: 1.9; text-align: center;
}
#${WRAP_ID} .codex-foot { margin-top: 10px; text-align: center; font-size: 12px; color: #7f8aba; }
#${WRAP_ID} .codex-foot b { color: #dfe6ff; }
`;

const SORT_LABELS: Record<CodexSortMode, string> = {
  recent: '최근순', discovered: '발견순', power: '위력순', element: '속성별', form: '폼별',
};

/** 폼별 SVG 글리프 — 원소색 타일 위에 밝은 선으로 형태를 상징한다 (currentColor). */
const FORM_GLYPHS: Record<SpellForm, string> = {
  bolt: '<path d="M14 3 6 15h4l-1 6 8-12h-4z" fill="currentColor"/>',
  beam: '<line x1="3" y1="12" x2="19" y2="12"/><circle cx="20" cy="12" r="2.4" fill="currentColor" stroke="none"/>',
  wave: '<path d="M3 12q3-7 6 0t6 0 6 0" fill="none"/>',
  nova: '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18"/>',
  rain: '<path d="M7 4 5 11M12 3l-2 7M17 4l-2 7M8 14l-1 5M13 13l-1 5M18 14l-1 5"/>',
  wall: '<rect x="4" y="8" width="16" height="9" rx="1" fill="none"/><path d="M4 12.5h16M9 8v4.5M14 12.5V17"/>',
  cage: '<rect x="5" y="5" width="14" height="14" rx="1" fill="none"/><path d="M9.5 5v14M14 5v14M5 9.5h14M5 14h14"/>',
  orbit: '<circle cx="12" cy="12" r="7" fill="none"/><circle cx="12" cy="5" r="2.2" fill="currentColor" stroke="none"/>',
  summon: '<circle cx="12" cy="13" r="5.5" fill="none"/><circle cx="10" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="12" r="1" fill="currentColor" stroke="none"/><path d="M9 4l1.5 3M15 4l-1.5 3"/>',
  buff: '<path d="M12 20V6M6.5 11.5 12 6l5.5 5.5" fill="none"/>',
  zone: '<circle cx="12" cy="12" r="8" fill="none" stroke-dasharray="3 3"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>',
  chain: '<circle cx="7.5" cy="12" r="3.2" fill="none"/><circle cx="16.5" cy="12" r="3.2" fill="none"/><line x1="10.7" y1="12" x2="13.3" y2="12"/>',
};
const SEQUENCE_GLYPH = '<circle cx="5" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2" fill="currentColor" stroke="none"/><path d="M7.5 12h2M14.5 12h2"/>';

function glyphSvg(form: SpellForm | undefined): string {
  const inner = form ? FORM_GLYPHS[form] : SEQUENCE_GLYPH;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

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

function tileColors(entry: CodexEntry): { core: string; glow: string } {
  const primary = ELEMENT_PALETTES[entry.element];
  const secondary = entry.elementSecondary ? ELEMENT_PALETTES[entry.elementSecondary] : primary;
  return { core: paletteColorToCss(primary.core), glow: paletteColorToCss(secondary.glow) };
}

function metaLine(entry: CodexEntry): string {
  const el = ELEMENT_LABELS[entry.element]
    + (entry.elementSecondary ? `+${ELEMENT_LABELS[entry.elementSecondary]}` : '');
  const form = entry.form ? FORM_LABELS[entry.form] : '시퀀스';
  const date = new Date(entry.firstCastAt);
  const dateStr = Number.isNaN(date.getTime())
    ? '' : ` · 발견 ${date.getMonth() + 1}/${date.getDate()}`;
  return `${el} · ${form} · 위력 ${entry.power} · ${entry.castCount}회 시전${dateStr}`;
}

/** 도감을 연다. 닫힐 때 resolve — Esc·바깥 클릭으로 닫는다. */
export function showCodexOverlay(entries: readonly CodexEntry[]): Promise<void> {
  const { wrap, panel } = ensureDom();
  let sortMode: CodexSortMode = 'recent';

  const render = (): void => {
    const sorted = sortCodex(entries, sortMode);
    const sortButtons = (Object.keys(SORT_LABELS) as CodexSortMode[]).map((m) => (
      `<button class="codex-sortbtn${m === sortMode ? ' active' : ''}" data-sort="${m}">${SORT_LABELS[m]}</button>`
    )).join('');

    const tiles = sorted.length === 0
      ? `<div class="codex-empty">아직 기록된 주문이 없다.<br>
          전투에서 <b>Enter</b>를 눌러 첫 문장을 영창하라 —<br>당신이 만든 마법이 여기 새겨진다.</div>`
      : sorted.map((entry, i) => {
        const { core, glow } = tileColors(entry);
        const count = entry.castCount > 1 ? `<span class="codex-count">×${entry.castCount}</span>` : '';
        return `<button class="codex-tile" data-idx="${i}" style="--tile-core:${core};--tile-glow:${glow}">
          ${count}
          <div class="codex-icon">${glyphSvg(entry.form)}</div>
          <div class="codex-tile-name">${escapeHtml(entry.name)}</div>
          <div class="codex-tile-pow">위력 ${entry.power}</div>
        </button>`;
      }).join('');

    panel.innerHTML = `
      <div class="codex-head">
        <div class="codex-title">주문 도감</div>
        <div class="codex-sub">${entries.length > 0 ? `새겨진 주문 ${entries.length}종` : '비어 있는 책'}</div>
      </div>
      <div class="codex-sortbar">${entries.length > 0 ? sortButtons : ''}</div>
      <div class="codex-grid">${tiles}</div>
      <div class="codex-detail"><div class="codex-detail-hint">타일에 커서를 올리면 상세가 나타난다</div></div>
      <div class="codex-foot"><b>ESC</b> 또는 바깥을 클릭해 닫기</div>
    `;

    const detail = panel.querySelector<HTMLDivElement>('.codex-detail')!;
    const showDetail = (entry: CodexEntry): void => {
      const flavor = entry.flavor
        ? `<div class="codex-detail-flavor">“${escapeHtml(entry.flavor)}”</div>` : '';
      detail.innerHTML = `
        <div class="codex-detail-name" style="color:${tileColors(entry).core}">${escapeHtml(entry.name)}</div>
        <div class="codex-detail-sum">${escapeHtml(entry.summary)}</div>
        ${flavor}
        <div class="codex-detail-meta">${escapeHtml(metaLine(entry))}</div>`;
    };
    panel.querySelectorAll<HTMLElement>('.codex-tile').forEach((el) => {
      const entry = sorted[Number(el.dataset.idx)];
      el.addEventListener('mouseenter', () => showDetail(entry));
      el.addEventListener('focus', () => showDetail(entry));
      el.addEventListener('click', () => showDetail(entry));
    });
    panel.querySelectorAll<HTMLElement>('.codex-sortbtn').forEach((el) => {
      el.addEventListener('click', () => { sortMode = el.dataset.sort as CodexSortMode; render(); });
    });
  };

  render();

  return new Promise((resolve) => {
    const close = (): void => {
      window.removeEventListener('keydown', onKey, true);
      wrap.classList.remove('active');
      wrap.setAttribute('aria-hidden', 'true');
      resolve();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' || event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    };
    wrap.onclick = (event) => { if (event.target === wrap) close(); };
    window.addEventListener('keydown', onKey, true);
    void wrap.offsetWidth;
    wrap.classList.add('active');
    wrap.setAttribute('aria-hidden', 'false');
  });
}
