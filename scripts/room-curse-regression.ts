import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ROOM_CURSE_CONFIG,
  isInsideCurseCircle,
  silenceManaDrainPerSecond,
} from '../src/combat-core/run/roomCurse';

assert.equal(ROOM_CURSE_CONFIG.silenceRadius, 185);
assert.equal(ROOM_CURSE_CONFIG.silenceManaDrainRatio, 0.05);
assert.equal(ROOM_CURSE_CONFIG.blackoutVisionRadius, 95);
assert.equal(ROOM_CURSE_CONFIG.blackoutIlluminationSeconds, 4);

assert.equal(isInsideCurseCircle(0, 0, 0, 0, 10), true);
assert.equal(isInsideCurseCircle(10, 0, 0, 0, 10), true);
assert.equal(isInsideCurseCircle(10.01, 0, 0, 0, 10), false);
assert.equal(isInsideCurseCircle(0, 0, 0, 0, -1), false);
assert.equal(isInsideCurseCircle(Number.NaN, 0, 0, 0, 10), false);

assert.equal(silenceManaDrainPerSecond(100), 5);
assert.equal(silenceManaDrainPerSecond(0), 0);
assert.equal(silenceManaDrainPerSecond(Number.NaN), 0);

const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
const shell = readFileSync('index.html', 'utf8');
assert.ok(
  scene.includes("behaviorUsesAnyElement(behavior, ['light', 'fire', 'lightning'])"),
  '암전은 빛·불·번개 원소로 밝힐 수 있어야 한다',
);
assert.ok(
  shell.includes('#incant-wrap.ultimate.word-limit #incant-charge')
    && shell.includes('width: var(--charge);'),
  '필살영창과 금언이 겹치면 하단 바는 완충 장식이 아니라 실제 언령 비용을 표시해야 한다',
);
assert.ok(
  shell.includes('#incant-wrap.ultimate.word-limit-over')
    && shell.includes('#incant-wrap.ultimate.judging #incant-charge'),
  '필살영창 복합 상태는 판정 중 > 금언 초과 > 필살 장식 우선순위를 명시해야 한다',
);

console.log('Room curse regression: MapGraph trap config·circle guard·silence drain·blackout elements·ultimate word-limit UI 6군 통과');
