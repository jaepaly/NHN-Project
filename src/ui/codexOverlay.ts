import type { CodexEntry, CodexSortMode } from '../spell/spellCodex';
import { UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL, UI_SEMANTIC } from './uiTokens';
import { deckleMask, divider, ornamentCss } from './grimoireOrnament';
import { isCodexEntryTokenClaimable, markCodexEntryTokenClaimed, sortCodex } from '../spell/spellCodex';
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
  background: ${UI_COLOR.scrim};
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
#${WRAP_ID} .codex-head { position: relative; display: flex; min-height: 34px; align-items: center; }
#${WRAP_ID} .codex-title { position: relative; z-index: 1; font-size: 24px; font-weight: 800; letter-spacing: 0.28em; color: ${UI_COLOR.textBright}; }
#${WRAP_ID} .codex-title-count { margin-left: 8px; font-size: 14px; font-weight: 600; letter-spacing: 0.06em; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .codex-sub {
  position: relative; z-index: 1; margin-left: auto;
  font-family: ${UI_FONT.serif}; font-size: 15px; letter-spacing: 1.2px;
  color: ${UI_COLOR.warm}; opacity: 0.9;
  -webkit-text-stroke: 3px ${UI_COLOR.ink}; paint-order: stroke fill;
}
#${WRAP_ID} .codex-head .orn-divider {
  position: absolute; left: 50%; top: 50%; width: min(320px, 42%); height: 14px;
  margin: 0; transform: translate(-50%, -50%);
}
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
#${WRAP_ID} .codex-converted {
  position: absolute; left: 6px; right: 6px; bottom: 5px;
  padding: 2px 3px; border-radius: 4px;
  background: rgba(24, 56, 48, 0.92); color: ${UI_SEMANTIC.ok};
  font-size: 10px; font-weight: 700; letter-spacing: 0.04em;
}
#${WRAP_ID} .codex-detail {
  margin-top: 16px; padding: 14px 16px; min-height: 62px;
  border-top: 1px solid rgba(58, 74, 143, 0.4);
}
#${WRAP_ID} .codex-detail-name { font-size: 17px; font-weight: 700; }
#${WRAP_ID} .codex-detail-sum { margin-top: 4px; font-size: 15px; color: ${UI_COLOR.textSoft}; }
#${WRAP_ID} .codex-detail-flavor { margin-top: 3px; font-size: 14px; color: #8a93bd; font-style: italic; }
#${WRAP_ID} .codex-detail-meta { margin-top: 4px; font-size: 13px; color: #6f7aa8; }
#${WRAP_ID} .codex-claim {
  font: inherit; font-size: 17px; font-weight: 800; cursor: pointer;
  padding: 11px 18px; border-radius: 8px;
  border: 1px solid ${UI_COLOR.borderStrong}; background: rgba(104, 78, 34, 0.26); color: ${UI_COLOR.accentGlow};
}
#${WRAP_ID} .codex-claim:hover { border-color: ${UI_COLOR.warm}; background: rgba(164, 123, 43, 0.38); }
#${WRAP_ID} .codex-sold { margin-top: 9px; font-size: 13px; color: #7981a4; }
#${WRAP_ID} .codex-detail-action { display: flex; justify-content: flex-end; margin: 18px 22px 8px 0; }
#${WRAP_ID} .codex-claim-all {
  margin-left: auto; padding: 7px 12px; border: 1px solid ${UI_COLOR.borderStrong}; border-radius: 7px;
  background: rgba(104, 78, 34, 0.2); color: ${UI_COLOR.accentGlow}; font: inherit; font-size: 13px; cursor: pointer;
}
#${WRAP_ID} .codex-claim-all:hover { background: rgba(164, 123, 43, 0.32); }
#${WRAP_ID} .codex-detail-hint { font-size: 14px; color: ${UI_COLOR.textMuted}; text-align: center; }
#${WRAP_ID} .codex-empty {
  grid-column: 1 / -1; display: grid; place-items: center; height: 150px;
  font-size: 15px; color: ${UI_COLOR.textMuted}; line-height: 1.9; text-align: center;
}
#${WRAP_ID} .codex-foot { margin-top: 14px; text-align: center; font-size: 14px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .codex-foot b { color: ${UI_COLOR.text}; }
`;

const SORT_LABELS: Record<CodexSortMode, string> = {
  unclaimed: '미수령 우선', recent: '최근순', discovered: '발견순', power: '위력순', element: '속성별', form: '폼별',
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
export interface CodexTokenClaimResult {
  amount: number;
  tokenBalance: number;
}

export interface CodexOverlayOptions {
  tokenBalance?: number;
  tokenRewardFor?: (entry: CodexEntry) => number;
  onClaimToken?: (entry: CodexEntry) => CodexTokenClaimResult | null;
}

export function showCodexOverlay(
  entries: readonly CodexEntry[],
  options: CodexOverlayOptions = {},
): Promise<void> {
  const { wrap, panel } = ensureDom();
  let sortMode: CodexSortMode = 'recent';
  let currentEntries = [...entries];
  let tokenBalance = options.tokenBalance ?? 0;
  let selectedEntry: CodexEntry | undefined;

  const render = (): void => {
    const sorted = sortCodex(currentEntries, sortMode);
    const claimableCount = currentEntries.filter(isCodexEntryTokenClaimable).length;
    const sortButtons = (Object.keys(SORT_LABELS) as CodexSortMode[]).map((m) => (
      `<button class="codex-sortbtn${m === sortMode ? ' active' : ''}" data-sort="${m}">${SORT_LABELS[m]}</button>`
    )).join('');

    const tiles = sorted.length === 0
      ? `<div class="codex-empty">아직 기록된 주문이 없다.<br>
          전투에서 <b>Enter</b>를 눌러 첫 문장을 영창하라 —<br>당신이 만든 마법이 여기 새겨진다.</div>`
      : sorted.map((entry, i) => {
        const { core, glow } = tileColors(entry);
        const count = entry.castCount > 1 ? `<span class="codex-count">×${entry.castCount}</span>` : '';
        const converted = Boolean(options.onClaimToken) && !isCodexEntryTokenClaimable(entry);
        const selected = selectedEntry?.name === entry.name && selectedEntry.firstCastAt === entry.firstCastAt;
        const convertedMark = converted ? '<span class="codex-converted">발견 보상 수령 완료</span>' : '';
        return `<button class="codex-tile${selected ? ' selected' : ''}" data-idx="${i}" style="--tile-core:${core};--tile-glow:${glow}">
          ${count}
          <div class="codex-icon">${glyphSvg(entry.form)}</div>
          <div class="codex-tile-name">${escapeHtml(entry.name)}</div>
          <div class="codex-tile-pow">위력 ${entry.power}</div>
          ${convertedMark}
        </button>`;
      }).join('');

    panel.innerHTML = `
      <div class="codex-head">
        <div class="codex-title">주문 도감<span class="codex-title-count">(새겨진 주문 ${currentEntries.length}종)</span></div>
        ${divider()}
        <div class="codex-sub">주문 토큰 ${tokenBalance}</div>
      </div>
      <div class="codex-sortbar">
        ${currentEntries.length > 0 ? sortButtons : ''}
        ${options.onClaimToken && claimableCount > 0
          ? `<button class="codex-claim-all" type="button">새 발견 보상 모두 수령 · ${claimableCount}개</button>`
          : ''}
      </div>
      <div class="codex-grid">${tiles}</div>
      <div class="codex-detail"><div class="codex-detail-hint">타일을 클릭해 주문을 선택하세요</div></div>
      <div class="codex-foot"><b>ESC</b> 또는 바깥을 클릭해 닫기</div>
    `;

    const claimAll = panel.querySelector<HTMLButtonElement>('.codex-claim-all');
    claimAll?.addEventListener('click', () => {
      let lastBalance = tokenBalance;
      let nextEntries = currentEntries;
      for (const entry of currentEntries.filter(isCodexEntryTokenClaimable)) {
        const result = options.onClaimToken?.(entry);
        if (!result || result.amount <= 0) continue;
        nextEntries = markCodexEntryTokenClaimed(nextEntries, entry);
        lastBalance = result.tokenBalance;
      }
      currentEntries = nextEntries;
      tokenBalance = lastBalance;
      selectedEntry = undefined;
      render();
    });

    const detail = panel.querySelector<HTMLDivElement>('.codex-detail')!;
    const showDetail = (entry: CodexEntry): void => {
      const flavor = entry.flavor
        ? `<div class="codex-detail-flavor">“${escapeHtml(entry.flavor)}”</div>` : '';
      const tokenReward = options.tokenRewardFor?.(entry) ?? 0;
      const claimable = Boolean(options.onClaimToken) && isCodexEntryTokenClaimable(entry) && tokenReward > 0;
      const claimControl = options.onClaimToken
        ? (claimable
          ? `<button class="codex-claim" type="button">발견 보상 수령 · +${tokenReward} 토큰</button>`
          : '<div class="codex-sold">이 주문의 발견 보상은 이미 수령했습니다.</div>')
        : '';
      detail.innerHTML = `
        <div class="codex-detail-name" style="color:${tileColors(entry).core}">${escapeHtml(entry.name)}</div>
        <div class="codex-detail-sum">${escapeHtml(entry.summary)}</div>
        ${flavor}
        <div class="codex-detail-meta">${escapeHtml(metaLine(entry))}</div>
        <div class="codex-detail-action">${claimControl}</div>`;
      detail.querySelector<HTMLButtonElement>('.codex-claim')?.addEventListener('click', () => {
        const result = options.onClaimToken?.(entry);
        if (!result || result.amount <= 0) return;
        currentEntries = markCodexEntryTokenClaimed(currentEntries, entry);
        tokenBalance = result.tokenBalance;
        const updated = currentEntries.find((candidate) => (
          candidate.name === entry.name && candidate.firstCastAt === entry.firstCastAt
        ));
        selectedEntry = updated;
        render();
      });
    };
    panel.querySelectorAll<HTMLElement>('.codex-tile').forEach((el) => {
      const entry = sorted[Number(el.dataset.idx)];
      el.addEventListener('focus', () => showDetail(entry));
      el.addEventListener('click', () => {
        selectedEntry = entry;
        render();
      });
    });
    panel.querySelectorAll<HTMLElement>('.codex-sortbtn').forEach((el) => {
      el.addEventListener('click', () => { sortMode = el.dataset.sort as CodexSortMode; render(); });
    });
    if (selectedEntry) {
      const selected = sorted.find((entry) => (
        entry.name === selectedEntry?.name && entry.firstCastAt === selectedEntry?.firstCastAt
      ));
      if (selected) showDetail(selected);
    }
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
