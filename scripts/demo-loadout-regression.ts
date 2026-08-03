import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DEMO_BUILD_OPTIONS,
  DEMO_START_ROOM,
  applyDemoBuildLoadout,
  consumeDemoRunRequest,
  demoBuildFromOptionId,
  requestDemoRun,
} from '../src/run/demoLoadout';
import { SpiritManager } from '../src/combat-core/spirit/spiritManager';
import { CombatRunController } from '../src/combat-core/run/runController';
import { PlayerCombatState } from '../src/combat-core/player/playerCombatState';
import { MAP_GRAPH_BUILD_PRESET } from '../src/run/mapGraphPreset';

const makeController = () => new CombatRunController({ playerState: new PlayerCombatState() });

{
  const controller = makeController();
  const spirits = new SpiritManager();
  applyDemoBuildLoadout('specialist', spirits, controller);
  assert.equal(controller.state.elementalAffinity.fire, 1.1, 'specialist starts just below awakening');
  assert.equal(controller.state.chorusAffinity, null, 'specialist must not enter chorus');
}

{
  const controller = makeController();
  applyDemoBuildLoadout('chorus', new SpiritManager(), controller);
  assert.equal(controller.state.chorusAffinity, 0.15, 'chorus starts at stage one');
  assert.equal(controller.state.chorusAvailable, false, 'chorus is activated, not merely offered');
}

{
  const spirits = new SpiritManager();
  applyDemoBuildLoadout('spirits', spirits, makeController());
  assert.equal(spirits.entries.length, 2);
  const fusion = spirits.entries.find(entry => entry.fused);
  assert.deepEqual(fusion?.elements, ['fire', 'ice']);
  assert.equal(fusion?.level, 1, 'fused spirit does not have a separate evolution level');
  assert.equal(spirits.entries.find(entry => entry.element === 'lightning')?.level, 1);
}

{
  assert.equal(DEMO_START_ROOM, 1, 'build preset begins at the first room of its map');
  assert.equal(DEMO_BUILD_OPTIONS.length, 3, 'title exposes every supported build preset');
  assert.equal(demoBuildFromOptionId('demo-build-chorus'), 'chorus');
  assert.equal(consumeDemoRunRequest(), null);
  requestDemoRun('spirits');
  assert.equal(consumeDemoRunRequest(), 'spirits', 'selected preset crosses the scene boundary once');
  assert.equal(consumeDemoRunRequest(), null, 'request is consumed exactly once');
}

{
  const byId = new Map(MAP_GRAPH_BUILD_PRESET.nodes.map(node => [node.id, node]));
  const outgoing = new Map<string, string[]>();
  for (const edge of MAP_GRAPH_BUILD_PRESET.edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge.to]);
  }
  const visit = (nodeId: string, sawAltar: boolean): void => {
    const node = byId.get(nodeId);
    assert.ok(node, `missing node ${nodeId}`);
    const nextSawAltar = sawAltar || node.kind === 'altar';
    const next = outgoing.get(nodeId) ?? [];
    if (next.length === 0) {
      assert.equal(node.kind, 'memory-boss');
      assert.ok(nextSawAltar, 'every build-map route must pass through an altar');
      return;
    }
    for (const child of next) visit(child, nextSawAltar);
  };
  visit(MAP_GRAPH_BUILD_PRESET.startNodeId, false);
}

{
  const title = readFileSync('src/scenes/TitleScene.ts', 'utf8');
  const scene = readFileSync('src/scenes/ProtoScene.ts', 'utf8');
  const choiceOverlay = readFileSync('src/ui/bossChoiceOverlay.ts', 'utf8');
  assert.ok(title.includes('openDemoBuildChoice'), 'title must open the build picker');
  assert.ok(scene.includes('MAP_GRAPH_BUILD_PRESET'), 'preset run must install its fixed map');
  assert.ok(scene.includes('applyDemoBuildLoadout'), 'scene must apply the selected build');
  assert.ok(scene.includes('showDemoCompletionChoice'), 'demo completion must use its own exit prompt');
  assert.ok(scene.includes("if (!isDemoRun) this.persistRunMemory('win');"),
    'demo victory must not persist meta rewards or grimoire entries');
  assert.ok(scene.includes('if (this.demoRun) return;'),
    'demo defeat or abandon must not persist meta rewards either');
  assert.ok(scene.includes('if (!this.demoRun) this.runResearchTracker.recordRoomCleared'),
    'demo room clears must not grant insight progress');
  assert.ok(scene.includes('if (castMode === \'normal\' && !this.demoRun)'),
    'demo casts must not record discoveries or research progress');
  const completedAt = scene.indexOf("this.combatRunController.on('run-completed'");
  const completed = scene.slice(completedAt, completedAt + 2800);
  assert.ok(completed.indexOf('showDemoCompletionChoice') < completed.indexOf('showBossChoice'),
    'demo completion must branch before the normal continue-deeper choice');
  assert.ok(completed.includes("choice === 'start-real') this.scene.restart()"),
    'the primary demo completion action must start a fresh normal run');
  const demoChoiceAt = choiceOverlay.indexOf('export function showDemoCompletionChoice');
  const demoChoice = choiceOverlay.slice(demoChoiceAt, demoChoiceAt + 1600);
  assert.ok(demoChoice.includes('체험 완료') && demoChoice.includes('정식 런 시작'),
    'demo completion must explain the trial and point to a real run');
  assert.ok(!demoChoice.includes('더 깊이 간다'),
    'demo completion must not expose the normal loop-continuation action');
}

console.log('demo build preset regression: picker, loadouts, mandatory altar route, and isolated completion flow passed');
