import Phaser from 'phaser';
import { ROOM_CURSE_CONFIG } from '../combat-core/run/roomCurse';

const BLACKOUT_DEPTH = 9;
const GRADIENT_SCALES = [1, 1.06, 1.13, 1.22, 1.32] as const;
// 다섯 겹 합성 시 최외곽 약 96% 암도. 실루엣만 희미하게 남긴다.
const GRADIENT_LAYER_ALPHA = 0.48;
const VISION_EXPAND_SECONDS = 0.18;
const VISION_FADE_SECONDS = 0.8;
const ILLUMINATED_VISION_MULTIPLIER = 2;
const BASE_VISION_DIM_ALPHA = 0.18;

interface DarknessLayerSet {
  darknessLayers: Phaser.GameObjects.Graphics[];
  maskSources: Phaser.GameObjects.Graphics[];
  masks: Phaser.Display.Masks.GeometryMask[];
  radiusMultiplier: number;
}

/** 암전 저주: 플레이어 주변만 보이며 빛·불꽃 직접 영창 후 시야가 잠시 넓어진다. */
export class BlackoutCurseField {
  readonly visionRadius: number;
  readonly illuminationSeconds: number;

  private readonly baseLayers: DarknessLayerSet;
  private readonly illuminatedLayers: DarknessLayerSet;
  private readonly baseVisionDim: Phaser.GameObjects.Graphics;
  private playerX: number;
  private playerY: number;
  private illuminationRemaining = 0;
  /** 0=기본 시야, 1=2배 시야. 두 고정 반경 마스크의 alpha만 교차 페이드한다. */
  private illuminationBlend = 0;
  private dirty = true;

  constructor(
    scene: Phaser.Scene,
    worldBounds: Phaser.Geom.Rectangle,
    playerX: number,
    playerY: number,
  ) {
    this.visionRadius = ROOM_CURSE_CONFIG.blackoutVisionRadius;
    this.illuminationSeconds = ROOM_CURSE_CONFIG.blackoutIlluminationSeconds;
    this.playerX = playerX;
    this.playerY = playerY;
    this.baseVisionDim = scene.add.graphics().setDepth(BLACKOUT_DEPTH - 0.05);
    this.baseVisionDim.fillStyle(0x05030d, BASE_VISION_DIM_ALPHA);
    this.baseVisionDim.fillRect(
      worldBounds.left,
      worldBounds.top,
      worldBounds.width,
      worldBounds.height,
    );
    this.baseLayers = createDarknessLayerSet(scene, worldBounds, 1);
    this.illuminatedLayers = createDarknessLayerSet(
      scene,
      worldBounds,
      ILLUMINATED_VISION_MULTIPLIER,
    );
    this.applyBlend();
    this.redrawMasks();
  }

  /** 연속 발동은 남은 시간을 초기화해 항상 한 번의 완전한 조명 시간을 보장한다. */
  illuminate(): void {
    this.illuminationRemaining = this.illuminationSeconds;
  }

  update(deltaSeconds: number, playerX: number, playerY: number): void {
    if (!this.baseLayers.darknessLayers[0]?.active) return;
    if (playerX !== this.playerX || playerY !== this.playerY) {
      this.playerX = playerX;
      this.playerY = playerY;
      this.dirty = true;
    }

    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const previousBlend = this.illuminationBlend;
    if (this.illuminationRemaining > 0) {
      this.illuminationRemaining = Math.max(0, this.illuminationRemaining - safeDelta);
      this.illuminationBlend = Math.min(
        1,
        this.illuminationBlend + safeDelta / VISION_EXPAND_SECONDS,
      );
    } else {
      this.illuminationBlend = Math.max(
        0,
        this.illuminationBlend - safeDelta / VISION_FADE_SECONDS,
      );
    }
    if (this.illuminationBlend !== previousBlend) this.applyBlend();
    if (this.dirty) this.redrawMasks();
  }

  destroy(): void {
    this.baseVisionDim.destroy();
    destroyLayerSet(this.baseLayers);
    destroyLayerSet(this.illuminatedLayers);
  }

  private applyBlend(): void {
    this.baseVisionDim.setAlpha(1 - this.illuminationBlend);
    for (const layer of this.baseLayers.darknessLayers) {
      layer.setAlpha(1 - this.illuminationBlend);
    }
    for (const layer of this.illuminatedLayers.darknessLayers) {
      layer.setAlpha(this.illuminationBlend);
    }
  }

  private redrawMasks(): void {
    this.dirty = false;
    redrawLayerSet(
      this.baseLayers,
      this.playerX,
      this.playerY,
      this.visionRadius,
    );
    redrawLayerSet(
      this.illuminatedLayers,
      this.playerX,
      this.playerY,
      this.visionRadius,
    );
  }
}

function createDarknessLayerSet(
  scene: Phaser.Scene,
  worldBounds: Phaser.Geom.Rectangle,
  radiusMultiplier: number,
): DarknessLayerSet {
  const maskSources: Phaser.GameObjects.Graphics[] = [];
  const masks: Phaser.Display.Masks.GeometryMask[] = [];
  const darknessLayers = GRADIENT_SCALES.map(() => {
    const darkness = scene.add.graphics().setDepth(BLACKOUT_DEPTH);
    darkness.fillStyle(0x020108, GRADIENT_LAYER_ALPHA);
    darkness.fillRect(
      worldBounds.left,
      worldBounds.top,
      worldBounds.width,
      worldBounds.height,
    );
    const maskSource = scene.make.graphics({ x: 0, y: 0 });
    const mask = maskSource.createGeometryMask();
    mask.setInvertAlpha(true);
    darkness.setMask(mask);
    maskSources.push(maskSource);
    masks.push(mask);
    return darkness;
  });
  return { darknessLayers, maskSources, masks, radiusMultiplier };
}

function redrawLayerSet(
  set: DarknessLayerSet,
  playerX: number,
  playerY: number,
  visionRadius: number,
): void {
  set.maskSources.forEach((maskSource, index) => {
    maskSource.clear();
    maskSource.fillStyle(0xffffff, 1);
    maskSource.fillCircle(
      playerX,
      playerY,
      visionRadius * set.radiusMultiplier * GRADIENT_SCALES[index],
    );
  });
}

function destroyLayerSet(set: DarknessLayerSet): void {
  set.darknessLayers.forEach((darkness, index) => {
    darkness.clearMask(false);
    set.masks[index].destroy();
    set.maskSources[index].destroy();
    darkness.destroy();
  });
}
