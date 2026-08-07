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
assert.ok(source.includes("['1', '2', '3', '4']"), '숫자키 직접 선택 유지');
assert.ok(source.includes("addEventListener('click'"), '마우스 직접 선택 유지');
assert.ok(
  source.includes('width: min(788px, calc(100vw - 32px)); box-sizing: border-box;'),
  '선택 상세 설명과 무관한 viewport 기준 패널 총폭 고정',
);
assert.ok(
  source.includes('translateY(calc(var(--card-lift, 0px) - 10px)) scale(1.035)'),
  '선택 강조는 레이아웃 폭이 아닌 transform만 사용',
);
assert.ok(
  source.includes('detailPanel.style.height = `${Math.ceil(tallest)}px`;'),
  '기존 상세 패널 높이 잠금 유지',
);

console.log('reward card overlay regression: 입력·직접 선택·반응형 고정 폭·상세 높이 잠금 통과');
