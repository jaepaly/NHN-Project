
import { UI_COLOR, UI_FONT, UI_LAYER, UI_MATERIAL } from './uiTokens';
import { scheduleOverlayActivation } from './overlayActivation';
import { formatRunElapsed } from '../combat-core/run/runTimer';
import {
  cornerFlourish, deckleMask, divider, ornamentCss,
} from './grimoireOrnament';
import type { MetaRunSummary } from '../meta/metaRunSummary';
import type { SpellElement, SpellForm } from '../spell/types';
import type { MapNodeKind } from '../run/mapGraphContract';
import {
  discoverySignatureLabel,
  META_UNLOCK_LABELS,
  representativeBuildLabel,
  researchContractSummaryLabel,
} from './runSummaryModel';

/**
 * 런 요약 오버레이 — 승리(RUN COMPLETE)·패배(YOU DIED) 공용, "이번 런의 주문서" (GDD §2 사망 흐름)
 * R3 소유 자립형 DOM 오버레이 — 씬은 데이터만 넘기고 Enter/클릭으로 재도전을 resolve받는다.
 */

const STYLE_ID = 'r3-summary-style';
const WRAP_ID = 'r3-summary-wrap';

const CSS = `
#${WRAP_ID} {
  position: fixed; inset: 0; z-index: ${UI_LAYER.summary};
  display: grid; place-items: center;
  background: rgba(3, 5, 16, 0.88);
  opacity: 0; visibility: hidden; transition: opacity 240ms ease;
  font-family: ${UI_FONT.sans};
  text-align: center;
}
#${WRAP_ID}.active { opacity: 1; visibility: visible; }
#${WRAP_ID} .summary-title {
  font-size: clamp(34px, 6vw, 52px); font-weight: 800; letter-spacing: 0.22em;
}
#${WRAP_ID} .summary-panel {
  position: relative; text-align: center;
  --orn: ${UI_COLOR.accent};
  max-width: min(760px, calc(100vw - 32px));
  max-height: calc(100vh - 24px); overflow-y: auto;
  padding: 40px 36px 30px;
  -webkit-mask-image: ${deckleMask()};
  mask-image: ${deckleMask()};
  -webkit-mask-size: 100% 100%; mask-size: 100% 100%;
  background:
    ${UI_MATERIAL.grain},
    ${UI_MATERIAL.stain},
    linear-gradient(163deg, rgba(26, 19, 30, 0.985), rgba(13, 10, 17, 0.975));
  box-shadow: ${UI_MATERIAL.paperShadow}, ${UI_MATERIAL.rule};
  border: 1px solid ${UI_COLOR.border};
}
${ornamentCss(WRAP_ID)}
#${WRAP_ID}.victory .summary-title { color: ${UI_COLOR.positive}; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6); }
#${WRAP_ID}.defeat .summary-title { color: ${UI_COLOR.danger}; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.6); }
#${WRAP_ID} .summary-sub { margin-top: 6px; font-size: 13px; letter-spacing: 0.14em; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .summary-book {
  margin: 22px auto 0; padding: 14px 22px; min-width: 260px; max-width: min(560px, 84vw);
  border: 1px solid #3a4a8f; border-radius: 12px;
  background: rgba(8, 11, 28, 0.92);
}
#${WRAP_ID} .book-title { font-size: 12px; letter-spacing: 0.2em; color: ${UI_COLOR.accent}; margin-bottom: 8px; }
#${WRAP_ID} .book-row { font-size: 13.5px; color: ${UI_COLOR.textSoft}; line-height: 1.7; }
#${WRAP_ID} .book-row b { color: ${UI_COLOR.textBright}; font-weight: 600; }
#${WRAP_ID} .summary-meta-grid {
  display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 10px;
  margin: 12px auto 0; max-width: min(606px, 88vw); text-align: left;
}
#${WRAP_ID} .summary-meta-card {
  padding: 13px 15px; border: 1px solid ${UI_COLOR.border}; border-radius: 10px;
  background: rgba(8, 11, 28, 0.72);
}
#${WRAP_ID} .meta-title { font-size: 11px; letter-spacing: 0.16em; color: ${UI_COLOR.accent}; }
#${WRAP_ID} .meta-main { margin-top: 7px; font-size: 14px; line-height: 1.55; color: ${UI_COLOR.textBright}; }
#${WRAP_ID} .meta-sub { margin-top: 4px; font-size: 12px; line-height: 1.5; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .discovery-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
#${WRAP_ID} .discovery-chip {
  padding: 4px 7px; border: 1px solid rgba(129, 151, 255, 0.35); border-radius: 999px;
  font-size: 11px; color: ${UI_COLOR.textSoft}; background: rgba(28, 36, 76, 0.58);
}
#${WRAP_ID} .debug-run-table { margin-top: 14px; text-align: left; }
#${WRAP_ID} .debug-run-table table { width: 100%; border-collapse: collapse; margin-top: 7px; }
#${WRAP_ID} .debug-run-table th, #${WRAP_ID} .debug-run-table td {
  padding: 5px 7px; border-bottom: 1px solid rgba(129, 151, 255, 0.18);
  font-size: 11px; color: ${UI_COLOR.textSoft};
}
#${WRAP_ID} .debug-run-table th { color: ${UI_COLOR.accent}; font-weight: 600; }
#${WRAP_ID} .debug-run-table td:last-child, #${WRAP_ID} .debug-run-table th:last-child { text-align: right; }
#${WRAP_ID} .summary-hint { margin-top: 20px; font-size: 13px; color: ${UI_COLOR.textMuted}; }
#${WRAP_ID} .summary-hint b { color: ${UI_COLOR.text}; }
@media (max-width: 620px) {
  #${WRAP_ID} .summary-panel { padding: 30px 18px 24px; }
  #${WRAP_ID} .summary-meta-grid { grid-template-columns: 1fr; }
}
`;

