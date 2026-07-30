import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  VFX_BRIGHTNESS_CONFIG,
  clampVfxBrightness,
  scaledAlpha,
  setVfxBrightness,
  vfxBrightness,
  withVfxBrightness,
} from '../src/render/vfxBrightness';
import {
  DEFAULT_SETTINGS,
  SETTINGS_CONFIG,
  normalizeSettings,
  settingDisplay,
} from '../src/run/gameSettings';

/**
 * VFX 밝기 회귀 (팀 의견: "이펙트가 너무 밝다").
 *
 * 기존 `brightness`는 월드 위에 검은 막을 씌워 **배경 아트와 적 스프라이트까지**
 * 어둡게 한다. 이펙트를 낮추려고 내리면 적이 안 보이는데, 그건 접근성 개선이 아니라
 * 새 문제다. 그래서 이펙트만 줄이는 축을 따로 뒀다.
 */

// ── 1) 기본값은 현행 체감을 유지한다 ────────────────────────────────────────
{
  assert.equal(DEFAULT_SETTINGS.vfxBrightness, 1, '기본은 배율 1 — 켜자마자 어두워지면 안 된다');
  assert.equal(
    normalizeSettings({}).vfxBrightness, 1,
    '저장값이 없던 기존 사용자도 1로 시작한다(설정 추가가 화면을 바꾸면 안 된다)',
  );
}

// ── 2) **완전 소거는 허용하지 않는다** ──────────────────────────────────────
//
// 하한이 0이 아닌 이유는 밝기가 아니라 **가독성**이다. 이펙트를 지우면 "무엇이
// 맞았는지"를 볼 수 없다 — 광과민성 대응이 되레 플레이를 불가능하게 만들면 안 된다
// (기존 `brightnessMin: 0.4`와 같은 근거).
{
  assert.ok(VFX_BRIGHTNESS_CONFIG.min > 0, '하한은 0보다 커야 한다 — 완전 소거 금지');
  assert.equal(clampVfxBrightness(0), VFX_BRIGHTNESS_CONFIG.min, '0은 하한으로 클램프');
  assert.equal(clampVfxBrightness(-5), VFX_BRIGHTNESS_CONFIG.min);
  assert.equal(normalizeSettings({ vfxBrightness: 0 }).vfxBrightness, VFX_BRIGHTNESS_CONFIG.min);
  // 상한 1 — 더 밝게 하려고 만든 축이 아니다
  assert.equal(VFX_BRIGHTNESS_CONFIG.max, 1, '이펙트를 1 넘게 밝힐 이유가 없다');
  assert.equal(clampVfxBrightness(2), 1, '1 초과는 1로');
  assert.equal(normalizeSettings({ vfxBrightness: 99 }).vfxBrightness, 1);
  // 설정 상수와 모듈 상수가 어긋나면 UI 슬라이더 범위와 실제 클램프가 달라진다
  assert.equal(SETTINGS_CONFIG.vfxBrightnessMin, VFX_BRIGHTNESS_CONFIG.min, 'UI 하한 = 모듈 하한');
  assert.equal(SETTINGS_CONFIG.vfxBrightnessMax, VFX_BRIGHTNESS_CONFIG.max, 'UI 상한 = 모듈 상한');
  // 잘못된 값이 게임을 멈추면 안 된다
  assert.equal(clampVfxBrightness(Number.NaN), 1, 'NaN은 기본값으로');
  assert.equal(clampVfxBrightness(Number.POSITIVE_INFINITY), 1);
}

// ── 3) 표시는 배율로 — 볼륨(%)과 섞이면 안 된다 ─────────────────────────────
{
  assert.equal(settingDisplay(normalizeSettings({ vfxBrightness: 0.5 }), 'vfxBrightness'), '×0.5');
  assert.equal(settingDisplay(normalizeSettings({ vfxBrightness: 1 }), 'vfxBrightness'), '×1.0');
  assert.equal(settingDisplay(normalizeSettings({ sfxVolume: 0.8 }), 'sfxVolume'), '80%');
}

