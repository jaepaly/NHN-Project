import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { UI_COLOR, UI_HEX, UI_MATERIAL, UI_SEMANTIC, hex } from '../src/ui/uiTokens';

/**
 * UI 팔레트 통일 회귀 (총괄 지시: "이 스타일에 맞게 다른 UI도 다 통일시켜야 하지 않을까?").
 *
 * #301이 경로 지도를 마도서 톤으로 재설계하면서 나머지 화면과 갈렸다. 실측으로
 * 드러난 진짜 문제는 색이 아니라 **토큰이 죽어 있었다는 것**이다:
 *
 *   settingsOverlay  토큰 19회 · 하드코딩 2
 *   rewardCardOverlay 토큰 0회 · 하드코딩 45   ← 토큰을 바꿔도 안 따라온다
 *   codexOverlay      토큰 0회 · 하드코딩 28
 *
 * 그래서 값만 바꾸지 않고 **소비처를 옮겼다.** 이 회귀는 다시 하드코딩으로 돌아가는
 * 것을 막는다.
 */

// ── 1) 마도서 팔레트가 정본인가 ─────────────────────────────────────────────
//
// 청색 계열이 남아 있으면 통일이 안 된 것이다. 색조로 검사한다 — 값을 하드코딩으로
// 고정하면 색 조정 때마다 회귀가 깨져 아무도 안 고친다.
{
  const hue = (color: string): number => {
    const n = hex(color);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return -1;
    const d = max - min;
    let h: number;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return ((h * 60) + 360) % 360;
  };

  // 강조는 금색(따뜻한 계열: 30~60도)이어야 한다 — 청색(200~250도)이면 옛 톤이다
  const accentHue = hue(UI_COLOR.accent);
  assert.ok(
    accentHue >= 25 && accentHue <= 60,
    `accent가 금색 계열이어야 한다 (색조 ${accentHue.toFixed(0)}도, ${UI_COLOR.accent})`,
  );
  assert.ok(
    hue(UI_COLOR.borderStrong) >= 25 && hue(UI_COLOR.borderStrong) <= 60,
    '강조 테두리도 금박 계열',
  );
  // 밝은 텍스트는 양피지 — 청백색이면 화면이 차갑다
  const brightHue = hue(UI_COLOR.textBright);
  assert.ok(
    brightHue >= 20 && brightHue <= 70,
    `textBright가 양피지 계열이어야 한다 (색조 ${brightHue.toFixed(0)}도)`,
  );
}

// ── 2) 의미 색은 **색조를 지킨다** ──────────────────────────────────────────
//
// ⚠️ HP·마나·실드는 장식이 아니라 "무엇인지"를 구분한다. 마도서 톤으로 밀면
// HP와 마나가 같은 색이 된다. 색조는 지키고 채도만 낮추기로 했다(총괄 결정).
{
  const sat = (color: string): number => {
    const n = hex(color);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    const max = Math.max(r, g, b);
    return max === 0 ? 0 : ((max - Math.min(r, g, b)) / max) * 100;
  };
  const channel = (color: string): { r: number; g: number; b: number } => {
    const n = hex(color);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  };

  // 색조 구분: HP는 붉은 쪽, 마나는 푸른 쪽, 실드는 청록 쪽이 우세해야 한다
  const hp = channel(UI_SEMANTIC.hp);
  assert.ok(hp.r > hp.g && hp.r > hp.b, 'HP는 붉은 계열이어야 한다');
  const mana = channel(UI_SEMANTIC.mana);
  assert.ok(mana.b > mana.r, '마나는 푸른 계열이어야 한다');
  const shield = channel(UI_SEMANTIC.shield);
  assert.ok(shield.b > shield.r && shield.g > shield.r, '보호막은 청록 계열이어야 한다');
  const ok = channel(UI_SEMANTIC.ok);
  assert.ok(ok.g > ok.r, '정상 표시는 초록 계열이어야 한다');

  // 서로 구분되는가 — 채도를 낮추다 보면 다 회색이 된다
  const pairs: [string, string][] = [
    [UI_SEMANTIC.hp, UI_SEMANTIC.mana],
    [UI_SEMANTIC.mana, UI_SEMANTIC.shield],
    [UI_SEMANTIC.hp, UI_SEMANTIC.ok],
  ];
  for (const [a, b] of pairs) {
    const ca = channel(a);
    const cb = channel(b);
    const dist = Math.abs(ca.r - cb.r) + Math.abs(ca.g - cb.g) + Math.abs(ca.b - cb.b);
    assert.ok(dist > 60, `${a}와 ${b}가 너무 비슷하다 (거리 ${dist}) — 구분이 안 된다`);
  }

  // 채도가 과하면 마도서 화면에서 형광으로 뜬다
  for (const [name, color] of Object.entries(UI_SEMANTIC)) {
    assert.ok(
      sat(color) <= 50,
      `${name} 채도 ${sat(color).toFixed(0)}%가 높다 — 금색·양피지 화면에서 튄다`,
    );
  }
}

