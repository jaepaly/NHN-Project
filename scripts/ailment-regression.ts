import assert from 'node:assert/strict';
import {
  AILMENT_CONFIG,
  burnDpsFromPower,
  freezeSecondsFromPower,
  weakenMultiplierFromPower,
} from '../src/combat-core/status/ailmentConfig';
import { EnemyAilmentState } from '../src/combat-core/status/enemyAilmentState';
import type { CombatEnemy } from '../src/combat-core/enemies/combatEnemy';

// 최소 적 스텁 — EnemyAilmentState는 alive만 본다
const enemyStub = (): CombatEnemy => ({ alive: true, x: 0, y: 0 } as unknown as CombatEnemy);

// 1) 설정 수치 — 위력 비례 + 방어(클램프)
assert.equal(burnDpsFromPower(50), Math.max(3, 50 * AILMENT_CONFIG.burn.dpsPerPower));
assert.equal(burnDpsFromPower(0), AILMENT_CONFIG.burn.minDps, '하한 dps');
assert.ok(freezeSecondsFromPower(90) > freezeSecondsFromPower(10), '고위력=긴 경직');
assert.equal(weakenMultiplierFromPower(100), AILMENT_CONFIG.weaken.max, '위력100=최대 취약');
assert.equal(weakenMultiplierFromPower(0), AILMENT_CONFIG.weaken.min, '하한 취약');
assert.ok(weakenMultiplierFromPower(50) > 1, '취약은 받는 피해 증폭(>1)');

// 2) burn — 0.5초 펄스로 피해 전달, 총량 = dps × 지속
const s = new EnemyAilmentState();
const e = enemyStub();
s.applyBurn(e, 10, 2); // 10 dps, 2초 = 총 20
let total = 0; let ticks = 0;
for (let i = 0; i < 4; i += 1) s.update(0.5, (_e, dmg) => { total += dmg; ticks += 1; });
assert.ok(Math.abs(total - 20) < 1e-6, `burn 총량 20 (실제 ${total})`);
assert.equal(ticks, 4, '0.5초 펄스 4회');
assert.equal(s.isBurning(e), false, 'burn 만료');

// 3) burn 갱신 — 더 강한 dps·더 긴 시간
const e2 = enemyStub();
s.applyBurn(e2, 5, 1);
s.applyBurn(e2, 12, 3); // 더 강함
let t2 = 0;
s.update(0.5, (_e, d) => { t2 += d; });
assert.ok(Math.abs(t2 - 6) < 1e-6, '갱신된 dps 12 × 0.5 = 6');

// 4) weaken — 받는 피해 배율 + 만료
const w = new EnemyAilmentState();
const e3 = enemyStub();
assert.equal(w.damageTakenMultiplierFor(e3), 1, '평소 1');
w.applyWeaken(e3, 1.3, 4);
assert.equal(w.damageTakenMultiplierFor(e3), 1.3, 'weaken 적용');
w.update(4.1, () => {});
assert.equal(w.damageTakenMultiplierFor(e3), 1, 'weaken 만료 후 1');

// 5) 죽은 적 정리 + clear
const d = new EnemyAilmentState();
const dead = enemyStub();
d.applyBurn(dead, 10, 5);
(dead as { alive: boolean }).alive = false;
d.update(0.5, () => {});
assert.equal(d.isBurning(dead), false, '죽은 적 burn 제거');
d.applyWeaken(enemyStub(), 1.4, 5);
d.clear();

console.log('Ailment regression: 수치·burn펄스·갱신·weaken·정리 5군 통과');
