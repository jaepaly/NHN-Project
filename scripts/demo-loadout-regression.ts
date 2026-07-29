import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEMO_AFFINITY,
  DEMO_ENGRAVES,
  DEMO_SAMPLE_INCANTATIONS,
  DEMO_SPIRITS,
  DEMO_START_ROOM,
  applyDemoLoadout,
  consumeDemoRunRequest,
  requestDemoRun,
} from '../src/run/demoLoadout';
import { EngraveManager, ENGRAVE_CONFIG } from '../src/combat-core/engrave/engraveManager';
import { SpiritManager, SPIRIT_CONFIG } from '../src/combat-core/spirit/spiritManager';
import { CombatRunController } from '../src/combat-core/run/runController';
import { maximumMapPathRooms } from '../src/run/mapGraph';
import { MAP_GRAPH_PRESET_01 } from '../src/run/mapGraphPreset';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { AFFINITY_VFX_CONFIG, affinityVfxIntensity } from '../src/render/affinityVfx';
import { MockJudge } from '../src/spell/mockJudge';
import { slashCutCount } from '../src/combat-core/combat/slashConfig';
import type { SpellElement } from '../src/spell/types';

const build = () => {
  const engrave = new EngraveManager();
  const spirit = new SpiritManager();
  const controller = new CombatRunController({ playerState: new PlayerCombatState() });
  applyDemoLoadout(engrave, spirit, controller);
  return { engrave, spirit, controller };
};

// ── 각인: 2슬롯이 **실제로** Lv3 + 진화까지 갔는가 ────────────────────
// 이 회귀의 존재 이유: 시연 상태를 손으로 심으면 조용히 실패해도 티가 안 난다.
// applyReward가 하나라도 거부되면(레벨 순서·슬롯 상한) 심사위원은 약한 상태로 시작한다.
{
  const { engrave } = build();
  assert.equal(engrave.entries.length, DEMO_ENGRAVES.length, '각인 슬롯 수');
  assert.ok(
    engrave.entries.length <= ENGRAVE_CONFIG.maxSlots,
    '슬롯 상한을 넘게 정의했다 — 뒤쪽 각인이 조용히 버려진다',
  );
  for (const slot of engrave.entries) {
    assert.equal(slot.level, ENGRAVE_CONFIG.maxLevel, `${slot.spell.name} Lv3 미달`);
    assert.equal(slot.evolved, true, `${slot.spell.name} 진화 안 됨`);
  }
  // 격상명이 실제로 반영됐는가 (진화가 이름만 바꾸던 시절의 회귀 지점)
  const names = engrave.entries.map((e) => e.spell.name);
  for (const entry of DEMO_ENGRAVES) {
    assert.ok(names.includes(entry.evolvedName), `격상명 누락: ${entry.evolvedName}`);
  }
}

// ── 각인 폼을 갈랐는가 — 같은 폼 둘이면 "각인 두 개"로 안 읽힌다 ──────
{
  const forms = new Set(DEMO_ENGRAVES.map((e) => e.spell.form));
  assert.equal(forms.size, DEMO_ENGRAVES.length, '각인 폼이 겹친다 — 화면에서 구분이 안 된다');
  // wall·orbit은 rememberManualCast가 후보에서 거른다 → 심어도 슬롯에 안 들어간다
  for (const entry of DEMO_ENGRAVES) {
    assert.ok(
      entry.spell.form !== 'wall' && entry.spell.form !== 'orbit',
      `${entry.spell.form}은 각인 후보에서 제외되는 폼이다`,
    );
    assert.equal(entry.spell.effect, 'damage', '각인 후보는 damage만');
  }
}

// ── 정령: 정의된 레벨까지 올라갔는가 (spiritId 규칙이 틀리면 전부 거부된다) ──
{
  const { spirit } = build();
  assert.equal(spirit.entries.length, DEMO_SPIRITS.length, '정령 수');
  for (const seed of DEMO_SPIRITS) {
    const found = spirit.entries.find((s) => s.element === seed.element);
    assert.ok(found, `정령 누락: ${seed.element} — spiritId 규칙(attack-<원소>) 확인`);
    assert.equal(found.level, seed.level, `${seed.element} 레벨 불일치`);
  }
  assert.ok(spirit.slotCount() <= SPIRIT_CONFIG.maxSlots, '정령 슬롯 상한 초과');
  // 공격 2체 = 융합 후보 → "다음 단계"가 보상으로 보인다
  assert.ok(spirit.fuseCandidate(), '공격 정령 2체인데 융합 후보가 없다');
}

