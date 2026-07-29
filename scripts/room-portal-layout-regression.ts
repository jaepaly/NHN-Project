import assert from 'node:assert/strict';
import {
  DEFAULT_ROOM_PORTAL_LAYOUT,
  layoutRoomArrival,
  layoutRoomExits,
  toArrivalContext,
} from '../src/run/roomPortalLayout';

const WORLD = { x: 0, y: 0, width: 1920, height: 1280 };
const closeTo = (actual: number, expected: number): void => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} should be close to ${expected}`);
};

{
  const exits = layoutRoomExits(WORLD, [
    { nodeId: 'upper', lane: 0 },
    { nodeId: 'middle', lane: 1 },
    { nodeId: 'lower', lane: 2 },
  ]);

  exits.map((exit) => exit.normalizedY).forEach((value, index) => {
    closeTo(value, [0.34, 0.5, 0.66][index]);
  });
  exits.map((exit) => exit.y).forEach((value, index) => {
    closeTo(value, [435.2, 640, 844.8][index]);
  });
  assert.ok(exits.every((exit) => exit.side === 'right'));
  assert.ok(exits.every((exit) => exit.x === 1840));
  closeTo(exits[1].y - exits[0].y, WORLD.height * 0.16);
}

{
  const exits = layoutRoomExits(WORLD, [
    { nodeId: 'lower', lane: 9 },
    { nodeId: 'upper-b', lane: 2 },
    { nodeId: 'upper-a', lane: 2 },
  ]);
  assert.deepEqual(
    exits.map((exit) => exit.targetNodeId),
    ['upper-a', 'upper-b', 'lower'],
    'exits must follow destination lane with a deterministic tie-breaker',
  );
}

{
  assert.deepEqual(layoutRoomExits(WORLD, [{ nodeId: 'only', lane: 0 }])[0].normalizedY, 0.5);
  layoutRoomExits(WORLD, [{ nodeId: 'a', lane: 0 }, { nodeId: 'b', lane: 1 }])
    .map((exit) => exit.normalizedY)
    .forEach((value, index) => closeTo(value, [0.42, 0.58][index]));
  assert.deepEqual(layoutRoomExits(WORLD, []), []);
}

{
  const [selected] = layoutRoomExits(WORLD, [
    { nodeId: 'next', lane: 0 },
    { nodeId: 'middle', lane: 1 },
    { nodeId: 'lower', lane: 2 },
  ], {
    ...DEFAULT_ROOM_PORTAL_LAYOUT,
    slotGapRatio: 0.2,
  });
  const context = toArrivalContext('current', selected);
  const arrival = layoutRoomArrival(WORLD, context);

  assert.equal(context.toNodeId, 'next');
  assert.equal(arrival.side, 'left');
  assert.equal(arrival.portal.x, 80);
  assert.equal(arrival.playerSpawn.x, 176);
  assert.equal(arrival.portal.y, arrival.playerSpawn.y);
  assert.equal(selected.normalizedY, 0.3, 'selected exit may be above center');
  assert.equal(arrival.normalizedY, 0.5, 'arrival must reset to the shared center entry');
  assert.equal(arrival.portal.y, 640);
}

{
  assert.throws(
    () => layoutRoomExits(WORLD, [
      { nodeId: 'a', lane: 0 },
      { nodeId: 'b', lane: 1 },
      { nodeId: 'c', lane: 2 },
      { nodeId: 'd', lane: 3 },
    ]),
    /at most 3 exits/,
  );
  assert.throws(
    () => layoutRoomExits({ ...WORLD, height: 0 }, []),
    /Room bounds/,
  );
  assert.throws(
    () => layoutRoomExits(WORLD, [], {
      ...DEFAULT_ROOM_PORTAL_LAYOUT,
      slotGapRatio: 0.4,
    }),
    /do not fit/,
  );
}

console.log('Room portal layout regression: exit slots, lane order, centered arrival, and guards passed');
