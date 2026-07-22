import assert from 'node:assert/strict';
import { resolveSelfBuff, SELF_BUFF_CONFIG } from '../src/combat-core/player/selfBuffConfig';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';

// 1) 원소 기본 매핑 (주문명 단서 없을 때)
assert.equal(resolveSelfBuff('wind', '질풍의 가호', 50).kind, 'buff');
assert.equal((resolveSelfBuff('wind', '바람', 50) as { buff: string }).buff, 'haste', '바람=가속');
assert.equal((resolveSelfBuff('fire', '불꽃', 50) as { buff: string }).buff, 'empower', '불=맹렬');
assert.equal((resolveSelfBuff('earth', '대지', 50) as { buff: string }).buff, 'ward', '대지=철벽');

// 2) 주문명 키워드가 원소보다 우선
assert.equal((resolveSelfBuff('fire', '빠르게 달려라', 50) as { buff: string }).buff, 'haste', '이름 속도 > 원소');
assert.equal((resolveSelfBuff('wind', '무적의 방패', 50) as { buff: string }).buff, 'ward', '이름 무적 > 원소');

// 3) 돌진 — 지속 버프가 아니라 즉시 변위
const dash = resolveSelfBuff('lightning', '번개처럼 돌진', 50);
assert.equal(dash.kind, 'dash');
assert.ok((dash as { distance: number }).distance > SELF_BUFF_CONFIG.dash.baseDistance, '위력이 거리를 늘림');

// 4) 무적 — 고위력 ward는 받는피해 0
const invuln = resolveSelfBuff('earth', '철벽 방어', 100);
assert.equal(invuln.kind, 'buff');
assert.equal((invuln as { multiplier: number }).multiplier, 0, '위력100 ward = 무적(0배)');
assert.equal((invuln as { label: string }).label, '무적');
const partial = resolveSelfBuff('earth', '방어', 50);
assert.equal((partial as { multiplier: number }).multiplier, 0.5, '위력50 ward = 피해 절반');

// 5) 세기·지속이 위력에 비례 (haste)
const weak = resolveSelfBuff('wind', '바람', 20) as { multiplier: number; seconds: number };
const strong = resolveSelfBuff('wind', '바람', 90) as { multiplier: number; seconds: number };
assert.ok(strong.multiplier > weak.multiplier, '고위력일수록 강함');
assert.ok(strong.seconds > weak.seconds, '고위력일수록 오래감');
assert.ok(weak.multiplier >= SELF_BUFF_CONFIG.haste.min, '하한 보장');

// 6) PlayerCombatState — 버프 배율 적용 + 만료 + 리셋
const p = new PlayerCombatState();
assert.equal(p.moveSpeedMultiplier, 1, '평소 이동 1');
p.applyTimedBuff('haste', 1.5, 4);
assert.equal(p.moveSpeedMultiplier, 1.5, 'haste 적용');
p.update(1);
assert.equal(p.moveSpeedMultiplier, 1.5, '만료 전 유지');
p.update(3.5);
assert.equal(p.moveSpeedMultiplier, 1, '만료 후 복귀');

// 7) ward가 받는 피해를 감쇠 (무적 = 0 피해)
const q = new PlayerCombatState();
q.applyTimedBuff('ward', 0, 2); // 무적
const before = q.hp;
q.takeDamage(40);
assert.equal(q.hp, before, '무적 중 피해 0');
q.applyTimedBuff('ward', 0.5, 2); // 절반 (ward는 더 강한=낮은 쪽 유지, 0<0.5라 0 유지)
q.update(3); // 무적 만료
q.applyTimedBuff('ward', 0.5, 2);
q.takeDamage(40);
assert.equal(q.hp, before - 20, 'ward 0.5배 = 피해 절반');

// 8) empower = 주는피해 배율, reset이 버프 청소
const r = new PlayerCombatState();
r.applyTimedBuff('empower', 1.4, 5);
assert.equal(r.damageOutMultiplier, 1.4);
r.reset();
assert.equal(r.damageOutMultiplier, 1, 'reset이 버프 청소');
assert.equal(r.moveSpeedMultiplier, 1);

console.log('SelfBuff regression: 원소/이름 매핑·돌진·무적·비례·타이머·ward감쇠·reset 8군 통과');
