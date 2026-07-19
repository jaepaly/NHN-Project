import assert from 'node:assert/strict';
import {
  sanitizeName,
  templateEvolvedName,
  getEvolvedName,
} from '../src/spell/evolveName';
import type { EvolveNameRequest } from '../src/spell/evolveName';

// 1) sanitizeName — 공백·따옴표/괄호 정리·12자 제한·무효값
assert.equal(sanitizeName('  업화의   뇌격 '), '업화의 뇌격', '공백 정리');
assert.equal(sanitizeName('『멸망의 낙하』'), '멸망의 낙하', '겹낫표 제거');
assert.equal(sanitizeName('"작열"'), '작열', '따옴표 제거');
assert.equal(sanitizeName(''), null, '빈 문자열 무효');
assert.equal(sanitizeName(42), null, '비문자열 무효');
assert.equal(sanitizeName('가'.repeat(30))?.length, 12, '12자 제한(주문명 스키마 일치)');

// 2) templateEvolvedName — 폴백 결정론
const fuse: EvolveNameRequest = { kind: 'fuse', elements: ['fire', 'lightning'] };
assert.equal(templateEvolvedName(fuse), '불꽃·뇌전 융합', '융합 템플릿');
const fuseDark: EvolveNameRequest = { kind: 'fuse', elements: ['fire', 'dark'] };
assert.equal(templateEvolvedName(fuseDark), '불꽃·심연 융합', '융합(fire+dark)');
const evolve: EvolveNameRequest = { kind: 'evolve', baseName: '화염구', elements: ['fire'], level: 2 };
assert.equal(templateEvolvedName(evolve), '불꽃 대격변', '진화 템플릿');
const noElem: EvolveNameRequest = { kind: 'evolve', elements: [] };
assert.equal(templateEvolvedName(noElem), '마력 대격변', '원소 없어도 이름 나옴');

// 3) getEvolvedName — 프록시 도달 불가 시 템플릿 폴백 (작명은 반드시 성공)
const name = await getEvolvedName(fuse, 'http://127.0.0.1:9'); // 닫힌 포트
assert.equal(name, '불꽃·뇌전 융합', '프록시 실패 → 템플릿 폴백');
assert.ok(name.length > 0 && name.length <= 12, '항상 유효한 12자 이내 이름');

console.log('EvolveName regression: sanitize·템플릿(evolve/fuse)·폴백 3군 통과');
