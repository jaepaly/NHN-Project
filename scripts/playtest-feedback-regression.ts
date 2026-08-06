import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOSS_PULL_FX } from '../src/render/bossPullFieldConfig';
import { BOSS_ARCANA_CONFIG } from '../src/combat-core/boss/bossArcana';

/**
 * 플레이테스트 피드백 대응 회귀 (총괄 + 외부 플레이어, 2026-08-06).
 *
 * 처음 이 게임을 만진 사람들에게서 나온 것들이라, **개발자가 다시 만들기 쉬운 종류의
 * 실수**를 고정한다 — 익숙해지면 안 보인다.
 */

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');

// ── ① 피격 무적 — "데미지가 두두두두 들어온다" ──────────────────────────────
//
// ⚠️ 종전에도 접촉 쿨다운은 있었지만 **적 개체별**이었다. 적 넷이 붙으면 각자 자기
// 쿨다운을 보므로 한 프레임에 네 대를 맞는다. 투사체·위험지대는 플레이어 쪽 게이트가
// 아예 없었다. 무적은 **플레이어 쪽**에 있어야 한다.
{
  assert.ok(
    /private hitInvulnUntil = 0;/.test(scene),
    '플레이어 쪽 무적 만료 시각이 있어야 한다 — 적 개체별 쿨다운으로는 다중 피격을 못 막는다',
  );
  assert.ok(
    /if \(this\.time\.now < this\.hitInvulnUntil\) return \{ hpDamage: 0, shieldDamage: 0 \};/
      .test(scene),
    '무적 중에는 피해가 0이어야 한다',
  );
  assert.ok(
    /this\.hitInvulnUntil = this\.time\.now \+ ProtoScene\.HIT_INVULN_SECONDS \* 1000;/.test(scene),
    '타격을 맞으면 무적이 갱신돼야 한다',
  );

  // ⚠️ 바닥 지형(용암·독)은 **무적을 무시**해야 한다. 밟고 서 있으면 계속 아파야
  // 장판이 "피할 곳"으로 성립한다. 반대로 틱이 무적을 소모하면 장판 위에서 적에게
  // 맞을 때 무적이 틱에 먹혀 타격을 그대로 맞는다 — 두 채널을 분리해야 하는 이유다.
  assert.ok(
    /this\.damagePlayer\(floorHazardTickDamage\(kind\), 'tick'\)/.test(scene),
    "바닥 지형 피해는 'tick' 채널이어야 한다 — 무적에 먹히면 장판이 무의미해진다",
  );
  assert.ok(
    /channel: 'hit' \| 'tick' = 'hit'/.test(scene),
    "기본 채널은 'hit'이어야 한다 — 새 피해원이 실수로 무적을 우회하지 않게",
  );
  // 런 리셋에서 비운다 — 남으면 새 런 첫 순간이 무적이 된다
  // 선언부(`private hitInvulnUntil = 0`)는 `this.` 접두가 없어 여기 안 잡힌다 —
  // 세는 건 런 리셋 지점뿐이다
  const resets = scene.match(/this\.hitInvulnUntil = 0;/g) ?? [];
  assert.ok(
    resets.length >= 2,
    `무적 리셋이 ${resets.length}곳 — 런 리셋 2곳에서 비워야 새 런 첫 순간이 무적이 안 된다`,
  );

  // 무적이 접촉 쿨다운보다 길면 "때려도 안 아픈" 구간이 생긴다
  const match = scene.match(/HIT_INVULN_SECONDS = ([\d.]+);/);
  assert.ok(match, '무적 시간 상수를 찾아야 한다');
  const invuln = Number.parseFloat(match![1]);
  assert.ok(
    invuln > 0 && invuln < 0.8,
    `무적 ${invuln}초가 접촉 쿨다운(0.8초) 이상이다 — 단일 적 상대로 피해가 사라진다`,
  );
}