// ── 3) Phaser 숫자 토큰이 문자열 토큰에서 파생되는가 ────────────────────────
//
// DOM은 문자열, Phaser는 숫자를 쓴다. 두 축을 따로 두면 "오버레이는 마도서인데
// HUD만 청색"이 다시 생긴다 — 실제로 그래서 통일이 필요해졌다.
{
  assert.equal(UI_HEX.border, hex(UI_COLOR.border), '테두리는 같은 값이어야 한다');
  assert.equal(UI_HEX.accent, hex(UI_COLOR.accent), '강조는 같은 값이어야 한다');
  assert.equal(UI_HEX.textMuted, hex(UI_COLOR.textMuted));
  // 트랙은 패널보다 밝아야 빈 게이지가 보인다
  const lum = (n: number): number =>
    (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  assert.ok(lum(UI_HEX.track) > lum(UI_HEX.panel), '바 트랙이 패널보다 밝아야 한다');
}

// ── 4) **주요 화면이 토큰을 실제로 쓴다** ───────────────────────────────────
//
// 이게 이 회귀의 본론이다. 값만 바꾸고 소비처가 하드코딩이면 화면이 안 따라온다.
{
  const MIGRATED = [
    'rewardCardOverlay',   // 매 방마다 본다 — 경로 지도 바로 다음 화면
    'runSummaryOverlay',
    'bossChoiceOverlay',
    'settingsOverlay',
  ];
  for (const name of MIGRATED) {
    const src = readFileSync(`src/ui/${name}.ts`, 'utf8');
    const tokens = (src.match(/UI_COLOR\.\w+|UI_SEMANTIC\.\w+/g) ?? []).length;
    const hard = (src.match(/#[0-9a-fA-F]{6}/g) ?? []).length;
    assert.ok(
      tokens > hard,
      `${name}: 토큰 ${tokens} vs 하드코딩 ${hard} — 토큰이 더 많아야 값 변경이 화면에 반영된다`,
    );
  }
}

// ── 5) HUD가 토큰을 쓴다 (항상 떠 있는 화면) ────────────────────────────────
//
// 총괄 지적: *"좌측 상단의 체력마나 같은 것도 건드려야 하는 거 아님?"*
// HUD는 가끔 보는 도감보다 통일감에 중요하다 — 늘 화면에 있기 때문이다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  for (const token of ['UI_HEX.panel', 'UI_HEX.border', 'UI_HEX.track', 'UI_SEMANTIC.hp', 'UI_SEMANTIC.mana', 'UI_SEMANTIC.shield']) {
    assert.ok(scene.includes(token), `HUD가 ${token}을 써야 한다`);
  }
  // 옛 청색 HUD 값이 남아 있으면 통일이 덜 된 것이다
  for (const stale of ['0x080b1c', '0x33447f', '0x141a35', "'#ff91ad'", "'#91b7ff'", "'#72d8ff'"]) {
    assert.ok(
      !scene.includes(stale),
      `HUD에 옛 청색 값 ${stale}이 남아 있다`,
    );
  }
}

// ── 6) 새 오버레이가 토큰을 우회하지 않는지 감시한다 ────────────────────────
//
// 지금 남은 하드코딩(도감 21 · 경로 지도 35)은 2단계 대상이라 통과시킨다. 다만
// **더 늘어나면** 통일이 다시 무너지므로 상한을 둔다.
{
  const files = readdirSync('src/ui').filter((f) => f.endsWith('.ts') && f !== 'uiTokens.ts');
  let total = 0;
  for (const file of files) {
    total += (readFileSync(`src/ui/${file}`, 'utf8').match(/#[0-9a-fA-F]{6}/g) ?? []).length;
  }
  // 통일 직후 실측 74건. 여유를 조금 두되 늘어나는 방향은 막는다.
  assert.ok(
    total <= 85,
    `src/ui 하드코딩 색이 ${total}건으로 늘었다 — 새 화면은 토큰을 쓸 것`,
  );
}

// ── 7) **index.html이 토큰과 갈리지 않는가** ───────────────────────────────
//
// 영창 바는 정적 HTML이라 TS 토큰을 가져올 수 없어 CSS 변수로 **사본**을 둔다.
// 사본은 조용히 갈리는 게 문제라, 여기서 두 파일을 대조한다.
//
// 영창 화면은 플레이어가 **캐스팅할 때마다** 본다 — 이 게임에서 가장 자주 보는
// 화면이므로 여기가 청색으로 남으면 통일이 무의미하다.
{
  const html = readFileSync('index.html', 'utf8');
  const cssVar = (name: string): string | null => {
    const found = html.match(new RegExp(`--${name}:\s*([^;]+);`));
    return found ? found[1].trim() : null;
  };

  const PAIRS: [string, string][] = [
    ['ui-accent', UI_COLOR.accent],
    ['ui-accent-glow', UI_COLOR.accentGlow],
    ['ui-border', UI_COLOR.border],
    ['ui-border-strong', UI_COLOR.borderStrong],
    ['ui-text-bright', UI_COLOR.textBright],
    ['ui-text', UI_COLOR.text],
    ['ui-text-soft', UI_COLOR.textSoft],
    ['ui-text-muted', UI_COLOR.textMuted],
    ['ui-panel', UI_COLOR.panel],
    ['ui-danger', UI_COLOR.danger],
  ];
  for (const [name, expected] of PAIRS) {
    const actual = cssVar(name);
    assert.ok(actual, `index.html에 --${name} 변수가 있어야 한다`);
    assert.equal(
      actual, expected,
      `--${name}이 토큰과 다르다 (HTML ${actual} vs 토큰 ${expected})`
      + ' — 사본이 갈리면 영창 바만 옛 톤으로 남는다',
    );
  }

  // 옛 청색이 남아 있으면 통일이 덜 된 것이다
  for (const stale of ['#8fa4ff', '#4c66ff', '#e8edff', '#dce3ff', '#7f8aba', '#05060f']) {
    assert.ok(
      !html.includes(stale),
      `index.html에 옛 청색 ${stale}이 남아 있다`,
    );
  }

  // 상태 색은 **정보**다 — 마도서 톤으로 밀면 마나 부족·어휘제한·초과가 구분 안 된다
  for (const name of ['incant-dry', 'incant-limit', 'incant-over']) {
    assert.ok(cssVar(name), `상태 색 --${name}이 있어야 한다`);
  }
  const dry = cssVar('incant-dry')!;
  const limit = cssVar('incant-limit')!;
  const over = cssVar('incant-over')!;
  assert.notEqual(dry, limit, '마나 부족과 어휘제한이 같은 색이면 구분이 안 된다');
  assert.notEqual(limit, over, '어휘제한과 초과가 같은 색이면 구분이 안 된다');
}

// ── 8) **색이 아니라 재질이 마도서를 만든다** ──────────────────────────────
//
// 총괄 지적: *"임재윤은 마도서처럼 만들려고 했는데, 사실상 현재 상태는 그냥 평범한
// 박스에다가 테두리 색만 칠한 느낌"*. 맞는 진단이었다 — 처음 통일은 색 교체였고,
// 구조가 그대로면 "빛나는 UI 컴포넌트"로 읽힌다.
//
// 실측으로 뽑은 차이(경로 지도 vs 나머지): 양피지 결 · 비대칭 얼룩 · 잉크 번짐 ·
// 낡은 채도 · serif 서체. 그리고 **양쪽 다 갖고 있던 문제**가 네온 글로우다.
{
  const overlays = ['rewardCardOverlay', 'bossChoiceOverlay', 'runSummaryOverlay'];

  // ⚠️ `box-shadow: 0 0 Npx`는 **네온·SF 문법**이다. 종이는 스스로 빛나지 않고
  // 아래로 그림자를 떨어뜨린다. 색을 아무리 금색으로 바꿔도 균일 글로우가 남으면
  // 홀로그램 카드로 읽힌다. (`inset 0 0 0 1px`은 테두리라 예외)
  for (const name of overlays) {
    const src = readFileSync(`src/ui/${name}.ts`, 'utf8');
    // ⚠️ 그림자 선언은 **여러 줄에 걸친다** — `box-shadow: A,` 다음 줄에 `inset B`가
    // 오는 식이다. 줄 단위로 보면 두 번째 줄의 inset을 놓쳐 오탐한다(실제로 그렇게
    // 걸렸다). `;`까지를 한 덩어리로 잡고 그 안을 쉼표로 나눠 본다.
    const shadows = src.match(/(?:box|text|drop)-shadow:[^;]+/g) ?? [];
    const neon = shadows.flatMap((decl) => decl.split(','))
      .filter((part) => !/inset/.test(part))
      .filter((part) => /(?:^|[^0-9])0 0 [0-9]+px/.test(part));
    assert.ok(
      neon.length <= 1,
      `${name}: 네온 글로우가 ${neon.length}건 남았다 — 종이는 스스로 빛나지 않는다`
      + ` (${neon.slice(0, 2).join(' / ')})`,
    );
  }

  // 재질 토큰이 실제로 쓰이는가 — 정의만 하고 안 쓰면 아무 소용이 없다
  const reward = readFileSync('src/ui/rewardCardOverlay.ts', 'utf8');
  for (const token of ['UI_MATERIAL.grain', 'UI_MATERIAL.stain', 'UI_MATERIAL.paperShadow', 'UI_MATERIAL.deckle']) {
    assert.ok(reward.includes(token), `보상 카드가 ${token}을 써야 한다 — 매 방마다 보는 화면이다`);
  }

  // 서체 — 마도서에 고딕이면 재질을 얹어도 "앱 UI"로 읽힌다.
  // 경로 지도는 전부 serif인데 보상 카드만 sans였다(실측).
  assert.ok(
    !/font-family: [$]\{UI_FONT\.sans\}/.test(reward),
    '보상 카드가 sans를 쓰면 안 된다 — 마도서 서체는 serif다',
  );
  assert.ok(
    (reward.match(/UI_FONT\.serif/g) ?? []).length >= 3,
    '카드·제목·배지가 serif여야 한다',
  );

  // 균일 border-radius는 UI 컴포넌트의 문법이다. 손으로 자른 종이는 균일하지 않다.
  assert.ok(
    /border-radius: [$]\{UI_MATERIAL\.deckle\}/.test(reward),
    '카드 모서리가 균일하면 "UI 카드"로 읽힌다 — 네 귀퉁이를 다르게',
  );

  // 재질 토큰 자체의 성질
  assert.ok(/repeating-linear-gradient/.test(UI_MATERIAL.grain), '결은 반복 줄무늬여야 한다');
  const angle = UI_MATERIAL.grain.match(/(\d+)deg/);
  assert.ok(angle, '결에 각도가 있어야 한다');
  assert.ok(
    Number(angle![1]) % 90 !== 0,
    `결 각도 ${angle![1]}도가 직각이다 — 90의 배수면 종이가 아니라 인쇄 격자로 보인다`,
  );
  assert.ok(
    (UI_MATERIAL.stain.match(/radial-gradient/g) ?? []).length >= 3,
    '얼룩이 하나뿐이면 그라데이션으로 읽힌다 — 여러 곳에 흩어야 한다',
  );
  assert.ok(
    !/^0 0 /.test(UI_MATERIAL.paperShadow),
    '종이 그림자는 방향이 있어야 한다 (0 0 은 네온 글로우)',
  );
  // 모서리 네 값이 전부 같으면 균일한 것과 다르지 않다
  const corners = UI_MATERIAL.deckle.split(/\s+/);
  assert.equal(corners.length, 4, '모서리는 네 값을 따로 준다');
  assert.ok(new Set(corners).size >= 3, '네 귀퉁이 중 최소 셋은 달라야 한다');
}

console.log('ui palette regression: 마도서정본·의미색구분·숫자토큰파생·주요화면이행·HUD·하드코딩상한·영창바대조·마도서재질 8군 통과');
