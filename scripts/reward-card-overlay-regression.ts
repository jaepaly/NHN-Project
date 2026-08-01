import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rewardCardFocusDirection } from '../src/ui/rewardCardOverlay';

assert.equal(rewardCardFocusDirection({ code: 'KeyA' }), -1, 'A는 왼쪽 카드');
assert.equal(rewardCardFocusDirection({ code: 'KeyD' }), 1, 'D는 오른쪽 카드');
assert.equal(rewardCardFocusDirection({ code: 'ArrowLeft' }), 0, '왼쪽 방향키는 사용하지 않는다');
assert.equal(rewardCardFocusDirection({ code: 'ArrowRight' }), 0, '오른쪽 방향키는 사용하지 않는다');
assert.equal(rewardCardFocusDirection({ code: 'KeyW' }), 0, '세로 이동 키는 보상 카드에서 무시한다');
assert.equal(rewardCardFocusDirection({ code: 'KeyS' }), 0, '세로 이동 키는 보상 카드에서 무시한다');

const source = readFileSync('src/ui/rewardCardOverlay.ts', 'utf8');
assert.ok(source.includes('white-space: pre-line'), '카드 설명의 명시적 줄바꿈 보존');
for (const key of ['KeyA', 'KeyD', 'Enter']) {
  assert.ok(source.includes(`'${key}'`), `${key} 입력`);
}
for (const key of ['ArrowLeft', 'ArrowRight']) {
  assert.ok(!source.includes(`'${key}'`), `${key} 입력을 사용하지 않는다`);
}
assert.ok(source.includes('<b>A/D + Enter</b>'), '게임 이동키와 일치하는 조작 안내');
assert.ok(source.includes("['1', '2', '3']"), '숫자키 직접 선택 유지');
assert.ok(source.includes("addEventListener('click'"), '마우스 직접 선택 유지');

console.log('reward card overlay regression: A/D·방향키 비활성·직접 선택 3군 통과');