// ── ② 첫 런 조작 안내 — "엔터키를 누를 수 있다는 걸 아무도 모른다" ──────────
//
// Enter를 모르면 이 게임은 아무것도 아니다. 자유 문장이 전부인데 입구를 못 찾으면
// 남는 건 WASD로 도는 것뿐이다.
{
  const tutorial = readFileSync('src/ui/firstRunTutorial.ts', 'utf8');
  assert.ok(tutorial.includes('ENTER'), '안내가 Enter를 명시해야 한다');
  assert.ok(
    /예\)/.test(tutorial),
    '예시 문장이 있어야 한다 — "뭘 쓰라는 거지"가 남으면 안내가 절반만 한 것이다',
  );
  // 각인·정령은 **일부러 뺐다.** 아직 하나도 없는 상태에서 설명하면 안 남고,
  // 셋을 넣으면 셋 다 안 읽힌다. 그것들은 처음 얻는 순간에 붙이는 게 맞다.
  //
  // ⚠️ 파일 전체를 보면 안 된다. 문서 주석이 "각인은 …"을 **넣지 말 것의 예시**로
  // 인용하고 있어서 그대로 잡힌다 — 이 저장소에서 반복해 저지른 실수(산문을 코드로
  // 오독)다. 실제로 화면에 그려지는 템플릿만 본다.
  const panelAt = tutorial.indexOf('wrap.innerHTML = `');
  const panelEnd = tutorial.indexOf('`;', panelAt);
  assert.ok(panelAt > 0 && panelEnd > panelAt, '안내 패널 템플릿을 찾아야 한다');
  const panel = tutorial.slice(panelAt, panelEnd);
  assert.ok(
    !panel.includes('각인') && !panel.includes('정령'),
    '첫 안내 화면에 각인·정령 설명을 넣지 않는다 — 한 번에 다 설명하면 아무것도 안 읽힌다',
  );
  assert.ok(panel.includes('ENTER'), '패널이 Enter를 크게 말해야 한다');
  // ⚠️ rAF만으로 활성화하면 **백그라운드 탭에서 영영 안 뜬다** — rAF가 멈추기 때문이다.
  // 이 안내는 런 시작 흐름을 붙잡고 있어서 안 보이면 게임이 멈춘 것처럼 된다.
  // 브라우저 검증에서 실제로 DOM은 생겼는데 `active`가 안 붙는 걸 확인했다.
  assert.ok(
    tutorial.includes('requestAnimationFrame(activate);')
    && /window\.setTimeout\(activate, \d+\);/.test(tutorial),
    'rAF와 setTimeout 폴백을 함께 써야 한다 — 백그라운드 탭에서 안내가 안 뜨면 게임이 멈춘다',
  );
  // 표시 여부는 totalRuns가 아니라 전용 플래그 — 첫 런에 죽고 재시작해도 다시 뜨면 성가시다
  assert.ok(
    tutorial.includes("localStorage.getItem(SEEN_KEY) === '1'"),
    '본 적 있는지는 전용 플래그로 판단해야 한다',
  );
  assert.ok(
    /catch \{\s*return true;/.test(tutorial),
    'localStorage를 못 쓰면 "봤다"로 취급해 조용히 건너뛰어야 한다 — 안내가 벽이 되면 안 된다',
  );

  // 연구 선택 **뒤**에 뜬다 — 앞이면 맥락 없이 조작표부터 읽히고 카드가 그 인상을 덮는다
  const flowAt = scene.indexOf('private async offerRunStartChoices()');
  const flow = scene.slice(flowAt, flowAt + 900);
  assert.ok(
    flow.indexOf('offerResearchContract') < flow.indexOf('showFirstRunTutorial'),
    '안내는 연구 선택 뒤에 와야 한다',
  );
  assert.ok(
    flow.indexOf('showFirstRunTutorial') < flow.indexOf('offerLegacyEngrave'),
    '안내는 유산 선택보다 앞에 와야 한다',
  );
  // 안내를 읽는 동안 전투가 멈춰야 한다 — 연구·유산 선택과 같은 이유
  assert.ok(
    /this\.researchSelecting = true;[\s\S]{0,200}showFirstRunTutorial/.test(flow),
    '안내 중에는 전투를 멈춰야 한다',
  );
}