// ── 친화: 심어졌고, VFX 강도가 실제로 임계를 넘는가 ───────────────────
// 친화를 심어놓고 강도가 minIntensity 아래면 화면은 그대로다 — 심은 의미가 없다.
{
  const { controller } = build();
  const affinity = controller.state.elementalAffinity;
  for (const [element, value] of Object.entries(DEMO_AFFINITY)) {
    assert.equal(affinity[element as SpellElement], value, `친화 미반영: ${element}`);
  }
  const values = Object.values(DEMO_AFFINITY) as number[];
  const top = Math.max(...values);
  const low = Math.min(...values);
  assert.ok(
    affinityVfxIntensity(top) >= AFFINITY_VFX_CONFIG.flashFromIntensity,
    `최고 친화가 마스터리 섬광 임계 미달 (강도 ${affinityVfxIntensity(top)})`,
  );
  assert.ok(
    affinityVfxIntensity(low) >= AFFINITY_VFX_CONFIG.emberFromIntensity,
    `두 번째 친화가 엠버 임계 미달 (강도 ${affinityVfxIntensity(low)})`,
  );
  assert.ok(
    affinityVfxIntensity(top) > affinityVfxIntensity(low),
    '두 원소 친화가 같다 — 깊이 차이가 화면에서 구분되지 않는다',
  );
  // 각인 원소와 친화 원소가 맞아야 그 각인의 연출이 격상된다
  const engraveElements = new Set(DEMO_ENGRAVES.map((e) => e.spell.element_primary));
  for (const element of Object.keys(DEMO_AFFINITY)) {
    assert.ok(engraveElements.has(element as SpellElement),
      `친화 ${element}에 대응하는 각인이 없다 — 격상이 눈에 안 띈다`);
  }
}

// ── 시작 방: 힘이 필요한 자리여야 한다 ───────────────────────────────
{
  const controller = new CombatRunController({
    playerState: new PlayerCombatState(),
    maxRooms: maximumMapPathRooms(MAP_GRAPH_PRESET_01),
  });
  assert.ok(DEMO_START_ROOM > 1, '1번 방에서 강하게 시작하면 잡몹만 뭉갠다');
  assert.ok(DEMO_START_ROOM <= controller.state.maxRooms, '시작 방이 런 길이를 넘는다');
  controller.reset(1, false, DEMO_START_ROOM);
  assert.equal(controller.state.roomIndex, DEMO_START_ROOM, 'reset이 시작 방을 반영 안 함');
  // 기본 경로는 그대로여야 한다 (인자 없이 부르면 1번 방)
  controller.reset(1, false);
  assert.equal(controller.state.roomIndex, 1, '기본 reset이 바뀌었다 — 본 게임 경로 오염');
  // 범위 밖 값은 클램프
  controller.reset(1, false, 9999);
  assert.equal(controller.state.roomIndex, controller.state.maxRooms, '상한 클램프');
  controller.reset(1, false, -5);
  assert.equal(controller.state.roomIndex, 1, '하한 클램프');
}

// ── 친화 주입 API 방어 ───────────────────────────────────────────────
{
  const controller = new CombatRunController({ playerState: new PlayerCombatState() });
  controller.seedAffinity({ fire: Number.NaN, ice: -3, water: 0, dark: 0.5 });
  const a = controller.state.elementalAffinity;
  assert.equal(a.fire ?? 0, 0, 'NaN 방어');
  assert.equal(a.ice ?? 0, 0, '음수 방어');
  assert.equal(a.water ?? 0, 0, '0은 심지 않는다');
  assert.equal(a.dark, 0.5, '정상값 반영');
}

// ── 요청 플래그는 **1회성** — 다음 런에 새면 안 된다 ──────────────────
{
  assert.equal(consumeDemoRunRequest(), false, '초기엔 꺼져 있어야 한다');
  requestDemoRun();
  assert.equal(consumeDemoRunRequest(), true, '요청이 전달돼야 한다');
  assert.equal(consumeDemoRunRequest(), false,
    '두 번째 create에서 또 시연으로 시작한다 — 타이틀에서 일반 시작해도 시연이 된다');
}

// ── 예시 문장이 비어 있지 않은가 ─────────────────────────────────────
// 강해진 상태로 떨어뜨려도 **뭘 칠지 모르면 아무 일도 안 일어난다.**
{
  assert.ok(DEMO_SAMPLE_INCANTATIONS.length >= 2, '예시 문장이 너무 적다');
  for (const line of DEMO_SAMPLE_INCANTATIONS) {
    assert.ok(line.trim().length >= 6, `예시가 너무 짧다: ${line}`);
  }
}

