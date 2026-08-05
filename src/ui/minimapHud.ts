import Phaser from 'phaser';
import { UI_HEX } from './uiTokens';
import { drawGrimoirePanel } from '../render/grimoireFrame';
import type { MinimapModel, MinimapNode } from '../run/mapGraphContract';
import { MINIMAP_CONFIG, minimapLayout } from './minimapLayout';

/**
 * 미니맵 HUD (#214) — 맵 그래프의 클리어/현재/도달가능/미방문을 한눈에.
 *
 * 분기형 맵에서 "내가 어디고 어디로 갈 수 있나"를 텍스트 없이 전달한다.
 * 심사위원에게는 "이 게임에 로그라이크 구조가 있다"를 첫 화면에서 증명하는 요소.
 *
 * 입력은 뷰모델(MinimapModel)만 — R1 그래프 스냅샷과의 결합은 어댑터가 흡수한다
 * (mapGraphContract 참조). update(model)를 부르면 전체를 다시 그린다(노드 수가
 * 십수 개 규모라 디프 갱신은 과공학).
 */
/**
 * 미니맵 팔레트 — **토큰에서 파생한다.**
 *
 * 종전엔 청색을 하드코딩했다(`0x8fa4ff`·`0x2c3a6e`·`0x2a735c`). UI 통일에서 빠져
 * 일시정지를 열면 마도서 판 안에 청색 지도가 들어 있었다.
 *
 * ⚠️ 노드 상태 색(지나온 곳·현재·갈 수 있는 곳)은 **정보**다. 마도서 톤으로 전부
 * 밀면 어디를 지나왔는지 알 수 없다. HUD의 HP·마나와 같은 원칙으로 색조는 유지하고
 * 채도만 낮췄다.
 */
const STYLE = {
  panelFill: UI_HEX.panel,
  panelAlpha: 0.9,
  panelStroke: UI_HEX.border,
  /** 아직 안 간 길 — 흐린 잉크 */
  edge: 0x4b3850,
  /** 지나온 길 — 금박이 스민 자국 */
  edgeCleared: 0x8a7448,
  node: {
    /** 지나온 방 */
    cleared: 0x7a6a4a,
    /** 지금 있는 방 — 금박. 한눈에 찾아야 하므로 가장 밝다 */
    current: UI_HEX.accent,
    /** 갈 수 있는 방 — 탁한 보라(토큰 textSoft 계열) */
    reachable: 0xaaa1c8,
    /** 아직 모르는 방 */
    unvisited: 0x3a2f42,
  },
  /** 보스 — 위험은 붉은 계열로 남긴다(채도만 낮춤) */
  bossAccent: 0xb95f72,
} as const;

export interface MinimapHudLayout {
  x: number;
  y: number;
  /** ESC 검사 화면에서는 같은 경로를 크게 읽는다. 기본값 1은 기존 크기다. */
  scale?: number;
  /** 일시정지 메뉴와의 정보 계층을 맞추는 HUD 깊이. */
  depth?: number;
}

