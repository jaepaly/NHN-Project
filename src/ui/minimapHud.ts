import Phaser from 'phaser';
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
const STYLE = {
  panelFill: 0x080b1c,
  panelAlpha: 0.86,
  panelStroke: 0x2a735c,
  edge: 0x2c3a6e,
  edgeCleared: 0x3f6e5c,
  node: {
    cleared: 0x3f6e5c,
    current: 0xffd166,
    reachable: 0x8fa4ff,
    unvisited: 0x2c3a6e,
  },
  bossAccent: 0xff5a6e,
} as const;

export class MinimapHud {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly x: number;
  private readonly y: number;
  private lastModel: MinimapModel | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(99);
  }

  update(model: MinimapModel): void {
    this.lastModel = model;
    this.redraw();
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

    const { width, height, nodeRadius, currentRadius } = MINIMAP_CONFIG;
    g.fillStyle(STYLE.panelFill, STYLE.panelAlpha);
    g.fillRoundedRect(this.x, this.y, width, height, 12);
    g.lineStyle(1, STYLE.panelStroke, 0.62);
    g.strokeRoundedRect(this.x, this.y, width, height, 12);

    const points = new Map(
      minimapLayout(model).map((point) => [point.id, point] as const),
    );
    const nodesById = new Map(model.nodes.map((node) => [node.id, node] as const));

    // 엣지 먼저 (노드 아래 깔리게). 클리어된 경로는 밝게 — 지나온 길이 보인다.
    for (const edge of model.edges) {
      const from = points.get(edge.from);
      const to = points.get(edge.to);
      if (!from || !to) continue;
      const walked = nodesById.get(edge.from)?.status === 'cleared'
        && ['cleared', 'current'].includes(nodesById.get(edge.to)?.status ?? '');
      g.lineStyle(walked ? 2 : 1, walked ? STYLE.edgeCleared : STYLE.edge, walked ? 0.9 : 0.55);
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
        g.lineStyle(2, STYLE.node.current, 0.4 + 0.5 * pulse);
        g.strokeCircle(px, py, currentRadius + 2 * pulse);
      }

      const color = STYLE.node[node.status];
      const radius = node.status === 'current' ? currentRadius : nodeRadius;
      if (isBoss) {
        // 보스는 다이아몬드 — 색만으로는 "끝판"이 안 읽힌다
        this.drawDiamond(px, py, radius + 2, color, node.status !== 'unvisited');
        g.lineStyle(1.5, STYLE.bossAccent, 0.9);
        this.strokeDiamond(px, py, radius + 2);
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