export interface RunSummaryData {
  result: 'victory' | 'defeat';
  roomIndex: number;
  maxRooms: number;
  roomCountMode?: 'fixed' | 'dynamic';
  totalCasts: number;
  elapsedMs: number;
  dominantElement: SpellElement | null;
  dominantForm: SpellForm | null;
  recentSpellNames: string[];
  meta: MetaRunSummary;
  debug?: {
    mapSeed: number | null;
    rooms: readonly {
      roomIndex: number;
      nodeId: string;
      stage: number;
      kind: MapNodeKind;
      elapsedMs: number;
    }[];
  };
}

const DEBUG_ROOM_KIND_LABEL: Record<MapNodeKind, string> = {
  start: '시작방', combat: '일반방', elite: '엘리트방',
  'stage-boss': '스테이지 보스', 'memory-boss': '기억 보스',
  treasure: '보물방', altar: '제단방', trap: '함정방',
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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
    document.body.appendChild(wrap);
  }
  return wrap;
}

let open = false;
let current: Promise<void> | null = null;

/**
 * 요약을 표시하고 플레이어가 Enter/클릭으로 재도전을 선택할 때까지 기다린다.
 * 이미 열려 있으면 진행 중인 Promise를 공유한다 — 즉시 resolve로 뒤에서
 * 재시작이 실행되는 사고 방지 (호출측도 승/패 선점 가드를 함께 둔다).
 */
