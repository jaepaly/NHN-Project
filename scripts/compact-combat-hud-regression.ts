import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPACT_AFFINITY_HUD,
  COMPACT_VITAL_HUD,
  compactVitalGeometry,
  compactVitalRowY,
} from '../src/ui/combatHudPlacement';
import { AFFINITY_PANEL_LAYOUT, affinityPanelGeometry } from '../src/ui/combatHudLayout';

const buildSpan = 65;
const standard = compactVitalGeometry(1180, 900, buildSpan);
const buildLeft = 1180 - 20 - buildSpan;
assert.equal(standard.x + COMPACT_VITAL_HUD.width + COMPACT_VITAL_HUD.gapFromBuild, buildLeft);
assert.equal(standard.y, 900 - 26 - buildSpan);
assert.ok(compactVitalGeometry(300, 180, buildSpan).x >= 8, '작은 화면에서 왼쪽 밖으로 나가면 안 된다');
assert.ok(compactVitalGeometry(300, 80, buildSpan).y >= 8, '작은 화면에서 위쪽 밖으로 나가면 안 된다');
assert.ok(compactVitalRowY(standard.y, 2) < standard.y + COMPACT_VITAL_HUD.height, '3행이 상태판 안에 있어야 한다');

const affinity = affinityPanelGeometry(
  COMPACT_AFFINITY_HUD.y,
  COMPACT_AFFINITY_HUD.headerHeight,
  8,
);
assert.ok(COMPACT_AFFINITY_HUD.width < 300, '친화 패널 폭이 종전보다 작아야 한다');
assert.ok(affinity.height < 130, '친화 패널 높이가 종전보다 작아야 한다');
assert.equal(AFFINITY_PANEL_LAYOUT.rowsPerColumn, 4, '8원소 4×2 정보량을 유지한다');

const source = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
assert.ok(source.includes("? '! ' : ''"), '저체력 위험 표식을 보존해야 한다');
assert.ok(source.includes('AFFINITY_ROWS'), '8원소 라벨 생성을 유지해야 한다');
assert.ok(source.includes('vital.x + VITAL_HUD.barX'), '상태 바는 우하단 배치 좌표를 써야 한다');

console.log('compact combat HUD regression: 빌드칩 간격·화면경계·3행·친화축소·8원소·저체력 10군 통과');
