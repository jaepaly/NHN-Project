import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * 일시정지 키 회귀 (총괄 지시: "화면 멈추는 거 tab 대신 esc키로 바꿔").
 *
 * 이 화면은 상태/빌드·연구·지도를 보는 일시정지 탭이다. ESC가 관례에 맞다.
 *
 * 키 배치는 순수 모듈이 아니라 씬 배선이라 소스를 읽어 고정한다 — 그래도 안 하는
 * 것보다 낫다: 안내 문구와 실제 키가 어긋나면 플레이어가 못 연다.
 */

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

// ── 1) ESC가 토글한다 ───────────────────────────────────────────────────────
{
  assert.ok(
    /keydown-ESC['"], \(\) => \{/.test(scene),
    'ESC 핸들러가 있어야 한다',
  );
  const escAt = scene.indexOf("keydown-ESC");
  const escBlock = scene.slice(escAt, escAt + 600);
  assert.ok(
    /this\.toggleBuildInspect\(\)/.test(escBlock),
    'ESC가 검사 모드를 **토글**해야 한다 (닫기 전용이면 열 수가 없다)',
  );
}

// ── 2) TAB은 더 이상 열지 않는다 ───────────────────────────────────────────
{
  const tabAt = scene.indexOf("keydown-TAB");
  assert.ok(tabAt > 0, 'TAB 핸들러 자체는 남아 있어야 한다 (아래 3번 참조)');
  const tabBlock = scene.slice(tabAt, tabAt + 300);
  assert.ok(
    !/toggleBuildInspect/.test(tabBlock),
    'TAB이 검사 모드를 열면 안 된다 — ESC로 옮겼다',
  );
}

// ── 3) **TAB 캡처는 남긴다** ────────────────────────────────────────────────
//
// ⚠️ 토글을 뗐다고 캡처까지 풀면 브라우저 기본 포커스 이동이 살아난다. 포커스가
// 영창 입력창이나 브라우저 UI로 튀면 그 뒤 키 입력이 통째로 엉킨다. 아무 동작도
// 안 하는 게 포커스가 튀는 것보다 낫다.
{
  assert.ok(
    /addCapture\(['"]TAB['"]\)/.test(scene),
    'TAB 캡처를 풀면 포커스가 튄다 — 동작은 없애도 캡처는 남긴다',
  );
  const tabAt = scene.indexOf("keydown-TAB");
  assert.ok(
    /event\.preventDefault\(\)/.test(scene.slice(tabAt, tabAt + 300)),
    'TAB 기본 동작을 막아야 한다',
  );
}

// ── 4) **ESC가 두 겹을 한 번에 닫지 않는다** ───────────────────────────────
//
// 설정은 DOM 오버레이라 자체 Escape 핸들러를 갖는데, Phaser 키보드는 window에서
// 듣기 때문에 **둘 다 발화한다.** 가드가 없으면 설정이 닫히면서 일시정지까지 풀려
// 게임으로 튕겨 나간다 — 설정만 닫고 메뉴에 남아야 한다.
{
  assert.ok(
    /private settingsOverlayOpen = false;/.test(scene),
    '설정 오버레이 열림 플래그가 있어야 한다',
  );
  const escAt = scene.indexOf("keydown-ESC");
  assert.ok(
    /if \(this\.settingsOverlayOpen\) return;/.test(scene.slice(escAt, escAt + 600)),
    'ESC 핸들러가 설정 오버레이 중에는 빠져나가야 한다',
  );
  // 플래그가 켜지고 **꺼지는지** — 안 꺼지면 그 뒤로 ESC가 영영 안 먹는다
  assert.ok(
    /this\.settingsOverlayOpen = true;/.test(scene),
    '설정을 열 때 플래그를 켠다',
  );
  assert.ok(
    /this\.settingsOverlayOpen = false;/.test(scene),
    '설정이 닫히면 플래그를 꺼야 한다 — 안 끄면 ESC가 영영 안 먹는다',
  );
}

// ── 5) 안내 문구가 실제 키와 같다 ──────────────────────────────────────────
//
// 문구와 키가 어긋나면 플레이어가 못 연다. 화면에 뜨는 문자열에 TAB이 남으면 잡는다.
{
  // ⚠️ `[^']*`는 개행을 넘어가 엉뚱한 구간을 문자열로 잡는다(실제로 오탐했다).
  // 문자열 리터럴은 한 줄 안에 있으므로 개행을 명시적으로 제외한다.
  const uiStrings = scene.match(/'[^'\n]*(?:TAB|Tab)[^'\n]*'/g) ?? [];
  const userFacing = uiStrings.filter((text) => /이동|영창|빌드|돌아간다|일시정지/.test(text));
  assert.equal(
    userFacing.length, 0,
    `화면 문구에 TAB이 남아 있다: ${userFacing.join(' / ')}`,
  );
  assert.ok(
    /ESC 일시정지/.test(scene),
    '하단 조작 안내가 ESC를 가리켜야 한다',
  );
  assert.ok(/ESC 게임으로 돌아가기/.test(scene), '탭 화면 안내가 ESC 복귀를 가리켜야 한다');
}

// ── 6) 영창 중에는 열리지 않는다 ───────────────────────────────────────────
//
// 영창 입력창도 Escape로 닫힌다(같은 이유로 둘 다 발화한다). `toggleBuildInspect`의
// 기존 가드가 이걸 막는다 — ESC 토글로 바뀌면서 이 가드의 중요도가 올라갔다.
// 종전엔 ESC가 "닫기 전용"이라 영창 중에 눌러도 열릴 일이 없었다.
{
  const toggleAt = scene.indexOf('private toggleBuildInspect()');
  assert.ok(toggleAt > 0, 'toggleBuildInspect가 있어야 한다');
  const guard = scene.slice(toggleAt, toggleAt + 320);
  assert.ok(
    /!this\.buildInspectOpen && \([\s\S]*this\.incanting[\s\S]*this\.casting[\s\S]*this\.legacySelecting[\s\S]*this\.researchSelecting/.test(guard),
    '영창·시전·유산선택·연구선택 중에는 열리지 않아야 한다 (ESC가 영창 창도 닫으므로 둘 다 발화한다)',
  );
}

// ── 7) 지도는 ESC의 지도 탭에서만 보이며, 맵 시드는 숨긴다 ─────────────────
{
  assert.ok(
    /private currentMapSeed: number \| null = null;/.test(scene),
    '현재 런의 맵 시드를 씬 상태로 보관해야 한다',
  );
  const generatorAt = scene.indexOf('private runMapDefinition');
  const generatorBlock = scene.slice(generatorAt, generatorAt + 1_300);
  assert.ok(
    /this\.currentMapSeed = generated\.seed;/.test(generatorBlock),
    '생성에 실제 사용된 시드를 보관해야 한다',
  );
  const renderAt = scene.indexOf('private renderPauseMenu');
  const renderBlock = scene.slice(renderAt, renderAt + 1_500);
  assert.ok(
    !/pauseMapSeedText|맵 시드|this\.currentMapSeed/.test(renderBlock),
    '맵 시드는 개발 재현용이므로 ESC 사용자 화면에 표시하지 않는다',
  );
  const pauseAt = scene.indexOf('private createPauseMenu');
  const pauseBlock = scene.slice(pauseAt, pauseAt + 2_000);
  assert.ok(
    !/pauseMapSeedText/.test(pauseBlock),
    '맵 시드 전용 HUD 객체를 만들지 않는다',
  );
  const shouldAt = scene.indexOf('private shouldShowMinimap');
  const shouldBlock = scene.slice(shouldAt, shouldAt + 500);
  assert.ok(
    /this\.buildInspectOpen && PAUSE_MAIN\[this\.pauseMenuIndex\]\?\.id === 'map'/.test(shouldBlock),
    '전체 경로는 ESC 전체가 아니라 지도 탭에서만 보여야 한다',
  );
  const placeAt = scene.indexOf('private placePauseMinimap');
  const placeBlock = scene.slice(placeAt, placeAt + 700);
  assert.ok(
    /MINIMAP_CONFIG\.width \* PAUSE_MAP\.scale/.test(placeBlock)
      && /PAUSE_MAP\.top/.test(placeBlock)
      && /depth: PAUSE_MAP\.depth/.test(placeBlock),
    '전체 경로는 지도 탭 전용 레이아웃을 사용해야 한다',
  );
}

console.log('pause key regression: ESC토글·TAB해제·캡처유지·이중닫힘방지·안내일치·영창가드·지도탭 7군 통과');
