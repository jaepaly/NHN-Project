import { UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL } from './uiTokens';
import { cornerFlourish, divider, ornamentCss } from './grimoireOrnament';

/**
 * 첫 런 조작 안내 (총괄 제보 2026-08-06).
 *
 * 제보: *"다들 엔터키를 눌러서 영창을 입력할 수 있다는 사실 자체를 인지하지 못하는 거
 * 같음."*
 *
 * **Enter를 모르면 이 게임은 아무것도 아니다.** 자유 문장으로 마법을 만드는 게 전부인데
 * 그 입구를 못 찾으면 남는 건 WASD로 도는 것뿐이다. 하단에
 * `WASD 이동 · ENTER 영창 · ESC 일시정지` 한 줄이 있지만 아무도 안 본다 — 전투가
 * 시작되면 시선이 화면 중앙에 있고, 작은 회색 글씨는 장식으로 처리된다.
 *
 * ## 무엇을 넣지 않았나
 *
 * 각인·정령 설명은 **일부러 뺐다.** 총괄 제보에 그 둘도 안 와닿는다는 말이 있었지만,
 * 아직 하나도 없는 상태에서 "각인은 자동 시전됩니다"를 읽어봐야 남지 않는다. 한 번에
 * 다 설명하면 **아무것도 안 읽힌다** — 셋을 넣으면 셋 다 놓친다.
 *
 * 여기서는 **지금 당장 해야 할 하나**(Enter)만 크게 말하고, 이동·일시정지를 보조로 둔다.
 * 각인·정령은 실제로 처음 얻는 순간에 짧게 붙이는 게 맞다(별도 작업).
 *
 * ## 언제 뜨나
 *
 * 첫 런의 **연구 주제 선택 직후** 한 번. 그 자리인 이유:
 *  - 이미 화면이 멈춰 있어 흐름을 새로 끊지 않는다
 *  - 연구 카드로 "이 게임엔 고를 게 있다"를 본 직후라 맥락이 이어진다
 *  - 전투가 시작되기 전이라 읽을 여유가 있다
 *
 * ⚠️ 표시 여부는 `totalRuns`가 아니라 **전용 플래그**로 판단한다. 첫 런에 죽고 다시
 * 시작하면 `totalRuns`는 그대로라 매번 다시 뜬다 — 그건 성가시다.
 */

const STYLE_ID = 'r3-first-run-tutorial-style';
const WRAP_ID = 'r3-first-run-tutorial';
const SEEN_KEY = 'incant:tutorial:v1';

/** 이미 봤는가 — localStorage를 못 쓰면 "봤다"로 취급해 조용히 건너뛴다 */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* 저장 못 해도 이번 런은 봤으니 그냥 넘어간다 */
  }
}

function ensureDom(): HTMLElement {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: ${UI_LAYER.reward + 2};
  display: grid; place-items: center;
  background: radial-gradient(ellipse at 50% 45%, rgba(40, 28, 52, .55), transparent 55%),
    rgba(3, 2, 8, .88);
  font-family: ${UI_FONT.serif};
  opacity: 0; visibility: hidden; transition: opacity 200ms ease;
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
${ornamentCss(WRAP_ID)}
#${WRAP_ID} .tut-panel {
  --orn: ${UI_COLOR.accent};
  position: relative; width: min(560px, calc(100vw - 36px));
  padding: 34px 38px 26px; box-sizing: border-box; text-align: center;
  color: ${UI_COLOR.text};
  border: 1px solid rgba(179, 151, 99, .5); border-radius: ${UI_MATERIAL.deckle};
  background: ${UI_MATERIAL.grain}, ${UI_MATERIAL.stain},
    linear-gradient(152deg, rgba(26, 19, 31, .99), rgba(11, 8, 16, .995));
  box-shadow: ${UI_MATERIAL.paperShadowLift};
}
#${WRAP_ID} .tut-kicker {
  font: 700 11px/1 ${UI_FONT.serif}; letter-spacing: .24em; color: #b79a68;
}
#${WRAP_ID} h2 {
  margin: 9px 0 2px; font-size: 25px; font-weight: 700; color: ${UI_COLOR.textBright};
  letter-spacing: .02em;
}
/* 핵심 한 줄 — 이것만 읽고 나가도 게임이 된다 */
#${WRAP_ID} .tut-hero {
  margin: 16px 0 6px; padding: 16px 12px;
  border: 1px solid rgba(216, 187, 114, .34); border-radius: 12px 9px 13px 10px;
  background: rgba(216, 187, 114, .055);
}
#${WRAP_ID} .tut-hero .key {
  display: inline-block; min-width: 78px; padding: 7px 14px; margin-bottom: 9px;
  color: ${UI_COLOR.ink}; background: ${UI_COLOR.accent};
  border-radius: 6px; font: 700 17px ${UI_FONT.mono}; letter-spacing: .06em;
}
#${WRAP_ID} .tut-hero .line {
  font-size: 16px; line-height: 1.6; color: ${UI_COLOR.textBright};
}
#${WRAP_ID} .tut-hero .sub {
  margin-top: 7px; font-size: 13px; color: ${UI_COLOR.textSoft};
}
#${WRAP_ID} .tut-example {
  margin-top: 10px; font: 15px ${UI_FONT.serif}; color: #e9d9a8;
}
#${WRAP_ID} .tut-rows { margin: 4px 0 0; display: grid; gap: 7px; }
#${WRAP_ID} .tut-row {
  display: flex; align-items: center; gap: 12px; justify-content: center;
  font-size: 14px; color: ${UI_COLOR.textSoft};
}
#${WRAP_ID} .tut-row b {
  min-width: 96px; padding: 4px 9px; color: ${UI_COLOR.textBright};
  border: 1px solid ${UI_COLOR.border}; border-radius: 5px;
  font: 700 13px ${UI_FONT.mono}; background: rgba(255, 255, 255, .04);
}
#${WRAP_ID} .tut-go {
  margin-top: 20px; padding: 11px 30px; cursor: pointer;
  color: ${UI_COLOR.ink}; background: ${UI_COLOR.accent};
  border: 1px solid ${UI_COLOR.accentGlow}; border-radius: 8px;
  font: 700 15px ${UI_FONT.serif};
}
#${WRAP_ID} .tut-go:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
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

