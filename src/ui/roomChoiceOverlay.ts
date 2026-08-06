import type {
  MapNodeKind,
  MinimapModel,
  MinimapNode,
} from '../run/mapGraphContract';
import { MINIMAP_CONFIG, minimapLayout } from './minimapLayout';
import { scheduleOverlayActivation } from './overlayActivation';
import { UI_COLOR, UI_FONT, UI_LAYER, UI_ROOM } from './uiTokens';
import {
  cornerFlourish, divider, ornamentCss,
} from './grimoireOrnament';
import { roomIconDataUri } from './roomKindIcon';
import {
  currentMinimapStage,
  minimapStages,
  projectMinimapStage,
} from './minimapStageProjection';

/**
 * 다음 방 선택 UI의 입력 계약.
 *
 * map은 전체 경로 표시, options는 현재 위치에서 실제로 이동 가능한 노드만 담당한다.
 * UI는 전체 지도를 보여주되 options 밖의 노드를 선택 결과로 반환하지 않는다.
 */
export interface RoomChoiceOption {
  nodeId: string;
  kind: MapNodeKind;
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

export type RoomRouteMetricValue = 0 | 1 | 2 | 3 | '?' | 'none' | null;

export interface RoomRouteMetrics {
  risk: RoomRouteMetricValue;
  reward: RoomRouteMetricValue;
}

const ROOM_ROUTE_METRICS: Record<MapNodeKind, RoomRouteMetrics> = {
  start: { risk: null, reward: null },
  combat: { risk: 1, reward: 1 },
  elite: { risk: 2, reward: 2 },
  trap: { risk: 2, reward: 2 },
  treasure: { risk: 0, reward: 1 },
  altar: { risk: '?', reward: '?' },
  'stage-boss': { risk: 3, reward: 1 },
  'memory-boss': { risk: 3, reward: 'none' },
};

export function roomRouteMetrics(kind: MapNodeKind): RoomRouteMetrics {
  return ROOM_ROUTE_METRICS[kind];
}

const ROOM_PRESENTATION: Record<MapNodeKind, RoomChoicePresentation> = {
  start: {
    label: '시작',
    color: UI_COLOR.accent,
    description: '이번 여정이 시작된 방이다.',
  },
  combat: {
    label: '일반방',
    color: UI_ROOM.combat,
    description: '기본 적과 싸우며 주문 친화도와 표준 보상을 쌓는다.',
  },
  elite: {
    label: '정예방',
    color: UI_ROOM.elite,
    description: '강화된 적이 기다린다. 더 위험하지만 보상도 크다.',
  },
  'stage-boss': {
    label: '수문장',
    color: UI_ROOM.boss,
    description: '다음 구역으로 향하는 길을 막는 강적이다.',
  },
  'memory-boss': {
    label: '기억의 주인',
    color: UI_ROOM.boss,
    description: '이번 여정의 마지막에서 플레이어의 주문을 기억해 맞선다.',
  },
  treasure: {
    label: '보물방',
    color: UI_ROOM.treasure,
    description: '전투 없이 안전하게 보상을 고르지만 성장 기회는 적다.',
  },
  altar: {
    label: '제단방',
    color: UI_ROOM.altar,
    description: '최대 체력을 대가로 상급 힘을 얻거나 거래를 거절한다.',
  },
  trap: {
    label: '함정방',
    color: UI_ROOM.trap,
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

/**
 * 경로 이동 입력 — **게임 이동키와 같은 W/S** (R2, #306).
 *
 * 보상 카드가 가로로 놓여 A/D를 쓰는 것과 달리, 경로는 지도 위에 세로로 놓이므로
 * W/S다. 좌우 키는 여기서 무시한다.
 *
 * ⚠️ `code`를 보는 이유는 `rewardCardFocusDirection`과 같다 — 한글 IME.
 */
export function roomChoiceFocusDirection(
  input: Pick<KeyboardEvent, 'code' | 'key'>,
): -1 | 0 | 1 {
  if (input.code === 'KeyW') return -1;
  if (input.code === 'KeyS') return 1;
  return 0;
}

const STYLE_ID = 'r3-room-choice-style';
const WRAP_ID = 'r3-room-choice-wrap';
const ROUTE_MAP_VERTICAL_GUTTER = 24;
const ROUTE_MAP_VIEW_HEIGHT = MINIMAP_CONFIG.height + ROUTE_MAP_VERTICAL_GUTTER * 2;

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: ${UI_LAYER.reward};
  display: grid; place-items: center; box-sizing: border-box; padding: 22px;
  background:
    radial-gradient(ellipse at 50% 44%, rgba(91, 67, 111, 0.2), transparent 43%),
    radial-gradient(circle at 18% 20%, rgba(154, 116, 71, 0.08), transparent 26%),
    linear-gradient(rgba(8, 5, 12, 0.9), rgba(4, 3, 8, 0.98));
  backdrop-filter: blur(4px) saturate(0.78);
  opacity: 0; visibility: hidden; transition: opacity 240ms ease;
  font-family: ${UI_FONT.serif}; color: #ded3bc;
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
${ornamentCss(WRAP_ID)}
#${WRAP_ID} .route-panel {
  --orn: ${UI_COLOR.accent};
  position: relative; width: min(1080px, calc(100vw - 32px));
  padding: 28px 30px 20px; box-sizing: border-box; overflow: hidden;
  border: 1px solid rgba(179, 151, 99, 0.46);
  border-radius: 22px 18px 24px 17px;
  background:
    radial-gradient(circle at 12% 22%, rgba(137, 102, 69, 0.11), transparent 31%),
    radial-gradient(circle at 88% 74%, rgba(95, 65, 114, 0.14), transparent 36%),
    repeating-linear-gradient(102deg, transparent 0 54px, rgba(218, 193, 149, 0.012) 55px 56px),
    linear-gradient(150deg, rgba(24, 17, 28, 0.985), rgba(10, 8, 15, 0.995));
  box-shadow:
    0 28px 100px rgba(0, 0, 0, 0.8),
    inset 0 0 0 4px rgba(10, 7, 13, 0.72),
    inset 0 0 65px rgba(166, 123, 76, 0.045);
  text-align: center;
}
#${WRAP_ID} .route-panel::before,
#${WRAP_ID} .route-panel::after {
  content: '✦'; position: absolute; top: 18px;
  width: 44px; height: 44px; display: grid; place-items: center;
  border: 1px solid rgba(216, 187, 114, 0.22); border-radius: 50%;
  color: rgba(216, 187, 114, 0.52); font: 15px/1 ${UI_FONT.serif};
  box-shadow: inset 0 2px 18px rgba(216, 187, 114, 0.06);
}
#${WRAP_ID} .route-panel::before { left: 22px; }
#${WRAP_ID} .route-panel::after { right: 22px; }
#${WRAP_ID} .route-kicker {
  font: 600 12px/1 ${UI_FONT.serif}; letter-spacing: 0.22em; color: #b79a68;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.7);
}
#${WRAP_ID} .route-title {
  margin: 8px 0 5px; font-family: ${UI_FONT.serif}; font-size: 27px;
  font-weight: 700; color: #eee3cc; letter-spacing: 0.04em;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.72);
}
#${WRAP_ID} .route-subtitle {
  margin-bottom: 10px; font: 12px/1.5 ${UI_FONT.serif}; color: #91869a;
}
#${WRAP_ID} .route-stage-tabs {
  display: flex; justify-content: center; gap: 8px; margin: 0 0 10px;
}
#${WRAP_ID} .route-stage-tab {
  min-width: 104px; padding: 7px 14px; border: 1px solid rgba(151, 129, 157, 0.42);
  border-radius: 999px; background: rgba(20, 15, 24, 0.78); color: #8f8498;
  font: 700 11px/1 ${UI_FONT.serif}; letter-spacing: 0.1em; cursor: pointer;
}
#${WRAP_ID} .route-stage-tab.viewing {
  border-color: rgba(216, 187, 114, 0.78); color: #ead9ad;
  box-shadow: 0 2px 10px rgba(216, 187, 114, 0.12);
}
#${WRAP_ID} .route-stage-tab.current::after {
  content: ' 현재'; color: ${UI_COLOR.accent}; font-size: 8px; letter-spacing: 0;
}
#${WRAP_ID} .route-map {
  position: relative; width: 100%; height: clamp(310px, 49vh, 500px);
  border: 1px solid rgba(157, 128, 87, 0.34); border-radius: 18px 14px 20px 15px;
  background:
    radial-gradient(ellipse at center, rgba(82, 58, 93, 0.23), transparent 58%),
    radial-gradient(circle at 18% 32%, rgba(155, 112, 65, 0.08), transparent 24%),
    radial-gradient(circle at 77% 62%, rgba(115, 80, 126, 0.08), transparent 28%),
    linear-gradient(145deg, rgba(14, 10, 18, 0.94), rgba(6, 5, 10, 0.98));
  box-shadow: inset 0 2px 55px rgba(0, 0, 0, 0.58), inset 0 0 0 3px rgba(7, 5, 10, 0.38);
  overflow: hidden;
}
#${WRAP_ID} .route-map::before {
  content: ''; position: absolute; width: min(40vw, 390px); aspect-ratio: 1;
  left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-8deg);
  border: 1px solid rgba(181, 151, 103, 0.07); border-radius: 50%;
  background:
    radial-gradient(circle, transparent 0 28%, rgba(181, 151, 103, 0.055) 28.4% 28.8%, transparent 29.2% 43%, rgba(181, 151, 103, 0.04) 43.4% 43.8%, transparent 44.2%),
    repeating-conic-gradient(from 8deg, rgba(181, 151, 103, 0.045) 0 1deg, transparent 1deg 30deg);
  opacity: 0.78; pointer-events: none;
}
#${WRAP_ID} .route-map::after {
  content: '✦　·　☾　·　✧　·　☽　·　✦';
  position: absolute; left: 50%; bottom: 11px; transform: translateX(-50%);
  color: rgba(190, 159, 108, 0.13); font: 12px/1 ${UI_FONT.serif};
  letter-spacing: 0.24em; white-space: nowrap; pointer-events: none;
}
#${WRAP_ID} .route-edges {
  position: absolute; inset: 0; z-index: 1; width: 100%; height: 100%; overflow: visible;
}
#${WRAP_ID} .route-edge {
  fill: none; stroke: #81728b; stroke-width: 1.35; vector-effect: non-scaling-stroke;
  stroke-linecap: round; opacity: 0.64;
}
#${WRAP_ID} .route-edge.walked {
  stroke: #a78d5f; stroke-width: 1.8; opacity: 0.82;
  filter: drop-shadow(0 0 3px rgba(176, 143, 82, 0.3));
}
#${WRAP_ID} .route-edge.available {
  stroke: ${UI_COLOR.accent}; stroke-width: 2.2; opacity: 0.92;
  filter: drop-shadow(0 0 6px rgba(216, 187, 114, 0.66));
  animation: r3-route-flow 2.4s ease-in-out infinite;
}
@keyframes r3-route-flow {
  0%, 100% { opacity: 0.55; }
  50% { opacity: 1; }
}
#${WRAP_ID} .route-nodes { position: absolute; inset: 0; z-index: 2; }
#${WRAP_ID} .route-node {
  --room-color: ${UI_ROOM.combat};
  position: absolute; transform: translate(-50%, -50%);
  width: 58px; height: 58px; padding: 0;
  border: 1px solid color-mix(in srgb, var(--room-color) 68%, #594f61);
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--room-color) 9%, #211824) 0 58%, #0d0a10 76%);
  color: var(--room-color); font: 700 10px/1.08 ${UI_FONT.serif};
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 1px; cursor: default;
  opacity: 0.66;
  box-shadow: 0 2px 7px rgba(0, 0, 0, 0.42), inset 0 2px 10px rgba(0, 0, 0, 0.52);
  transition: transform 180ms ease, opacity 180ms ease, box-shadow 180ms ease,
    border-color 180ms ease, filter 180ms ease;
}
#${WRAP_ID} .route-node::before,
#${WRAP_ID} .route-node::after {
  content: ''; position: absolute; inset: -6px; border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--room-color) 42%, transparent);
  opacity: 0; pointer-events: none;
}
#${WRAP_ID} .route-node::after { display: none; }
#${WRAP_ID} .route-node.current::before,
#${WRAP_ID} .route-node.selectable::before { opacity: 0.72; }
#${WRAP_ID} .route-node.selectable::before {
  inset: -7px; border: 1.5px solid rgba(216, 187, 114, 0.82); opacity: 0.9;
  box-shadow: 0 2px 8px rgba(216, 187, 114, 0.2);
}
#${WRAP_ID} .route-node.special,
#${WRAP_ID} .route-node.boss { border-radius: 50%; clip-path: none; }
#${WRAP_ID} .route-node.cleared {
  opacity: 0.48; border-color: #6f674f; color: #8f8565; filter: saturate(0.48);
}
#${WRAP_ID} .route-node.current {
  width: 62px; height: 62px; opacity: 1; color: ${UI_COLOR.accent}; border-color: ${UI_COLOR.accent};
  box-shadow:
    0 2px 12px rgba(216, 187, 114, 0.18),
    0 3px 9px rgba(0, 0, 0, 0.5), inset 0 2px 14px rgba(216, 187, 114, 0.08);
}
#${WRAP_ID} .route-node.selectable {
  width: 68px; height: 68px; opacity: 1; cursor: pointer;
  border-width: 2px;
  border-color: color-mix(in srgb, var(--room-color) 66%, #d8bb72);
  background: radial-gradient(circle, color-mix(in srgb, var(--room-color) 18%, #251a29) 0 58%, #0c090f 78%);
  box-shadow:
    0 2px 17px color-mix(in srgb, var(--room-color) 28%, rgba(216, 187, 114, 0.15)),
    0 4px 12px rgba(0, 0, 0, 0.55), inset 0 2px 15px color-mix(in srgb, var(--room-color) 12%, transparent);
  animation: r3-route-ready 2.2s ease-in-out infinite;
}
#${WRAP_ID} .route-node.selectable:hover,
#${WRAP_ID} .route-node.selectable.focused {
  transform: translate(-50%, -50%) scale(1.09);
  box-shadow:
    0 2px 17px color-mix(in srgb, var(--room-color) 32%, transparent),
    0 6px 16px rgba(0, 0, 0, 0.6),
    inset 0 2px 22px color-mix(in srgb, var(--room-color) 15%, transparent);
}
#${WRAP_ID} .route-node:not(.selectable):not(.current):hover {
  transform: translate(-50%, -50%) scale(1.06);
  opacity: 0.68;
  border-color: color-mix(in srgb, var(--room-color) 82%, #8f7f91);
  filter: brightness(1.2) saturate(0.9);
  box-shadow:
    0 2px 10px color-mix(in srgb, var(--room-color) 16%, transparent),
    0 4px 11px rgba(0, 0, 0, 0.52),
    inset 0 2px 18px color-mix(in srgb, var(--room-color) 10%, transparent);
}
#${WRAP_ID} .route-room-icon {
  width: 55%; height: 55%; flex: 0 0 auto; display: block; object-fit: contain;
  pointer-events: none; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--room-color) 52%, transparent)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.82));
}
#${WRAP_ID} .route-node.boss .route-room-icon { width: 60%; height: 60%; }
#${WRAP_ID} .route-node.boss { width: 66px; height: 66px; border-width: 2px; }
#${WRAP_ID} .route-node.boss:not(.cleared) { opacity: 0.68; }
#${WRAP_ID} .route-node.boss.selectable { width: 72px; height: 72px; opacity: 1; }
#${WRAP_ID} .route-room-name {
  position: static; width: 92%; max-width: 92%; pointer-events: none;
  color: color-mix(in srgb, var(--room-color) 82%, #e8dfcf);
  font: 700 10px/1 ${UI_FONT.serif}; letter-spacing: -0.02em;
  overflow: hidden; white-space: nowrap; text-overflow: clip; text-align: center;
  text-shadow: 0 1px 3px ${UI_ROOM.routeShadow}, 0 2px 5px ${UI_ROOM.routeShadow};
}
#${WRAP_ID} .route-node.selectable .route-room-name { font-size: 11px; }
#${WRAP_ID} .route-node:not(:has(.route-room-icon)) .route-room-name { font-size: 10px; }
#${WRAP_ID} .route-node.cleared .route-room-name { color: #8f8565; }
#${WRAP_ID} .route-node-metrics {
  position: absolute; top: calc(100% + 8px); left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  width: 46px; min-height: 25px; padding: 3px 4px; box-sizing: border-box;
  border: 1px solid rgba(132, 115, 139, 0.2); border-radius: 6px;
  background: rgba(10, 7, 12, 0.72); box-shadow: 0 2px 6px rgba(0, 0, 0, 0.42);
  pointer-events: none; white-space: nowrap; filter: none;
}
#${WRAP_ID} .route-node.dense-choice .route-node-metrics {
  top: 50%; left: calc(100% + 10px); transform: translateY(-50%);
}
#${WRAP_ID} .route-node-metric {
  width: 38px; height: 8px; display: inline-flex; align-items: center; gap: 4px;
  font: 700 9px/1 ${UI_FONT.serif}; text-shadow: 0 1px 3px ${UI_ROOM.routeShadow}, 0 2px 4px ${UI_ROOM.routeShadow};
}
#${WRAP_ID} .route-node-metric.risk { color: ${UI_ROOM.routeRisk}; }
#${WRAP_ID} .route-node-metric.reward { color: ${UI_COLOR.accent}; }
#${WRAP_ID} .route-metric-icon {
  width: 10px; height: 10px; display: block; overflow: visible;
  filter: drop-shadow(0 0 2px currentColor) drop-shadow(0 1px 1px #050308);
}
#${WRAP_ID} .route-metric-slots { display: inline-flex; align-items: center; gap: 2px; }
#${WRAP_ID} .route-metric-slot {
  width: 5px; height: 5px; box-sizing: border-box; border: 1px solid currentColor;
  border-radius: 1px; opacity: 0.26;
}
#${WRAP_ID} .route-metric-slot.filled {
  background: currentColor; opacity: 0.95; box-shadow: 0 1px 3px currentColor;
}
#${WRAP_ID} .route-metric-zero,
#${WRAP_ID} .route-metric-unknown,
#${WRAP_ID} .route-metric-none { width: 19px; text-align: center; }
#${WRAP_ID} .route-metric-unknown { font-size: 9px; letter-spacing: 2px; }
#${WRAP_ID} .route-metric-none { font-size: 10px; opacity: 0.65; }
#${WRAP_ID} .route-metric-legend {
  position: absolute; z-index: 3; right: 18px; top: 14px;
  display: flex; gap: 12px; color: #827889;
  font: 700 9px/1 ${UI_FONT.serif}; letter-spacing: 0.04em; pointer-events: none;
}
#${WRAP_ID} .route-metric-legend .risk { color: ${UI_ROOM.routeRisk}; }
#${WRAP_ID} .route-metric-legend .reward { color: ${UI_COLOR.accent}; }
#${WRAP_ID} .route-metric-legend > span { display: inline-flex; align-items: center; gap: 4px; }
#${WRAP_ID} .route-metric-legend .route-metric-icon { width: 11px; height: 11px; }
#${WRAP_ID} .route-node:focus-visible {
  outline: 1px solid #ead9ad; outline-offset: 12px;
}
@keyframes r3-route-ready {
  0%, 100% { filter: brightness(0.92); }
  50% { filter: brightness(1.18); }
}
#${WRAP_ID} .route-hotkey {
  position: absolute; top: -9px; left: -9px; width: 22px; height: 22px;
  box-sizing: border-box; border: 1px solid ${UI_COLOR.accent}; border-radius: 50%;
  color: ${UI_COLOR.ink}; background: ${UI_COLOR.accent};
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  font: 800 11px/20px ${UI_FONT.serif};
}
#${WRAP_ID} .route-detail {
  position: relative; min-height: 76px; margin: 16px auto 0; padding: 14px 32px 10px;
  max-width: 720px; box-sizing: border-box;
}
#${WRAP_ID} .route-detail::before {
  content: '—　✦　—'; position: absolute; left: 50%; top: -8px;
  transform: translateX(-50%); color: rgba(184, 153, 103, 0.42);
  font: 10px/1 ${UI_FONT.serif}; letter-spacing: 0.2em;
}
#${WRAP_ID} .route-detail-state {
  font: 700 10px/1 ${UI_FONT.serif}; letter-spacing: 0.18em; color: #b89a67;
}
#${WRAP_ID} .route-detail-title {
  margin-top: 6px; font-family: ${UI_FONT.serif}; font-size: 18px;
  font-weight: 700; color: #eadfc8;
}
#${WRAP_ID} .route-detail-description {
  margin-top: 4px; font: 12.5px/1.55 ${UI_FONT.serif}; color: #a99dac;
}
#${WRAP_ID} .route-hint {
  margin-top: 7px; font: 11.5px/1.4 ${UI_FONT.serif}; color: #776e7e;
}
#${WRAP_ID} .route-hint b { color: #ad9eae; font-weight: 700; }
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

