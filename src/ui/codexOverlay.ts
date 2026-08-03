import type { CodexEntry, CodexSortMode } from '../spell/spellCodex';
import { UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL } from './uiTokens';
import { cornerFlourish, deckleMask, divider, ornamentCss } from './grimoireOrnament';
import { isCodexEntrySellable, markCodexEntrySold, sortCodex } from '../spell/spellCodex';
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
  background: rgba(6, 5, 10, 0.9);
  opacity: 0; visibility: hidden; transition: opacity 200ms ease;
  font-family: ${UI_FONT.sans};
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
${ornamentCss(WRAP_ID)}
#${WRAP_ID} .codex-panel {
  --orn: ${UI_COLOR.accent};
  -webkit-mask-image: ${deckleMask()};
  mask-image: ${deckleMask()};
  -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
  background:
    ${UI_MATERIAL.grain},
    ${UI_MATERIAL.stain},
    linear-gradient(163deg, rgba(26, 19, 30, 0.985), rgba(13, 10, 17, 0.975));
  box-shadow: ${UI_MATERIAL.paperShadow}, ${UI_MATERIAL.rule};
  width: min(920px, 96vw); max-height: min(90vh, 800px);
  display: flex; flex-direction: column;
  /* ⚠️ 여기 background·box-shadow를 다시 선언하면 위의 재질이 덮인다 — 실제로
     그래서 도감만 배경 겹 0이었다. 테두리만 남긴다. */
  border: 1px solid ${UI_COLOR.border};
  padding: 28px 30px 20px;
}
#${WRAP_ID} .codex-head { display: flex; align-items: baseline; gap: 12px; }
#${WRAP_ID} .codex-title { font-size: 24px; font-weight: 800; letter-spacing: 0.28em; color: ${UI_COLOR.textBright}; }
#${WRAP_ID} .codex-sub { font-size: 14px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .codex-sortbar { margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap; }
#${WRAP_ID} .codex-sortbtn {
  font: inherit; font-size: 14px; cursor: pointer;
  padding: 6px 14px; border-radius: 999px;
  border: 1px solid #33447f; background: transparent; color: #9aa4d4;
  transition: background 120ms, color 120ms, border-color 120ms;
}
#${WRAP_ID} .codex-sortbtn:hover { color: #c7d0ff; border-color: ${UI_COLOR.accentGlow}; }
#${WRAP_ID} .codex-sortbtn.active { background: ${UI_COLOR.accentGlow}; color: #fff; border-color: ${UI_COLOR.accentGlow}; }
#${WRAP_ID} .codex-grid {
  margin-top: 18px; overflow-y: auto; flex: 1; min-height: 180px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px; padding: 3px;
  scrollbar-width: thin; scrollbar-color: #3a4a8f transparent;
}
#${WRAP_ID} .codex-tile {
  position: relative; cursor: pointer; text-align: center;
  border: 1px solid rgba(58, 74, 143, 0.5); border-radius: 10px;
  background: rgba(12, 16, 36, 0.6); padding: 10px 8px 9px;
  transition: transform 120ms, border-color 120ms, box-shadow 120ms;
}
#${WRAP_ID} .codex-tile:hover, #${WRAP_ID} .codex-tile.selected {
  transform: translateY(-3px); border-color: var(--tile-core);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
#${WRAP_ID} .codex-icon {
  width: 64px; height: 64px; margin: 0 auto 8px; border-radius: 11px;
  display: grid; place-items: center;
  background: linear-gradient(145deg, var(--tile-core), var(--tile-glow));
  box-shadow: inset 0 0 12px rgba(0,0,0,0.35);
}
#${WRAP_ID} .codex-icon svg { width: 36px; height: 36px; color: #f4f6ff; }
#${WRAP_ID} .codex-tile-name {
  font-size: 14px; color: ${UI_COLOR.text}; line-height: 1.25;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
