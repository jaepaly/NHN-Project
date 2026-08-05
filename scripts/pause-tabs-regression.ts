import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ESC 화면의 최소 계약. Phaser 브라우저 실행 없이 탭 구성·상태/빌드 원천·설정 저장 경로를 고정한다.
 */
const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

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
  'this.startingLegacyReward',
  'this.engraveManager.entries',
  'this.spiritManager.entries',
  'buildResonanceLedger(this.combatRunController.state.rewards)',
]) {
  assert.ok(content.includes(source), `상태/빌드는 ${source}를 포함해야 한다`);
}
for (const category of ['legacy', 'engrave', 'spirit', 'altar', 'resonance']) {
  assert.match(scene, new RegExp(`id: '${category}'`), `상태/빌드 분류 ${category}가 있어야 한다`);
}
assert.match(scene, /private selectPauseBuildCategory\(/, '상태/빌드 분류는 클릭으로 선택할 수 있어야 한다');
assert.match(scene, /private selectPauseBuildEntry\(/, '상태/빌드 카드는 클릭하면 상세를 바꿔야 한다');
assert.match(scene, /private renderPauseSettingsContent\(/, '설정은 ESC 패널 안에서 그려야 한다');
assert.match(scene, /private commitPauseSettings\(/, 'ESC 설정은 기존 저장 경로를 사용해야 한다');

const pauseMenuAt = scene.indexOf('private createPauseMenu(');
const pauseMenu = scene.slice(pauseMenuAt, pauseMenuAt + 8_000);
assert.doesNotMatch(pauseMenu, /\.on\('pointerover',[\s\S]{0,140}selectPauseTab/, '마우스 hover로 탭이 바뀌면 안 된다');
assert.match(pauseMenu, /\.on\('pointerdown',[\s\S]{0,220}selectPauseTab/, '탭은 클릭으로 전환해야 한다');

const researchAt = scene.indexOf('private pauseResearchLines()');
const research = scene.slice(researchAt, researchAt + 1_500);
assert.match(research, /this\.runResearchTracker\.snapshot\(\)\.research/, '연구 탭은 현재 런 연구를 읽어야 한다');

console.log('pause tabs regression: 클릭 탭 · 상태/빌드 분류 카드 · 내장 설정 · 별도 나가기 확인 통과');
