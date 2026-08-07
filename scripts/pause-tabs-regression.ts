import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ESC 화면의 최소 계약. Phaser 브라우저 실행 없이 탭 구성·상태/빌드 원천·설정 저장 경로를 고정한다.
 */
const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
const buildCategoriesAt = scene.indexOf('const PAUSE_BUILD_CATEGORIES');
const buildCategories = scene.slice(buildCategoriesAt, buildCategoriesAt + 420);
assert.doesNotMatch(buildCategories, /id: 'legacy'/,
  'Start legacy must not have a separate build category');

const menuAt = scene.indexOf('const PAUSE_MAIN');
const menu = scene.slice(menuAt, menuAt + 480);
assert.ok(menuAt > 0, 'ESC 탭 목록이 있어야 한다');
for (const id of ['build', 'research', 'map', 'settings']) {
  assert.match(menu, new RegExp(`id: '${id}'`), `${id} 탭이 있어야 한다`);
}
assert.doesNotMatch(menu, /id: 'quit'/, '`타이틀로 나가기`는 탭이 아니라 별도 확인 버튼이어야 한다');
assert.doesNotMatch(menu, /id: 'resume'/, '`게임 재개` 항목은 ESC 탭에서 제거되어야 한다');

const toggleAt = scene.indexOf('private toggleBuildInspect()');
const toggle = scene.slice(toggleAt, toggleAt + 900);
assert.match(toggle, /this\.pauseMenuIndex = 0/, 'ESC를 열면 항상 상태/빌드 탭부터 보여야 한다');

