import Phaser from 'phaser';
import { drawGrimoirePanel } from '../render/grimoireFrame';
import { UI_HEX } from './uiTokens';
import {
  projectRoomRadarPoint,
  ROOM_RADAR_CONFIG,
  type RoomRadarBounds,
  type RoomRadarPosition,
} from './roomRadarModel';

export interface RoomRadarEntity extends RoomRadarPosition {
  alive: boolean;
}

/** 전체 경로가 아니라 현재 전투방 안의 플레이어·적 위치만 보여 주는 상시 레이더. */
export class RoomRadarHud {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private x: number;
  private y: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.x = x;
    this.y = y;
    this.graphics = scene.add.graphics().setScrollFactor(0).setDepth(99);
    this.title = scene.add.text(x + ROOM_RADAR_CONFIG.padding, y + 8, 'CURRENT ROOM', {
      fontFamily: 'Consolas, monospace',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#c9d3ff',
      letterSpacing: 1.2,
    }).setScrollFactor(0).setDepth(100);
  }

  setPosition(x: number, y: number): void {
    if (this.x === x && this.y === y) return;
    this.x = x;
    this.y = y;
    this.title.setPosition(x + ROOM_RADAR_CONFIG.padding, y + 8);
  }

  update(
    bounds: RoomRadarBounds,
    player: RoomRadarPosition,
    enemies: readonly RoomRadarEntity[],
  ): void {
    const g = this.graphics.clear();
    drawGrimoirePanel(
      g,
      this.x,
      this.y,
      ROOM_RADAR_CONFIG.width,
      ROOM_RADAR_CONFIG.height,
      0.86,
    );

    const mapLeft = this.x + ROOM_RADAR_CONFIG.padding;
    const mapTop = this.y + ROOM_RADAR_CONFIG.headerHeight;
    const mapWidth = ROOM_RADAR_CONFIG.width - ROOM_RADAR_CONFIG.padding * 2;
    const mapHeight = ROOM_RADAR_CONFIG.height
      - ROOM_RADAR_CONFIG.headerHeight
      - ROOM_RADAR_CONFIG.padding;
    g.fillStyle(UI_HEX.track, 0.45);
    g.fillRect(mapLeft, mapTop, mapWidth, mapHeight);
    g.lineStyle(1, UI_HEX.border, 0.58);
    g.strokeRect(mapLeft, mapTop, mapWidth, mapHeight);
    g.lineStyle(0.7, UI_HEX.accent, 0.12);
    g.lineBetween(mapLeft + mapWidth / 2, mapTop, mapLeft + mapWidth / 2, mapTop + mapHeight);
    g.lineBetween(mapLeft, mapTop + mapHeight / 2, mapLeft + mapWidth, mapTop + mapHeight / 2);

    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const point = projectRoomRadarPoint(bounds, enemy);
      const x = this.x + point.x;
      const y = this.y + point.y;
      g.fillStyle(0xff5c6f, 0.96);
      g.fillCircle(x, y, ROOM_RADAR_CONFIG.enemyRadius);
      g.lineStyle(1, 0xffa0aa, 0.52);
      g.strokeCircle(x, y, ROOM_RADAR_CONFIG.enemyRadius + 1.5);
    }

    const playerPoint = projectRoomRadarPoint(bounds, player);
    const playerX = this.x + playerPoint.x;
    const playerY = this.y + playerPoint.y;
    g.fillStyle(0x66b8ff, 1);
    g.fillCircle(playerX, playerY, ROOM_RADAR_CONFIG.playerRadius);
    g.lineStyle(1.6, 0xc8e8ff, 0.92);
    g.strokeCircle(playerX, playerY, ROOM_RADAR_CONFIG.playerRadius + 2.5);
  }

  destroy(): void {
    this.graphics.destroy();
    this.title.destroy();
  }
}
