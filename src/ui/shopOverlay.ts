import { UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL, overlayBaseCss } from './uiTokens';
import { cornerFlourish, divider, ornamentCss } from './grimoireOrnament';

const STYLE_ID = 'r3-shop-style';
const WRAP_ID = 'r3-shop-wrap';

const CSS = `
${overlayBaseCss(WRAP_ID)}
#${WRAP_ID} { z-index: ${UI_LAYER.codex}; }
${ornamentCss(WRAP_ID)}
#${WRAP_ID} .shop-panel {
  --orn: ${UI_COLOR.accent};
  width: min(580px, calc(100vw - 32px)); padding: 34px 38px 30px;
  text-align: center; background: ${UI_COLOR.panel}; border: 1px solid ${UI_COLOR.border};
  box-shadow: ${UI_MATERIAL.paperShadow}, ${UI_MATERIAL.rule};
}
#${WRAP_ID} .shop-token-readout {
  position: fixed; top: 19px; right: 28px; z-index: 1;
  font-family: ${UI_FONT.serif}; font-size: 15px; letter-spacing: 1.2px;
  color: ${UI_COLOR.warm}; opacity: 0.9; -webkit-text-stroke: 3px ${UI_COLOR.ink}; paint-order: stroke fill;
}
#${WRAP_ID} .shop-title { font-family: ${UI_FONT.serif}; font-size: 24px; font-weight: 800; letter-spacing: 0.24em; color: ${UI_COLOR.textBright}; }
#${WRAP_ID} .shop-note { margin-top: 24px; color: ${UI_COLOR.textSoft}; font-size: 16px; line-height: 1.8; }
#${WRAP_ID} .shop-foot { margin-top: 28px; color: ${UI_COLOR.textMuted}; font-size: 14px; }
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
    document.body.appendChild(wrap);
  }
  wrap.innerHTML = '<div class="shop-panel" role="dialog" aria-label="상점"></div>';
  return { wrap, panel: wrap.firstElementChild as HTMLDivElement };
}

/** 꾸미기 상품 연결 전의 상점 진입점. 로비와 달리 암막 위에도 토큰을 읽을 수 있게 둔다. */
export function showShopOverlay(tokenBalance: number): Promise<void> {
  const { wrap, panel } = ensureDom();
  const tokenReadout = document.createElement('div');
  tokenReadout.className = 'shop-token-readout';
  tokenReadout.textContent = `✦ 주문 토큰 ${tokenBalance}`;
  wrap.appendChild(tokenReadout);
  panel.innerHTML = `
    ${cornerFlourish().replace('orn-corner', 'orn-corner tl')}
    ${cornerFlourish().replace('orn-corner', 'orn-corner tr')}
    ${cornerFlourish().replace('orn-corner', 'orn-corner bl')}
    ${cornerFlourish().replace('orn-corner', 'orn-corner br')}
    <div class="shop-title">상점</div>
    ${divider()}
    <div class="shop-note">꾸미기 품목을 준비하고 있습니다.</div>
    <div class="shop-foot"><b>ESC</b> 또는 바깥을 클릭해 닫기</div>`;

  return new Promise((resolve) => {
    const close = (): void => {
      window.removeEventListener('keydown', onKey, true);
      wrap.classList.remove('active');
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
  });
}