// ── ③ 보스 중력 인력 연출 — "끌어당길 때 이펙트가 있어야 할 것 같다" ────────
//
// 종전엔 시스템 메시지와 효과음뿐이라 `castBossPull`에 `add.*`가 하나도 없었다.
// 화면에서는 아무 일도 안 일어나는데 플레이어만 끌려간다 — 조작 고장으로 읽힌다.
{
  assert.ok(
    /playBossPullTelegraph\(this, boss\.x, boss\.y, BOSS_ARCANA_CONFIG\.pullTelegraphSeconds\)/
      .test(scene),
    '예고 링이 보스 위치에 떠야 하고, 닫히는 시간이 실제 예고 시간과 같아야 한다',
  );
  assert.ok(
    /spawnBossPullStreaks\(this, boss\.x, boss\.y\)/.test(scene),
    '흡인 선이 나와야 한다',
  );
  // 흡인 선은 **실제로 끄는 동안만** — 예고 구간에 나오면 예고와 흡인이 구분되지 않는다
  const pullAt = scene.indexOf('spawnBossPullStreaks(this, boss.x, boss.y)');
  const pullBlock = scene.slice(pullAt - 1200, pullAt + 120);
  assert.ok(
    pullBlock.includes('if (telegraphLeft <= 0) {'),
    '흡인 선은 예고가 끝난 뒤에만 나와야 한다',
  );

  // 예고 링은 인력 사거리 바깥에서 조여든다 — 안에서 시작하면 "모인다"로 안 읽힌다
  assert.ok(
    BOSS_PULL_FX.telegraphStartRadius > BOSS_PULL_FX.telegraphEndRadius,
    '예고 링은 안쪽으로 조여들어야 한다',
  );
  // 1.6초 동안 반복되는 연출이라 얇고 짧아야 한다 (#220)
  assert.ok(
    BOSS_PULL_FX.streakMs <= 400,
    `흡인 선이 ${BOSS_PULL_FX.streakMs}ms — 반복 연출이라 짧아야 잔상이 안 쌓인다`,
  );
  const streaksPerPull = Math.ceil(
    (BOSS_ARCANA_CONFIG.pullDurationSeconds * 1000) / BOSS_PULL_FX.streakIntervalMs,
  ) * BOSS_PULL_FX.streakCount;
  assert.ok(
    streaksPerPull <= 60,
    `인력 1회에 선 ${streaksPerPull}개 — 화면이 선으로 덮인다`,
  );
}

// ── ④ 탈채도 완화 — "화면이랑 글씨가 너무 뿌옇고 흐리다" ────────────────────
//
// ⚠️ 근본 원인은 캔버스 업스케일(960×640 → 1080p에서 1.69배)이지만, 그건 월드 좌표가
// 캔버스에서 파생되고 지형 좌표가 하드코딩이라 콘텐츠 프리즈 직전에 손댈 수 없다
// (별도 과제로 분리). 지금 줄일 수 있는 건 **탈채도**다 — "뿌옇다"는 초점이 아니라
// 색이 빠져서일 수 있고, 마도서 톤이 0.48까지 내려가 있었다.
{
  // ⚠️ **화면 전체에 걸리는 것만** 본다. 두 종류를 구분해야 한다:
  //
  //  - `backdrop-filter`·재질 토큰 → 화면 전체가 색이 빠진다. 이게 제보의 원인
  //  - 개별 요소의 `filter: saturate()` → 예: `.route-node.cleared`(지나온 방을
  //    흐리게). 이건 **정당한 용법**이고 오히려 낮아야 한다
  //
  // 그리고 문서 주석에 옛 수치가 인용돼 있어(`saturate(0.48) 지도 O`) 파일 전체를
  // 훑으면 그것까지 잡힌다 — 이 저장소에서 반복한 실수(산문을 코드로 오독)다.
  const screenWide: Array<[string, RegExp]> = [
    ['src/ui/roomChoiceOverlay.ts', /backdrop-filter:[^;]*saturate\(([\d.]+)\)/g],
    ['src/ui/rewardCardOverlay.ts', /backdrop-filter:[^;]*saturate\(([\d.]+)\)/g],
    ['index.html', /backdrop-filter:[^;]*saturate\(([\d.]+)\)/g],
    ['src/ui/uiTokens.ts', /aged: 'saturate\(([\d.]+)\)'/g],
  ];
  let checked = 0;
  for (const [file, pattern] of screenWide) {
    const body = readFileSync(file, 'utf8');
    for (const match of body.matchAll(pattern)) {
      checked += 1;
      const value = Number.parseFloat(match[1]);
      assert.ok(
        value >= 0.7,
        `${file}: 화면 전역 saturate(${value})가 0.7 미만이다 — 색이 빠져 뿌옇게 읽힌다`,
      );
    }
  }
  assert.ok(checked >= 4, `화면 전역 채도 검사 대상이 ${checked}건뿐이다 — 패턴이 낡았다`);
}

console.log(
  'playtest feedback regression: 무적채널·안내순서·인력연출·탈채도상한 4군 통과',
);
