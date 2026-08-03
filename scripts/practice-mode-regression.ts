import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PRACTICE_DUMMY_CONFIG,
  consumePracticeRunRequest,
  requestPracticeRun,
} from '../src/dev/practiceMode';

assert.equal(consumePracticeRunRequest(), false, '기본값은 일반 런');
requestPracticeRun();
assert.equal(consumePracticeRunRequest(), true, '타이틀 요청을 전투 씬이 한 번 소비');
assert.equal(consumePracticeRunRequest(), false, '연습 요청은 다음 런에 새지 않음');
assert.equal(PRACTICE_DUMMY_CONFIG.maxHp, 450, '기억 보스 기준 체력으로 피해 강조 단계 유지');
assert.ok(PRACTICE_DUMMY_CONFIG.regenerationPerSecond > 0, '장시간 관측용 체력 회복');

const title = readFileSync('src/scenes/TitleScene.ts', 'utf8').replace(/\s+/g, ' ');
const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8').replace(/\s+/g, ' ');
const dummy = readFileSync('src/dev/trainingDummyEnemy.ts', 'utf8').replace(/\s+/g, ' ');

assert.match(
  title,
  /if \(import\.meta\.env\.DEV\) this\.createPracticeTab\(width, height\);/u,
  '프로덕션 타이틀에는 연습실 진입점이 없음',
);
assert.match(title, /requestPracticeRun\(\); this\.startGame\(\);/u, '연습실 클릭 진입');
assert.match(
  scene,
  /const practice = import\.meta\.env\.DEV && consumePracticeRunRequest\(\);[\s\S]*?if \(practice\) this\.seedPracticeRun\(\);/u,
  'DEV 요청만 연습 런으로 전환',
);
assert.match(
  scene,
  /private seedPracticeRun\(\): void \{ this\.practiceRun = true; this\.demoRun = true; applyDemoBuildLoadout\('chorus',/u,
  '단일 허수아비와 일치하는 합주 연습 로드아웃',
);
assert.match(scene, /this\.waveText\.setText\(withCleanse\(\['PRACTICE', '고정 표적 · 마나 자동 회복'\]\)\);/u, '연습실 전용 HUD');
assert.match(
  scene,
  /if \(this\.practiceRun\) \{ this\.startPracticeRoom\(\); return; \}/u,
  '일반 방 저주·웨이브 이전 연습실 분기',
);
assert.match(
  scene,
  /private startPracticeRoom\(\): void \{ this\.waveManager = new WaveManager\(\[\{ chaserCount: 0, shooterCount: 0, splitterCount: 0 \}\]\);[\s\S]*?new TrainingDummyEnemy/u,
  '일반 웨이브 없이 허수아비 하나 배치',
);
assert.match(scene, /if \(this\.practiceRun\) this\.playerState\.restoreMana\(this\.playerState\.maxMana\);/u, '연습실 마나 자동 회복');
assert.match(dummy, /readonly kind = 'boss' as const;/u, '단일 대상 합주·넉백 면역은 보스 경로와 동일');
assert.match(dummy, /get canDealContactDamage\(\): boolean \{ return false; \}/u, '허수아비는 공격하지 않음');
assert.match(dummy, /this\.hp = Math\.max\(1,[\s\S]*?return false;/u, '피해는 받되 처치되지 않음');
assert.doesNotMatch(dummy, /this\.view\.[xy] \+=/u, '허수아비는 이동하지 않음');

console.log('practice mode regression: DEV 진입·합주 로드아웃·전용 HUD·정지 무공격 불사 허수아비 13군 통과');
