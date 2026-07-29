import type { CodexEntry, CodexSortMode } from '../spell/spellCodex';
import { UI_FONT, UI_LAYER } from './uiTokens';
import { sortCodex } from '../spell/spellCodex';
import { ELEMENT_LABELS, ELEMENT_PALETTES, FORM_LABELS, paletteColorToCss } from '../render/palette';
import { glyphSvg } from '../render/formGlyphs';

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
  position: fixed; inset: 0; z-index: ${UI_LAYER.codex};
  display: grid; place-items: center;
  background: rgba(3, 5, 16, 0.9);
  opacity: 0; visibility: hidden; transition: opacity 200ms ease;
  font-family: ${UI_FONT.sans};
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
