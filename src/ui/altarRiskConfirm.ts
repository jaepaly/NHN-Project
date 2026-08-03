import { UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL } from './uiTokens';

const STYLE_ID = 'r3-altar-risk-confirm-style';
const WRAP_ID = 'r3-altar-risk-confirm';

function ensureDom(): HTMLElement {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${WRAP_ID} { position: fixed; inset: 0; z-index: ${UI_LAYER.reward + 1}; display: grid; place-items: center;
  background: rgba(3, 2, 8, .74); font-family: ${UI_FONT.serif}; opacity: 0; visibility: hidden; transition: opacity 130ms ease; }
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
#${WRAP_ID} .altar-risk-panel { width: min(420px, calc(100vw - 36px)); padding: 28px 30px 24px; text-align: center;
  color: ${UI_COLOR.text}; border: 1px solid #c76b77; border-radius: ${UI_MATERIAL.deckle};
  background: ${UI_MATERIAL.grain}, linear-gradient(155deg, rgba(45, 16, 28, .98), rgba(17, 9, 18, .98));
  box-shadow: ${UI_MATERIAL.paperShadowLift}; }
#${WRAP_ID} .altar-risk-kicker { color: #ff9ba7; font-size: 12px; font-weight: 700; letter-spacing: .2em; }
#${WRAP_ID} h2 { margin: 7px 0 11px; color: ${UI_COLOR.textBright}; font-size: 24px; }
#${WRAP_ID} p { margin: 0; color: ${UI_COLOR.textSoft}; font-size: 14px; line-height: 1.65; }
#${WRAP_ID} .altar-risk-hp { margin: 15px 0 20px; color: #ffbbc3; font: 700 21px ${UI_FONT.mono}; }
#${WRAP_ID} .altar-risk-actions { display: flex; gap: 10px; justify-content: center; }
#${WRAP_ID} button { min-width: 130px; padding: 10px 14px; border-radius: 7px; cursor: pointer; font: 700 14px ${UI_FONT.serif}; }
#${WRAP_ID} .confirm { color: #240b14; background: #ff9ba7; border: 1px solid #ffd1d6; }
#${WRAP_ID} .cancel { color: ${UI_COLOR.text}; background: #252039; border: 1px solid ${UI_COLOR.border}; }
#${WRAP_ID} button:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
`;
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

export interface AltarRiskConfirmInput {
  currentMaxHp: number;
  nextMaxHp: number;
}

/** 위험 거래만 한 번 더 확인한다. 취소하면 보상 카드 선택으로 돌아간다. */
export function showAltarRiskConfirm(input: AltarRiskConfirmInput): Promise<boolean> {
  const wrap = ensureDom();
  wrap.innerHTML = `
    <div class="altar-risk-panel" aria-labelledby="altar-risk-title">
      <div class="altar-risk-kicker">DANGEROUS BARGAIN</div>
      <h2 id="altar-risk-title">생명을 깊이 내어준다</h2>
      <p>이 거래를 고르면 회복 여유가 크게 줄어듭니다.<br>그래도 제단과 거래하시겠습니까?</p>
      <div class="altar-risk-hp">최대 생명 ${input.currentMaxHp} → ${input.nextMaxHp}</div>
      <div class="altar-risk-actions">
        <button class="cancel" type="button">돌아가기</button>
        <button class="confirm" type="button">그래도 거래한다</button>
      </div>
    </div>`;
  const confirm = wrap.querySelector<HTMLButtonElement>('.confirm')!;
  const cancel = wrap.querySelector<HTMLButtonElement>('.cancel')!;

  return new Promise<boolean>((resolve) => {
    const finish = (accepted: boolean): void => {
      window.removeEventListener('keydown', onKeyDown, true);
      wrap.classList.remove('active');
      window.setTimeout(() => { if (!wrap.classList.contains('active')) wrap.innerHTML = ''; }, 160);
      resolve(accepted);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); finish(false);
      } else if (event.key === 'Enter') {
        event.preventDefault(); event.stopImmediatePropagation(); finish(true);
      }
    };
    confirm.addEventListener('click', () => finish(true));
    cancel.addEventListener('click', () => finish(false));
    window.addEventListener('keydown', onKeyDown, true);
    requestAnimationFrame(() => { wrap.classList.add('active'); confirm.focus({ preventScroll: true }); });
  });
}
