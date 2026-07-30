import type {
  MapNodeKind,
  MinimapModel,
  MinimapNode,
} from '../run/mapGraphContract';
import { MINIMAP_CONFIG, minimapLayout } from './minimapLayout';
import { UI_COLOR, UI_FONT, UI_LAYER, UI_RADIUS } from './uiTokens';

/**
 * 다음 방 선택 UI의 입력 계약.
 *
 * map은 전체 경로 표시, options는 현재 위치에서 실제로 이동 가능한 노드만 담당한다.
 * UI는 전체 지도를 보여주되 options 밖의 노드를 선택 결과로 반환하지 않는다.
 */
export interface RoomChoiceOption {
  nodeId: string;
  kind: MapNodeKind;
  rewardHint?: string;
}

export interface RoomChoiceRequest {
  map: MinimapModel;
  options: readonly RoomChoiceOption[];
}

export interface RoomChoicePresentation {
  label: string;
  color: string;
  description: string;
}

const ROOM_PRESENTATION: Record<MapNodeKind, RoomChoicePresentation> = {
  start: {
    label: '시작',
    color: '#8fa4ff',
    description: '이번 여정이 시작된 방이다.',
  },
  combat: {
    label: '일반방',
    color: '#8fa4ff',
    description: '기본 적과 싸우며 주문 친화도와 표준 보상을 쌓는다.',
  },
  elite: {
    label: '정예방',
    color: '#ffa94d',
    description: '강화된 적이 기다린다. 더 위험하지만 보상도 크다.',
  },
  'stage-boss': {
    label: '수문장',
    color: '#ff5a6e',
    description: '다음 구역으로 향하는 길을 막는 강적이다.',
  },
  'memory-boss': {
    label: '기억의 주인',
    color: '#ff5a6e',
    description: '이번 여정의 마지막에서 플레이어의 주문을 기억해 맞선다.',
  },
  treasure: {
    label: '보물방',
    color: '#ffd166',
    description: '전투 없이 안전하게 보상을 고르지만 성장 기회는 적다.',
  },
  altar: {
    label: '제단방',
    color: '#d0a8ff',
    description: '최대 체력을 대가로 상급 힘을 얻거나 거래를 거절한다.',
  },
  trap: {
    label: '함정방',
    color: '#72f1b8',
    description: '특수 기믹이 전장을 제한한다. 위험한 만큼 보상이 커진다.',
  },
};

/** 기존 미니맵·포탈에서 쓰던 방 이름과 색을 큰 경로 지도에서도 재사용한다. */
export function roomChoicePresentation(kind: MapNodeKind): Readonly<RoomChoicePresentation> {
  return ROOM_PRESENTATION[kind];
}

/** 위·아래 후보의 끝에서는 반대편으로 순환하지 않는다. */
export function nextRoomChoiceFocusIndex(
  currentIndex: number,
  direction: -1 | 1,
  optionCount: number,
): number {
  if (optionCount <= 0) return 0;
  return Math.min(Math.max(currentIndex + direction, 0), optionCount - 1);
}

