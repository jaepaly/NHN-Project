import type { GameSettings, SettingKey } from '../run/gameSettings';
import {
  SETTINGS_CONFIG,
  loadSettings,
  saveSettings,
  settingDisplay,
} from '../run/gameSettings';

/**
 * 설정 오버레이 — 타이틀(로비)에서 연다. R3 자립형 DOM (도감 오버레이와 같은 패턴).
 *
 * 왜 DOM인가: 타이틀은 Phaser HUD가 없어 지킬 레이어가 없고, `<input type="range">`가
 * 드래그·키보드·접근성을 공짜로 준다. 전투 중 일시정지 메뉴는 Phaser로 남긴다 —
 * 거기선 암막을 HUD 아래(깊이 98)에 깔아 빌드 칩을 밝게 남기는 게 설계의 핵심이라
 * DOM 오버레이(z-index로 전부 덮음)로 바꾸면 그 구조가 깨진다.
 *
 * 두 화면은 **같은 순수 코어**(gameSettings.ts)를 쓰므로 값·범위·저장이 항상 일치한다.
 */

const STYLE_ID = 'r3-settings-style';
const WRAP_ID = 'r3-settings-wrap';

interface SettingRow {
  key: SettingKey;
  label: string;
  hint: string;
}

const ROWS: SettingRow[] = [
  { key: 'sfxVolume', label: '효과음', hint: '타격·시전 소리' },
  { key: 'bgmVolume', label: '배경음악', hint: '전투·보스 음악' },
  { key: 'brightness', label: '화면 밝기', hint: '이펙트가 과하면 낮추세요' },
];

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: 46;
  display: grid; place-items: center;
  background: rgba(3, 5, 16, 0.9);
  opacity: 0; visibility: hidden; transition: opacity 200ms ease;
  font-family: 'Segoe UI', 'Malgun Gothic', sans-serif;
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
#${WRAP_ID} .settings-panel {
  width: min(460px, calc(100vw - 40px));
  padding: 26px 30px 22px;
  border-radius: 16px;
  border: 1px solid #2a3566;
  background: linear-gradient(180deg, #0b1030 0%, #070a1e 100%);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6);
}
#${WRAP_ID} .settings-title {
  font-size: 19px; font-weight: 800; letter-spacing: 0.28em; color: #eef1ff;
}
#${WRAP_ID} .settings-sub { margin-top: 4px; font-size: 12px; color: #7f8aba; }
#${WRAP_ID} .settings-row { margin-top: 22px; }
#${WRAP_ID} .settings-head {
  display: flex; justify-content: space-between; align-items: baseline;
}
#${WRAP_ID} .settings-label { font-size: 14px; font-weight: 700; color: #dfe6ff; }
#${WRAP_ID} .settings-value {
  font-family: Consolas, monospace; font-size: 13px; font-weight: 700; color: #8fa4ff;
}
#${WRAP_ID} .settings-hint { margin-top: 2px; font-size: 11.5px; color: #6f7aa8; }
#${WRAP_ID} input[type="range"] {
  -webkit-appearance: none; appearance: none;
  width: 100%; margin-top: 10px; height: 6px; border-radius: 3px;
  background: #1d2445; outline: none; cursor: pointer;
}
#${WRAP_ID} input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 16px; height: 16px; border-radius: 50%;
  background: #dfe6ff; border: 2px solid #0b1030; cursor: grab;
}
#${WRAP_ID} input[type="range"]::-moz-range-thumb {
  width: 16px; height: 16px; border-radius: 50%;
  background: #dfe6ff; border: 2px solid #0b1030; cursor: grab;
}
#${WRAP_ID} input[type="range"]:focus-visible { box-shadow: 0 0 0 3px rgba(76, 102, 255, 0.5); }
#${WRAP_ID} .settings-foot {
  margin-top: 24px; display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; color: #7f8aba;
}
#${WRAP_ID} .settings-reset {
  padding: 6px 12px; border-radius: 7px; cursor: pointer;
  border: 1px solid #33447f; background: transparent; color: #aeb9e8;
  font-size: 12px; font-family: inherit;
}
#${WRAP_ID} .settings-reset:hover { border-color: #4c66ff; color: #dfe6ff; }
#${WRAP_ID} .settings-foot b { color: #dfe6ff; }
@media (prefers-reduced-motion: reduce) { #${WRAP_ID} { transition: none; } }
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
  wrap.innerHTML = '<div class="settings-panel" role="dialog" aria-label="설정"></div>';
  return { wrap, panel: wrap.firstElementChild as HTMLDivElement };
}

