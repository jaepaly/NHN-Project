import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildMetaRunSummary,
  META_INSIGHT_UNLOCKS,
  nextMetaInsightUnlock,
} from '../src/meta/metaRunSummary';
import {
  discoverySignatureLabel,
  META_UNLOCK_LABELS,
  representativeBuildLabel,
  researchContractSummaryLabel,
} from '../src/ui/runSummaryModel';

assert.deepEqual(META_INSIGHT_UNLOCKS.map((unlock) => unlock.threshold), [4, 14, 30, 50]);
assert.deepEqual(nextMetaInsightUnlock(0), { id: 'basic-research', threshold: 4 });
assert.deepEqual(nextMetaInsightUnlock(4), { id: 'expanded-research', threshold: 14 });
assert.deepEqual(nextMetaInsightUnlock(14), { id: 'forbidden-research', threshold: 30 });
assert.deepEqual(nextMetaInsightUnlock(30), { id: 'advanced-records', threshold: 50 });
assert.equal(nextMetaInsightUnlock(50), null);
assert.deepEqual(nextMetaInsightUnlock(Number.NaN), { id: 'basic-research', threshold: 4 });

const summary = buildMetaRunSummary(
  { insight: 9 },
  {
    insightEarned: 7,
    discoveryInsight: 3,
    roomInsight: 4,
    researchInsight: 0,
    newSignatures: [
      'damage:fire:none:bolt',
      'heal:water:light:nova',
    ],
    research: null,
  },
);
assert.equal(summary.totalInsight, 9);
assert.equal(summary.insightEarned, 7);
assert.equal(summary.insightToNextUnlock, 5);
assert.equal(summary.nextUnlock?.id, 'expanded-research');
assert.equal(summary.newSignatures.length, 2);

assert.equal(discoverySignatureLabel('damage:fire:none:bolt'), '화염 · 투사체 · 피해');
assert.equal(discoverySignatureLabel('heal:water:light:nova'), '해류+광휘 · 폭발 · 회복');
assert.equal(representativeBuildLabel('lightning', 'chain'), '뇌전 연쇄술사');
assert.equal(representativeBuildLabel('ice', null), '빙결 중심');
assert.equal(representativeBuildLabel(null, 'wall'), '벽 중심');
assert.equal(representativeBuildLabel(null, null), '아직 형성되지 않음');
assert.equal(META_UNLOCK_LABELS['basic-research'], '기본 연구');
assert.equal(researchContractSummaryLabel({
  id: 'spirit-resonance',
  element: null,
  progress: 3,
  goal: 3,
  completed: true,
  rewardInsight: 3,
  usedElements: [],
  usedForms: [],
}), '수호 연구 3/3 · 완료 +3');

const overlaySource = readFileSync('src/ui/runSummaryOverlay.ts', 'utf8');
for (const phrase of ['대표 빌드', '수동 영창', '새로운 발견', '마도 통찰', '다음 해금']) {
  assert.ok(overlaySource.includes(phrase), `결산 화면 필수 문구: ${phrase}`);
}
assert.ok(overlaySource.includes('data.meta.newSignatures'), '런 신규 발견 데이터 배선');
assert.ok(overlaySource.includes('slice(0, 6)'), '발견이 많아도 결산 카드 높이를 제한');
assert.ok(overlaySource.includes('hiddenDiscoveryCount'), '숨긴 발견 수 표시');
assert.ok(overlaySource.includes('data.meta.insightEarned'), '이번 런 통찰 데이터 배선');
assert.ok(overlaySource.includes('data.meta.totalInsight'), '누적 통찰 데이터 배선');
assert.ok(overlaySource.includes('data.meta.researchInsight'), '연구 통찰 데이터 배선');

const sceneSource = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
assert.ok(sceneSource.includes('buildMetaRunSummary(this.metaProfile'), '저장 후 메타 프로필 결산 배선');
assert.equal(
  (sceneSource.match(/showRunSummaryOverlay\(this\.buildRunSummary\('(victory|defeat)'\)\)/g) ?? []).length,
  3,
  '승리·사망·포기 공용 결산 화면',
);

console.log('meta run summary regression: 해금·발견라벨·대표빌드·승패배선 6군 통과');
