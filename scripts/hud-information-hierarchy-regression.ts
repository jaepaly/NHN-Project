import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8').replace(/\s+/g, ' ');
const bossHud = readFileSync('src/ui/bossHealthBarHud.ts', 'utf8').replace(/\s+/g, ' ');

assert.match(bossHud, /const y = 35;/u, 'boss bar sits below the timer');
assert.match(bossHud, /const x = width \/ 2;/u, 'boss bar is centered');
assert.match(scene, /this\.add\.text\(width \/ 2, height - 20, 'WASD/u, 'controls are centered at the bottom');
// #369에서 전용 렌더러가 사라지고 ESC 패널의 **탭**으로 통합됐다. 지키려는 건 렌더러
// 이름이 아니라 "ESC에서 연구를 들여다볼 수 있다"이므로 탭의 존재를 본다.
assert.match(scene, /PauseTabId = [^;]*'research'/u, 'ESC 패널에 연구 탭이 있다');
assert.match(scene, /pauseContentTitle\.setText\('연구'\)/u, 'ESC 연구 탭이 실제 내용을 그린다');
// 연구 상세는 전투 중에 떠 있으면 안 된다 — ESC를 열었을 때만 보여야 한다. 종전엔
// `buildInspectOpen` 가드로 지켰는데, 지금은 **구조가 대신 보장한다**: 연구 문구를
// 만드는 곳이 일시정지 내용 렌더 한 곳뿐이다. 호출이 하나 더 생기면 여기서 걸린다.
assert.equal(
  (scene.match(/this\.pauseResearchLines\(\)/g) ?? []).length, 1,
  'research detail is produced only by the ESC pause panel',
);
assert.match(
  scene,
  /case 'research': this\.pauseContentTitle\.setText\('연구'\); this\.pauseContentText\.setText\(this\.pauseResearchLines\(\)/u,
  'research detail is rendered by the research tab',
);
assert.match(scene, /const noticeHeight = this\.waveText\.text\.trim\(\)\.length > 0 \? roomNoticeHeight\(this\.waveText\.height\) : 0;/u, 'only a real hazard notice reserves space below radar');
assert.doesNotMatch(scene, /RIGHT_PANEL|rightPanelHeight/u, 'legacy combined right panel removed');

console.log('hud information hierarchy regression: combat and ESC information layers passed');
