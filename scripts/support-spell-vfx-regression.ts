import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SUPPORT_VFX_CONFIG,
  shieldVisualRatio,
  supportPowerScale,
  supportVfxScale,
} from '../src/render/supportSpellVfxConfig';

// 1) 수동 영창은 자동 정령보다 강하게, 자동 반복은 광량을 억제한다.
assert.equal(supportVfxScale('spell'), 1);
assert.equal(supportVfxScale('spirit'), SUPPORT_VFX_CONFIG.passiveScale);
assert.equal(supportVfxScale('room-start'), SUPPORT_VFX_CONFIG.passiveScale);
assert.ok(SUPPORT_VFX_CONFIG.passiveScale > 0 && SUPPORT_VFX_CONFIG.passiveScale < 1);

// 2) 지속 보호막은 현행 합산 수치만 읽고 0~1 범위로 안전하게 정규화한다.
assert.equal(shieldVisualRatio(0, 100), 0);
assert.equal(shieldVisualRatio(25, 100), 0.25);
assert.equal(shieldVisualRatio(150, 100), 1);
assert.equal(shieldVisualRatio(-20, 100), 0);
assert.equal(shieldVisualRatio(20, 0), 0);
assert.equal(shieldVisualRatio(Number.NaN, 100), 0);
assert.equal(supportPowerScale(0), SUPPORT_VFX_CONFIG.minPowerScale);
assert.equal(supportPowerScale(100), SUPPORT_VFX_CONFIG.maxPowerScale);
assert.ok(supportPowerScale(80) > supportPowerScale(20));

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
const renderer = readFileSync('src/render/supportSpellVfx.ts', 'utf8');

// 3) heal/shield/buff 수치 적용 직후 전용 VFX 진입점이 각각 연결된다.
assert.ok(/playHeal\(\s*healed,[\s\S]*?spec\.power,/.test(scene), '수동 heal 적용량과 power가 VFX로 전달되어야 한다');
assert.ok(/spec\.element_primary,\s*'spell'/.test(scene), '수동 지원 영창은 원소 강조와 spell 강도를 사용');
assert.ok(/playShieldGain\(\s*shielded,[\s\S]*?spec\.power,/.test(scene), '수동 shield 획득량과 power 연출 연결');
assert.ok(scene.includes('playBuffCast(outcome.buff, spec.power, spec.element_primary)'), 'buff 종류별 power 시전 연출 연결');

// 4) 반복 정령은 같은 의미 언어를 쓰되 passive source로 광량이 감쇠된다.
assert.ok(scene.includes("playHeal(amount, this.playerState.maxHp, 50, 'light', 'spirit')"));
assert.ok(/playShieldGain\([\s\S]*?null,[\s\S]*?'spirit'/.test(scene));

// 5) 보호막 피격·파괴는 실제 흡수량과 최종 잔량에 연결된다.
assert.ok(scene.includes('playShieldHit(result.shieldDamage, this.playerState.shield <= 0)'));
assert.ok(renderer.includes('if (!broken) return;'), '파편은 최종 파괴 때만 발생해야 한다');

// 6) 지속 VFX는 매 프레임 실제 상태를 동기화하고 세 buff를 독립 레이어로 유지한다.
assert.ok(scene.includes('this.playerState.activeBuffs()'));
for (const kind of ['haste', 'empower', 'ward']) {
  assert.ok(renderer.includes(`'${kind}'`), `${kind} 전용 형태가 있어야 한다`);
}
assert.ok(!scene.includes('buffAura'), '종류를 덮어쓰던 단일 buff 오라는 제거해야 한다');

// 7) 런 리셋과 씬 종료에서 지속·순간 객체 참조가 남지 않는다.
assert.ok((scene.match(/this\.supportSpellVfx\?\.reset\(\)/g) ?? []).length >= 3);
assert.ok(renderer.includes('this.transients.clear()'));
assert.ok(scene.includes('this.supportSpellVfx = null'));

// 8) 이 변경은 보호막 메커니즘을 바꾸지 않는다.
const playerState = readFileSync('src/combat-core/player/playerCombatState.ts', 'utf8');
assert.ok(playerState.includes('shield: number = 0'));
// 상한은 #383에서 maxHp → **maxShield**로 갈라졌다. 이 회귀가 지키려는 건 상한값이
// 아니라 "보호막은 상한에 걸려 무한히 쌓이지 않는다"이므로, 그 성질만 본다.
assert.ok(playerState.includes('this.shield = Math.min(this.maxShield, this.shield + Math.max(0, amount))'));

// 9) 1차 화면 검토에서 발견된 가시성·방향성 문제의 재발을 막는다.
assert.ok(SUPPORT_VFX_CONFIG.healDurationMs >= 700, 'heal 핵심 연출은 눈에 읽힐 만큼 유지되어야 한다');
assert.ok(renderer.includes("import { spawnTrailGhost } from './trailEffect'"), 'haste는 기존 플레이어 잔상 표현을 재사용한다');
assert.ok(renderer.includes('this.player.x - moveDirection.x * 5'), 'haste 잔상은 실제 이동 경로 뒤에 남아야 한다');
assert.ok(!renderer.includes('drawHastePersistent'), 'haste 전용 속도선 레이어를 중복 유지하면 안 된다');
assert.ok(renderer.includes('for (let index = 0; index < segments; index += 1)'), 'shield 외곽은 전 방향을 항상 균등하게 그린다');
assert.ok(!renderer.includes('Math.ceil(segments *'), 'shield 잔량이 외곽 한쪽만 남기는 방식으로 표현되면 안 된다');
assert.ok(renderer.includes('SUPPORT_VFX_CONFIG.shieldMergeWindowMs'), '동시 shield 획득 연출은 짧은 창으로 병합한다');
assert.ok(renderer.includes('amount: pending.amount + Math.max(0, gainedAmount)'), '병합 중 실제 shield 획득량은 합산한다');
assert.ok(renderer.includes('power: Math.max(pending.power, safePower)'), '병합 연출 강도는 가장 높은 power를 따른다');

console.log('support spell VFX regression: 강도·보호막상태·수동3효과·정령·피격파괴·동시buff·정리·메커니즘보존·시각교정·power병합 10군 통과');