export class MinimapHud {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private x: number;
  private y: number;
  private scale: number;
  private lastModel: MinimapModel | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, options: Omit<MinimapHudLayout, 'x' | 'y'> = {}) {
    this.x = x;
    this.y = y;
    this.scale = this.normalizedScale(options.scale);
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(options.depth ?? 99);
  }

  update(model: MinimapModel): void {
    this.lastModel = model;
    this.redraw();
  }

  /**
   * 세로 위치 이동 — 위쪽 상태 패널이 내용에 따라 늘어나므로(보스전 저항 줄 등)
   * 미니맵도 그만큼 내려와야 겹치지 않는다. 씬이 패널 높이 변화 시에만 호출한다.
   */
  setTop(y: number): void {
    this.setLayout({ x: this.x, y });
  }

  /** ESC 전용 확대 지도와 일반 HUD 지도를 같은 렌더러로 유지한다. */
  setLayout(layout: MinimapHudLayout): void {
    const nextScale = this.normalizedScale(layout.scale ?? this.scale);
    const changed = this.x !== layout.x || this.y !== layout.y || this.scale !== nextScale;
    this.x = layout.x;
    this.y = layout.y;
    this.scale = nextScale;
    if (layout.depth !== undefined) this.graphics.setDepth(layout.depth);
    if (changed) this.redraw();
  }

  /** 현재 노드 펄스용 — 씬 update에서 호출 (모델 불변 시 재계산 없이 다시 그림) */
  pulse(): void {
    if (this.lastModel) this.redraw();
  }

  setVisible(visible: boolean): void {
    this.graphics.setVisible(visible);
  }

  destroy(): void {
    this.graphics.destroy();
  }

  private redraw(): void {
    const model = this.lastModel;
    const g = this.graphics;
    g.clear();
    if (!model || model.nodes.length === 0) return;

    const scale = this.scale;
    const width = MINIMAP_CONFIG.width * scale;
    const height = MINIMAP_CONFIG.height * scale;
    const nodeRadius = MINIMAP_CONFIG.nodeRadius * scale;
    const currentRadius = MINIMAP_CONFIG.currentRadius * scale;
    // 마도서 판 — 일시정지를 열면 이 지도가 나온다. 옆의 HUD·상태 패널과 같은
    // 문법이어야 한 화면으로 읽힌다(총괄 지시)
    drawGrimoirePanel(g, this.x, this.y, width, height, STYLE.panelAlpha);

    const points = new Map(minimapLayout(model).map((point) => [point.id, {
      x: point.x * scale,
      y: point.y * scale,
    }] as const));
    const nodesById = new Map(model.nodes.map((node) => [node.id, node] as const));

    // 엣지 먼저 (노드 아래 깔리게). 클리어된 경로는 밝게 — 지나온 길이 보인다.
    for (const edge of model.edges) {
      const from = points.get(edge.from);
      const to = points.get(edge.to);
      if (!from || !to) continue;
      const walked = nodesById.get(edge.from)?.status === 'cleared'
        && ['cleared', 'current'].includes(nodesById.get(edge.to)?.status ?? '');
      g.lineStyle((walked ? 2 : 1) * scale, walked ? STYLE.edgeCleared : STYLE.edge, walked ? 0.9 : 0.55);
      g.lineBetween(this.x + from.x, this.y + from.y, this.x + to.x, this.y + to.y);
    }

    const now = Date.now();
    for (const node of model.nodes) {
      const point = points.get(node.id);
      if (!point) continue;
      const px = this.x + point.x;
      const py = this.y + point.y;
      const isBoss = node.kind === 'stage-boss' || node.kind === 'memory-boss';

      if (node.status === 'current') {
        // 현재 위치 — 펄스 링. 미니맵에서 시선이 처음 가야 할 곳.
        const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 260));
        g.lineStyle(2 * scale, STYLE.node.current, 0.4 + 0.5 * pulse);
        g.strokeCircle(px, py, currentRadius + 2 * scale * pulse);
      }

      const color = STYLE.node[node.status];
      const radius = node.status === 'current' ? currentRadius : nodeRadius;
      if (isBoss) {
        // 보스는 다이아몬드 — 색만으로는 "끝판"이 안 읽힌다
        this.drawDiamond(px, py, radius + 2 * scale, color, node.status !== 'unvisited');
        g.lineStyle(1.5 * scale, STYLE.bossAccent, 0.9);
        this.strokeDiamond(px, py, radius + 2 * scale);
      } else if (node.kind === 'treasure' || node.kind === 'altar' || node.kind === 'trap') {
        // 특수 방은 사각 — 전투방(원)과 실루엣부터 다르게
        g.fillStyle(color, node.status === 'unvisited' ? 0.5 : 1);
        g.fillRect(px - radius, py - radius, radius * 2, radius * 2);
      } else {
        g.fillStyle(color, node.status === 'unvisited' ? 0.5 : 1);
        g.fillCircle(px, py, radius);
      }
    }
  }

  private drawDiamond(x: number, y: number, r: number, color: number, solid: boolean): void {
    this.graphics.fillStyle(color, solid ? 1 : 0.5);
    this.graphics.fillPoints(
      [
        new Phaser.Math.Vector2(x, y - r),
        new Phaser.Math.Vector2(x + r, y),
        new Phaser.Math.Vector2(x, y + r),
        new Phaser.Math.Vector2(x - r, y),
      ],
      true,
    );
  }

  private strokeDiamond(x: number, y: number, r: number): void {
    this.graphics.strokePoints(
      [
        new Phaser.Math.Vector2(x, y - r),
        new Phaser.Math.Vector2(x + r, y),
        new Phaser.Math.Vector2(x, y + r),
        new Phaser.Math.Vector2(x - r, y),
      ],
      true,
      true,
    );
  }

  private normalizedScale(value: number | undefined): number {
    const safe = Number.isFinite(value) ? value! : 1;
    return Phaser.Math.Clamp(safe, 0.75, 2);
  }
}

/** 노드 상태 판정 헬퍼 — 어댑터(R1 스냅샷 → 뷰모델)에서 재사용 예정 */
export function nodeStatusPriority(node: MinimapNode): number {
  switch (node.status) {
    case 'current': return 3;
    case 'reachable': return 2;
    case 'cleared': return 1;
    default: return 0;
  }
}
