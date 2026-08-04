import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOSS_ARCANA_CONFIG,
  BOSS_SPELLBOOK,
  bossArcanaSpell,
  bossArcanaTelegraphRadius,
} from '../src/combat-core/boss/bossArcana';
import { isInstantForm } from '../src/combat-core/boss/mirrorCast';
import { BossPatternController } from '../src/combat-core/boss/bossPatternController';
import type { BossPatternAction } from '../src/combat-core/boss/bossPatternController';
import { FORMS, ELEMENTS } from '../src/spell/types';

// ── 스펠북: 전부 시전 가능한 damage + 회피 문법이 성립하는 폼만 ────────
{
  assert.ok(BOSS_SPELLBOOK.length >= 3, '스펠북이 너무 얇다 — 다양성이 목적이다');
  const elements = new Set(BOSS_SPELLBOOK.map((s) => s.element_primary));
  const forms = new Set(BOSS_SPELLBOOK.map((s) => s.form));
  assert.equal(elements.size, BOSS_SPELLBOOK.length, '원소가 겹친다 — 화면에서 구분 안 됨');
  assert.equal(forms.size, BOSS_SPELLBOOK.length, '폼이 겹친다 — 화면에서 구분 안 됨');
  for (const spec of BOSS_SPELLBOOK) {
    assert.equal(spec.effect, 'damage', `${spec.name}: 보스 공격 마법은 damage만`);
    assert.ok((FORMS as readonly string[]).includes(spec.form), `${spec.name}: 유효 폼`);
    assert.ok((ELEMENTS as readonly string[]).includes(spec.element_primary), `${spec.name}: 유효 원소`);
    assert.ok(!isInstantForm(spec.form),
      `${spec.name}: 즉발 폼(${spec.form}) — 짧은 예고(0.6s)로는 회피 문법이 안 성립한다. `
      + '즉발은 미러(1.1s 중예고) 전용');
    assert.ok(spec.form !== 'orbit', `${spec.name}: orbit은 렌더 폴백으로 동일성 깨짐`);
    assert.ok(spec.power >= 30 && spec.power <= 70,
      `${spec.name}: 위력 ${spec.power} — 30~70 밖이면 밋밋하거나 즉사급`);
  }
}

// ── 순환: 사본 반환·인덱스 방어·전 항목 도달 ─────────────────────────
{
  const first = bossArcanaSpell(0);
  first.power = 9999;
  assert.equal(BOSS_SPELLBOOK[0].power < 9999, true, '사본이 아니라 원본을 돌려준다 — 오염');
  const seen = new Set<string>();
  for (let i = 0; i < BOSS_SPELLBOOK.length * 2; i += 1) seen.add(bossArcanaSpell(i).name);
  assert.equal(seen.size, BOSS_SPELLBOOK.length, '순환이 전 항목에 도달');
  assert.ok(bossArcanaSpell(Number.NaN).name.length > 0, 'NaN 인덱스 방어');
  assert.ok(bossArcanaSpell(-3).name.length > 0, '음수 인덱스 방어');
}

// ── 피해·제어 수치 가드 ──────────────────────────────────────────────
{
  assert.ok(BOSS_ARCANA_CONFIG.damageScale <= 0.35,
    '비전 마법이 미러(필살기 성격)보다 아프면 서열이 뒤집힌다');
  const maxHit = Math.max(...BOSS_SPELLBOOK.map((s) => s.power)) * BOSS_ARCANA_CONFIG.damageScale;
  assert.ok(maxHit < 25, `일상 패턴 한 방이 ${maxHit} — HP 100의 1/4 이상이면 과하다`);
  // 흡인은 플레이어 이속(220)보다 확실히 낮아야 "걸어서 저항"이 성립한다
  assert.ok(BOSS_ARCANA_CONFIG.pullSpeedPerSecond <= 220 * 0.7,
    '흡인이 이속의 70%를 넘는다 — 저항 불가능해 보인다');
  assert.ok(BOSS_ARCANA_CONFIG.pullDurationSeconds <= 2.5, '흡인이 너무 길다');
  assert.ok(BOSS_ARCANA_CONFIG.shroudSeconds <= 4,
    '장막이 너무 길다 — 길면 위협이 아니라 답답함이다');
  assert.ok(BOSS_ARCANA_CONFIG.castTelegraphSeconds >= 1, '예고 없는 원소 마법은 불공정');
  const rain = BOSS_SPELLBOOK.find((spec) => spec.form === 'rain')!;
  assert.ok(bossArcanaTelegraphRadius(rain) >= 150,
    '빗발 장판은 실제 위험 범위를 예고해야 한다');
  const nova = BOSS_SPELLBOOK.find((spec) => spec.form === 'nova')!;
  assert.ok(bossArcanaTelegraphRadius(nova) > 90,
    '폭발 주문도 작은 점 예고로 축소하면 안 된다');
}

