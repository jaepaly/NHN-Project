/**
 * 보스 후 선택 오버레이 — "이대로 마칠까 vs 이어갈까" (게임성: 절정 + 성장하는 맛).
 * R3 자립형 DOM 오버레이 (runSummary/codex 패턴). 씬은 현재 루프·다음 난이도만 넘기고,
 * 선택('end' | 'continue')을 Promise로 돌려받는다.
 */

const STYLE_ID = 'r3-bosschoice-style';
const WRAP_ID = 'r3-bosschoice-wrap';

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: 46;
  display: grid; place-items: center;
  background: rgba(3, 5, 16, 0.9);
  opacity: 0; visibility: hidden; transition: opacity 220ms ease;
  font-family: 'Segoe UI', 'Malgun Gothic', sans-serif; text-align: center;
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
#${WRAP_ID} .bc-kicker {
  font-size: 13px; letter-spacing: 0.34em; color: #72f1b8;
  text-shadow: 0 0 20px rgba(114, 241, 184, 0.7);
}
#${WRAP_ID} .bc-title {
  margin-top: 8px; font-size: clamp(26px, 4.5vw, 38px); font-weight: 800;
  color: #eef1ff; letter-spacing: 0.06em;
}
#${WRAP_ID} .bc-sub { margin-top: 8px; font-size: 13.5px; color: #9aa4d4; line-height: 1.7; }
#${WRAP_ID} .bc-cards { margin-top: 24px; display: flex; gap: 18px; justify-content: center; }
#${WRAP_ID} .bc-card {
  width: min(230px, 40vw); padding: 20px 18px; cursor: pointer;
  border: 1px solid var(--bc-core); border-radius: 13px;
  background: rgba(8, 11, 28, 0.94);
  box-shadow: 0 0 0 rgba(0,0,0,0); transition: box-shadow 160ms ease, transform 160ms ease;
}
#${WRAP_ID} .bc-card:hover, #${WRAP_ID} .bc-card.focused {
  box-shadow: 0 0 26px color-mix(in srgb, var(--bc-glow) 55%, transparent);
  transform: translateY(-3px);
}
#${WRAP_ID} .bc-card-title { font-size: 18px; font-weight: 700; color: var(--bc-core); }
#${WRAP_ID} .bc-card-desc { margin-top: 8px; font-size: 12.5px; color: #aeb9e8; line-height: 1.55; }
#${WRAP_ID} .bc-hotkey {
  display: inline-block; margin-bottom: 10px; min-width: 20px;
  font: 700 12px/1.6 'Consolas', monospace; color: #0a0e22;
  background: var(--bc-core); border-radius: 5px; padding: 0 6px;
}
#${WRAP_ID} .bc-hint { margin-top: 20px; font-size: 12px; color: #7f8aba; }
#${WRAP_ID} .bc-hint b { color: #dfe6ff; }
`;

export type BossChoice = 'end' | 'continue';

interface ChoiceCard {
  choice: BossChoice;
  hotkey: string;
  title: string;
  desc: string;
  core: string;
  glow: string;
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
export function showBossChoice(nextLoop: number, nextDamagePct: number): Promise<BossChoice> {
  const wrap = ensureDom();
  const cards: ChoiceCard[] = [
    {
      choice: 'end', hotkey: '1', title: '여기서 마친다',
      desc: '이번 여정을 갈무리하고 시작 화면으로. 얻은 유산은 이미 안전하다.',
      core: '#72f1b8', glow: '#1f9d5c',
    },
    {
      choice: 'continue', hotkey: '2', title: '더 깊이 간다',
      desc: `빌드 그대로 다음 순환으로 — 적 피해 ×${(nextDamagePct / 100).toFixed(1)}. `
        + '더 강해지지만, 여기서 쓰러지면 이번에 더 벌 것을 잃는다.',
      core: '#e2b7ff', glow: '#8a3ffb',
    },
  ];

  wrap.innerHTML = `
    <div>
      <div class="bc-kicker">BOSS FELLED</div>
      <div class="bc-title">${nextLoop > 1 ? `${nextLoop - 1}순환 돌파` : '기억의 보스를 넘었다'}</div>
      <div class="bc-sub">유산은 은행에 새겨졌다. 이대로 마칠 것인가, 더 깊이 밀어붙일 것인가.</div>
      <div class="bc-cards">
        ${cards.map((c) => `
          <div class="bc-card" data-choice="${c.choice}" style="--bc-core:${c.core};--bc-glow:${c.glow}">
            <div class="bc-hotkey">${c.hotkey}</div>
            <div class="bc-card-title">${escapeText(c.title)}</div>
            <div class="bc-card-desc">${escapeText(c.desc)}</div>
          </div>`).join('')}
      </div>
      <div class="bc-hint"><b>1</b> 마치기 · <b>2</b> 이어가기 · 클릭</div>
    </div>`;

  return new Promise<BossChoice>((resolve) => {
    const finish = (choice: BossChoice): void => {
      window.removeEventListener('keydown', onKey, true);
      wrap.classList.remove('active');
      wrap.setAttribute('aria-hidden', 'true');
      resolve(choice);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === '1') { event.preventDefault(); event.stopImmediatePropagation(); finish('end'); }
      else if (event.key === '2') { event.preventDefault(); event.stopImmediatePropagation(); finish('continue'); }
    };
    wrap.querySelectorAll<HTMLElement>('.bc-card').forEach((el) => {
      el.addEventListener('click', () => finish(el.dataset.choice as BossChoice));
    });
    window.addEventListener('keydown', onKey, true);
    void wrap.offsetWidth;
    wrap.classList.add('active');
    wrap.setAttribute('aria-hidden', 'false');
  });
}
