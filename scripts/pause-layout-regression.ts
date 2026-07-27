import assert from 'node:assert/strict';
import {
  PAUSE_BAR,
  PAUSE_LAYOUT,
  pauseBarRect,
  pauseSliderHitArea,
  pauseSliderRatio,
} from '../src/ui/pauseLayout';
import {
  DEFAULT_SETTINGS,
  SETTINGS_CONFIG,
  setSettingFromRatio,
  settingRatio,
} from '../src/run/gameSettings';

const W = 960;

// 1) 바는 화면 중앙 정렬, 행마다 rowGap씩 내려간다
const b0 = pauseBarRect(W, 0);
const b1 = pauseBarRect(W, 1);
assert.equal(b0.x + b0.w / 2, W / 2, '바 중심 = 화면 중심');
assert.equal(b0.w, PAUSE_BAR.width);
assert.equal(b1.y - b0.y, PAUSE_LAYOUT.rowGap, '행 간격');
// 화면 폭이 달라져도 중앙을 지킨다
assert.equal(pauseBarRect(1280, 0).x + PAUSE_BAR.width / 2, 640);

// 2) **히트 영역과 바가 같은 중심을 쓴다** — 어긋나면 손과 눈이 따로 논다
for (let row = 0; row < 3; row += 1) {
  const bar = pauseBarRect(W, row);
  const hit = pauseSliderHitArea(W, row);
  assert.equal(hit.centerX, bar.x + bar.w / 2, `행 ${row} 가로 중심 일치`);
  assert.equal(hit.centerY, bar.y + PAUSE_BAR.height / 2, `행 ${row} 세로 중심 일치`);
  assert.ok(hit.width > bar.w, '히트 영역이 바보다 넓다 (양 끝 잡기)');
  assert.ok(hit.height > PAUSE_BAR.height, '히트 영역이 바보다 두껍다 (세로 여유)');
  // 히트 영역이 바를 완전히 덮는다
  assert.ok(hit.centerX - hit.width / 2 <= bar.x, '왼쪽 덮음');
  assert.ok(hit.centerX + hit.width / 2 >= bar.x + bar.w, '오른쪽 덮음');
}

// 3) 포인터 → 비율: 양 끝·중앙이 정확하고, 바 밖은 클램프된다
const bar = pauseBarRect(W, 0);
assert.equal(pauseSliderRatio(bar, bar.x), 0, '왼쪽 끝 = 0');
assert.equal(pauseSliderRatio(bar, bar.x + bar.w), 1, '오른쪽 끝 = 1');
assert.equal(pauseSliderRatio(bar, bar.x + bar.w / 2), 0.5, '중앙 = 0.5');
assert.equal(pauseSliderRatio(bar, bar.x - 500), 0, '왼쪽 밖 → 0 (튀지 않음)');
assert.equal(pauseSliderRatio(bar, bar.x + bar.w + 500), 1, '오른쪽 밖 → 1');
assert.equal(pauseSliderRatio(bar, Number.NaN), 0, 'NaN 방어');
assert.equal(pauseSliderRatio({ x: 0, y: 0, w: 0 }, 50), 0, '폭 0 → 0으로 나누지 않는다');
// 단조 증가
let prev = -1;
for (let x = bar.x; x <= bar.x + bar.w; x += 10) {
  const v = pauseSliderRatio(bar, x);
  assert.ok(v >= prev, '오른쪽으로 갈수록 커진다');
  prev = v;
}

// 4) 끝에서 끝까지 — 드래그가 설정의 전 범위를 실제로 커버한다
const left = setSettingFromRatio(DEFAULT_SETTINGS, 'brightness', pauseSliderRatio(bar, bar.x));
const right = setSettingFromRatio(DEFAULT_SETTINGS, 'brightness', pauseSliderRatio(bar, bar.x + bar.w));
assert.equal(left.brightness, SETTINGS_CONFIG.brightnessMin, '바 왼쪽 끝 = 밝기 하한');
assert.equal(right.brightness, SETTINGS_CONFIG.brightnessMax, '바 오른쪽 끝 = 밝기 상한');
const volLeft = setSettingFromRatio(DEFAULT_SETTINGS, 'sfxVolume', pauseSliderRatio(bar, bar.x));
const volRight = setSettingFromRatio(DEFAULT_SETTINGS, 'sfxVolume', pauseSliderRatio(bar, bar.x + bar.w));
assert.equal(volLeft.sfxVolume, 0);
assert.equal(volRight.sfxVolume, 1);

// 5) 손잡이가 그려지는 x와 그 지점을 다시 집었을 때가 일치한다 (눈 ↔ 손 왕복)
for (const key of ['sfxVolume', 'brightness'] as const) {
  for (const ratio of [0, 0.3, 0.5, 0.8, 1]) {
    const set = setSettingFromRatio(DEFAULT_SETTINGS, key, ratio);
    const knobX = bar.x + bar.w * settingRatio(set, key);
    const regrabbed = setSettingFromRatio(DEFAULT_SETTINGS, key, pauseSliderRatio(bar, knobX));
    assert.equal(
      regrabbed[key], set[key],
      `${key}: 손잡이 위치를 다시 집으면 같은 값 (ratio ${ratio})`,
    );
  }
}

console.log('pause layout regression: 중앙정렬·히트정합·비율클램프·전범위·손잡이왕복 5군 통과');