/** 다음 방 선택 화면은 현재 방보다 실제 선택지가 속한 스테이지를 우선 표시한다. */
export function roomChoiceTargetStage(
  model: MinimapModel,
  options: readonly RoomChoiceOption[],
): number {
  const firstOptionNode = model.nodes.find((node) => node.id === options[0]?.nodeId);
  return typeof firstOptionNode?.stage === 'number' && Number.isFinite(firstOptionNode.stage)
    ? firstOptionNode.stage
    : currentMinimapStage(model);
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
  const currentStage = currentMinimapStage(model);
  const choiceStage = roomChoiceTargetStage(model, request.options);
  const stages = minimapStages(model);
  const initialStageModel = projectMinimapStage(model, choiceStage);
  const sortPoints = new Map(minimapLayout(initialStageModel).map((point) => [point.id, point] as const));
  const shown = request.options
    .map((option) => ({ ...option }))
    .sort((a, b) => {
      const aPoint = sortPoints.get(a.nodeId)!;
      const bPoint = sortPoints.get(b.nodeId)!;
      return aPoint.y - bPoint.y || aPoint.x - bPoint.x;
    });
  const optionById = new Map(shown.map((option, index) => [option.nodeId, { option, index }] as const));
  const wrap = ensureDom();
  wrap.innerHTML = `
    <div class="route-panel">
      ${cornerFlourish().replace('orn-corner', 'orn-corner tl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner tr')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner bl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner br')}
      <div class="route-kicker">운명의 갈림길</div>
      <div class="route-title">다음 길을 선택하라</div>
      ${divider()}
      <div class="route-subtitle">드러난 운명의 흐름 속에서 빛이 깃든 방으로 나아갈 수 있습니다</div>
      <div class="route-stage-tabs" role="tablist" aria-label="스테이지 지도"></div>
      <div class="route-map">
        <div class="route-metric-legend" aria-hidden="true">
          <span class="risk">${routeMetricIconMarkup('risk')}위험</span>
          <span class="reward">${routeMetricIconMarkup('reward')}보상</span>
        </div>
        <svg class="route-edges" aria-hidden="true"></svg>
        <div class="route-nodes"></div>
      </div>
      <div class="route-detail" aria-live="polite">
        <div class="route-detail-state"></div>
        <div class="route-detail-title"></div>
        <div class="route-detail-description"></div>
      </div>
      <div class="route-hint"><b>W/S + Enter</b> · 숫자키 또는 빛나는 인장 선택</div>
    </div>`;

  const svg = wrap.querySelector<SVGSVGElement>('.route-edges')!;
  const nodesEl = wrap.querySelector<HTMLElement>('.route-nodes')!;
  const tabsEl = wrap.querySelector<HTMLElement>('.route-stage-tabs')!;
  const stateEl = wrap.querySelector<HTMLElement>('.route-detail-state')!;
  const titleEl = wrap.querySelector<HTMLElement>('.route-detail-title')!;
  const descriptionEl = wrap.querySelector<HTMLElement>('.route-detail-description')!;
  const currentNodeId = model.nodes.find((node) => node.status === 'current')?.id ?? null;
  svg.setAttribute(
    'viewBox',
    `0 ${-ROUTE_MAP_VERTICAL_GUTTER} ${MINIMAP_CONFIG.width} ${ROUTE_MAP_VIEW_HEIGHT}`,
  );
  svg.setAttribute('preserveAspectRatio', 'none');

  return new Promise<RoomChoiceOption>((resolve) => {
    let focusIndex = 0;
    let viewedStage = choiceStage;
    const selectableButtons = new Map<number, HTMLButtonElement>();

    let activation: { cancel(): void } | null = null;
    const cleanup = (): void => {
      activation?.cancel();
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
      const focusDirection = roomChoiceFocusDirection(event);
      if (focusDirection !== 0) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (viewedStage !== choiceStage) {
          renderStage(choiceStage);
          setFocus(focusIndex);
          return;
        }
        setFocus(nextRoomChoiceFocusIndex(
          focusIndex,
          focusDirection,
          shown.length,
        ));
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (viewedStage !== choiceStage) {
          renderStage(choiceStage);
          setFocus(focusIndex);
          return;
        }
        finish(focusIndex);
      }
    };

    const renderStage = (stage: number): void => {
      viewedStage = stage;
      const stageModel = projectMinimapStage(model, stage);
      const stageNodesById = new Map(stageModel.nodes.map((node) => [node.id, node] as const));
      const points = new Map(minimapLayout(stageModel).map((point) => [point.id, point] as const));
      const selectableLayerCounts = new Map<number, number>();
      if (stage === choiceStage) {
        for (const node of stageModel.nodes) {
          if (!optionById.has(node.id)) continue;
          selectableLayerCounts.set(node.layer, (selectableLayerCounts.get(node.layer) ?? 0) + 1);
        }
      }
      svg.replaceChildren();
      nodesEl.replaceChildren();
      tabsEl.replaceChildren();
      selectableButtons.clear();

      for (const tabStage of stages) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = [
          'route-stage-tab',
          tabStage === viewedStage ? 'viewing' : '',
          tabStage === currentStage ? 'current' : '',
        ].filter(Boolean).join(' ');
        tab.textContent = `STAGE ${tabStage}`;
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(tabStage === viewedStage));
        tab.addEventListener('click', () => {
          renderStage(tabStage);
          if (tabStage === choiceStage) setFocus(focusIndex);
          else {
            const firstNode = projectMinimapStage(model, tabStage).nodes.at(0);
            if (firstNode) showDetail(firstNode);
          }
        });
        tabsEl.appendChild(tab);
      }

      for (const edge of stageModel.edges) {
        const from = points.get(edge.from);
        const to = points.get(edge.to);
        if (!from || !to) continue;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const deltaX = to.x - from.x;
        path.setAttribute(
          'd',
          `M ${from.x} ${from.y} C ${from.x + deltaX * 0.38} ${from.y}, ${from.x + deltaX * 0.62} ${to.y}, ${to.x} ${to.y}`,
        );
        const walked = stageNodesById.get(edge.from)?.status === 'cleared'
          && ['cleared', 'current'].includes(stageNodesById.get(edge.to)?.status ?? '');
        const available = stage === choiceStage
          && edge.from === currentNodeId && optionById.has(edge.to);
        path.setAttribute(
          'class',
          `route-edge${walked ? ' walked' : ''}${available ? ' available' : ''}`,
        );
        svg.appendChild(path);
      }

      for (const node of stageModel.nodes) {
        const point = points.get(node.id);
        if (!point) continue;
        const selectable = stage === choiceStage ? optionById.get(node.id) : undefined;
        const presentation = roomChoicePresentation(node.kind);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = [
          'route-node', node.status, nodeShapeClass(node.kind), selectable ? 'selectable' : '',
          selectable && (selectableLayerCounts.get(node.layer) ?? 0) >= 3 ? 'dense-choice' : '',
        ].filter(Boolean).join(' ');
        button.style.left = `${(point.x / MINIMAP_CONFIG.width) * 100}%`;
        button.style.top = `${((point.y + ROUTE_MAP_VERTICAL_GUTTER) / ROUTE_MAP_VIEW_HEIGHT) * 100}%`;
        button.style.setProperty('--room-color', presentation.color);
        button.setAttribute('aria-label', `${nodeStateLabel(node, selectable !== undefined)}: ${presentation.label}`);
        button.setAttribute('aria-disabled', selectable ? 'false' : 'true');
        button.tabIndex = selectable ? 0 : -1;

        const iconUri = roomIconDataUri(node.kind);
        if (iconUri) {
          const icon = document.createElement('img');
          icon.className = 'route-room-icon';
          icon.src = iconUri;
          icon.alt = '';
          icon.setAttribute('aria-hidden', 'true');
          button.appendChild(icon);
        }

        const roomName = document.createElement('span');
        roomName.className = 'route-room-name';
        roomName.textContent = presentation.label;
        roomName.setAttribute('aria-hidden', 'true');
        button.appendChild(roomName);

        const metrics = roomRouteMetrics(node.kind);
        const metricsEl = document.createElement('span');
        metricsEl.className = 'route-node-metrics';
        metricsEl.setAttribute('aria-hidden', 'true');
        appendRouteMetric(metricsEl, 'risk', metrics.risk);
        appendRouteMetric(metricsEl, 'reward', metrics.reward);
        if (metricsEl.childElementCount > 0) button.appendChild(metricsEl);

        if (selectable) {
          const hotkey = document.createElement('span');
          hotkey.className = 'route-hotkey';
          hotkey.textContent = String(selectable.index + 1);
          button.appendChild(hotkey);
          button.addEventListener('click', () => finish(selectable.index));
          button.addEventListener('focus', () => showDetail(node));
          selectableButtons.set(selectable.index, button);
        }
        button.addEventListener('mouseenter', () => {
          if (selectable) setFocus(selectable.index);
          else showDetail(node);
        });
        nodesEl.appendChild(button);
      }
    };

    renderStage(choiceStage);

    window.addEventListener('keydown', onKeyDown, true);
    activeCleanup = cleanup;

    // 닫힘이 예약을 이긴다 — 취소하지 않으면 뜨기 전에 닫은 오버레이가 화면에 남는다.
    activation = scheduleOverlayActivation((): void => {
      wrap.classList.add('active');
      setFocus(0);
    });
  });
}

