import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { UI_COLOR, UI_HEX, UI_MATERIAL, UI_SEMANTIC, hex } from '../src/ui/uiTokens';
import { FRAME_CONFIG, deckledPoints } from '../src/render/grimoireFrameGeometry';

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
  // ⚠️ 판 색(panel·border)은 이제 `drawGrimoirePanel` **안**에 있다. 씬에서 직접
  // 참조가 사라진 게 정상이라, 씬에는 **의미 색**과 트랙만 남는다.
  // (이 단언이 낡아 한 번 오탐했다 — 구조가 바뀌면 검사도 따라가야 한다)
  for (const token of ['UI_HEX.track', 'UI_SEMANTIC.hp', 'UI_SEMANTIC.mana', 'UI_SEMANTIC.shield']) {
    assert.ok(scene.includes(token), `HUD가 ${token}을 써야 한다`);
  }
  // 판 색은 그리기 모듈이 쓴다
  const frameSrc = readFileSync('src/render/grimoireFrame.ts', 'utf8');
  for (const token of ['UI_HEX.panel', 'UI_HEX.border', 'UI_HEX.accent']) {
    assert.ok(frameSrc.includes(token), `판 그리기가 ${token}을 써야 한다`);
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
  // 다섯 오버레이 전부 — 하나라도 빠지면 그 화면만 다른 게임처럼 보인다
  const overlays = [
    'rewardCardOverlay', 'bossChoiceOverlay', 'runSummaryOverlay',
    'roomChoiceOverlay', 'codexOverlay',
  ];

  // ⚠️ `box-shadow: 0 0 Npx`는 **네온·SF 문법**이다. 종이는 스스로 빛나지 않고
  // 아래로 그림자를 떨어뜨린다. 색을 아무리 금색으로 바꿔도 균일 글로우가 남으면
  // 홀로그램 카드로 읽힌다. (`inset 0 0 0 1px`은 테두리라 예외)
  for (const name of overlays) {
    const src = readFileSync(`src/ui/${name}.ts`, 'utf8');
    // ⚠️ 그림자 선언은 여러 줄에 걸치고, `rgba(0, 0, 0, .5)`처럼 **함수 인자 안에도
    // 쉼표가 있다.** 그냥 쉼표로 나누면 `inset 0 0 55px rgba(0` / ` 0` / ` 0` 식으로
    // 쪼개져 오탐한다(실제로 그렇게 걸렸다).
    // 함수 인자를 먼저 지우고 나눈다.
    const shadows = src.match(/(?:box|text|drop)-shadow:[^;]+/g) ?? [];
    const neon = shadows
      // 중첩 괄호(`color-mix(in srgb, var(--x) 30%, transparent)`)까지 지우려면
      // 안쪽부터 반복 치환해야 한다
      .map((decl) => {
        let out = decl;
        for (let pass = 0; pass < 4; pass += 1) {
          const next = out.replace(/[a-z-]+\([^()]*\)/gi, 'C');
          if (next === out) break;
          out = next;
        }
        return out;
      })
      .flatMap((decl) => decl.split(','))
      .filter((part) => !/inset/.test(part))
      // ⚠️ `0 0 0 Npx`는 **퍼짐 링**이지 발광이 아니다(오프셋 0·흐림 0·퍼짐 N).
      // 선택 테두리를 두껍게 그리는 정상 용법이라 걸러야 한다 — 실제로 오탐했다.
      .filter((part) => !/0 0 0 [0-9]+px/.test(part))
      .filter((part) => /(?:^|[^0-9])0 0 [0-9]+px/.test(part));
    assert.ok(
      neon.length <= 1,
      `${name}: 네온 글로우가 ${neon.length}건 남았다 — 종이는 스스로 빛나지 않는다`
      + ` (${neon.slice(0, 2).join(' / ')})`,
    );
  }

  // **모든 오버레이가 장식을 쓰는가.** 만들어만 두면 아무 소용이 없다.
  for (const name of overlays) {
    const src = readFileSync(`src/ui/${name}.ts`, 'utf8');
    assert.ok(
      /cornerFlourish\(\)/.test(src),
      `${name}: 모서리 장식이 없다 — 판만 있으면 "상자에 색만"으로 돌아간다`,
    );
    assert.equal(
      (src.match(/orn-corner (?:tl|tr|bl|br)/g) ?? []).length >= 2, true,
      `${name}: 모서리 장식이 최소 둘은 있어야 한다`,
    );
    assert.ok(/divider\(\)/.test(src), `${name}: 구획 괘선이 없다`);

    // ⚠️ **같은 규칙 안에서 background를 두 번 선언하면 뒤엣것이 이긴다.**
    // 도감에서 실제로 그랬다 — 재질을 넣었는데 아래에 `background: rgba(...)`가
    // 남아 있어 배경 겹이 0이었다. 라이브로 확인하기 전엔 회귀도 통과했다.
    for (const rule of src.match(/\.[a-z-]*panel \{[^}]*\}/g) ?? []) {
      const bg = (rule.match(/(?:^|\s)background:/g) ?? []).length;
      assert.ok(
        bg <= 1,
        `${name}: 패널 규칙에 background가 ${bg}번 — 뒤엣것이 재질을 덮는다`,
      );
      const shadow = (rule.match(/(?:^|\s)box-shadow:/g) ?? []).length;
      assert.ok(shadow <= 1, `${name}: 패널 규칙에 box-shadow가 ${shadow}번`);
    }
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

// ── 9) **장식이 있는가** — 색·재질로는 부족하다 ────────────────────────────
//
// 총괄 지적: *"그냥 상자 하나 띄우고 색만 칠한 거잖아. 디자인이 없어."*
//
// 앞선 두 단계(색 교체 → 재질 추가)는 전부 **표면 처리**였다. 표면을 아무리 손봐도
// 형태가 `둥근 사각형 + 테두리 + 가운데 정렬`이면 기본값으로 보인다. 필사본이
// 필사본으로 보이는 이유는 종이 질감이 아니라 **그려 넣은 것들**이다.
{
  const orn = readFileSync('src/ui/grimoireOrnament.ts', 'utf8');
  const reward = readFileSync('src/ui/rewardCardOverlay.ts', 'utf8');

  // 장식은 SVG여야 한다 — CSS로는 곡선을 못 그린다. border-radius·box-shadow로
  // 흉내내면 결국 "둥근 사각형"이라 지금 문제가 반복된다.
  for (const fn of ['cornerFlourish', 'divider', 'waxSeal', 'titleSigil', 'deckleMask']) {
    assert.ok(orn.includes(`export function ${fn}`), `${fn} 장식이 있어야 한다`);
  }
  assert.ok((orn.match(/<path /g) ?? []).length >= 8, '실제로 선을 그어야 한다 (path 8개 이상)');

  // ⚠️ 장식에 색을 박으면 팔레트를 바꿀 때 장식만 옛 색으로 남는다 — 이번 통일에서
  // 실제로 겪은 실패다(text-shadow가 옛 청록으로 남았다). currentColor를 쓴다.
  const hardCoded = (orn.match(/(?:stroke|fill)="#[0-9a-fA-F]{3,6}"/g) ?? [])
    // 예외 둘:
    //  - `#1a1206` 봉랍 각인 — 밀랍 **위에 눌린 음각**이라 밀랍색을 따라가면 안 보인다
    //  - `#fff` deckle 마스크 — 색이 아니라 **알파**다. 마스크에서 흰색은 "보인다"는 뜻
    .filter((m) => !m.includes('#1a1206') && !m.includes('#fff'));
  assert.equal(
    hardCoded.length, 0,
    `장식에 색이 박혀 있다: ${hardCoded.join(' ')} — currentColor를 쓸 것`,
  );

  // 보상 카드가 실제로 장식을 **쓰는가**. 만들어만 두면 아무 소용이 없다.
  for (const use of ['cornerFlourish()', 'divider()', 'titleSigil()', 'waxSeal(', 'deckleMask()']) {
    assert.ok(reward.includes(use), `보상 카드가 ${use}을 써야 한다`);
  }
  // 모서리는 네 귀퉁이 전부 — 하나만 두면 장식이 아니라 얼룩으로 보인다
  assert.equal(
    (reward.match(/orn-corner (?:tl|tr|bl|br)/g) ?? []).length, 4,
    '모서리 장식은 네 귀퉁이 전부에 놓는다',
  );

  // ⚠️ **머리글자(drop cap)를 쓰면 안 된다.** 라틴 문자 전제의 관습이라 한글에
  // 적용하면 단어가 쪼개진다 — "공명의 대가를…"에서 「공」만 떼어 상자에 넣었다가
  // 총괄이 바로 잡았다("왜 '공'만 상자에 들어있는 거임?").
  assert.ok(
    !/reward-initial/.test(reward) && !/titleText\.slice\(0, 1\)/.test(reward),
    '제목 첫 글자를 떼면 안 된다 — 한글은 음절 블록이 단어의 일부다',
  );
  assert.ok(
    /titleSigil\(\)/.test(reward),
    '표제 자리에는 글자가 아니라 표식을 놓는다 (한국어·일본어 책 디자인의 어두 장식)',
  );
  // 앞뒤 한 쌍 — 한쪽만 있으면 장식이 아니라 아이콘으로 읽힌다 (총괄 제안)
  assert.ok(
    (reward.match(/titleSigil\(\)/g) ?? []).length >= 2,
    '표제 인장은 제목 앞뒤에 한 쌍으로 둔다',
  );
  assert.ok(
    /orn-sigil mirrored/.test(reward),
    '뒤쪽 인장은 좌우 반전해 마주 보는 한 쌍이 되게 한다',
  );

  // 알약 배지(border-radius: 999px)는 웹 UI의 문법이다 — 봉랍으로 대체했는지 본다
  assert.ok(
    !/card-rare-ribbon/.test(reward),
    '알약 배지가 남아 있다 — 마도서에서 "특별하다"를 말하는 물건은 밀랍 도장이다',
  );

  // 균일한 3열은 그 자체가 컴포넌트의 문법이다. 손으로 놓은 듯 어긋나야 한다.
  assert.ok(
    /--card-tilt/.test(reward) && /rotate\(var\(--card-tilt/.test(reward),
    '카드가 미세하게 기울어야 한다',
  );
  const tilts = reward.match(/\[-?[\d.]+, -?[\d.]+, -?[\d.]+, -?[\d.]+\]\[i % 4\]/g) ?? [];
  assert.ok(tilts.length >= 2, '기울기·높이가 카드마다 달라야 한다');
  // 각도가 크면 장난스러워진다
  const angles = (reward.match(/\[(-?[\d.]+(?:, -?[\d.]+){3})\]\[i % 4\]`\}deg/g) ?? []).join();
  for (const raw of angles.match(/-?[\d.]+/g) ?? []) {
    assert.ok(Math.abs(Number(raw)) <= 1, `기울기 ${raw}도가 과하다 — 1도 안쪽이어야 한다`);
  }
}

// ── 10) **항상 떠 있는 판도 장식이 있는가** ────────────────────────────────
//
// 총괄 지시: 자주 보이는 것부터 — *"체력 마나 뜨는 좌측 상단이랑, 현재 상태 뜨는
// 우측 상단이랑 아무튼 다"*. HUD는 오버레이보다 훨씬 자주 보인다(늘 떠 있다).
//
// DOM은 SVG를 쓰지만 HUD는 Phaser Graphics라 **선을 직접 그어야 한다.** 종전엔
// `fillRoundedRect` + 1px 테두리 — 지적받은 "상자에 색만" 그 형태였다.
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

  // 씬의 모든 UI 판이 장식 판을 쓰는가 — HUD · 우측 상태 · 일시정지 · 빌드 검사 툴팁
  // · 시퀀스 진행 바. 하나라도 빠지면 그 판만 둥근 사각형으로 튄다.
  assert.ok(
    (scene.match(/drawGrimoirePanel\(g/g) ?? []).length >= 5,
    `씬의 UI 판이 모두 장식 판을 써야 한다 (현재 ${(scene.match(/drawGrimoirePanel\(g/g) ?? []).length}건)`,
  );
  // 일시정지는 판이 커서 제목만 두면 비어 보인다 — 표제 인장 한 쌍 + 구획 괘선
  assert.ok(
    (scene.match(/drawTitleSigil\(g/g) ?? []).length >= 2,
    '일시정지 제목 양옆에 인장 한 쌍을 둔다',
  );

  // 미니맵 — 일시정지를 열면 나온다. 통일에서 빠져 청색이 남아 있었다.
  const minimap = readFileSync('src/ui/minimapHud.ts', 'utf8');
  assert.ok(
    /drawGrimoirePanel\(g/.test(minimap),
    '미니맵도 같은 판 문법이어야 한다 — 일시정지 화면 안에서 혼자 튀면 안 된다',
  );
  // ⚠️ **산문이 아니라 선언을 잡는다.** 주석에 "종전엔 0x8fa4ff였다"고 적어두면
  // `includes`로는 구분이 안 된다(실제로 오탐했다 — #303 프롬프트 회귀와 같은 실수).
  // 값이 실제로 쓰이는 자리(`: 0x…` 또는 `(0x…`)만 본다.
  for (const stale of ['0x8fa4ff', '0x2c3a6e', '0x2a735c', '0x080b1c']) {
    assert.ok(
      !new RegExp(`[:(,]\s*${stale}\b`).test(minimap),
      `미니맵이 옛 청색 ${stale}을 아직 쓴다`,
    );
  }
  // ⚠️ 노드 상태 색은 **정보**다(지나온 곳·현재·갈 수 있는 곳). 전부 금색으로 밀면
  // 어디를 지나왔는지 알 수 없다 — HUD의 HP·마나와 같은 원칙.
  const nodeColors = minimap.match(/cleared: (\S+),[\s\S]*?current: (\S+),[\s\S]*?reachable: (\S+),[\s\S]*?unvisited: (\S+),/);
  assert.ok(nodeColors, '노드 상태 색 네 가지가 있어야 한다');
  assert.equal(
    new Set(nodeColors!.slice(1, 5)).size, 4,
    '노드 상태 네 색이 서로 달라야 한다 — 같으면 진행 상황을 못 읽는다',
  );
  // 옛 둥근 사각형이 남아 있으면 그 판만 기본값으로 보인다
  assert.ok(
    !/fillRoundedRect\(HUD\.x, HUD\.y/.test(scene),
    'HUD가 아직 fillRoundedRect를 쓴다 — 매끈한 호는 종이가 되지 않는다',
  );
  assert.ok(
    !/fillRoundedRect\(width - 306/.test(scene),
    '우측 패널이 아직 fillRoundedRect를 쓴다',
  );

  // 변이 실제로 불규칙한가 — 직사각형이면 x·y가 각각 2종뿐이다
  const pts = deckledPoints(18, 18, 300, 130);
  assert.equal(pts.length / 2, 8, '변마다 중간점을 넣어 8꼭짓점');
  const xs = new Set<string>();
  const ys = new Set<string>();
  for (let i = 0; i < pts.length; i += 2) {
    xs.add(pts[i].toFixed(2));
    ys.add(pts[i + 1].toFixed(2));
  }
  assert.ok(xs.size > 2 && ys.size > 2, '꼭짓점이 직사각형이면 흔든 의미가 없다');

  // ⚠️ **결정론**이어야 한다. 매 프레임 다시 그리는데 난수를 쓰면 판이 떨린다 —
  // 늘 떠 있는 물체라 미세한 떨림도 누적 피로가 된다(#220).
  assert.deepEqual(
    deckledPoints(18, 18, 300, 130), pts,
    '같은 입력이면 같은 꼭짓점이어야 한다 (난수 금지)',
  );

  // 흔드는 폭 — 크면 찢어진 종이가 되고 작으면 직선과 구분이 안 된다
  assert.ok(
    FRAME_CONFIG.jitter >= 1 && FRAME_CONFIG.jitter <= 4,
    `흔드는 폭 ${FRAME_CONFIG.jitter}px가 범위를 벗어났다`,
  );

  // 늘 떠 있는 판에 애니메이션·발광을 넣지 않았는가 (#220 광과민성 예산)
  const frame = readFileSync('src/render/grimoireFrame.ts', 'utf8');
  assert.ok(!/BlendModes\.ADD/.test(frame), 'HUD 판에 ADD 블렌드를 쓰지 않는다');
  // ⚠️ 검사 대상은 **시간 의존**이다. `Math.sin`만 보고 잡으면 안 된다 —
  // 육각 인장 꼭짓점 계산에도 쓰인다(실제로 오탐했다). 프레임마다 값이 달라지는
  // 것(`time.now`·`tweens`·`Date.now`)만 금지한다.
  assert.ok(
    !/tweens\.add|time\.now|Date\.now|performance\.now/.test(frame),
    'HUD 판은 정지해 있어야 한다 — 늘 떠 있는 물체의 깜빡임은 누적 피로가 된다(#220)',
  );
}

console.log('ui palette regression: 마도서정본·의미색구분·숫자토큰파생·주요화면이행·HUD·하드코딩상한·영창바대조·마도서재질·장식·HUD장식 10군 통과');