// ── 패턴 편입: memory 보스 순환에 비전 마법이 실제로 나오는가 ─────────
{
  const collect = (phase: 1 | 2 | 3, strategy: 'rush' | 'ranged' | null, steps: number) => {
    const c = new BossPatternController('memory');
    c.setCounterStrategy(strategy);
    const seen = new Set<BossPatternAction>();
    // cooldown을 넘기며 행동 수집 (텔레그래프 2단계 행동 포함)
    for (let i = 0; i < steps; i += 1) {
      const { actions } = c.update(10, phase, 0);
      for (const a of actions) seen.add(a);
    }
    return seen;
  };
  assert.ok(collect(1, null, 12).has('arcane-cast'),
    '페이즈1에 원소 마법이 없다 — "이 보스는 마법사다"가 첫 페이즈부터 보여야 한다');
  assert.ok(collect(2, 'rush', 14).has('pull'),
    'rush 카운터에 중력 인력이 없다 — 거리를 좁히려는 보스와 주제 정합');
  assert.ok(collect(2, 'ranged', 14).has('shroud'),
    'ranged 카운터에 어둠 장막이 없다 — 원거리 조준 방해와 주제 정합');
  assert.ok(collect(3, null, 24).has('mirror'),
    '페이즈3 순환에 미러 재발동이 없다');
  // stage 보스는 비전 마법 없음 — 최종 보스만의 격
  const stage = new BossPatternController('stage');
  const stageSeen = new Set<BossPatternAction>();
  for (let i = 0; i < 20; i += 1) {
    for (const a of stage.update(10, i < 10 ? 1 : 2, 0).actions) stageSeen.add(a);
  }
  for (const forbidden of ['arcane-cast', 'shroud', 'pull', 'mirror'] as const) {
    assert.ok(!stageSeen.has(forbidden), `stage 보스가 ${forbidden}을 쓴다 — 최종 보스 전용이어야 함`);
  }
}

// ── 씬 배선 (이 저장소에서 배선 유실 3회 전례) ────────────────────────
{
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  for (const [needle, why] of [
    ["case 'arcane-cast':", '패턴 스위치에 원소 마법 케이스 없음'],
    ["case 'shroud':", '패턴 스위치에 장막 케이스 없음'],
    ["case 'pull':", '패턴 스위치에 흡인 케이스 없음'],
    ["case 'mirror':", '패턴 스위치에 미러 재발동 케이스 없음'],
    ['this.queueMirrorCast(boss, true)', '미러 재발동이 force 없이 불림 — 1회 제한에 막힘'],
    ['this.updateBossArcana(d)', '비전 마법 타이머가 스케일 델타로 돌지 않음'],
    ['bossArcanaTelegraphRadius(spec)', '비전 마법이 실제 범위를 반영한 낙성 예고를 쓰지 않음'],
    ['this.clearBossArcana()', '방 전환 시 장막·흡인·예고가 남는다'],
    ['|| this.blackoutCurseField', '암전 저주 방에서 장막이 겹쳐 아무것도 안 보이게 됨'],
  ] as const) {
    assert.ok(scene.includes(needle), `${why} (누락: ${needle})`);
  }
  // 미러 예고 3겹 연출 배선 — "티가 안 남" 피드백의 답이 실제로 붙어 있는가
  for (const [needle, why] of [
    ['vignette', '화면 가장자리 맥동 없음'],
    ['beamLine', '수렴 마력선·수축 링 없음'],
    ["playSfx('boss-appear')", '예고 사운드 없음'],
  ] as const) {
    assert.ok(scene.includes(needle), `미러 예고 연출 누락: ${why}`);
  }
}

console.log(
  'Boss arcana regression: 스펠북·순환·수치가드·패턴편입·stage제외·배선 6군 통과',
);
