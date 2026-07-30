import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  SETTINGS_CONFIG,
  loadSettings,
  normalizeSettings,
  saveSettings,
  settingDisplay,
} from '../src/run/gameSettings';

// 1) 기본값 — 범위 안이고 밝기는 현행 체감 유지(1.0)
const d = DEFAULT_SETTINGS;
assert.equal(d.brightness, 1, '기본 밝기는 현행 그대로');
assert.ok(d.sfxVolume > 0 && d.sfxVolume <= 1);
assert.ok(d.bgmVolume > 0 && d.bgmVolume <= 1);
assert.ok(d.bgmVolume < d.sfxVolume, '배경음악은 효과음보다 낮게 시작 (타격감 우선)');

// 2) 정규화 — 손상·범위 밖·누락 전부 방어
assert.deepEqual(normalizeSettings(null), d, 'null → 기본값');
assert.deepEqual(normalizeSettings({}), d, '빈 객체 → 기본값');
assert.equal(normalizeSettings({ sfxVolume: 5 }).sfxVolume, 1, '볼륨 상한');
assert.equal(normalizeSettings({ sfxVolume: -3 }).sfxVolume, 0, '볼륨 하한');
assert.equal(normalizeSettings({ brightness: 9 }).brightness, SETTINGS_CONFIG.brightnessMax, '밝기 상한');
assert.equal(normalizeSettings({ brightness: 0 }).brightness, SETTINGS_CONFIG.brightnessMin, '밝기 하한 — 완전 암전 금지');
assert.equal(normalizeSettings({ sfxVolume: Number.NaN }).sfxVolume, d.sfxVolume, 'NaN → 기본값');
// 부분 지정은 나머지를 기본값으로 채운다
assert.equal(normalizeSettings({ bgmVolume: 0.2 }).sfxVolume, d.sfxVolume);

// 6) 표시값 — 볼륨은 %, 밝기는 배율. 부동소수 잔재가 안 보인다
assert.equal(settingDisplay({ ...d, sfxVolume: 0.7 }, 'sfxVolume'), '70%');
assert.equal(settingDisplay({ ...d, bgmVolume: 0 }, 'bgmVolume'), '0%');
assert.equal(settingDisplay({ ...d, brightness: 1 }, 'brightness'), '×1.0');
assert.equal(settingDisplay({ ...d, brightness: 0.7 }, 'brightness'), '×0.7');
// 부동소수 잔재가 표시에 새지 않는다 — 정규화가 0.1 격자로 반올림한다
assert.equal(
  settingDisplay(normalizeSettings({ sfxVolume: 0.30000000000000004 }), 'sfxVolume'),
  '30%',
  '부동소수 오차가 화면에 안 샌다',
);

// 7) 저장 왕복 + 손상 방어
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
};
assert.deepEqual(loadSettings(storage), d, '저장 전 = 기본값');
// ⚠️ **축을 추가하면 여기가 깨진다 — 그게 의도다.** deepEqual이 리터럴이라
// 새 설정이 저장·복원 경로를 타는지 확인하지 않고 넘어가는 일이 없다.
// (vfxBrightness 추가 때 실제로 걸렸다)
const custom = { sfxVolume: 0.3, bgmVolume: 0.1, brightness: 0.6, vfxBrightness: 0.5 };
saveSettings(storage, custom);
assert.deepEqual(loadSettings(storage), custom, '왕복 보존');
// 모든 축이 빠짐없이 왕복하는가 — 리터럴이 기본값과 같은 값이면 통과해도 의미가 없다
for (const key of Object.keys(d) as (keyof typeof d)[]) {
  assert.ok(key in custom, `설정 축 ${key}가 왕복 검사에 빠져 있다`);
  assert.notEqual(
    custom[key], d[key],
    `${key}는 기본값과 다른 값으로 검사해야 왕복이 실제로 확인된다`,
  );
}
mem.set(SETTINGS_CONFIG.storageKey, '{깨진');
assert.deepEqual(loadSettings(storage), d, '손상 JSON → 기본값');
mem.set(SETTINGS_CONFIG.storageKey, '[]');
assert.deepEqual(loadSettings(storage), d, '배열 → 기본값');
// 범위 밖 저장분도 로드 시 정규화된다
mem.set(SETTINGS_CONFIG.storageKey, JSON.stringify({ sfxVolume: 99, brightness: -5 }));
const loaded = loadSettings(storage);
assert.equal(loaded.sfxVolume, 1);
assert.equal(loaded.brightness, SETTINGS_CONFIG.brightnessMin);

const throwing = {
  getItem: () => { throw new Error('denied'); },
  setItem: () => { throw new Error('denied'); },
};
assert.deepEqual(loadSettings(throwing), d, '스토리지 예외 → 기본값');
saveSettings(throwing, custom); // throw 없이 조용히 무시돼야 한다

console.log('game settings regression: 기본값·정규화·표시·저장 4군 통과');
