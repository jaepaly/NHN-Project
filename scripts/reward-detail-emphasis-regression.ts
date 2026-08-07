import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const overlay = readFileSync('src/ui/rewardCardOverlay.ts', 'utf8');
const glossary = readFileSync('src/ui/rewardGlossary.ts', 'utf8');

assert.ok(glossary.includes('**저절로 다시 시전된다.**'),
  '강조 표본이 용어 설명에 남아 있어야 렌더 계약을 검증할 수 있다');
assert.ok(overlay.includes('export function setRewardDetailText'),
  '보상 상세용 안전한 강조 렌더러가 필요하다');
assert.ok(overlay.includes("document.createElement('strong')"),
  '강조 구간은 실제 strong 요소로 렌더되어야 한다');
assert.ok(!/detailPanelCopy\.textContent\s*=/.test(overlay),
  '상세 패널을 평문으로 덮어써 ** 기호를 노출하면 안 된다');
assert.ok(overlay.includes('.reward-detail-copy strong'),
  '강조 요소의 시각 스타일이 필요하다');

console.log('Reward detail emphasis regression: safe strong rendering passed');
