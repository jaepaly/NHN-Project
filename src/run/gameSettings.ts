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
}

export const SETTINGS_CONFIG = {
  storageKey: 'incant:settings:v1',
  /** 한 번 조절에 움직이는 폭 — 조작 횟수와 정밀도의 절충 */
  step: 0.1,
  volumeMin: 0,
  volumeMax: 1,
  /** 완전 암전·과다 발광을 막는 밝기 범위 (광과민성 대응이 되레 위험해지면 안 된다) */
  brightnessMin: 0.4,
  brightnessMax: 1.3,
} as const;

/** 기본값은 step(0.1) 격자 위에 둔다 — 격자 밖 값은 정규화에서 반올림돼 왕복이 깨진다. */
export const DEFAULT_SETTINGS: GameSettings = {
  sfxVolume: 0.8,
  bgmVolume: 0.5,
  brightness: 1,
};

function clamp(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/** 부동소수 누적 오차를 막는다 — 0.1씩 더하면 0.30000000000000004가 화면에 샌다. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function normalizeSettings(raw: Partial<GameSettings> | null | undefined): GameSettings {
  const c = SETTINGS_CONFIG;
  return {
    sfxVolume: round1(clamp(
      raw?.sfxVolume ?? DEFAULT_SETTINGS.sfxVolume,
      c.volumeMin, c.volumeMax, DEFAULT_SETTINGS.sfxVolume,
    )),
    bgmVolume: round1(clamp(
      raw?.bgmVolume ?? DEFAULT_SETTINGS.bgmVolume,
      c.volumeMin, c.volumeMax, DEFAULT_SETTINGS.bgmVolume,
    )),
    brightness: round1(clamp(
      raw?.brightness ?? DEFAULT_SETTINGS.brightness,
      c.brightnessMin, c.brightnessMax, DEFAULT_SETTINGS.brightness,
    )),
  };
}

export type SettingKey = keyof GameSettings;

/** 화면에 쓰는 표시값 — 밝기는 배율(×1.0), 볼륨은 백분율. */
export function settingDisplay(settings: GameSettings, key: SettingKey): string {
  if (key === 'brightness') return `×${settings.brightness.toFixed(1)}`;
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
