import Phaser from 'phaser';
import type { SpellElement } from '../spell/types';

/** Clear 16px silhouettes for the fixed boss bar; no enclosing status badge. */
export function drawBossElementIcon(
  graphics: Phaser.GameObjects.Graphics,
  element: SpellElement,
  x: number,
  y: number,
  color: number,
): void {
  graphics.fillStyle(color, 1).lineStyle(1.8, color, 1);
  switch (element) {
    case 'fire':
      graphics.fillPoints([
        new Phaser.Math.Vector2(x, y - 9),
        new Phaser.Math.Vector2(x + 7, y),
        new Phaser.Math.Vector2(x + 5, y + 7),
        new Phaser.Math.Vector2(x, y + 9),
        new Phaser.Math.Vector2(x - 6, y + 6),
        new Phaser.Math.Vector2(x - 7, y),
        new Phaser.Math.Vector2(x - 2, y - 4),
      ], true);
      graphics.fillStyle(0x0b0914, 1).fillTriangle(x + 1, y - 1, x - 2, y + 6, x + 4, y + 6);
      break;
    case 'water':
      graphics.fillTriangle(x, y - 10, x - 7, y + 2, x + 7, y + 2);
      graphics.fillCircle(x, y + 3, 7);
      break;
    case 'lightning':
      graphics.fillPoints([
        new Phaser.Math.Vector2(x + 2, y - 10),
        new Phaser.Math.Vector2(x - 6, y + 1),
        new Phaser.Math.Vector2(x - 1, y + 1),
        new Phaser.Math.Vector2(x - 4, y + 10),
        new Phaser.Math.Vector2(x + 7, y - 3),
        new Phaser.Math.Vector2(x + 2, y - 3),
      ], true);
      break;
    case 'ice': {
      for (let i = 0; i < 3; i += 1) {
        const angle = (Math.PI / 3) * i;
        const dx = Math.cos(angle) * 9;
        const dy = Math.sin(angle) * 9;
        graphics.lineBetween(x - dx, y - dy, x + dx, y + dy);
        for (const sign of [-1, 1]) {
          const tipX = x + dx * sign;
          const tipY = y + dy * sign;
          const baseAngle = angle + (sign < 0 ? Math.PI : 0);
          graphics.lineBetween(
            tipX,
            tipY,
            tipX - Math.cos(baseAngle - 0.7) * 4,
            tipY - Math.sin(baseAngle - 0.7) * 4,
          );
          graphics.lineBetween(
            tipX,
            tipY,
            tipX - Math.cos(baseAngle + 0.7) * 4,
            tipY - Math.sin(baseAngle + 0.7) * 4,
          );
        }
      }
      break;
    }
    case 'earth':
      graphics.strokeTriangle(x, y - 8, x - 9, y + 7, x + 9, y + 7);
      graphics.lineBetween(x - 9, y + 9, x + 9, y + 9);
      graphics.fillTriangle(x, y - 3, x - 4, y + 5, x + 4, y + 5);
      break;
    case 'wind':
      graphics.beginPath().arc(x - 2, y - 3, 7, -1.2, 1.4).strokePath();
      graphics.beginPath().arc(x + 1, y + 4, 7, 1.9, 5.5).strokePath();
      graphics.lineBetween(x - 9, y, x + 6, y);
      break;
    case 'light':
      graphics.strokeCircle(x, y, 5).fillCircle(x, y, 2.5);
      graphics.lineBetween(x, y - 10, x, y - 7);
      graphics.lineBetween(x, y + 7, x, y + 10);
      graphics.lineBetween(x - 10, y, x - 7, y);
      graphics.lineBetween(x + 7, y, x + 10, y);
      break;
    case 'dark':
      graphics.fillCircle(x - 2, y, 8);
      graphics.fillStyle(0x0b0914, 1).fillCircle(x + 3, y - 3, 7);
      break;
  }
}
