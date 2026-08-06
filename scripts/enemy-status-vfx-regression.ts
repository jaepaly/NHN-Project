import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ENEMY_STATUS_VFX } from '../src/render/enemyStatusVfxConfig';

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
const controlState = readFileSync('src/combat-core/control/enemyControlState.ts', 'utf8');
const ailmentState = readFileSync('src/combat-core/status/enemyAilmentState.ts', 'utf8');
const burn = ENEMY_STATUS_VFX.burn;

assert.ok(burn.iconRadius >= 9, '화상 표식은 전투 중 실루엣으로 식별 가능해야 한다');
assert.ok(burn.emberStartScale <= 0.18, '몸체 불씨는 상태 표식을 방해하지 않는 보조 연출이어야 한다');
assert.ok(scene.includes('createBurnStatusIcon'), '화상은 전용 불꽃 실루엣을 사용해야 한다');
assert.ok(scene.includes('enemy.view.add(icon)'), '지속 표식은 적을 따라가야 한다');
assert.ok(scene.includes('radius * cfg.iconOffsetXRatio'), '불꽃은 적 몸체 우측 상단에 붙어야 한다');
assert.ok(!scene.includes('const backplate ='), '화상 불꽃을 UI 배지처럼 만드는 원형 바탕은 사용하지 않는다');
assert.ok(scene.includes('repeat: -1'), '지속 표식은 화상 수명 동안 맥동해야 한다');
assert.ok(scene.includes('this.destroyBurnVfx(existing)'), '화상 만료 시 모든 지속 객체를 정리해야 한다');
assert.ok(scene.includes('this.destroyBurnVfx(vfx)'), '사망·런 정리에서도 화상 VFX를 제거해야 한다');
assert.ok(scene.includes('this.showBurnTickPulse(enemy)'), '지속 상태와 피해 틱 피드백을 분리해야 한다');

const slow = ENEMY_STATUS_VFX.slow;
assert.ok(slow.bodyOffsetYRatio > 0, '둔화 표식은 적 몸체 하단에 붙어야 한다');
assert.ok(controlState.includes('slowRemainingFor(enemy: CombatEnemy)'), '둔화 VFX는 실제 상태를 조회해야 한다');
assert.ok(scene.includes('this.syncSlowMarks()'), '둔화 표식은 매 프레임 실제 상태와 동기화한다');
assert.ok(scene.includes('this.enemyControlState.slowRemainingFor(enemy) > 0'), '수동·status·각인 진화 경로를 구분하지 않는다');
assert.ok(!scene.includes('if (!this.controlIndicators.has(enemy))'), 'applySlow 호출부 전용 표시는 남기지 않는다');
assert.ok(scene.includes('this.slowMarks.clear()'), '런 정리에서 둔화 표식을 제거해야 한다');

const freeze = ENEMY_STATUS_VFX.freeze;
assert.ok(freeze.radiusScale >= 1, '빙결 결박선은 적 몸체 바깥을 감싸야 한다');
assert.ok(scene.includes('this.syncFreezeMarks()'), '빙결 표식은 매 프레임 실제 상태와 동기화한다');
assert.ok(scene.includes('this.enemyControlState.rootRemainingFor(enemy) > 0'), '수동·freeze status·얼음 각인 진화 경로를 구분하지 않는다');
assert.ok(scene.includes('mark.strokePoints(['), '빙결은 각형 외곽 결박선을 사용한다');
assert.ok(scene.includes('this.freezeMarks.clear()'), '런 정리에서 빙결 표식을 제거해야 한다');
assert.ok(!scene.includes('controlIndicators'), '호출 경로에 종속된 구형 공용 원은 제거해야 한다');

const weaken = ENEMY_STATUS_VFX.weaken;
assert.ok(weaken.shieldScaleRatio >= 0.7, '취약 방패는 적 외곽에서 판독 가능한 크기여야 한다');
assert.ok(weaken.sideGap >= 6, '취약 방패는 적 몸체와 분리된 측면 표식이어야 한다');
assert.ok(scene.includes('mark.closePath()'), '취약은 닫힌 방패 실루엣을 사용해야 한다');
assert.ok(scene.includes('-radius - cfg.sideGap - size'), '취약 방패는 체력바를 피해 좌측 외곽 여백을 둬야 한다');
assert.ok(ailmentState.includes('weakenRemainingFor(enemy: CombatEnemy)'), '취약 VFX는 실제 상태를 조회해야 한다');
assert.ok(scene.includes('this.syncWeakenMarks()'), '취약 표식은 매 프레임 실제 상태와 동기화한다');
assert.ok(scene.includes('this.enemyAilments.weakenRemainingFor(enemy) > 0'), '일반·각인 진화·정령·각성 경로를 구분하지 않는다');
assert.ok(scene.includes('this.weakenMarks.clear()'), '런 정리에서 취약 표식을 제거해야 한다');
assert.ok(scene.includes('this.enemyAilments.remove(enemy)'), '적 사망 시 상태 저장소도 즉시 정리해야 한다');

console.log('enemy status VFX regression: burn 몸체불꽃 + slow/freeze/weaken 좌측 깨진방패 상태동기화·경로통합·동시표시·정리 30군 통과');
