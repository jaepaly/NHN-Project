/**
 * 게임 설정 (순수) — 효과음·배경음악 크기, 화면 밝기. 일시정지 메뉴에서 조절한다.
 *
 * 밝기는 취향이 아니라 **접근성 장치**다: #216 항목1이 지속형 VFX 중첩을 광과민성
 * 위험으로 지목했고 #220에서 장식 예산을 넣었지만, 사람마다 모니터·민감도가 달라
 * 마지막 한 칸은 플레이어가 쥐어야 한다. 기본값은 현행 체감을 유지한다(1.0).
 *
 * 로직을 순수 함수로 분리해 회귀로 고정한다(minimapLayout·runRewardSummary 선례).
 * 저장 실패(사생활 모드 등)는 조용히 무시 — 설정 때문에 게임이 멈추면 안 된다.
 */

export interface GameSettings {
  /** 효과음 크기 0~1 */
  sfxVolume: number;
  /** 배경음악 크기 0~1 */
  bgmVolume: number;
  /** 화면 밝기 0.4~1.3 (1=기본). 1 미만은 어둡게, 초과는 밝게 */
  brightness: number;
  /**
   * 이펙트 밝기 0.3~1 (1=기본) — **시전 연출만** 어둡게 한다 (팀 의견: "이펙트가 너무 밝다").
   *
   * `brightness`와 나누는 이유: 그건 월드 위에 검은 막을 씌우므로 이펙트를 낮추려고
   * 내리면 **배경 아트와 적 스프라이트까지** 어두워진다. 적이 안 보이는 건 접근성
   * 개선이 아니라 새 문제다. 이 축은 이펙트가 만드는 객체의 알파만 곱한다.
   *
   * 하한이 0이 아니라 0.3인 이유: 완전히 지우면 "무엇이 맞았는지"를 볼 수 없다.
   * 밝기가 아니라 **가독성**이 무너지는 지점이라 소거는 허용하지 않는다.
   */
  vfxBrightness: number;
}

export const SETTINGS_CONFIG = {
  storageKey: 'incant:settings:v1',
  /** 한 번 조절에 움직이는 폭 — 조작 횟수와 정밀도의 절충 */
  step: 0.01,
  volumeMin: 0,
  volumeMax: 1,
  /** 완전 암전·과다 발광을 막는 밝기 범위 (광과민성 대응이 되레 위험해지면 안 된다) */
  brightnessMin: 0.4,
  brightnessMax: 1.3,
  /** 이펙트 밝기 — 1을 넘길 이유가 없다(더 밝게 하려고 만든 축이 아니다) */
  vfxBrightnessMin: 0.3,
  vfxBrightnessMax: 1,
} as const;

/** 기본값은 step(0.1) 격자 위에 둔다 — 격자 밖 값은 정규화에서 반올림돼 왕복이 깨진다. */
export const DEFAULT_SETTINGS: GameSettings = {
  sfxVolume: 0.8,
  bgmVolume: 0.5,
  brightness: 1,
  vfxBrightness: 1,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** 부동소수 누적 오차를 막는다 — 0.1씩 더하면 0.30000000000000004가 화면에 샌다. */
function roundToStep(value: number): number {
  const factor = 1 / SETTINGS_CONFIG.step;
  return Math.round(value * factor) / factor;
}

export function normalizeSettings(raw: Partial<GameSettings> | null | undefined): GameSettings {
  const c = SETTINGS_CONFIG;
  return {
    sfxVolume: roundToStep(clamp(
      raw?.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume,
      c.volumeMin, c.volumeMax, DEFAULT_SETTINGS.sfxVolume,
    )),
    bgmVolume: roundToStep(clamp(
      raw?.bgmVolume ?? DEFAULT_SETTINGS.bgmVolume,
      c.volumeMin, c.volumeMax, DEFAULT_SETTINGS.bgmVolume,
    )),
    brightness: roundToStep(clamp(
      raw?.brightness ?? DEFAULT_SETTINGS.brightness,
      c.brightnessMin, c.brightnessMax, DEFAULT_SETTINGS.brightness,
    )),
    vfxBrightness: roundToStep(clamp(
      raw?.vfxBrightness ?? DEFAULT_SETTINGS.vfxBrightness,
      c.vfxBrightnessMin, c.vfxBrightnessMax, DEFAULT_SETTINGS.vfxBrightness,
    )),
  };
}

export type SettingKey = keyof GameSettings;

/** 설정별 슬라이더 범위의 단일 출처 — 타이틀과 ESC가 같은 조작 범위를 쓴다. */
export function settingRange(key: SettingKey): { min: number; max: number } {
  if (key === 'brightness') {
    return { min: SETTINGS_CONFIG.brightnessMin, max: SETTINGS_CONFIG.brightnessMax };
  }
  if (key === 'vfxBrightness') {
    return { min: SETTINGS_CONFIG.vfxBrightnessMin, max: SETTINGS_CONFIG.vfxBrightnessMax };
  }
  return { min: SETTINGS_CONFIG.volumeMin, max: SETTINGS_CONFIG.volumeMax };
}

/** 슬라이더 비율을 저장 가능한 0.01 단위 설정값으로 바꾼다. */
export function settingValueFromRatio(key: SettingKey, ratio: number): number {
  const { min, max } = settingRange(key);
  const clampedRatio = Math.min(1, Math.max(0, ratio));
  return roundToStep(min + (max - min) * clampedRatio);
}

/** 화면에 쓰는 표시값 — 밝기 계열은 배율(×1.0), 볼륨은 백분율. */
export function settingDisplay(settings: GameSettings, key: SettingKey): string {
  if (key === 'brightness' || key === 'vfxBrightness') {
    return `×${settings[key].toFixed(2)}`;
  }
  return `${Math.round(settings[key] * 100)}%`;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSettings(storage: StorageLike): GameSettings {
  try {
    const raw = storage.getItem(SETTINGS_CONFIG.storageKey);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    return normalizeSettings(parsed as Partial<GameSettings>);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage: StorageLike, settings: GameSettings): void {
  try {
    storage.setItem(SETTINGS_CONFIG.storageKey, JSON.stringify(settings));
  } catch {
    // 저장 실패는 무시 — 이번 세션 동안은 설정이 그대로 적용된다
  }
}
