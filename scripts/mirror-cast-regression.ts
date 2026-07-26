import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MIRROR_CAST_CONFIG,
  isInstantForm,
  mirrorImpactDamage,
  mirrorImpactHitsPlayer,
  pickMirrorSpell,
} from '../src/combat-core/boss/mirrorCast';
import { SpellHistory } from '../src/spell/spellHistory';
import type { SpellSpec } from '../src/spell/types';

const spell = (over: Partial<SpellSpec> = {}): SpellSpec => ({
  name: '화염구',
  effect: 'damage',
  target: 'enemy',
  element_primary: 'fire',
  element_secondary: null,
  form: 'bolt',
  size: 'medium',
  speed: 'normal',
  status: [],
  power: 70,
  cost: 30,
  ...over,
});

const record = (history: SpellHistory, s: SpellSpec): void => {
  history.record({ rawText: s.name, spell: s, source: 'mock', castAt: 0 });
};

// ── 주문 선정: 이번 런 최강 damage 주문, 그대로 ─────────────────────
// "네 주문을 되돌려준다"는 약속이라 별도 선정 로직이 아니라 주문서 경로
// (bestEntryFromRun+specFromEntry)를 재사용한다 — 실제 도달한 스펙만 나온다.
{
  const history = new SpellHistory();
  assert.equal(pickMirrorSpell(history), null, '빈 히스토리 = 미러 없음');

  record(history, spell({ name: '약한 바람', power: 30, element_primary: 'wind' }));
  record(history, spell({ name: '백만볼트', power: 88, element_primary: 'lightning', form: 'beam' }));
  record(history, spell({ name: '치유의 빛', power: 95, effect: 'heal', target: 'self' }));
  const picked = pickMirrorSpell(history);
  assert.ok(picked, '선정 실패');
  assert.equal(picked.name, '백만볼트', 'heal(95)이 아니라 최강 damage(88)');
  assert.equal(picked.effect, 'damage', 'damage만 되돌린다 — 보스가 힐을 쏘면 코미디');
  assert.equal(picked.form, 'beam', '폼 보존 — 렌더 동일성이 이 기능의 존재 이유');
  assert.equal(picked.element_primary, 'lightning', '원소 보존');
}

// ── 재료 미달·부적합 폼 방어 ─────────────────────────────────────────
{
  const weak = new SpellHistory();
  record(weak, spell({ power: MIRROR_CAST_CONFIG.minPower - 1 }));
  assert.equal(pickMirrorSpell(weak), null, '약한 주문뿐이면 생략 — 밋밋한 미러는 역효과');

  const orbitOnly = new SpellHistory();
  record(orbitOnly, spell({ form: 'orbit', power: 90 }));
  assert.equal(pickMirrorSpell(orbitOnly), null,
    'orbit은 렌더러가 bolt로 폴백 — "그대로"가 깨지므로 제외');
}

// ── 임팩트 판정: 명중 시점 플레이어 위치 대조 (이동 회피의 근거) ──────
{
  // circle: 반경 + 플레이어 반경 합산
  const circle = { kind: 'circle', x: 100, y: 100, radius: 50 } as const;
  assert.ok(mirrorImpactHitsPlayer(circle, 130, 100, 16), '원 안 = 명중');
  assert.ok(mirrorImpactHitsPlayer(circle, 165, 100, 16), '경계(50+16) 안 = 명중');
  assert.ok(!mirrorImpactHitsPlayer(circle, 167, 100, 16), '경계 밖 = 회피 성공');

  // point: 플레이어 반경으로만 판정
  const point = { kind: 'point', x: 0, y: 0 } as const;
  assert.ok(mirrorImpactHitsPlayer(point, 10, 0, 16), '반경 안');
  assert.ok(!mirrorImpactHitsPlayer(point, 17, 0, 16), '반경 밖 — 옆으로 비키면 산다');

  // line: 선분 거리 + 폭/2
  const line = { kind: 'line', fromX: 0, fromY: 0, toX: 200, toY: 0, width: 30 } as const;
  assert.ok(mirrorImpactHitsPlayer(line, 100, 20, 16), '빔 폭 안(15+16=31)');
  assert.ok(!mirrorImpactHitsPlayer(line, 100, 32, 16), '빔 폭 밖');
  assert.ok(!mirrorImpactHitsPlayer(line, 300, 0, 16), '선분 연장선은 벗어남 — 빔 뒤는 안전');

  // NaN 방어
  assert.ok(!mirrorImpactHitsPlayer(circle, Number.NaN, 100, 16), 'NaN 좌표 방어');
}

