
import { UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL } from './uiTokens';
import {
  cornerFlourish, deckleMask, divider, ornamentCss,
} from './grimoireOrnament';/**
 * 보스 후 선택 오버레이 — "이대로 마칠까 vs 이어갈까" (게임성: 절정 + 성장하는 맛).
 * R3 자립형 DOM 오버레이 (runSummary/codex 패턴). 씬은 현재 루프·다음 난이도만 넘기고,
 * 선택('end' | 'continue')을 Promise로 돌려받는다.
 */

const STYLE_ID = 'r3-bosschoice-style';
const WRAP_ID = 'r3-bosschoice-wrap';

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: ${UI_LAYER.bossChoice};
  display: grid; place-items: center;
  background: rgba(3, 5, 16, 0.9);
  opacity: 0; visibility: hidden; transition: opacity 220ms ease;
  font-family: ${UI_FONT.sans}; text-align: center;
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
#${WRAP_ID} .bc-panel {
  position: relative; text-align: center;
  --orn: ${UI_COLOR.accent};
  max-width: min(720px, calc(100vw - 32px));
  padding: 40px 34px 28px;
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
#${WRAP_ID} .bc-kicker {
  font-size: 13px; letter-spacing: 0.34em; color: ${UI_COLOR.positive};
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6);
}
#${WRAP_ID} .bc-title {
  margin-top: 8px; font-size: clamp(26px, 4.5vw, 38px); font-weight: 800;
  color: ${UI_COLOR.textBright}; letter-spacing: 0.06em;
}
#${WRAP_ID} .bc-sub { margin-top: 8px; font-size: 13.5px; color: #9aa4d4; line-height: 1.7; }
#${WRAP_ID} .bc-cards { margin-top: 24px; display: flex; gap: 18px; justify-content: center; }
#${WRAP_ID} .bc-card {
  width: min(230px, 40vw); padding: 20px 18px; cursor: pointer;
  border: 1px solid var(--bc-core); border-radius: 13px;
  background: ${UI_COLOR.panel};
  box-shadow: 0 0 0 rgba(0,0,0,0); transition: box-shadow 160ms ease, transform 160ms ease;
}
#${WRAP_ID} .bc-card:hover, #${WRAP_ID} .bc-card.focused {
  box-shadow: ${UI_MATERIAL.paperShadowLift},
              inset 0 0 0 1px color-mix(in srgb, var(--bc-glow) 30%, transparent);
  transform: translateY(-3px);
}
#${WRAP_ID} .bc-card-title { font-size: 18px; font-weight: 700; color: var(--bc-core); }
#${WRAP_ID} .bc-card-desc { margin-top: 8px; font-size: 12.5px; color: ${UI_COLOR.textSoft}; line-height: 1.55; }
#${WRAP_ID} .bc-hotkey {
  display: inline-block; margin-bottom: 10px; min-width: 20px;
  font: 700 12px/1.6 'Consolas', monospace; color: ${UI_COLOR.ink};
  background: var(--bc-core); border-radius: 5px; padding: 0 6px;
}
#${WRAP_ID} .bc-hint { margin-top: 20px; font-size: 12px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .bc-hint b { color: ${UI_COLOR.text}; }
`;

export type BossChoice = 'end' | 'continue';
export type DemoCompletionChoice = 'start-real' | 'title';

interface ChoiceCard<T extends string> {
  choice: T;
  hotkey: string;
  title: string;
  desc: string;
  core: string;
  glow: string;
}

interface ChoiceOverlayCopy {
  kicker: string;
  title: string;
  sub: string;
  hint: string;
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
    document.body.appendChild(wrap);
  }
  return wrap;
}

function escapeText(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] ?? ch
  ));
}

/**
 * 보스 후 선택을 연다.
 * @param nextLoop 이어가면 진입할 루프 번호 (표시용) · @param nextDamagePct 다음 루프 적 피해 배율(%)
 */
function showChoiceOverlay<T extends string>(
  copy: ChoiceOverlayCopy,
  cards: readonly ChoiceCard<T>[],
): Promise<T> {
  const wrap = ensureDom();

  wrap.innerHTML = `
    <div class="ui-panel bc-panel">
      ${cornerFlourish().replace('orn-corner', 'orn-corner tl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner tr')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner bl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner br')}
      <div class="bc-kicker">${escapeText(copy.kicker)}</div>
      <div class="bc-title">${escapeText(copy.title)}</div>
      ${divider()}
      <div class="bc-sub">${escapeText(copy.sub)}</div>
      <div class="bc-cards">
        ${cards.map((c) => `
          <div class="bc-card" data-choice="${c.choice}" style="--bc-core:${c.core};--bc-glow:${c.glow}">
            <div class="bc-hotkey">${c.hotkey}</div>
            <div class="bc-card-title">${escapeText(c.title)}</div>
            <div class="bc-card-desc">${escapeText(c.desc)}</div>
          </div>`).join('')}
      </div>
      <div class="bc-hint">${copy.hint}</div>
    </div>`;

  return new Promise<T>((resolve) => {
    const finish = (choice: T): void => {
      window.removeEventListener('keydown', onKey, true);
      wrap.classList.remove('active');
      wrap.setAttribute('aria-hidden', 'true');
      resolve(choice);
    };
    const onKey = (event: KeyboardEvent): void => {
      const selected = cards.find((card) => card.hotkey === event.key);
      if (!selected) return;
      event.preventDefault(); event.stopImmediatePropagation(); finish(selected.choice);
    };
    wrap.querySelectorAll<HTMLElement>('.bc-card').forEach((el) => {
      el.addEventListener('click', () => finish(el.dataset.choice as T));
    });
    window.addEventListener('keydown', onKey, true);
    void wrap.offsetWidth;
    wrap.classList.add('active');
    wrap.setAttribute('aria-hidden', 'false');
  });
}

/** 보스 후 선택 — 저장된 런을 갈무리하거나 다음 순환으로 이어간다. */
export function showBossChoice(nextLoop: number, nextDamagePct: number): Promise<BossChoice> {
  return showChoiceOverlay<BossChoice>(
    {
      kicker: 'BOSS FELLED',
      title: nextLoop > 1 ? `${nextLoop - 1}순환 돌파` : '기억의 보스를 넘었다',
      sub: '유산은 은행에 새겨졌다. 이대로 마칠 것인가, 더 깊이 밀어붙일 것인가.',
      hint: '<b>1</b> 마치기 · <b>2</b> 이어가기 · 클릭',
    },
    [
      {
        choice: 'end', hotkey: '1', title: '여기서 마친다',
        desc: '이번 여정을 갈무리하고 시작 화면으로. 얻은 유산은 이미 안전하다.',
        core: UI_COLOR.positive, glow: '#3f7a5f',
      },
      {
        choice: 'continue', hotkey: '2', title: '더 깊이 간다',
        desc: `빌드 그대로 다음 순환으로 — 적 피해 ×${(nextDamagePct / 100).toFixed(1)}. `
          + '더 강해지지만, 여기서 쓰러지면 이번에 더 벌 것을 잃는다.',
        core: '#c9b0d8', glow: '#6b4a86',
      },
    ],
  );
}

/** 시연 런 완주 — 프리셋 빌드의 체험을 정식 런의 루프·메타 보상과 분리한다. */
export function showDemoCompletionChoice(): Promise<DemoCompletionChoice> {
  return showChoiceOverlay<DemoCompletionChoice>(
    {
      kicker: 'TRIAL COMPLETE',
      title: '체험 완료',
      sub: '각성한 영창가의 힘은 체험이었다. 이제 당신만의 영창으로 첫 기억을 시작하라.',
      hint: '<b>1</b> 정식 런 시작 · <b>2</b> 타이틀로 · 클릭',
    },
    [
      {
        choice: 'start-real', hotkey: '1', title: '정식 런 시작',
        desc: '체험 보상은 남지 않는다. 처음부터 당신만의 영창과 빌드를 만들어 간다.',
        core: UI_COLOR.positive, glow: '#3f7a5f',
      },
      {
        choice: 'title', hotkey: '2', title: '타이틀로',
        desc: '다른 각성한 영창가를 체험하거나, 시작 화면에서 새 여정을 고른다.',
        core: UI_COLOR.textSoft, glow: UI_COLOR.borderStrong,
      },
    ],
  );
}
