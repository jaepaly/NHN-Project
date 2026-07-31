import type { GameSettings, SettingKey } from '../run/gameSettings';
import {
  SETTINGS_CONFIG,
  loadSettings,
  saveSettings,
  settingDisplay,
} from '../run/gameSettings';
import {
  UI_COLOR, UI_FONT, UI_LAYER, UI_RADIUS, overlayBaseCss,
} from './uiTokens';

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
  // 화면 밝기는 **배경·적까지** 어두워진다 — 이펙트만 줄이고 싶으면 아래 행이다
  { key: 'brightness', label: '화면 밝기', hint: '배경·적을 포함한 전체' },
  { key: 'vfxBrightness', label: '이펙트 밝기', hint: '마법 연출만 (배경·적은 그대로)' },
];

const CSS = `
${overlayBaseCss(WRAP_ID)}
#${WRAP_ID} { z-index: ${UI_LAYER.settings}; }
#${WRAP_ID} .settings-panel {
  width: min(460px, calc(100vw - 40px));
  padding: 26px 30px 22px;
}
#${WRAP_ID} .settings-title {
  font-family: ${UI_FONT.serif};
  font-size: 19px; font-weight: 800; letter-spacing: 0.24em; color: ${UI_COLOR.textBright};
}
#${WRAP_ID} .settings-sub { margin-top: 4px; font-size: 12px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .settings-row { margin-top: 22px; }
#${WRAP_ID} .settings-head { display: flex; justify-content: space-between; align-items: baseline; }
#${WRAP_ID} .settings-label { font-size: 14px; font-weight: 700; color: ${UI_COLOR.text}; }
#${WRAP_ID} .settings-value {
  font-family: ${UI_FONT.mono}; font-size: 13px; font-weight: 700; color: ${UI_COLOR.accent};
}
#${WRAP_ID} .settings-hint { margin-top: 2px; font-size: 11.5px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} input[type="range"] {
  -webkit-appearance: none; appearance: none;
  width: 100%; margin-top: 10px; height: 6px; border-radius: ${UI_RADIUS.pill};
  background: #1d2445; outline: none; cursor: pointer;
}
#${WRAP_ID} input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none;
  width: 16px; height: 16px; border-radius: ${UI_RADIUS.circle};
  background: ${UI_COLOR.text}; border: 2px solid ${UI_COLOR.ink}; cursor: grab;
}
#${WRAP_ID} input[type="range"]::-moz-range-thumb {
  width: 16px; height: 16px; border-radius: ${UI_RADIUS.circle};
  background: ${UI_COLOR.text}; border: 2px solid ${UI_COLOR.ink}; cursor: grab;
}
#${WRAP_ID} input[type="range"]:focus-visible { box-shadow: 0 0 0 3px rgba(216, 187, 114, 0.5); }
#${WRAP_ID} .settings-toggle {
  margin-top: 22px; width: 100%; display: flex; justify-content: space-between;
  align-items: center; padding: 11px 14px;
  border: 1px solid ${UI_COLOR.border}; border-radius: ${UI_RADIUS.sm};
  background: transparent; color: ${UI_COLOR.text};
  font: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
}
#${WRAP_ID} .settings-toggle:hover { border-color: ${UI_COLOR.borderStrong}; }
#${WRAP_ID} .settings-toggle b { font-family: ${UI_FONT.mono}; color: ${UI_COLOR.accent}; }
#${WRAP_ID} .settings-foot {
  margin-top: 24px; display: flex; justify-content: space-between; align-items: center;
  font-size: 12px; color: ${UI_COLOR.textMuted};
}
#${WRAP_ID} .settings-reset {
  padding: 6px 12px; border-radius: ${UI_RADIUS.sm}; cursor: pointer;
  border: 1px solid ${UI_COLOR.border}; background: transparent; color: ${UI_COLOR.textSoft};
  font: inherit; font-size: 12px;
}
#${WRAP_ID} .settings-reset:hover { border-color: ${UI_COLOR.borderStrong}; color: ${UI_COLOR.text}; }
#${WRAP_ID} .settings-foot b { color: ${UI_COLOR.text}; }
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
  wrap.innerHTML = '<div class="settings-panel ui-panel" role="dialog" aria-label="설정"></div>';
  return { wrap, panel: wrap.firstElementChild as HTMLDivElement };
}

function rangeAttrs(key: SettingKey): { min: number; max: number } {
  const c = SETTINGS_CONFIG;
  if (key === 'brightness') return { min: c.brightnessMin, max: c.brightnessMax };
  if (key === 'vfxBrightness') return { min: c.vfxBrightnessMin, max: c.vfxBrightnessMax };
  return { min: c.volumeMin, max: c.volumeMax };
}

export interface SettingsOverlayOptions {
  /** 값이 바뀔 때마다 호출 — 밝기처럼 즉시 반영해야 하는 것을 씬이 받는다 */
  onChange?: (settings: GameSettings) => void;
  /** 이 화면에서 소리가 안 나는 경우(타이틀) 안내를 바꾼다 */
  audioNote?: string;
  /**
   * 음소거 토글 — 오디오를 가진 화면(전투)만 넘긴다. 없으면 행 자체를 안 그린다.
   * 타이틀엔 GameAudio가 없어 토글할 대상이 없다.
   */
  mute?: { get: () => boolean; toggle: () => boolean };
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
    ${options.mute ? '<button type="button" class="settings-toggle">음소거 <b></b></button>' : ''}
    <div class="settings-foot">
      <button type="button" class="settings-reset">기본값으로</button>
      <span><b>ESC</b> 또는 바깥을 클릭해 닫기</span>
    </div>`;

  const muteButton = panel.querySelector<HTMLButtonElement>('.settings-toggle');
  const sync = (): void => {
    if (muteButton && options.mute) {
      muteButton.querySelector('b')!.textContent = options.mute.get() ? '[켬]' : '[끔]';
    }
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
  muteButton?.addEventListener('click', () => {
    // 반환값을 쓴다 — 토글 직후 get()은 Phaser 타이밍상 이전 값을 돌려준다
    const next = options.mute?.toggle();
    muteButton.querySelector('b')!.textContent = next ? '[켬]' : '[끔]';
  });
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
    // 키보드만으로도 바로 조절되게 — 마우스를 안 쓰는 사람도 ←→로 들어온다
    panel.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
  });
}
