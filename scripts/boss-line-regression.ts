import assert from 'node:assert/strict';
import { templateBossLine, sanitizeLine, getBossLine } from '../src/spell/bossLine';
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

// 3) getBossLine — 프록시 도달 불가 시 템플릿 폴백 (보스는 반드시 말한다)
const line = await getBossLine(
  { ...EMPTY_RUN_MEMORY, deaths: 2, topSpellName: '화염구' },
  'http://127.0.0.1:9', // 닫힌 포트 → 연결 실패
);
assert.equal(line.source, 'template', '프록시 실패 → 템플릿 폴백');
assert.match(line.text, /화염구/);
assert.ok(line.text.length > 0, '항상 비지 않은 대사');

console.log('BossLine regression: sanitize·템플릿·폴백 5군 통과');