#${WRAP_ID} .codex-tile-pow { font-size: 12px; color: #8a93bd; margin-top: 2px; }
#${WRAP_ID} .codex-count {
  position: absolute; top: 5px; right: 6px;
  font-size: 11px; font-weight: 700; color: #0a0e22;
  background: var(--tile-core); border-radius: 999px; padding: 0 5px;
}
#${WRAP_ID} .codex-detail {
  margin-top: 16px; padding: 14px 16px; min-height: 62px;
  border-top: 1px solid rgba(58, 74, 143, 0.4);
}
#${WRAP_ID} .codex-detail-name { font-size: 17px; font-weight: 700; }
#${WRAP_ID} .codex-detail-sum { margin-top: 4px; font-size: 15px; color: ${UI_COLOR.textSoft}; }
#${WRAP_ID} .codex-detail-flavor { margin-top: 3px; font-size: 14px; color: #8a93bd; font-style: italic; }
#${WRAP_ID} .codex-detail-meta { margin-top: 4px; font-size: 13px; color: #6f7aa8; }
#${WRAP_ID} .codex-sell {
  margin-top: 10px; font: inherit; font-size: 14px; cursor: pointer;
  padding: 7px 12px; border-radius: 6px;
  border: 1px solid #937747; background: rgba(104, 78, 34, 0.26); color: #ffe0a0;
}
#${WRAP_ID} .codex-sell:hover { border-color: #ffd166; background: rgba(164, 123, 43, 0.38); }
#${WRAP_ID} .codex-sold { margin-top: 9px; font-size: 13px; color: #7981a4; }
#${WRAP_ID} .codex-tokens { margin-left: auto; font-size: 14px; color: #ffd166; white-space: nowrap; }
#${WRAP_ID} .codex-detail-hint { font-size: 14px; color: ${UI_COLOR.textMuted}; text-align: center; }
#${WRAP_ID} .codex-empty {
  grid-column: 1 / -1; display: grid; place-items: center; height: 150px;
  font-size: 15px; color: ${UI_COLOR.textMuted}; line-height: 1.9; text-align: center;
}
#${WRAP_ID} .codex-foot { margin-top: 14px; text-align: center; font-size: 14px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .codex-foot b { color: ${UI_COLOR.text}; }
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
export interface CodexSaleResult {
  amount: number;
  tokenBalance: number;
}

export interface CodexOverlayOptions {
  tokenBalance?: number;
  saleValueFor?: (entry: CodexEntry) => number;
  onSell?: (entry: CodexEntry) => CodexSaleResult | null;
}

export function showCodexOverlay(
  entries: readonly CodexEntry[],
  options: CodexOverlayOptions = {},
): Promise<void> {
  const { wrap, panel } = ensureDom();
  let sortMode: CodexSortMode = 'recent';
  let currentEntries = [...entries];
  let tokenBalance = options.tokenBalance ?? 0;

  const render = (selectedEntry?: CodexEntry): void => {
    const sorted = sortCodex(currentEntries, sortMode);
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
        ${cornerFlourish().replace('orn-corner', 'orn-corner tl')}
        ${cornerFlourish().replace('orn-corner', 'orn-corner tr')}
        ${cornerFlourish().replace('orn-corner', 'orn-corner bl')}
        ${cornerFlourish().replace('orn-corner', 'orn-corner br')}
        <div class="codex-title">주문 도감</div>
        ${divider()}
        <div class="codex-sub">${currentEntries.length > 0 ? `새겨진 주문 ${currentEntries.length}종` : '비어 있는 책'}</div>
        ${options.onSell ? `<div class="codex-tokens">✦ 주문 토큰 ${tokenBalance}</div>` : ''}
      </div>
      <div class="codex-sortbar">${currentEntries.length > 0 ? sortButtons : ''}</div>
      <div class="codex-grid">${tiles}</div>
      <div class="codex-detail"><div class="codex-detail-hint">타일에 커서를 올리면 상세가 나타난다</div></div>
      <div class="codex-foot"><b>ESC</b> 또는 바깥을 클릭해 닫기</div>
    `;

    const detail = panel.querySelector<HTMLDivElement>('.codex-detail')!;
    const showDetail = (entry: CodexEntry): void => {
      const flavor = entry.flavor
        ? `<div class="codex-detail-flavor">“${escapeHtml(entry.flavor)}”</div>` : '';
      const saleAmount = options.saleValueFor?.(entry) ?? 0;
      const sellable = Boolean(options.onSell) && isCodexEntrySellable(entry) && saleAmount > 0;
      const saleControl = options.onSell
        ? (sellable
          ? `<button class="codex-sell" type="button">연구 기록으로 전환 · +${saleAmount} 토큰</button>`
          : '<div class="codex-sold">다음 전환은 이 주문을 한 번 더 시전한 뒤 가능합니다.</div>')
        : '';
      detail.innerHTML = `
        <div class="codex-detail-name" style="color:${tileColors(entry).core}">${escapeHtml(entry.name)}</div>
        <div class="codex-detail-sum">${escapeHtml(entry.summary)}</div>
        ${flavor}
        <div class="codex-detail-meta">${escapeHtml(metaLine(entry))}</div>
        ${saleControl}`;
      detail.querySelector<HTMLButtonElement>('.codex-sell')?.addEventListener('click', () => {
        const result = options.onSell?.(entry);
        if (!result || result.amount <= 0) return;
        currentEntries = markCodexEntrySold(currentEntries, entry);
        tokenBalance = result.tokenBalance;
        const updated = currentEntries.find((candidate) => (
          candidate.name === entry.name && candidate.firstCastAt === entry.firstCastAt
        ));
        render(updated);
      });
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
    if (selectedEntry) showDetail(selectedEntry);
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
