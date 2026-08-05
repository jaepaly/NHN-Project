import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatRunElapsed } from '../src/combat-core/run/runTimer';

assert.equal(formatRunElapsed(0), '00:00.0', '런 시작 표기');
assert.equal(formatRunElapsed(61_230), '01:01.2', '기존 런 시간 기준 재사용');

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8').replace(/\s+/g, ' ');
assert.match(
  scene,
  /this\.runTimerText = this\.add\.text\(width \/ 2, 14, '00:00\.0'/u,
  '상단 중앙 타이머 생성',
);
assert.match(
  scene,
  /this\.runTimerText\.setText\(formatRunElapsed\(this\.runElapsedMs\)\);/u,
  '기존 누적 시간 실시간 표시',
);
assert.doesNotMatch(
  scene,
  /`RUN \$\{formatRunElapsed\(this\.runElapsedMs\)\}`/u,
  '우측 패널 중복 런타임 제거',
);
assert.match(
  scene,
  /if \(this\.deathHandled \|\| this\.time\.paused \|\| !this\.isCombatActive\(\)\) return;/u,
  '기존 일시정지 제외 시간 계약 보존',
);

console.log('run timer HUD regression: 기존 시간 기준·상단 단일 표시·중복 제거 6군 통과');