// ── 피해: 배수·폼별 배분 존중, 즉사 불가 ─────────────────────────────
{
  const s = spell({ power: 88 });
  assert.ok(MIRROR_CAST_CONFIG.damageScale <= 0.5,
    '배수 0.5 초과 — 시연 최강 주문(88)이 절반 이상을 깎는다');
  const full = mirrorImpactDamage(s);
  assert.equal(full, 88 * MIRROR_CAST_CONFIG.damageScale, '기본 피해');
  assert.ok(full < 50, '최대 HP 100 대비 즉사 불가 (loopDamageScale 여유 포함)');
  assert.equal(mirrorImpactDamage(s, 0.08), full * 0.08, 'zone 틱 배분(0.08) 존중');
  assert.equal(mirrorImpactDamage(s, Number.NaN), full, 'NaN 배분 방어');
  assert.equal(mirrorImpactDamage(spell({ power: 0 })), 0, '0 위력 = 0');
}

// ── 즉발 폼 분류 — 텔레그래프 근거 문서화 ────────────────────────────
{
  for (const form of ['beam', 'slash', 'chain'] as const) {
    assert.ok(isInstantForm(form), `${form}은 즉발 — 예고 없인 회피 불가`);
  }
  for (const form of ['bolt', 'wave', 'nova', 'zone', 'rain'] as const) {
    assert.ok(!isInstantForm(form), `${form}은 이동 시간이 있어 예고 없이도 회피 가능`);
  }
}

// ── 배선: 씬이 실제로 연결했는가 (이 저장소에서 배선 유실 3회 전례) ────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(scene.includes('this.queueMirrorCast(boss)'),
    '페이즈2 블록이 미러 캐스트를 큐하지 않는다');
  // 페이즈2 블록 **안**이어야 한다 — memory-boss 한정
  const phase2At = scene.indexOf("isMemoryBoss && boss.phase === 2");
  const queueAt = scene.indexOf('this.queueMirrorCast(boss)');
  const phase3At = scene.indexOf("isMemoryBoss && boss.phase === 3");
  assert.ok(phase2At >= 0 && phase2At < queueAt && queueAt < phase3At,
    '미러 큐가 memory-boss 페이즈2 블록 밖에 있다');
  // 타이머는 스케일된 델타 루프에서 — delayedCall이면 슬로모를 무시해
  // "슬로모 열고 보호막" 카운터플레이가 죽는다.
  assert.ok(scene.includes('this.updateMirrorCast(d)'),
    '미러 타이머가 스케일된 델타(d)로 돌지 않는다 — 슬로모 카운터플레이 상실');
  // 명중 시점 위치 판정 — 이동 회피의 근거
  assert.ok(/mirrorImpactHitsPlayer\(\s*impact, this\.player\.x, this\.player\.y/.test(scene),
    'onHit이 명중 시점 플레이어 위치를 보지 않는다 — 이동 회피 불가가 된다');
  // 방 전환·사망 정리
  assert.ok(scene.includes('this.clearPendingMirrorCast()'),
    '예고 중 방 전환 시 마커가 남거나 유령 발사된다');
  // 보스전마다 리셋
  const bossRoomAt = scene.indexOf('private startBossRoom');
  const resetAt = scene.indexOf('this.mirrorCastUsed = false');
  assert.ok(bossRoomAt >= 0 && resetAt > bossRoomAt,
    'startBossRoom이 미러 사용 플래그를 리셋하지 않는다');
}

console.log(
  'Mirror cast regression: 선정·재료방어·임팩트판정·피해배분·즉발분류·배선 6군 통과',
);
