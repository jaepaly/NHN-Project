import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveBossLine, templateBossLine, sanitizeLine } from '../src/spell/bossLine';
import { EMPTY_RUN_MEMORY } from '../src/spell/runMemory';
import type { RunMemory } from '../src/spell/runMemory';

// 1) sanitizeLine — 공백 정리·길이 제한·무효값
assert.equal(sanitizeLine('  안녕   보스  '), '안녕 보스', '공백 정리');
assert.equal(sanitizeLine(''), null, '빈 문자열 무효');
assert.equal(sanitizeLine(123), null, '비문자열 무효');
assert.equal(sanitizeLine('가'.repeat(200))?.length, 80, '길이 80 제한');

// 2) templateBossLine — 상태별 결정론 대사
const first = templateBossLine({ ...EMPTY_RUN_MEMORY });
assert.equal(first.source, 'template');
assert.match(first.text, /낯선/, '첫 조우 대사');

const withSpell: RunMemory = { ...EMPTY_RUN_MEMORY, deaths: 1, topSpellName: '뇌전해일' };
assert.match(templateBossLine(withSpell).text, /뇌전해일/, '애용 주문 언급');

const withEl: RunMemory = { ...EMPTY_RUN_MEMORY, deaths: 1, favoriteElement: 'fire' };
assert.match(templateBossLine(withEl).text, /불꽃/, '애용 원소 언급');

const onlyDeaths: RunMemory = { ...EMPTY_RUN_MEMORY, deaths: 3 };
assert.match(templateBossLine(onlyDeaths).text, /3번/, '사망 언급');

// 3) Mock은 fetch를 시작하지 않고, 라이브는 사용자 지정 프록시를 정확히 사용한다.
const originalFetch = globalThis.fetch;
const fetchedUrls: string[] = [];
try {
  globalThis.fetch = (async (input) => {
    fetchedUrls.push(String(input));
    return new Response(JSON.stringify({ text: '기억하고 있다.' }), {
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
]) {
  assert.ok(sceneSource.includes(token), `보스 대사 배선 누락: ${token}`);
}
const bossLogIndex = sceneSource.indexOf("type: 'boss_line'");
const bossLogDevGuard = sceneSource.lastIndexOf('if (import.meta.env.DEV)', bossLogIndex);
assert.ok(
  bossLogDevGuard >= 0 && bossLogIndex - bossLogDevGuard < 240,
  'boss_line 로그는 DEV 가드 안에 있어야 한다',
);

console.log('BossLine regression: sanitize·템플릿·Mock차단·프록시·폴백·로그 8군 통과');