export function showRunSummaryOverlay(data: RunSummaryData): Promise<void> {
  if (current) return current;
  open = true;
  const wrap = ensureDom();
  const victory = data.result === 'victory';
  wrap.className = victory ? 'victory' : 'defeat';

  const spells = data.recentSpellNames.length
    ? data.recentSpellNames.map((name) => `『${escapeHtml(name)}』`).join(' · ')
    : '기록 없음';
  const buildLabel = representativeBuildLabel(data.dominantElement, data.dominantForm);
  const discoveryLabels = data.meta.newSignatures.map(discoverySignatureLabel);
  const visibleDiscoveries = discoveryLabels.slice(0, 6);
  const hiddenDiscoveryCount = discoveryLabels.length - visibleDiscoveries.length;
  const discoveries = visibleDiscoveries.length
    ? visibleDiscoveries.map((label) => `<span class="discovery-chip">${escapeHtml(label)}</span>`).join('')
      + (hiddenDiscoveryCount > 0
        ? `<span class="discovery-chip">외 ${hiddenDiscoveryCount}개</span>`
        : '')
    : '<span class="meta-sub">새 발견 없음 · 이미 기록된 언령</span>';
  const nextUnlock = data.meta.nextUnlock
    ? `${META_UNLOCK_LABELS[data.meta.nextUnlock.id]}까지 ${data.meta.insightToNextUnlock}`
    : '현재 연구 단계 모두 기록됨';
  const researchResult = data.meta.research
    ? `<div class="meta-sub">연구 · ${escapeHtml(researchContractSummaryLabel(data.meta.research))}</div>`
    : '';
  const debugTable = data.debug
    ? `<section class="summary-meta-card debug-run-table">
        <div class="meta-title">DEV · ROOM TIMINGS</div>
        <div class="meta-sub">맵 시드 · ${data.debug.mapSeed === null ? '고정 프리셋' : data.debug.mapSeed}</div>
        <table>
          <thead><tr><th>ROOM</th><th>STAGE</th><th>종류</th><th>NODE</th><th>클리어</th></tr></thead>
          <tbody>${data.debug.rooms.map((room) => `<tr>
            <td>${room.roomIndex}</td><td>${room.stage}</td>
            <td>${DEBUG_ROOM_KIND_LABEL[room.kind]}</td><td>${escapeHtml(room.nodeId)}</td>
            <td>${formatRunElapsed(room.elapsedMs)}</td>
          </tr>`).join('')}</tbody>
        </table>
      </section>`
    : '';
  wrap.innerHTML = `
    <div class="ui-panel summary-panel">
      ${cornerFlourish().replace('orn-corner', 'orn-corner tl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner tr')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner bl')}
      ${cornerFlourish().replace('orn-corner', 'orn-corner br')}
      <div class="summary-title">${victory ? 'RUN COMPLETE' : 'YOU DIED'}</div>
      ${divider()}
      <div class="summary-sub">${victory
        ? '모든 방을 정화했다'
        : data.roomCountMode === 'dynamic'
          ? `ROOM ${data.roomIndex} 에서 쓰러졌다`
          : `ROOM ${data.roomIndex}/${data.maxRooms} 에서 쓰러졌다`}</div>
      <div class="summary-book">
        <div class="book-title">이번 런의 주문서</div>
        <div class="book-row">대표 빌드 <b>${escapeHtml(buildLabel)}</b> · 수동 영창 <b>${data.totalCasts}</b>회</div>
        <div class="book-row">RUN TIME <b>${formatRunElapsed(data.elapsedMs)}</b> <span class="meta-sub">PAUSE EXCLUDED</span></div>
        <div class="book-row">${spells}</div>
      </div>
      <div class="summary-meta-grid">
        <section class="summary-meta-card">
          <div class="meta-title">새로운 발견 · ${discoveryLabels.length}</div>
          <div class="discovery-list">${discoveries}</div>
        </section>
        <section class="summary-meta-card">
          <div class="meta-title">마도 통찰</div>
          <div class="meta-main">이번 런 <b>+${data.meta.insightEarned}</b> · 누적 <b>${data.meta.totalInsight}</b></div>
          <div class="meta-sub">발견 +${data.meta.discoveryInsight} · 방 돌파 +${data.meta.roomInsight} · 연구 +${data.meta.researchInsight}</div>
          ${researchResult}
          <div class="meta-sub">다음 해금 · ${escapeHtml(nextUnlock)}</div>
        </section>
      </div>
      ${debugTable}
      <div class="summary-hint"><b>Enter</b> — 새로운 런 (보스는 이번 런을 기억한다…)</div>
    </div>`;

  current = new Promise<void>((resolve) => {
    let activation: { cancel(): void } | null = null;
    const finish = (): void => {
      activation?.cancel();
      window.removeEventListener('keydown', onKeyDown, true);
      wrap.classList.remove('active');
      open = false;
      current = null;
      window.setTimeout(() => { if (!open) wrap.innerHTML = ''; }, 260);
      resolve();
    };
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter') return;
      e.preventDefault(); e.stopImmediatePropagation();
      finish();
    };
    window.addEventListener('keydown', onKeyDown, true);
    wrap.addEventListener('click', finish, { once: true });

    // 닫힘이 예약을 이긴다 — 취소하지 않으면 뜨기 전에 닫은 오버레이가 화면에 남는다.
    activation = scheduleOverlayActivation((): void => {
      wrap.classList.add('active');
    });
  });
  return current;
}
