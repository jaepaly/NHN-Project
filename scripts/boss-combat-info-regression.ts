import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bossCombatInfoLines } from '../src/ui/bossCombatInfoModel';

const base = {
  label: '수문장',
  hp: 319.2,
  maxHp: 520,
  phase: 2 as const,
  counterStrategy: 'rush' as const,
  resistance: {
    resisted: [{ element: 'ice' as const, reductionPercent: 25 }],
    pierced: ['fire' as const],
  },
};

assert.deepEqual(bossCombatInfoLines(base), [
  '수문장  320/520  ·  PHASE 2',
  '저항  빙결 −25%',
  '관통  화염',
  '패턴  돌진 강화',
]);
assert.equal(bossCombatInfoLines({ ...base, counterStrategy: 'ranged' })[3], '패턴  탄막 강화');
assert.equal(bossCombatInfoLines({ ...base, counterStrategy: null })[3], '패턴  기본 전술');
assert.deepEqual(bossCombatInfoLines({
  ...base,
  hp: -10,
  resistance: { resisted: [], pierced: [] },
}), ['수문장  0/520  ·  PHASE 2', '패턴  돌진 강화']);

const sceneSource = readFileSync(join(process.cwd(), 'src/scenes/ProtoScene.ts'), 'utf8');
assert.ok(sceneSource.includes('this.updateBossCombatInfo();'), '매 프레임 보스 정보가 갱신돼야 한다');
assert.ok(sceneSource.includes('if (!this.isBossEncounter())'), '일반방에서는 패널을 숨겨야 한다');
assert.ok(sceneSource.includes('enemy instanceof BossEnemy && enemy.alive'), '죽은 보스를 추적하면 안 된다');
assert.ok(!sceneSource.includes('bossResistanceLines(status'), '우측 패널에 상세 정보를 중복하면 안 된다');

console.log('boss combat info regression: 상태·저항·관통·패턴·숨김·중복제거 9군 통과');
