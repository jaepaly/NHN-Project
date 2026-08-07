import Phaser from 'phaser';
import { UI_HEX } from './uiTokens';
import { drawGrimoirePanel } from '../render/grimoireFrame';
import type { MinimapModel, MinimapNode } from '../run/mapGraphContract';
import { MINIMAP_CONFIG, minimapLayout } from './minimapLayout';
import { roomIconTextureKey } from './roomKindIcon';
import { roomChoicePresentation } from './roomChoiceOverlay';
import {
  currentMinimapStage,
  minimapStages,
  projectMinimapStage,
} from './minimapStageProjection';

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
  /** 현재 방의 펄스만 매 프레임 갱신한다. 지도 전체를 다시 그리면 호버 입력이 끊긴다. */
  private readonly pulseGraphics: Phaser.GameObjects.Graphics;
  private readonly scene: Phaser.Scene;
  private readonly iconImages = new Map<string, Phaser.GameObjects.Image>();
  private readonly stageTabs = new Map<number, Phaser.GameObjects.Text>();
  /** ESC 지도에서만 노드 위에 올린 방의 정보를 보여주는 투명 입력 영역. */
  private readonly nodeZones = new Map<string, Phaser.GameObjects.Zone>();
  private readonly nodeTooltipGraphics: Phaser.GameObjects.Graphics;
  private readonly nodeTooltipTitle: Phaser.GameObjects.Text;
  private readonly nodeTooltipDescription: Phaser.GameObjects.Text;
  private x: number;
  private y: number;
  private scale: number;
  private lastModel: MinimapModel | null = null;
  private selectedStage = 1;
  private lastCurrentStage: number | null = null;
  private pulseTarget: { x: number; y: number; radius: number } | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, options: Omit<MinimapHudLayout, 'x' | 'y'> = {}) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.scale = this.normalizedScale(options.scale);
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(options.depth ?? 99);
    this.pulseGraphics = scene.add.graphics().setScrollFactor(0).setDepth(this.graphics.depth);
    this.nodeTooltipGraphics = scene.add.graphics().setScrollFactor(0).setDepth(this.graphics.depth + 3).setVisible(false);
    this.nodeTooltipTitle = scene.add.text(0, 0, '', {
      fontFamily: '"Noto Serif KR", Georgia, serif',
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#ead9ad',
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(this.graphics.depth + 4).setVisible(false);
    this.nodeTooltipDescription = scene.add.text(0, 0, '', {
      fontFamily: '"Noto Serif KR", Georgia, serif',
      fontSize: '11px',
      color: '#c8c0d2',
      align: 'center',
      wordWrap: { width: 350, useAdvancedWrap: true },
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(this.graphics.depth + 4).setVisible(false);
  }

  update(model: MinimapModel): void {
    this.lastModel = model;
    const currentStage = currentMinimapStage(model);
    if (this.lastCurrentStage === null || this.lastCurrentStage !== currentStage) {
      this.selectedStage = currentStage;
      this.lastCurrentStage = currentStage;
    }
    this.syncStageTabs();
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
    if (layout.depth !== undefined) {
      this.pulseGraphics.setDepth(layout.depth);
      for (const icon of this.iconImages.values()) icon.setDepth(layout.depth + 1);
      for (const tab of this.stageTabs.values()) tab.setDepth(layout.depth + 2);
      this.nodeTooltipGraphics.setDepth(layout.depth + 3);
      this.nodeTooltipTitle.setDepth(layout.depth + 4);
      this.nodeTooltipDescription.setDepth(layout.depth + 4);
    }
    this.positionStageTabs();
    if (changed) this.redraw();
  }

  /** 현재 노드 펄스용 — 호버 입력 영역을 다시 만들지 않고 시각 효과만 갱신한다. */
  pulse(): void {
    this.drawCurrentPulse();
  }

  setVisible(visible: boolean): void {
    this.graphics.setVisible(visible);
    this.pulseGraphics.setVisible(visible);
    for (const icon of this.iconImages.values()) icon.setVisible(visible && icon.active);
    for (const tab of this.stageTabs.values()) tab.setVisible(visible);
    if (!visible) {
      this.clearNodeTooltip();
      for (const zone of this.nodeZones.values()) zone.disableInteractive();
      return;
    }
    // 숨겨져 있던 ESC 지도도 다시 열 때 노드 입력 영역을 새 위치·크기로 되살린다.
    if (this.lastModel) this.redraw();
  }

  destroy(): void {
    this.graphics.destroy();
    this.pulseGraphics.destroy();
    for (const icon of this.iconImages.values()) icon.destroy();
    this.iconImages.clear();
    for (const tab of this.stageTabs.values()) tab.destroy();
    this.stageTabs.clear();
    for (const zone of this.nodeZones.values()) zone.destroy();
    this.nodeZones.clear();
    this.nodeTooltipGraphics.destroy();
    this.nodeTooltipTitle.destroy();
    this.nodeTooltipDescription.destroy();
  }

  private redraw(): void {
    const fullModel = this.lastModel;
    const g = this.graphics;
    g.clear();
    this.pulseGraphics.clear();
    this.pulseTarget = null;
    for (const icon of this.iconImages.values()) icon.setActive(false).setVisible(false);
    for (const zone of this.nodeZones.values()) zone.setActive(false).disableInteractive();
    this.clearNodeTooltip();
    if (!fullModel || fullModel.nodes.length === 0) return;
    const model = projectMinimapStage(fullModel, this.selectedStage);

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
      const textureKey = roomIconTextureKey(node.kind);
      const iconBackingRadius = (isBoss ? 14 : node.status === 'current' ? 13 : 11) * scale;

      if (node.status === 'current') {
        // 펄스는 별도 레이어에서 갱신해 호버 입력 영역을 매 프레임 초기화하지 않는다.
        this.pulseTarget = {
          x: px,
          y: py,
          radius: textureKey ? iconBackingRadius : currentRadius,
        };
      }

      const color = STYLE.node[node.status];
      const radius = node.status === 'current' ? currentRadius : nodeRadius;
      if (textureKey) {
        // 방 종류는 공통 아이콘이 전담하고 상태는 단일 원형 받침으로만 전달한다.
        g.fillStyle(0x120e17, 0.94);
        g.fillCircle(px, py, iconBackingRadius);
        g.lineStyle(
          (isBoss ? 2 : 1.25) * scale,
          isBoss ? STYLE.bossAccent : color,
          node.status === 'unvisited' ? 0.62 : 0.92,
        );
        g.strokeCircle(px, py, iconBackingRadius);
        if (isBoss) {
          g.lineStyle(1 * scale, color, 0.5);
          g.strokeCircle(px, py, iconBackingRadius + 3 * scale);
        }
      } else {
        g.fillStyle(color, node.status === 'unvisited' ? 0.5 : 1);
        g.fillCircle(px, py, radius);
      }

      if (textureKey) {
        let icon = this.iconImages.get(node.id);
        if (!icon) {
          icon = this.scene.add.image(px, py, textureKey).setScrollFactor(0);
          this.iconImages.set(node.id, icon);
        }
        const iconSize = (isBoss ? 26 : 20) * scale;
        icon
          .setTexture(textureKey)
          .setPosition(px, py)
          .setDisplaySize(iconSize, iconSize)
          .setAlpha(node.status === 'unvisited' ? 0.72 : node.status === 'cleared' ? 0.55 : 1)
          .setDepth(this.graphics.depth + 1)
          .setActive(true)
          .setVisible(this.graphics.visible);
      }

      this.syncNodeZone(node, px, py, Math.max(iconBackingRadius * 2.35, 26 * scale));
    }
    this.drawCurrentPulse(now);
  }

  /** 지도 본문과 분리된 현재 위치 펄스. ESC 노드 hover 중에도 포인터 영역을 유지한다. */
  private drawCurrentPulse(now = Date.now()): void {
    const g = this.pulseGraphics.clear();
    const target = this.pulseTarget;
    if (!target || !this.graphics.visible) return;
    const pulse = 0.5 + 0.5 * Math.abs(Math.sin(now / 260));
    g.lineStyle(2 * this.scale, STYLE.node.current, 0.4 + 0.5 * pulse);
    g.strokeCircle(target.x, target.y, target.radius + 2 * this.scale * pulse);
  }

  /**
   * 각 노드의 Phaser 입력 영역을 한 번만 만들고, 지도 갱신 때는 위치·대상만 갱신한다.
   * 방을 이동하거나 바깥 HUD로 닫힌 뒤에도 오래된 노드가 입력을 가로채지 않게 한다.
   */
  private syncNodeZone(node: MinimapNode, x: number, y: number, size: number): void {
    let zone = this.nodeZones.get(node.id);
    if (!zone) {
      zone = this.scene.add.zone(x, y, size, size)
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(this.graphics.depth + 2)
        .on('pointerover', () => {
          const hovered = zone?.getData('minimap-node') as MinimapNode | undefined;
          if (hovered) this.showNodeTooltip(hovered);
        })
        .on('pointerout', () => this.clearNodeTooltip());
      this.nodeZones.set(node.id, zone);
    }
    zone
      .setPosition(x, y)
      .setSize(size, size)
      .setData('minimap-node', node)
      .setActive(true)
      .setInteractive({ useHandCursor: true });
  }

  /** 지도 패널 아래의 고정 정보판이라 노드가 가장자리에 있어도 화면 밖으로 잘리지 않는다. */
  private showNodeTooltip(node: MinimapNode): void {
    const presentation = roomChoicePresentation(node.kind);
    const width = Math.min(390, MINIMAP_CONFIG.width * this.scale - 20);
    const x = this.x + (MINIMAP_CONFIG.width * this.scale) / 2;
    const y = this.y + MINIMAP_CONFIG.height * this.scale + 10;
    const height = 45;

    this.nodeTooltipGraphics.clear().setVisible(true);
    drawGrimoirePanel(this.nodeTooltipGraphics, x - width / 2, y, width, height, 0.96);
    this.nodeTooltipTitle
      .setText(presentation.label)
      .setColor(presentation.color)
      .setPosition(x, y + 5)
      .setVisible(true);
    this.nodeTooltipDescription
      .setText(presentation.description)
      .setPosition(x, y + 23)
      .setVisible(true);
  }

  private clearNodeTooltip(): void {
    this.nodeTooltipGraphics.clear().setVisible(false);
    this.nodeTooltipTitle.setVisible(false);
    this.nodeTooltipDescription.setVisible(false);
  }

  private syncStageTabs(): void {
    if (!this.lastModel) return;
    const stages = minimapStages(this.lastModel);
    for (const [stage, tab] of this.stageTabs) {
      if (!stages.includes(stage)) {
        tab.destroy();
        this.stageTabs.delete(stage);
      }
    }
    for (const stage of stages) {
      let tab = this.stageTabs.get(stage);
      if (!tab) {
        tab = this.scene.add.text(0, 0, stage === 1 ? 'Ⅰ' : stage === 2 ? 'Ⅱ' : String(stage), {
          fontFamily: '"Noto Serif KR", Georgia, serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#8f8498',
          backgroundColor: '#120e17',
          padding: { x: 8, y: 3 },
        }).setOrigin(0.5).setScrollFactor(0).setDepth(this.graphics.depth + 2)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => {
            this.selectedStage = stage;
            this.redraw();
            this.refreshStageTabStyles();
          });
        this.stageTabs.set(stage, tab);
      }
    }
    this.positionStageTabs();
    this.refreshStageTabStyles();
  }

  private positionStageTabs(): void {
    const stages = [...this.stageTabs.keys()].sort((a, b) => a - b);
    const centerX = this.x + (MINIMAP_CONFIG.width * this.scale) / 2;
    const gap = 34 * this.scale;
    stages.forEach((stage, index) => {
      this.stageTabs.get(stage)
        ?.setFontSize(`${Math.round(11 + this.scale * 2)}px`)
        .setPosition(
          centerX + (index - (stages.length - 1) / 2) * gap,
          this.y - 10 * this.scale,
        );
    });
  }

  private refreshStageTabStyles(): void {
    const currentStage = this.lastModel ? currentMinimapStage(this.lastModel) : 1;
    for (const [stage, tab] of this.stageTabs) {
      const selected = stage === this.selectedStage;
      tab
        .setColor(selected ? '#ead9ad' : stage === currentStage ? '#c8ad77' : '#71687a')
        .setAlpha(selected ? 1 : 0.72)
        .setBackgroundColor(selected ? '#2b202f' : '#120e17')
        .setStroke(selected ? '#8f7850' : '#3d3344', selected ? 1 : 0);
    }
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