function rangeAttrs(key: SettingKey): { min: number; max: number } {
  const c = SETTINGS_CONFIG;
  return key === 'brightness'
    ? { min: c.brightnessMin, max: c.brightnessMax }
    : { min: c.volumeMin, max: c.volumeMax };
}

export interface SettingsOverlayOptions {
  /** 값이 바뀔 때마다 호출 — 밝기처럼 즉시 반영해야 하는 것을 씬이 받는다 */
  onChange?: (settings: GameSettings) => void;
  /** 이 화면에서 소리가 안 나는 경우(타이틀) 안내를 바꾼다 */
  audioNote?: string;
}

/** 설정을 연다. 닫힐 때 최종 설정으로 resolve — Esc·바깥 클릭·닫기로 닫는다. */
export function showSettingsOverlay(
  options: SettingsOverlayOptions = {},
): Promise<GameSettings> {
  const { wrap, panel } = ensureDom();
  let settings = loadSettings(window.localStorage);

  const commit = (next: GameSettings): void => {
    settings = next;
    saveSettings(window.localStorage, settings);
    options.onChange?.(settings);
  };

  panel.innerHTML = `
    <div class="settings-title">설정</div>
    <div class="settings-sub">${options.audioNote ?? '조절한 값은 바로 저장된다'}</div>
    ${ROWS.map((row) => {
    const { min, max } = rangeAttrs(row.key);
    return `
      <div class="settings-row" data-key="${row.key}">
        <div class="settings-head">
          <span class="settings-label">${row.label}</span>
          <span class="settings-value"></span>
        </div>
        <div class="settings-hint">${row.hint}</div>
        <input type="range" min="${min}" max="${max}" step="${SETTINGS_CONFIG.step}"
          aria-label="${row.label}">
      </div>`;
  }).join('')}
    <div class="settings-foot">
      <button type="button" class="settings-reset">기본값으로</button>
      <span><b>ESC</b> 또는 바깥을 클릭해 닫기</span>
    </div>`;

  const sync = (): void => {
    for (const row of ROWS) {
      const el = panel.querySelector<HTMLElement>(`[data-key="${row.key}"]`)!;
      const input = el.querySelector<HTMLInputElement>('input')!;
      input.value = String(settings[row.key]);
      el.querySelector('.settings-value')!.textContent = settingDisplay(settings, row.key);
    }
  };

  for (const row of ROWS) {
    const el = panel.querySelector<HTMLElement>(`[data-key="${row.key}"]`)!;
    const input = el.querySelector<HTMLInputElement>('input')!;
    // input — 끄는 동안 계속 발화한다(드래그 중 실시간 반영)
    input.addEventListener('input', () => {
      commit({ ...settings, [row.key]: Number(input.value) });
      sync();
    });
  }
  panel.querySelector('.settings-reset')!.addEventListener('click', () => {
    // 저장분을 지우고 기본값을 다시 읽는다 — 기본값의 단일 출처는 gameSettings다
    try {
      window.localStorage.removeItem(SETTINGS_CONFIG.storageKey);
    } catch {
      // 저장소 비활성 — 아래에서 메모리 기본값으로 되돌린다
    }
    commit(loadSettings(window.localStorage));
    sync();
  });
  sync();

  return new Promise((resolve) => {
    const close = (): void => {
      window.removeEventListener('keydown', onKey, true);
      wrap.classList.remove('active');
      wrap.setAttribute('aria-hidden', 'true');
      resolve(settings);
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