const contentAt = scene.indexOf('private pauseBuildEntries(');
const content = scene.slice(contentAt, contentAt + 7_500);
for (const source of [
  'this.engraveManager.entries',
  'this.spiritManager.entries',
  'buildResonanceLedger(this.combatRunController.state.rewards)',
]) {
  assert.ok(content.includes(source), `상태/빌드는 ${source}를 포함해야 한다`);
}
for (const category of ['engrave', 'spirit', 'altar', 'resonance']) {
  assert.match(scene, new RegExp(`id: '${category}'`), `상태/빌드 분류 ${category}가 있어야 한다`);
}
assert.match(scene, /private selectPauseBuildCategory\(/, '상태/빌드 분류는 클릭으로 선택할 수 있어야 한다');
assert.match(scene, /private selectPauseBuildEntry\(/, '상태/빌드 카드는 클릭하면 상세를 바꿔야 한다');
assert.match(scene, /private pauseBuildCategoryZones: Phaser\.GameObjects\.Zone\[\]/,
  '분류 탭은 테두리와 같은 클릭 영역을 가져야 한다');
assert.match(scene, /this\.pauseBuildCategoryZones = PAUSE_BUILD_CATEGORIES\.map/,
  '모든 분류 탭에 같은 크기의 클릭 영역을 만들어야 한다');
assert.match(scene, /private renderPauseSettingsContent\(/, '설정은 ESC 패널 안에서 그려야 한다');
assert.match(scene, /private commitPauseSettings\(/, 'ESC 설정은 기존 저장 경로를 사용해야 한다');
const settingsAt = scene.indexOf('private renderPauseSettingsContent()');
const settingsContent = scene.slice(settingsAt, settingsAt + 2_000);
assert.match(settingsContent, /this\.runMinimap\?\.setVisible\(false\)/,
  '설정 탭은 이전 지도 레이어를 즉시 숨겨야 한다');
assert.doesNotMatch(settingsContent, /타격 · 시전 소리|전투 · 보스 음악|마법 연출만 조절/,
  '설정은 보조 설명 없이 항목명과 값만 보여야 한다');
assert.match(scene, /private pauseSettingDragKey: SettingKey \| null = null/,
  '설정 슬라이더는 현재 드래그 대상을 유지해야 한다');
assert.match(scene, /this\.input\.on\('pointermove'/,
  '설정 슬라이더는 누른 채 움직이면 연속 조절해야 한다');
assert.match(scene, /private beginPauseSettingDrag\(/,
  '슬라이더 클릭은 드래그 시작 경로를 사용해야 한다');

assert.match(scene, /this\.game\.canvas\.setPointerCapture\(/,
  '슬라이더를 잡은 뒤 캔버스 밖에서도 포인터를 계속 받아야 한다');
assert.doesNotMatch(scene, /this\.input\.on\('pointerout', stopPauseSettingDrag\)/,
  '캔버스 밖으로 나갔다고 드래그를 중단하면 안 된다');
const titleSettingsPanel = readFileSync('src/ui/gameSettingsPanel.ts', 'utf8');
assert.match(titleSettingsPanel, /setPointerCapture\(/,
  '타이틀 설정도 같은 자유 드래그 규칙을 써야 한다');
assert.doesNotMatch(titleSettingsPanel, /input\.on\('pointerout'/,
  '타이틀 설정도 포인터가 화면 밖으로 나갔다고 드래그를 해제하면 안 된다');

const pauseMenuAt = scene.indexOf('private createPauseMenu(');
const pauseMenu = scene.slice(pauseMenuAt, pauseMenuAt + 8_000);
assert.doesNotMatch(pauseMenu, /\.on\('pointerover',[\s\S]{0,140}selectPauseTab/, '마우스 hover로 탭이 바뀌면 안 된다');
assert.match(pauseMenu, /\.on\('pointerdown',[\s\S]{0,220}selectPauseTab/, '탭은 클릭으로 전환해야 한다');
assert.doesNotMatch(pauseMenu, /drawTitleSigil\(/, '일시정지 제목의 시길은 제목 글자와 겹치지 않게 제거한다');
assert.match(scene, /titleY: 122/,
  'ESC 큰 제목은 콘텐츠 패널 위쪽 테두리에서 조금 내려와야 한다');
assert.match(scene, /this\.pauseContentTitle\.setPosition\(contentX \+ contentWidth \/ 2, PAUSE_LAYOUT\.titleY\)/,
  '모든 ESC 탭의 큰 제목은 콘텐츠 상단 중앙에 있어야 한다');

const quitAt = scene.indexOf('if (this.quitArmed) {', scene.indexOf('private renderPauseContent('));
const quitContent = scene.slice(quitAt, quitAt + 3_200);
assert.match(quitContent, /\.setPosition\(contentCenterX, PAUSE_LAYOUT\.top \+ 145\)/,
  '나가기 확인 질문은 일반 본문과 달리 콘텐츠 중앙에 있어야 한다');
assert.match(quitContent, /this\.pauseQuitYesText\.setVisible\(true\)/,
  '나가기 확인 화면에는 YES 버튼이 보여야 한다');
assert.match(quitContent, /this\.pauseQuitNoText\.setVisible\(true\)/,
  '나가기 확인 화면에는 NO 버튼이 보여야 한다');
assert.match(scene, /this\.pauseQuitYesZone[\s\S]{0,500}this\.abandonRun\(\)/,
  'YES 버튼은 실제 런 포기 동작과 연결되어야 한다');
assert.match(scene, /this\.pauseQuitNoZone[\s\S]{0,500}this\.cancelPauseQuit\(\)/,
  'NO 버튼은 나가기 확인만 취소해야 한다');

const buildRenderAt = scene.indexOf('private renderPauseBuildContent()');
const buildRender = scene.slice(buildRenderAt, buildRenderAt + 7_500);
assert.match(buildRender, /const detailWidth = 204/,
  '시작 유산은 하나뿐이므로 상세를 넓게 보여야 한다');
assert.doesNotMatch(buildRender, /아직/,
  '빈 상태/빌드 분류는 획득하지 못했다는 문구 대신 비워 둬야 한다');
assert.match(scene, /private pauseBuildCardFormIcons: Phaser\.GameObjects\.Image\[\]/,
  '주문 각인 카드는 전투 HUD와 같은 form 이미지를 별도로 그려야 한다');
assert.match(scene, /private pauseBuildDetailTexts: Phaser\.GameObjects\.Text\[\]/,
  'Build detail keeps text parts for element-specific colors');
assert.match(scene, /function pauseBuildDetailParts\(/,
  'Build detail splits element labels from ordinary prose');
assert.match(scene, /paletteColorToCss\(ELEMENT_PALETTES\[next\.element\]\.core\)/,
  'Element labels reuse the shared combat HUD palette');
assert.match(buildRender, /this\.renderPauseBuildDetail\(/,
  'Build panel uses the colored detail renderer');
assert.match(content, /formGlyph: entry\.spell\.form/,
  '주문 각인 카드는 실제 주문 form을 아이콘 원천으로 사용해야 한다');
assert.match(scene, /function shortBuildName\(/,
  'Automatic-engrave cards normalize dotted judge labels into one player-facing spell name');
assert.match(content, /const displayName = shortBuildName\(entry\.spell\.name\)/,
  'Automatic-engrave cards use the normalized spell name');
assert.match(content, /elements: \[entry\.spell\.element_primary\]/,
  'Automatic-engrave card borders expose only the displayed primary element');
assert.match(content, /formGlyph: SPIRIT_GLYPH\[entry\.role\]/,
  'Contract spirit cards reuse the same glyph source as the HUD');
assert.match(content, /cardLabel: entry\.fusedName \?\? `\$\{elementLabel\} 정령`/,
  'Contract spirit cards use their concise display name');
assert.match(buildRender, /setTexture\(formGlyphTextureKey\(entry\.formGlyph \?\? 'bolt'\)\)/,
  '주문 각인 카드는 우하단 HUD와 같은 formGlyphTextureKey를 재사용해야 한다');
assert.match(buildRender, /setTint\(entry\.iconTint \?\? 0xffffff\)/,
  'SVG 원본 픽셀이 검어도 카드 글리프는 원소색으로 강제 표시되어야 한다');
assert.match(buildRender, /const iconOnly = category\.id === 'engrave'/,
  'Automatic engraves use an icon-only card treatment');
assert.match(buildRender, /const iconTileSize = iconOnly \? 48 : 34/,
  'Automatic engrave icons are enlarged to HUD-readable size');
assert.match(buildRender, /setVisible\(!iconOnly\)/,
  'Automatic engrave cards do not repeat their spell names below the icon');
assert.match(buildRender, /drawElementSpectrumBorder\(g, iconElements, x, iconCenterY, iconTileSize \/ 2, false\)/,
  'Fused spirit cards draw a multi-element spectrum instead of a single tint');
assert.match(buildRender, /\.setText\(title\)/,
  '작은 카드에는 주문명만 표시해야 한다');
assert.doesNotMatch(buildRender, /cardMeta|`\$\{title\}\\n\$\{summary\}`/,
  '속성·형태·효과 요약은 작은 카드가 아니라 왼쪽 상세에서만 보여야 한다');
assert.match(buildRender, /const frame = pauseBuildTabFrame\(index\)/,
  '시작 유산 탭에는 불필요한 개수를 붙이지 않아야 한다');
assert.doesNotMatch(buildRender, /category\.id === 'legacy'/,
  '시작 유산은 우측 카드 목록을 만들지 않아야 한다');

const arrivalAt = scene.indexOf('private playBuildChipArrival(');
const arrival = scene.slice(arrivalAt, arrivalAt + 6_000);
assert.match(arrival, /this\.tweens\.addCounter\(\{/,
  '획득 알림의 체류 시간은 ESC가 멈추는 전투 Clock과 분리해야 한다');
assert.doesNotMatch(arrival, /this\.time\.delayedCall\(1100, beginTravel\)/,
  'ESC에서 멈추는 Scene Clock을 획득 알림 대기에 사용하면 안 된다');

const researchAt = scene.indexOf('private pauseResearchLines()');
const research = scene.slice(researchAt, researchAt + 1_500);
assert.match(research, /this\.runResearchTracker\.snapshot\(\)\.research/, '연구 탭은 현재 런 연구를 읽어야 한다');

console.log('pause tabs regression: 클릭 탭 · 정확한 분류 버튼 · 유산 통합 · 내장 설정 · 별도 나가기 확인 통과');
