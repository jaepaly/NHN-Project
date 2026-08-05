import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LOW_HEALTH_DANGER,
  lowHealthDangerAlpha,
  nextLowHealthDangerActive,
} from '../src/ui/lowHealthDanger';

assert.equal(nextLowHealthDangerActive(false, 0.31), false);
assert.equal(nextLowHealthDangerActive(false, 0.3), true, '30%에서 켜진다');
assert.equal(nextLowHealthDangerActive(true, 0.32), true, '30~35%는 켜진 상태를 유지한다');
assert.equal(nextLowHealthDangerActive(false, 0.32), false, '30~35%는 꺼진 상태도 유지한다');
assert.equal(nextLowHealthDangerActive(true, 0.35), false, '35%에서 꺼진다');
for (const time of [0, 325, 650, 975, 1300]) {
  const alpha = lowHealthDangerAlpha(time);
  assert.ok(alpha >= LOW_HEALTH_DANGER.minAlpha && alpha <= LOW_HEALTH_DANGER.maxAlpha);
}
const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
assert.ok(scene.includes('this.updateLowHealthDanger(hpRatio);'), 'HUD 갱신에 위험 효과가 연결돼야 한다');
assert.ok(scene.includes('.fillRect(0, 0, width, height)'), '화면 전체를 한 장의 오버레이로 덮어야 한다');

console.log('low health danger regression: 30% 진입·35% 해제·히스테리시스·알파·씬배선 9군 통과');