// ── 배선: 타이틀 탭과 씬 소비가 실제로 연결돼 있는가 ──────────────────
// 이 프로젝트에서 배선 한 줄이 PR 정리 중 유실된 적이 세 번 있다.
{
  const title = readFileSync('src/scenes/TitleScene.ts', 'utf8');
  assert.ok(title.includes('createDemoTab'), '타이틀에 시연 탭이 없다');
  assert.ok(/createDemoTab\(width, height\)/.test(title), '시연 탭이 create에서 안 불린다');
  assert.ok(title.includes('this.startGame(true)'), '시연 탭이 startGame(true)를 안 부른다');
  // ENTER 핸들러가 startGame을 **직접** 넘기면 Phaser가 키 이벤트를 첫 인자로 실어
  // demo가 truthy가 된다 — ENTER마다 시연 런으로 들어가는 버그.
  assert.ok(
    !/keydown-ENTER',\s*this\.startGame/.test(title),
    'ENTER가 startGame을 직접 참조한다 — 키 이벤트가 demo 플래그로 들어간다',
  );

  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  assert.ok(scene.includes('consumeDemoRunRequest()'), '씬이 시연 요청을 소비하지 않는다');
  assert.ok(scene.includes('seedDemoRun()'), '씬이 시연 상태를 심지 않는다');
  // 리셋 뒤에 심어야 한다 — 순서가 뒤집히면 심은 게 지워진다
  assert.ok(
    scene.indexOf('this.resetForNewRun()') < scene.indexOf('consumeDemoRunRequest()'),
    'resetForNewRun보다 먼저 심는다 — 심은 상태가 리셋에 지워진다',
  );
  // 컨트롤러 reset은 친화를 비우므로 로드아웃보다 **먼저** 와야 한다
  const seedBody = scene.slice(scene.indexOf('private seedDemoRun'), scene.indexOf('private seedDemoRun') + 1400);
  assert.ok(
    seedBody.indexOf('combatRunController.reset(') < seedBody.indexOf('applyDemoLoadout('),
    'applyDemoLoadout 뒤에 reset을 부른다 — reset이 친화를 비워 심은 친화가 사라진다',
  );
}

// ── 예시 문장이 **실제로 좋은 그림**을 만드는가 ───────────────────────
// 심사위원에게 "이걸 쳐보라"고 띄우는 문장이다. 판정이 밋밋한 폼으로 떨어지면
// 시연 전체가 약해진다. 실제로 "번개가 적들 사이를 뛰어다닌다"는 chain을 의도했는데
// bolt로 판정돼 각인(chain)과 어긋나 있었다 — 그래서 이 회귀를 만들었다.
// 판정은 라이브 Gemini가 우선이지만, 할당량 소진 시 쓰이는 MockJudge로 하한을 잡는다.
{
  const judge = new MockJudge();
  const results = await Promise.all(
    DEMO_SAMPLE_INCANTATIONS.map((text) => judge.judge(text).then((r) => ({ text, r }))),
  );
  const forms = new Set<string>();
  for (const { text, r } of results) {
    assert.equal(r.disposition, 'cast', `예시가 시전되지 않는다: ${text}`);
    if (r.disposition !== 'cast') continue;
    assert.ok(r.spell.power >= 45, `예시 위력이 낮다 (${r.spell.power}): ${text}`);
    forms.add(r.spell.form);
  }
  assert.equal(forms.size, results.length, '예시들이 같은 폼으로 떨어진다 — 다양성이 안 보인다');

  // 참격 예시는 **연참**이 보여야 한다 (위력이 임계를 넘는지)
  const slash = results.find(({ r }) => r.disposition === 'cast' && r.spell.form === 'slash');
  assert.ok(slash, '참격 예시가 slash로 판정되지 않는다');
  if (slash?.r.disposition === 'cast') {
    assert.ok(slashCutCount(slash.r.spell.power) >= 2,
      `참격 예시가 연참에 못 미친다 (위력 ${slash.r.spell.power}) — 한 번만 베면 밋밋하다`);
  }

  // 각인으로 심은 주문 텍스트도 같은 폼으로 판정돼야 한다 — 어긋나면 수동 시전이
  // 각인과 다른 마법을 낸다("이 문장이 저 각인"이라는 연결이 깨진다).
  for (const entry of DEMO_ENGRAVES) {
    const judged = await judge.judge(entry.key);
    assert.equal(judged.disposition, 'cast', `각인 원문이 시전되지 않는다: ${entry.key}`);
    if (judged.disposition !== 'cast') continue;
    assert.equal(judged.spell.form, entry.spell.form,
      `각인 원문의 판정 폼이 다르다: "${entry.key}" → ${judged.spell.form} (기대 ${entry.spell.form})`);
    assert.equal(judged.spell.element_primary, entry.spell.element_primary,
      `각인 원문의 판정 원소가 다르다: ${entry.key}`);
  }
}

console.log(
  'Demo loadout regression: 각인진화·폼분리·정령·친화강도·시작방·주입방어·1회성·예시판정·배선 10군 통과',
);
