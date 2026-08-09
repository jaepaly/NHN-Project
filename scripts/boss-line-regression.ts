import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveBossLine, templateBossLine, sanitizeLine } from '../src/spell/bossLine';
import { EMPTY_RUN_MEMORY } from '../src/spell/runMemory';
import type { RunMemory } from '../src/spell/runMemory';

// 1) sanitizeLine — 공백·인용부호 정리, 화자성·한 문장·시스템 말투 차단
assert.equal(
  sanitizeLine('  “또  왔군,  네  손에서  끝내 주마.”  '),
  '또 왔군, 네 손에서 끝내 주마.',
  '공백·인용부호 정리',
);
assert.equal(sanitizeLine(''), null, '빈 문자열 무효');
assert.equal(sanitizeLine(123), null, '비문자열 무효');
assert.equal(sanitizeLine('너는 보스에게 피해를 준다.'), null, '시스템 말투 차단');
assert.equal(sanitizeLine('너는 여기서 끝난다. 다시 오지 마라.'), null, '여러 문장 차단');
assert.equal(sanitizeLine('너'.repeat(53)), null, '길이 초과 차단');

// 2) templateBossLine — 상태별 결정론 대사
const first = templateBossLine({ ...EMPTY_RUN_MEMORY });
assert.equal(first.source, 'template');
assert.match(first.text, /낯선.*네/, '첫 조우 대사');

const withSpell: RunMemory = { ...EMPTY_RUN_MEMORY, deaths: 1, topSpellName: '뇌전해일' };
assert.match(templateBossLine(withSpell).text, /뇌전해일/, '애용 주문 언급');

const withEl: RunMemory = { ...EMPTY_RUN_MEMORY, deaths: 1, favoriteElement: 'fire' };
assert.match(templateBossLine(withEl).text, /불꽃/, '애용 원소 언급');

const onlyDeaths: RunMemory = { ...EMPTY_RUN_MEMORY, deaths: 3 };
assert.match(templateBossLine(onlyDeaths).text, /또 왔군.*네 패배/, '재도전 언급');

// 3) Mock은 fetch를 시작하지 않고, 라이브는 사용자 지정 프록시를 정확히 사용한다.
const originalFetch = globalThis.fetch;
const fetchedUrls: string[] = [];
try {
  globalThis.fetch = (async (input) => {
    fetchedUrls.push(String(input));
    return new Response(JSON.stringify({ text: '또 『화염구』인가, 네 손에서 끝내 주마.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;

  const memory = { ...EMPTY_RUN_MEMORY, deaths: 2, topSpellName: '화염구' };
  const mockLine = await resolveBossLine(memory, {
    mockForced: true,
    proxyUrl: 'https://must-not-be-called.example',
  });
  assert.equal(mockLine.source, 'template', 'Mock은 템플릿 사용');
  assert.equal(fetchedUrls.length, 0, 'Mock은 원격 호출 0건');

  const liveLine = await resolveBossLine(memory, {
    proxyUrl: 'https://custom-proxy.example',
  });
  assert.equal(liveLine.source, 'gemini', '유효 응답은 Gemini 출처');
  assert.equal(fetchedUrls[0], 'https://custom-proxy.example/boss-line');

  globalThis.fetch = (async () => new Response('{}', { status: 502 })) as typeof fetch;
  const fallbackLine = await resolveBossLine(memory, {
    proxyUrl: 'https://custom-proxy.example',
  });
  assert.equal(fallbackLine.source, 'template', '원격 실패는 템플릿 폴백');
  assert.match(fallbackLine.text, /화염구/);
} finally {
  globalThis.fetch = originalFetch;
}

// 4) 씬 배선은 Mock·프록시·쿼터 로그 계약을 모두 소비하고 로그는 DEV에만 남긴다.
const sceneSource = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
for (const token of [
  "VITE_JUDGE_MOCK === '1'",
  'VITE_JUDGE_PROXY_URL?.trim()',
  'resolveBossLine(runMemory, { mockForced, proxyUrl })',
  "type: 'boss_line'",
  'source: line.source',
  'elapsedMs: Date.now() - startedAt',
  'remoteAttempted: !mockForced',
  'showBossDialogue(this, {',
]) {
  assert.ok(sceneSource.includes(token), `보스 대사 배선 누락: ${token}`);
}
const bossLogIndex = sceneSource.indexOf("type: 'boss_line'");
const bossLogDevGuard = sceneSource.lastIndexOf('if (import.meta.env.DEV)', bossLogIndex);
assert.ok(
  bossLogDevGuard >= 0 && bossLogIndex - bossLogDevGuard < 240,
  'boss_line 로그는 DEV 가드 안에 있어야 한다',
);
assert.ok(
  !sceneSource.includes('this.announceSystemMessage(`"${line.text}"'),
  '보스 대사가 일반 시스템 공지로 다시 배선되면 안 된다',
);

const overlaySource = readFileSync('src/render/bossDialogueOverlay.ts', 'utf8');
for (const token of ['◆ ${copy.speaker}', '“${copy.line}”', '보스의 발화', 'depth: 123']) {
  assert.ok(overlaySource.includes(token), `보스 전용 대사판 계약 누락: ${token}`);
}

const workerSource = readFileSync('proxy/worker.js', 'utf8');
for (const token of ['기억의 주인', '반드시 "너" 또는 "네"', '관찰한 뒤 위협한다', 'temperature: 0.35']) {
  assert.ok(workerSource.includes(token), `보스 대사 프롬프트 가드 누락: ${token}`);
}

console.log('BossLine regression: 화자성·템플릿·Mock차단·프록시·전용 대사판·프롬프트 가드 통과');
