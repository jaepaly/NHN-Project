import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  SETTINGS_CONFIG,
  adjustSetting,
  loadSettings,
  normalizeSettings,
  saveSettings,
  setSettingFromRatio,
  settingDisplay,
  settingRatio,
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

// 3) 조절 — 한 칸씩, 범위를 넘지 않고, 원본 불변
let s = { ...d };
const before = JSON.stringify(s);
const up = adjustSetting(s, 'sfxVolume', +1);
assert.equal(JSON.stringify(s), before, '원본 불변');
assert.ok(Math.abs(up.sfxVolume - (d.sfxVolume + SETTINGS_CONFIG.step)) < 1e-9, '한 칸 증가');
assert.notEqual(up, s, '새 객체 반환');
// 다른 키는 안 건드린다
assert.equal(up.bgmVolume, d.bgmVolume);
assert.equal(up.brightness, d.brightness);

// 상한/하한에서 더 눌러도 넘지 않는다
s = { ...d, sfxVolume: 1 };
assert.equal(adjustSetting(s, 'sfxVolume', +1).sfxVolume, 1, '볼륨 상한 고정');
s = { ...d, sfxVolume: 0 };
assert.equal(adjustSetting(s, 'sfxVolume', -1).sfxVolume, 0, '볼륨 하한 고정');
s = { ...d, brightness: SETTINGS_CONFIG.brightnessMax };
assert.equal(adjustSetting(s, 'brightness', +1).brightness, SETTINGS_CONFIG.brightnessMax);
s = { ...d, brightness: SETTINGS_CONFIG.brightnessMin };
assert.equal(adjustSetting(s, 'brightness', -1).brightness, SETTINGS_CONFIG.brightnessMin);

// 4) 부동소수 오차가 화면에 새지 않는다 — 0.1씩 10번 왕복
let f = { ...d, sfxVolume: 0 };
for (let i = 0; i < 10; i += 1) f = adjustSetting(f, 'sfxVolume', +1);
assert.equal(f.sfxVolume, 1, `0.1씩 10번 = 정확히 1 (실제 ${f.sfxVolume})`);
for (let i = 0; i < 10; i += 1) f = adjustSetting(f, 'sfxVolume', -1);
assert.equal(f.sfxVolume, 0, '되돌려도 정확히 0');

// 5) 게이지 비율 — 밝기는 최소값이 0이 아니므로 범위로 정규화된다
assert.equal(settingRatio({ ...d, sfxVolume: 0 }, 'sfxVolume'), 0);
assert.equal(settingRatio({ ...d, sfxVolume: 1 }, 'sfxVolume'), 1);
assert.equal(settingRatio({ ...d, brightness: SETTINGS_CONFIG.brightnessMin }, 'brightness'), 0, '밝기 최소 = 0칸');
assert.equal(settingRatio({ ...d, brightness: SETTINGS_CONFIG.brightnessMax }, 'brightness'), 1, '밝기 최대 = 꽉');
const mid = settingRatio({ ...d, brightness: 1 }, 'brightness');
assert.ok(mid > 0 && mid < 1, '기본 밝기는 중간 어딘가');

// 6) 표시값 — 볼륨은 %, 밝기는 배율. 부동소수 잔재가 안 보인다
assert.equal(settingDisplay({ ...d, sfxVolume: 0.7 }, 'sfxVolume'), '70%');
assert.equal(settingDisplay({ ...d, bgmVolume: 0 }, 'bgmVolume'), '0%');
assert.equal(settingDisplay({ ...d, brightness: 1 }, 'brightness'), '×1.0');
assert.equal(settingDisplay({ ...d, brightness: 0.7 }, 'brightness'), '×0.7');
let drift = { ...d, sfxVolume: 0 };
for (let i = 0; i < 3; i += 1) drift = adjustSetting(drift, 'sfxVolume', +1);
assert.equal(settingDisplay(drift, 'sfxVolume'), '30%', '0.1×3이 30%로 (30.000000000000004 아님)');

// 7) 저장 왕복 + 손상 방어
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v); },
};
assert.deepEqual(loadSettings(storage), d, '저장 전 = 기본값');
const custom = { sfxVolume: 0.3, bgmVolume: 0.1, brightness: 0.6 };
saveSettings(storage, custom);
assert.deepEqual(loadSettings(storage), custom, '왕복 보존');
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

// 8) 드래그 — 비율(0~1) → 값. 양 끝이 정확히 min·max에 닿고 격자에 스냅된다
for (const key of ['sfxVolume', 'bgmVolume'] as const) {
  assert.equal(setSettingFromRatio(d, key, 0)[key], 0, `${key} 왼쪽 끝 = 0`);
  assert.equal(setSettingFromRatio(d, key, 1)[key], 1, `${key} 오른쪽 끝 = 1`);
  assert.equal(setSettingFromRatio(d, key, 0.5)[key], 0.5, `${key} 중앙 = 0.5`);
}
assert.equal(
  setSettingFromRatio(d, 'brightness', 0).brightness, SETTINGS_CONFIG.brightnessMin,
  '밝기 왼쪽 끝 = 하한 (완전 암전 아님)',
);
assert.equal(
  setSettingFromRatio(d, 'brightness', 1).brightness, SETTINGS_CONFIG.brightnessMax,
  '밝기 오른쪽 끝 = 상한',
);
// 범위 밖 비율·NaN 방어 (포인터가 바 밖으로 나가도 안전해야 한다)
assert.equal(setSettingFromRatio(d, 'sfxVolume', -2).sfxVolume, 0, '음수 비율 → 하한');
assert.equal(setSettingFromRatio(d, 'sfxVolume', 7).sfxVolume, 1, '초과 비율 → 상한');
assert.equal(setSettingFromRatio(d, 'sfxVolume', Number.NaN).sfxVolume, 0, 'NaN → 하한');
// 격자 스냅 — 드래그로 격자 밖 값이 생기면 이후 ←→ 조작이 어긋난다
const dragged = setSettingFromRatio(d, 'sfxVolume', 0.37);
assert.equal(Math.round(dragged.sfxVolume * 10) / 10, dragged.sfxVolume, '한 자리로 스냅');
assert.equal(settingDisplay(dragged, 'sfxVolume'), '40%', '0.37 → 40% (격자)');
// 드래그 뒤 ←→가 이어진다 (두 조작이 같은 격자를 쓴다)
assert.equal(adjustSetting(dragged, 'sfxVolume', +1).sfxVolume, 0.5, '드래그 후 한 칸 = 0.5');
// 왕복 — 비율로 넣고 비율로 읽으면 제자리 (스냅 오차 범위 안)
for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
  const set = setSettingFromRatio(d, 'bgmVolume', ratio);
  assert.ok(
    Math.abs(settingRatio(set, 'bgmVolume') - ratio) <= SETTINGS_CONFIG.step,
    `왕복 오차가 step 이내 (ratio ${ratio})`,
  );
}
// 다른 키는 안 건드리고 원본도 불변
const src = { ...d };
const only = setSettingFromRatio(src, 'brightness', 0.2);
assert.equal(only.sfxVolume, d.sfxVolume);
assert.equal(only.bgmVolume, d.bgmVolume);
assert.deepEqual(src, d, '원본 불변');

console.log('game settings regression: 기본값·정규화·조절·부동소수·게이지·표시·저장·드래그 8군 통과');
