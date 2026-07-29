import type { EncounterDefinition, EncounterKind } from './runContract';
import type { MapNode, MapNodeKind } from './mapGraphContract';

/**
 * MapNode를 기존 전투 컨트롤러가 소비하는 조우 정의로 바꾼다.
 *
 * 보물·제단은 적이 없는 방이지만 보상/전환 상태 머신은 RunController를 그대로
 * 사용하므로 contract상 combat으로 표현한다. 실제 무전투 처리는 씬이 MapNode.kind로
 * 결정한다. 함정방도 전투 조우 위에 trapProfile을 합성하므로 combat이다.
 */
export function encounterFromMapNode(node: MapNode): EncounterDefinition {
  if (node.stage !== 1 && node.stage !== 2) {
    throw new Error(`MapNode stage must be 1 or 2: ${node.id}`);
  }
  const kind = encounterKindFromMapNodeKind(node.kind);
  return {
    id: node.id,
    stage: node.stage,
    kind,
    rewardAfterClear: kind !== 'memory-boss',
    waveSetId: node.waveSetId ?? undefined,
  };
}

function encounterKindFromMapNodeKind(kind: MapNodeKind): EncounterKind {
  if (kind === 'elite') return 'elite';
  if (kind === 'stage-boss') return 'stage-boss';
  if (kind === 'memory-boss') return 'memory-boss';
  return 'combat';
}
