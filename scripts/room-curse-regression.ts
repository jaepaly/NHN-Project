import assert from 'node:assert/strict';
import type { EncounterDefinition } from '../src/run/runContract';
import {
  createRoomCursePlan,
  curseForRoom,
  isInsideCurseCircle,
  ROOM_CURSE_CONFIG,
  roomCurseWeights,
  selectHighestWeightedCurse,
  selectRoomCurseCategories,
  selectRoomCursesByCategory,
  silenceManaDrainPerSecond,
} from '../src/combat-core/run/roomCurse';

const encounters: EncounterDefinition[] = [
  { id: '1a', stage: 1, kind: 'combat', rewardAfterClear: true, waveSetId: 'a' },
  { id: '1b', stage: 1, kind: 'combat', rewardAfterClear: true, waveSetId: 'b' },
  { id: '1boss', stage: 1, kind: 'stage-boss', rewardAfterClear: true },
  { id: '2a', stage: 2, kind: 'combat', rewardAfterClear: true, waveSetId: 'a' },
  { id: '2b', stage: 2, kind: 'elite', rewardAfterClear: true, waveSetId: 'b' },
  { id: '2boss', stage: 2, kind: 'memory-boss', rewardAfterClear: false },
];

assert.equal(ROOM_CURSE_CONFIG.silenceRadius, 185);
assert.equal(ROOM_CURSE_CONFIG.silenceManaDrainRatio, 0.05);
assert.equal(ROOM_CURSE_CONFIG.blackoutVisionRadius, 95);
assert.equal(ROOM_CURSE_CONFIG.blackoutIlluminationSeconds, 4);
assert.equal(createRoomCursePlan(encounters, false, () => 0).assignments.length, 0);

const plan = createRoomCursePlan(encounters, true, () => 0.25);
assert.deepEqual(
  plan.selectedKinds,
  { movement: 'silence', element: 'blackout' },
  '런마다 이동/원소 카테고리에서 저주를 각각 1종 선택',
);
assert.equal(plan.assignments.length, 2, '3방 스테이지마다 40% 반올림 = 1방');
assert.deepEqual(plan.assignments.map((assignment) => assignment.stage), [1, 2]);
assert.deepEqual(
  plan.assignments.map((assignment) => assignment.kind),
  ['blackout', 'silence'],
  '스테이지 경계를 넘어 주·보조 저주를 1:1로 교대 배정',
);
assert.ok(plan.assignments.every((assignment) => !('level' in assignment)));
assert.equal(
  curseForRoom(plan, plan.assignments[0].roomIndex)?.kind,
  plan.assignments[0].kind,
);
assert.equal(curseForRoom(plan, 99), null);
assert.equal(isInsideCurseCircle(10, 0, 0, 0, 10), true, '결계 경계는 영창 가능');
assert.equal(isInsideCurseCircle(10.01, 0, 0, 0, 10), false, '결계 밖은 영창 차단');
assert.equal(isInsideCurseCircle(0, 0, 0, 0, -1), false, '잘못된 반경 방어');
assert.equal(silenceManaDrainPerSecond(100), 5, '고정 최대 마나 5%/초');
assert.equal(silenceManaDrainPerSecond(120), 6, '고정 최대 마나 5%/초');
assert.deepEqual(
  roomCurseWeights({
    movementDistance: 12_000,
    manualCastCount: 10,
    lightFireCastCount: 2,
  }),
  { silence: 1, blackout: 0.8 },
  '직전 행동을 저주 후보별 가중치로 계산',
);
assert.deepEqual(roomCurseWeights(), { silence: 0.5, blackout: 0.5 });
assert.equal(
  selectHighestWeightedCurse(
    ['silence', 'blackout'],
    { silence: 0.2, blackout: 0.9 },
    () => 0.5,
  ),
  'blackout',
  '선택된 카테고리 내부에서는 가중치가 가장 높은 저주를 선택',
);
assert.deepEqual(
  selectRoomCurseCategories(['movement', 'element', 'casting'], () => 0),
  ['element', 'casting'],
  '후보가 있는 카테고리 중 최대 2개를 결정적 랜덤으로 선택',
);
assert.deepEqual(
  selectRoomCursesByCategory(
    {
      movement: ['blackout', 'silence'],
      element: ['silence', 'blackout'],
      casting: ['blackout'],
    },
    { silence: 1, blackout: 0.8 },
    () => 0,
  ),
  { movement: 'silence', element: 'blackout' },
  '다른 행동 카테고리의 저주는 후보 풀에서 제외',
);

const denseStage: EncounterDefinition[] = Array.from({ length: 5 }, (_, index) => ({
  id: `dense-${index}`,
  stage: 1 as const,
  kind: 'combat' as const,
  rewardAfterClear: true,
  waveSetId: 'a',
}));
const mixedPlan = createRoomCursePlan(denseStage, true, () => 0.5);
assert.deepEqual(
  mixedPlan.assignments.map((assignment) => assignment.kind),
  ['silence', 'blackout'],
  '저주방이 2개 이상이면 침묵과 암전을 교대로 배정',
);

const tinyStage: EncounterDefinition[] = [
  { id: 'only', stage: 1, kind: 'memory-boss', rewardAfterClear: false },
];
assert.equal(
  createRoomCursePlan(tinyStage, true, () => 0).assignments.length,
  0,
  '정상방을 남길 수 없는 단일 방 스테이지에는 배정하지 않음',
);

console.log('Room curse regression: 고정 수치·해금·40% 배정·정상방 보장 통과');
