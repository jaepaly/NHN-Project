import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * ESC 탭 화면의 최소 계약. Phaser 씬은 브라우저가 필요하므로, 메뉴 배선과
 * 빌드 데이터 원천을 소스에서 고정한다.
 */
const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

const menuAt = scene.indexOf('const PAUSE_MAIN');
const menu = scene.slice(menuAt, menuAt + 560);

assert.ok(menuAt > 0, 'ESC 탭 목록이 있어야 한다');
for (const id of ['build', 'research', 'map', 'settings', 'quit']) {
  assert.match(menu, new RegExp(`id: '${id}'`), `${id} 탭이 있어야 한다`);
}
assert.doesNotMatch(menu, /id: 'resume'/, '`게임 재개` 항목은 ESC 탭에서 제거해야 한다');

const toggleAt = scene.indexOf('private toggleBuildInspect()');
const toggle = scene.slice(toggleAt, toggleAt + 900);
assert.match(toggle, /this\.pauseMenuIndex = 0/, 'ESC를 열면 항상 상태/빌드 탭부터 보여야 한다');

const contentAt = scene.indexOf('private pauseBuildLines()');
const content = scene.slice(contentAt, contentAt + 3_800);
for (const source of [
  'this.startingLegacyReward',
  'this.engraveManager.entries',
  'this.spiritManager.entries',
  'buildResonanceLedger(this.combatRunController.state.rewards)',
]) {
  assert.ok(content.includes(source), `상태/빌드는 ${source}를 포함해야 한다`);
}

const researchAt = scene.indexOf('private pauseResearchLines()');
const research = scene.slice(researchAt, researchAt + 1_500);
assert.match(research, /this\.runResearchTracker\.snapshot\(\)\.research/, '연구 탭은 현재 런 연구를 읽어야 한다');

console.log('pause tabs regression: 기본 상태/빌드 · 연구 · 지도 · 설정 · 나가기 · 빌드 원천 통과');