// ── 4) **새 객체만 줄이고, 누적되지 않는다** ────────────────────────────────
//
// ⚠️ 이게 이 구현의 핵심 위험이다. 표시 목록을 통째로 훑어 알파를 곱하면 배경·적·HUD가
// 같이 어두워지고, 매 시전마다 또 곱해져 몇 초 만에 화면이 새까매진다.
// 그래서 **호출 전후를 비교해 새로 생긴 것만** 고른다.
{
  interface FakeObject { id: string; alpha: number }
  const list: FakeObject[] = [{ id: 'bg', alpha: 1 }, { id: 'enemy', alpha: 1 }];
  const scene = { children: { list } } as unknown as Parameters<typeof withVfxBrightness>[0];

  setVfxBrightness(0.5);
  assert.equal(vfxBrightness(), 0.5);

  withVfxBrightness(scene, () => {
    list.push({ id: 'vfx-a', alpha: 1 });
    list.push({ id: 'vfx-b', alpha: 0.8 });
  });
  const byId = (id: string): number => list.find((o) => o.id === id)!.alpha;
  assert.equal(byId('bg'), 1, '배경은 그대로 — 이게 화면 밝기와 다른 점이다');
  assert.equal(byId('enemy'), 1, '적 스프라이트도 그대로');
  assert.equal(byId('vfx-a'), 0.5, '새 VFX만 배율 적용');
  assert.ok(Math.abs(byId('vfx-b') - 0.4) < 1e-9, '원래 알파에 곱한다(덮어쓰지 않는다)');

  // 두 번째 시전 — 기존 VFX가 또 줄면 몇 초 만에 화면이 사라진다
  withVfxBrightness(scene, () => { list.push({ id: 'vfx-c', alpha: 1 }); });
  assert.equal(byId('vfx-a'), 0.5, '이전 VFX는 다시 줄지 않는다 (누적 금지)');
  assert.equal(byId('vfx-c'), 0.5, '이번 VFX만 적용');

  // 배율 1이면 목록을 훑지도 않는다 — 기본 설정에서 비용 0
  setVfxBrightness(1);
  withVfxBrightness(scene, () => { list.push({ id: 'vfx-d', alpha: 1 }); });
  assert.equal(byId('vfx-d'), 1, '배율 1은 그대로 통과');

  // 씬에 표시 목록이 없어도(테스트 하네스 등) 콜백은 실행돼야 한다 — 이펙트가
  // 안 나오는 것보다 배율이 안 먹는 게 낫다
  setVfxBrightness(0.5);
  let ran = false;
  withVfxBrightness({} as Parameters<typeof withVfxBrightness>[0], () => { ran = true; });
  assert.ok(ran, '표시 목록이 없어도 시전은 실행된다');
  setVfxBrightness(1);
}

// ── 5) 시작 알파를 명시하는 트윈·이미터는 직접 곱한다 ───────────────────────
//
// `withVfxBrightness`는 **생성 시점** 알파를 곱한다. 알파 트윈 17개가 전부 0으로
// 페이드아웃하므로 그걸로 충분하다 — 줄어든 값에서 시작해 0으로 간다.
//
// ⚠️ 예외는 `alpha: { from: ... }` / `{ start: ... }`처럼 **시작값을 명시**하는 경우다.
// 그건 생성 시점 알파를 덮어쓰므로 배율이 사라진다. 소스에서 미처리분이 없는지 검사한다.
{
  const renderer = readFileSync('src/render/spellRenderer.ts', 'utf8');
  const explicit = renderer.match(/alpha: \{ (?:from|start): [^}]*\}/g) ?? [];
  assert.ok(explicit.length > 0, '명시 알파가 하나도 없으면 이 검사가 무의미하다');
  for (const site of explicit) {
    assert.ok(
      site.includes('scaledAlpha('),
      `시작 알파를 명시하는데 배율이 없다: ${site}`
      + ' — withVfxBrightness가 줄여둔 값을 덮어써 이 연출만 밝게 남는다',
    );
  }
  // 진입점이 감싸져 있는가 — 여기가 풀리면 배율이 통째로 사라진다
  assert.ok(
    /withVfxBrightness\(ctx\.scene, \(\) => castSpellForm\(ctx, spec\)\)/.test(renderer),
    'castSpell이 배율로 감싸져 있어야 한다',
  );
}

// ── 6) 씬·타이틀이 설정을 렌더러에 반영한다 ─────────────────────────────────
//
// 배율은 모듈 전역이라 **누군가 설정값을 밀어넣어야** 한다. 전투 씬만 하면 타이틀에서
// 조절하고 바로 시작했을 때 첫 시전이 옛 값으로 나간다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(
    /setVfxBrightness\(this\.settings\.vfxBrightness\)/.test(scene),
    '전투 씬이 설정을 렌더러에 반영해야 한다',
  );
  // applyBrightness 안에 둔 이유: 초기화·설정 변경·복귀 세 호출 지점을 그대로 재사용한다
  const applyAt = scene.indexOf('private applyBrightness()');
  const setAt = scene.indexOf('setVfxBrightness(this.settings.vfxBrightness)');
  assert.ok(applyAt > 0 && setAt > applyAt, 'applyBrightness 안에서 반영해야 호출 지점이 갈리지 않는다');

  const title = readFileSync('src/scenes/TitleScene.ts', 'utf8');
  const titleCalls = title.match(/setVfxBrightness\(/g) ?? [];
  assert.ok(
    titleCalls.length >= 2,
    `타이틀도 초기화와 onChange 둘 다에서 반영해야 한다 (현재 ${titleCalls.length}건)`,
  );
}

// ── 7) 두 밝기 축이 서로 다른 것을 한다 ─────────────────────────────────────
//
// 설정 화면에서 둘이 같은 설명을 달고 있으면 플레이어가 무엇을 내려야 할지 모른다.
{
  const overlay = readFileSync('src/ui/settingsOverlay.ts', 'utf8');
  assert.ok(/key: 'vfxBrightness'/.test(overlay), '설정 행이 있어야 한다');
  const rows = overlay.match(/\{ key: '(?:brightness|vfxBrightness)'[^}]*\}/g) ?? [];
  assert.equal(rows.length, 2, '밝기 행이 둘이어야 한다');
  const hints = rows.map((row) => row.match(/hint: '([^']*)'/)?.[1] ?? '');
  assert.notEqual(hints[0], hints[1], '두 행의 설명이 달라야 한다 — 무엇을 내릴지 구분되어야 한다');
}

console.log(
  'vfx brightness regression: 기본값·소거금지·표시·신규객체한정·명시알파·씬반영·축구분 7군 통과',
);