const STYLE_ID = 'r3-room-choice-style';
const WRAP_ID = 'r3-room-choice-wrap';

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: ${UI_LAYER.reward};
  display: grid; place-items: center; box-sizing: border-box; padding: 22px;
  background:
    radial-gradient(circle at 50% 42%, rgba(76, 102, 255, 0.14), transparent 38%),
    linear-gradient(rgba(3, 5, 16, 0.93), rgba(3, 5, 16, 0.98));
  backdrop-filter: blur(5px) saturate(0.65);
  opacity: 0; visibility: hidden; transition: opacity 180ms ease;
  font-family: ${UI_FONT.sans}; color: ${UI_COLOR.text};
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
#${WRAP_ID} .route-panel {
  position: relative; width: min(1080px, calc(100vw - 32px));
  padding: 22px 26px 18px; box-sizing: border-box; overflow: hidden;
  border: 1px solid color-mix(in srgb, ${UI_COLOR.borderStrong} 72%, #26305b);
  border-radius: ${UI_RADIUS.md};
  background:
    repeating-linear-gradient(118deg, transparent 0 34px, rgba(143, 164, 255, 0.018) 35px 36px),
    linear-gradient(160deg, rgba(8, 11, 28, 0.98), rgba(5, 8, 22, 0.99));
  box-shadow: 0 26px 90px rgba(0, 0, 0, 0.72), inset 0 0 60px rgba(76, 102, 255, 0.05);
  text-align: center;
}
#${WRAP_ID} .route-panel::before,
#${WRAP_ID} .route-panel::after {
  content: ''; position: absolute; width: 84px; height: 2px; top: 16px;
  background: linear-gradient(90deg, transparent, ${UI_COLOR.accent});
  opacity: 0.58;
}
#${WRAP_ID} .route-panel::before { left: 16px; }
#${WRAP_ID} .route-panel::after { right: 16px; transform: scaleX(-1); }
#${WRAP_ID} .route-kicker {
  font: 800 11px/1 ${UI_FONT.mono}; letter-spacing: 0.26em; color: ${UI_COLOR.accent};
  text-shadow: 0 0 12px rgba(76, 102, 255, 0.75);
}
#${WRAP_ID} .route-title {
  margin: 6px 0 4px; font-family: ${UI_FONT.serif}; font-size: 25px;
  font-weight: 800; color: ${UI_COLOR.textBright};
}
#${WRAP_ID} .route-subtitle {
  margin-bottom: 15px; font-size: 12px; color: ${UI_COLOR.textMuted};
}
#${WRAP_ID} .route-map {
  position: relative; width: 100%; height: clamp(310px, 49vh, 500px);
  border: 1px solid rgba(47, 61, 118, 0.72); border-radius: ${UI_RADIUS.md};
  background:
    linear-gradient(rgba(143, 164, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(143, 164, 255, 0.035) 1px, transparent 1px),
    radial-gradient(circle at center, rgba(22, 31, 71, 0.52), rgba(4, 7, 20, 0.82));
  background-size: 42px 42px, 42px 42px, auto;
  overflow: hidden;
}
#${WRAP_ID} .route-edges {
  position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible;
}
#${WRAP_ID} .route-edge {
  stroke: #2c3a6e; stroke-width: 0.42; vector-effect: non-scaling-stroke; opacity: 0.58;
}
#${WRAP_ID} .route-edge.walked { stroke: #4b7d68; stroke-width: 1.5; opacity: 0.86; }
#${WRAP_ID} .route-edge.available {
  stroke: ${UI_COLOR.accent}; stroke-width: 2.5; opacity: 1;
  filter: drop-shadow(0 0 5px rgba(76, 102, 255, 0.9));
  stroke-dasharray: 7 6; animation: r3-route-flow 1.1s linear infinite;
}
@keyframes r3-route-flow { to { stroke-dashoffset: -13; } }
#${WRAP_ID} .route-nodes { position: absolute; inset: 0; }
#${WRAP_ID} .route-node {
  --room-color: ${UI_COLOR.accent};
  position: absolute; transform: translate(-50%, -50%);
  width: 48px; height: 48px; padding: 0; border: 2px solid var(--room-color);
  border-radius: 50%; background: rgba(10, 14, 34, 0.96);
  color: var(--room-color); font: 800 10px/1.08 ${UI_FONT.sans};
  display: grid; place-items: center; cursor: default;
  opacity: 0.38; transition: transform 140ms ease, opacity 140ms ease, box-shadow 140ms ease;
}
#${WRAP_ID} .route-node.special { border-radius: 10px; }
#${WRAP_ID} .route-node.boss { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); border-radius: 0; }
#${WRAP_ID} .route-node.cleared { opacity: 0.62; border-color: #4b7d68; color: #72a88e; }
#${WRAP_ID} .route-node.current {
  width: 56px; height: 56px; opacity: 1; color: #ffd166; border-color: #ffd166;
  box-shadow: 0 0 0 6px rgba(255, 209, 102, 0.12), 0 0 24px rgba(255, 209, 102, 0.32);
}
#${WRAP_ID} .route-node.selectable {
  width: 60px; height: 60px; opacity: 1; cursor: pointer;
  background: color-mix(in srgb, var(--room-color) 13%, rgba(10, 14, 34, 0.98));
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--room-color) 12%, transparent),
              0 0 25px color-mix(in srgb, var(--room-color) 43%, transparent);
  animation: r3-route-ready 1.45s ease-in-out infinite;
}
#${WRAP_ID} .route-node.selectable:hover,
#${WRAP_ID} .route-node.selectable.focused {
  transform: translate(-50%, -50%) scale(1.13);
  box-shadow: 0 0 0 7px color-mix(in srgb, var(--room-color) 18%, transparent),
              0 0 38px color-mix(in srgb, var(--room-color) 66%, transparent);
}
#${WRAP_ID} .route-node:focus-visible { outline: 2px solid #eef1ff; outline-offset: 5px; }
@keyframes r3-route-ready {
  0%, 100% { filter: brightness(0.96); }
  50% { filter: brightness(1.28); }
}
#${WRAP_ID} .route-hotkey {
  position: absolute; top: -8px; left: -8px; min-width: 20px; height: 20px;
  padding: 0 4px; box-sizing: border-box; border-radius: 6px;
  color: ${UI_COLOR.ink}; background: var(--room-color);
  font: 800 11px/20px ${UI_FONT.mono};
}
#${WRAP_ID} .route-ready-label {
  position: absolute; left: 50%; top: -25px; transform: translateX(-50%);
  width: max-content; padding: 3px 7px; border-radius: ${UI_RADIUS.pill};
  color: ${UI_COLOR.textBright}; background: rgba(10, 14, 34, 0.96);
  border: 1px solid var(--room-color); font: 800 9px/1 ${UI_FONT.sans};
  letter-spacing: 0.08em;
}
#${WRAP_ID} .route-detail {
  min-height: 72px; margin: 14px auto 0; padding: 11px 16px;
  max-width: 720px; box-sizing: border-box;
  border-top: 1px solid rgba(47, 61, 118, 0.85);
}
#${WRAP_ID} .route-detail-state {
  font: 800 10px/1 ${UI_FONT.mono}; letter-spacing: 0.16em; color: ${UI_COLOR.accent};
}
#${WRAP_ID} .route-detail-title {
  margin-top: 5px; font-family: ${UI_FONT.serif}; font-size: 17px;
  font-weight: 800; color: ${UI_COLOR.textBright};
}
#${WRAP_ID} .route-detail-description {
  margin-top: 4px; font-size: 12.5px; line-height: 1.45; color: ${UI_COLOR.textSoft};
}
#${WRAP_ID} .route-detail-reward {
  margin-left: 8px; color: ${UI_COLOR.warm}; white-space: nowrap;
}
#${WRAP_ID} .route-hint { margin-top: 6px; font-size: 11.5px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .route-hint b { color: ${UI_COLOR.textSoft}; }
@media (max-width: 720px) {
  #${WRAP_ID} { padding: 10px; }
  #${WRAP_ID} .route-panel { padding: 18px 12px 13px; }
  #${WRAP_ID} .route-map { height: 340px; }
  #${WRAP_ID} .route-node { width: 40px; height: 40px; font-size: 9px; }
  #${WRAP_ID} .route-node.current { width: 47px; height: 47px; }
  #${WRAP_ID} .route-node.selectable { width: 51px; height: 51px; }
}
@media (prefers-reduced-motion: reduce) {
  #${WRAP_ID}, #${WRAP_ID} .route-node, #${WRAP_ID} .route-edge.available {
    transition: none; animation: none;
  }
}
`;

function ensureDom(): HTMLElement {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  let wrap = document.getElementById(WRAP_ID);
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = WRAP_ID;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', '다음 경로 선택');
    document.body.appendChild(wrap);
  }
  return wrap;
}

let activeCleanup: (() => void) | null = null;

export function isRoomChoiceOverlayOpen(): boolean {
  return activeCleanup !== null;
}

function cloneModel(model: MinimapModel): MinimapModel {
  return {
    nodes: model.nodes.map((node) => ({ ...node })),
    edges: model.edges.map((edge) => ({ ...edge })),
  };
}

function validateRequest(request: RoomChoiceRequest): Error | null {
  if (request.map.nodes.length === 0) {
    return new Error('room choice overlay requires a non-empty map');
  }
  if (request.options.length === 0) {
    return new Error('room choice overlay requires at least one option');
  }
  if (new Set(request.map.nodes.map((node) => node.id)).size !== request.map.nodes.length) {
    return new Error('room choice overlay requires unique map node ids');
  }
  if (new Set(request.options.map((option) => option.nodeId)).size !== request.options.length) {
    return new Error('room choice overlay requires unique option node ids');
  }
  const nodesById = new Map(request.map.nodes.map((node) => [node.id, node] as const));
  for (const option of request.options) {
    const node = nodesById.get(option.nodeId);
    if (!node || node.kind !== option.kind) {
      return new Error(`room choice option must match a map node: ${option.nodeId}`);
    }
  }
  return null;
}

function nodeStateLabel(node: MinimapNode, selectable: boolean): string {
  if (selectable) return '이동 가능';
  if (node.status === 'current') return '현재 위치';
  if (node.status === 'cleared') return '지나온 방';
  return '경로 정보';
}

function nodeShapeClass(kind: MapNodeKind): string {
  if (kind === 'stage-boss' || kind === 'memory-boss') return 'boss';
  if (kind === 'treasure' || kind === 'altar' || kind === 'trap') return 'special';
  return '';
}

/**
 * 전체 경로를 표시하고, 현재 위치에서 이동 가능한 노드 하나를 반환한다.
 *
 * 모든 노드는 설명 확인이 가능하지만 options에 포함된 노드만 클릭·숫자키·방향키
 * 선택 대상이다. 취소 경로는 두지 않아 다음 방을 고르기 전 런이 진행되지 않는다.
 */
export function showRoomChoices(
  request: RoomChoiceRequest,
): Promise<RoomChoiceOption> {
  const error = validateRequest(request);
  if (error) return Promise.reject(error);
  if (activeCleanup) throw new Error('room choice overlay already open');

  const model = cloneModel(request.map);
  const nodesById = new Map(model.nodes.map((node) => [node.id, node] as const));
  const points = new Map(minimapLayout(model).map((point) => [point.id, point] as const));
  const shown = request.options
    .map((option) => ({ ...option }))
    .sort((a, b) => {
      const aPoint = points.get(a.nodeId)!;
      const bPoint = points.get(b.nodeId)!;
      return aPoint.y - bPoint.y || aPoint.x - bPoint.x;
    });
  const optionById = new Map(shown.map((option, index) => [option.nodeId, { option, index }] as const));
  const wrap = ensureDom();
  wrap.innerHTML = `
    <div class="route-panel">
      <div class="route-kicker">ROUTE SELECTION</div>
      <div class="route-title">다음 목적지를 선택하라</div>
      <div class="route-subtitle">전체 경로는 공개됩니다 · 발광하는 방으로만 이동할 수 있습니다</div>
      <div class="route-map">
        <svg class="route-edges" aria-hidden="true"></svg>
        <div class="route-nodes"></div>
      </div>
      <div class="route-detail" aria-live="polite">
        <div class="route-detail-state"></div>
        <div class="route-detail-title"></div>
        <div class="route-detail-description"></div>
      </div>
      <div class="route-hint"><b>숫자키</b> 또는 <b>↑↓ + Enter</b> · 발광하는 노드 클릭</div>
    </div>`;

  const svg = wrap.querySelector<SVGSVGElement>('.route-edges')!;
  const nodesEl = wrap.querySelector<HTMLElement>('.route-nodes')!;
  const stateEl = wrap.querySelector<HTMLElement>('.route-detail-state')!;
  const titleEl = wrap.querySelector<HTMLElement>('.route-detail-title')!;
  const descriptionEl = wrap.querySelector<HTMLElement>('.route-detail-description')!;
  const currentNodeId = model.nodes.find((node) => node.status === 'current')?.id ?? null;

  for (const edge of model.edges) {
    const from = points.get(edge.from);
    const to = points.get(edge.to);
    if (!from || !to) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', `${(from.x / MINIMAP_CONFIG.width) * 100}%`);
    line.setAttribute('y1', `${(from.y / MINIMAP_CONFIG.height) * 100}%`);
    line.setAttribute('x2', `${(to.x / MINIMAP_CONFIG.width) * 100}%`);
    line.setAttribute('y2', `${(to.y / MINIMAP_CONFIG.height) * 100}%`);
    const walked = nodesById.get(edge.from)?.status === 'cleared'
      && ['cleared', 'current'].includes(nodesById.get(edge.to)?.status ?? '');
    const available = edge.from === currentNodeId && optionById.has(edge.to);
    line.setAttribute(
      'class',
      `route-edge${walked ? ' walked' : ''}${available ? ' available' : ''}`,
    );
    svg.appendChild(line);
  }

  return new Promise<RoomChoiceOption>((resolve) => {
    let focusIndex = 0;
    const selectableButtons = new Map<number, HTMLButtonElement>();

    const cleanup = (): void => {
      window.removeEventListener('keydown', onKeyDown, true);
      wrap.classList.remove('active');
      activeCleanup = null;
      window.setTimeout(() => {
        if (!wrap.classList.contains('active')) wrap.innerHTML = '';
      }, 180);
    };

    const finish = (index: number): void => {
      cleanup();
      resolve(shown[index]);
    };

    const showDetail = (node: MinimapNode): void => {
      const selectable = optionById.get(node.id);
      const presentation = roomChoicePresentation(node.kind);
      stateEl.textContent = nodeStateLabel(node, selectable !== undefined);
      stateEl.style.color = selectable ? presentation.color : UI_COLOR.accent;
      titleEl.textContent = presentation.label;
      descriptionEl.textContent = presentation.description;
      if (selectable?.option.rewardHint) {
        const reward = document.createElement('span');
        reward.className = 'route-detail-reward';
        reward.textContent = `· ${selectable.option.rewardHint}`;
        descriptionEl.appendChild(reward);
      }
    };

    const setFocus = (index: number): void => {
      focusIndex = Math.min(Math.max(index, 0), shown.length - 1);
      selectableButtons.forEach((button, i) => button.classList.toggle('focused', i === focusIndex));
      const button = selectableButtons.get(focusIndex);
      if (!button) return;
      button.focus({ preventScroll: true });
      const node = nodesById.get(shown[focusIndex].nodeId);
      if (node) showDetail(node);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      const hotkey = Number.parseInt(event.key, 10) - 1;
      if (Number.isInteger(hotkey) && hotkey >= 0 && hotkey < shown.length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(hotkey);
        return;
      }
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setFocus(nextRoomChoiceFocusIndex(
          focusIndex,
          event.key === 'ArrowDown' ? 1 : -1,
          shown.length,
        ));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(focusIndex);
      }
    };

    for (const node of model.nodes) {
      const point = points.get(node.id);
      if (!point) continue;
      const selectable = optionById.get(node.id);
      const presentation = roomChoicePresentation(node.kind);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = [
        'route-node',
        node.status,
        nodeShapeClass(node.kind),
        selectable ? 'selectable' : '',
      ].filter(Boolean).join(' ');
      button.style.left = `${(point.x / MINIMAP_CONFIG.width) * 100}%`;
      button.style.top = `${(point.y / MINIMAP_CONFIG.height) * 100}%`;
      button.style.setProperty('--room-color', presentation.color);
      button.setAttribute('aria-label', `${nodeStateLabel(node, selectable !== undefined)}: ${presentation.label}`);
      button.setAttribute('aria-disabled', selectable ? 'false' : 'true');
      button.tabIndex = selectable ? 0 : -1;

      const label = document.createElement('span');
      label.textContent = presentation.label;
      button.appendChild(label);

      if (selectable) {
        const hotkey = document.createElement('span');
        hotkey.className = 'route-hotkey';
        hotkey.textContent = String(selectable.index + 1);
        button.appendChild(hotkey);

        const ready = document.createElement('span');
        ready.className = 'route-ready-label';
        ready.textContent = '이동 가능';
        button.appendChild(ready);

        button.addEventListener('click', () => finish(selectable.index));
        button.addEventListener('focus', () => showDetail(node));
        selectableButtons.set(selectable.index, button);
      }
      button.addEventListener('mouseenter', () => showDetail(node));
      nodesEl.appendChild(button);
    }

    window.addEventListener('keydown', onKeyDown, true);
    activeCleanup = cleanup;

    let activated = false;
    const activate = (): void => {
      if (activated) return;
      activated = true;
      wrap.classList.add('active');
      setFocus(0);
    };
    requestAnimationFrame(activate);
    window.setTimeout(activate, 60);
  });
}