function appendRouteMetric(
  parent: HTMLElement,
  kind: 'risk' | 'reward',
  value: RoomRouteMetricValue,
): void {
  if (value === null) return;
  const metric = document.createElement('span');
  metric.className = `route-node-metric ${kind}`;
  metric.insertAdjacentHTML('beforeend', routeMetricIconMarkup(kind));

  if (typeof value === 'number') {
    const slots = document.createElement('span');
    slots.className = 'route-metric-slots';
    for (let index = 0; index < 3; index += 1) {
      const slot = document.createElement('span');
      slot.className = `route-metric-slot${index < value ? ' filled' : ''}`;
      slots.appendChild(slot);
    }
    metric.appendChild(slots);
  } else {
    const valueEl = document.createElement('span');
    valueEl.className = value === '?' ? 'route-metric-unknown' : 'route-metric-none';
    valueEl.textContent = value === '?' ? '???' : '—';
    metric.appendChild(valueEl);
  }
  parent.appendChild(metric);
}

function routeMetricIconMarkup(kind: 'risk' | 'reward'): string {
  if (kind === 'risk') {
    return `<svg class="route-metric-icon" viewBox="0 0 12 12" aria-hidden="true">
      <path fill="currentColor" d="M6 1C3.24 1 1 3.04 1 5.55c0 1.7.87 2.92 2.2 3.63V11h1.45V9.72h.72V11h1.26V9.72h.72V11H8.8V9.18C10.13 8.47 11 7.25 11 5.55 11 3.04 8.76 1 6 1Z"/>
      <circle cx="4.15" cy="5.55" r="1.05" fill="${UI_ROOM.routeInk}"/>
      <circle cx="7.85" cy="5.55" r="1.05" fill="${UI_ROOM.routeInk}"/>
      <path d="M6 6.65 5.25 7.8h1.5Z" fill="${UI_ROOM.routeInk}"/>
    </svg>`;
  }
  return `<svg class="route-metric-icon" viewBox="0 0 12 12" aria-hidden="true">
    <path fill="currentColor" d="M1.2 4.6h9.6v5.7H1.2z"/>
    <path fill="currentColor" fill-opacity="0.72" d="M2 2h8l.8 2H1.2z"/>
    <path fill="${UI_ROOM.routeInk}" d="M1.2 5.45h9.6v1H1.2z"/>
    <rect x="5" y="5.15" width="2" height="2.7" rx=".35" fill="${UI_ROOM.routeHighlight}"/>
    <path d="M2.1 9.7h7.8" stroke="${UI_ROOM.routeHighlight}" stroke-opacity=".55" stroke-width=".6"/>
  </svg>`;
}