/**
 * 첫 런 안내를 띄우고 닫힐 때까지 기다린다. 이미 본 적이 있으면 즉시 해소된다.
 *
 * 닫는 키를 **Enter로 둔 것이 의도**다 — 안내를 닫는 동작 자체가 곧 영창을 여는 동작과
 * 같은 키라, 손이 그 키를 한 번 기억하게 된다.
 */
export function showFirstRunTutorial(): Promise<void> {
  if (tutorialSeen()) return Promise.resolve();
  const wrap = ensureDom();
  wrap.innerHTML = `
    <div class="tut-panel" aria-labelledby="tut-title">
      ${cornerFlourish().replace('orn-corner', 'orn-corner tl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner tr')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner bl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner br')}
      <div class="tut-kicker">FIRST INCANTATION</div>
      <h2 id="tut-title">말이 곧 마법이 된다</h2>
      ${divider()}
      <div class="tut-hero">
        <div class="key">ENTER</div>
        <div class="line">시간이 느려지고 <b>문장을 쓸 수 있다</b></div>
        <div class="sub">정해진 스킬은 없다 — 쓴 대로 마법이 된다</div>
        <div class="tut-example">예) <b>거대한 화염구를 던진다</b> · <b>얼음 감옥에 가둬라</b></div>
      </div>
      <div class="tut-rows">
        <div class="tut-row"><b>WASD</b><span>이동</span></div>
        <div class="tut-row"><b>ESC</b><span>일시정지 · 지도와 내 빌드 보기</span></div>
      </div>
      <button class="tut-go" type="button">시작한다 (Enter)</button>
    </div>`;

  const go = wrap.querySelector<HTMLButtonElement>('.tut-go')!;
  return new Promise<void>((resolve) => {
    const finish = (): void => {
      window.removeEventListener('keydown', onKeyDown, true);
      markTutorialSeen();
      wrap.classList.remove('active');
      window.setTimeout(() => {
        if (!wrap.classList.contains('active')) wrap.innerHTML = '';
      }, 240);
      resolve();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      // Enter·Space·Escape 다 닫는다 — 여기서 막혀 있으면 안내가 오히려 벽이 된다
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish();
      }
    };
    go.addEventListener('click', finish);
    window.addEventListener('keydown', onKeyDown, true);
    // ⚠️ rAF만 쓰면 **백그라운드 탭에서 영영 안 뜬다.** rAF는 탭이 숨겨지면 멈추는데,
    // 이 안내는 런 시작 흐름을 붙잡고 있어서 안 보이면 게임이 멈춘 것처럼 된다
    // (실제로 브라우저 검증에서 DOM은 생겼는데 `active`가 안 붙는 걸 확인했다).
    // 보상 카드 오버레이가 같은 이유로 이미 쓰는 패턴을 그대로 따른다.
    let activated = false;
    const activate = (): void => {
      if (activated) return;
      activated = true;
      wrap.classList.add('active');
      go.focus({ preventScroll: true });
    };
    requestAnimationFrame(activate);
    window.setTimeout(activate, 60);
  });
}
