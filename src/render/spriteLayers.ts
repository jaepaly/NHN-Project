/**
 * AI 스프라이트를 **재질 + 발광** 두 겹으로 그리는 공용 헬퍼.
 *
 * 왜 두 겹인가: 텍스처를 통째로 setTint하면 곱셈이라 어두운 흑요석·은색 선 같은
 * 재질감이 전부 죽고 단색 덩어리가 된다. 그래서 색은 **발광(코어)** 이 전담한다.
 * - 바탕(<key>.png): 발광부를 눌러둔 무채색 재질. 약한 틴트만 줘서 타입 색 기운만 남긴다.
 * - 발광(<key>-glow.png): 밝은 부분만 남긴 마스크. 타입 색으로 틴트해 ADD로 얹으면
 *   코어에만 그 색이 진하게 들어간다.
 */
import Phaser from 'phaser';

/** 바탕 틴트 세기. 0이면 무채색 그대로, 1이면 전체가 타입 색(단색화)이 된다. */
export const BASE_TINT_STRENGTH = 0.4;

/** 흰색과 타입 색을 섞어 약한 틴트를 만든다 — 재질을 남기면서 색 기운만 준다. */
export function weakTint(color: number, strength: number = BASE_TINT_STRENGTH): number {
  const mix = (channel: number) => Math.round(255 + (channel - 255) * strength);
  return (mix((color >> 16) & 0xff) << 16)
    | (mix((color >> 8) & 0xff) << 8)
    | mix(color & 0xff);
}

/** 회전을 함께 받아야 하는 최소 계약 — Image와 Shape 둘 다 만족한다. */
export interface RotatableLayer { rotation: number }

/**
 * 스프라이트 두 겹을 만들어 반환한다. 첫 원소가 바탕(피격 플래시 대상)이고,
 * 발광 텍스처가 없으면 바탕 한 겹만 돌려준다. 컨테이너에 그대로 펼쳐 넣으면 된다.
 */
export function createSpriteLayers(
  scene: Phaser.Scene,
  key: string,
  size: number,
  color: number,
): Phaser.GameObjects.Image[] {
  const base = scene.add.image(0, 0, key)
    .setDisplaySize(size, size)
    .setTint(weakTint(color));
  const layers = [base];
  const glowKey = `${key}-glow`;
  if (scene.textures.exists(glowKey)) {
    layers.push(
      scene.add.image(0, 0, glowKey)
        .setDisplaySize(size, size)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD),
    );
  }
  return layers;
}

/** 두 겹이 따로 놀지 않게 회전을 함께 적용한다. */
export function setLayersRotation(layers: readonly RotatableLayer[], rotation: number): void {
  for (const layer of layers) layer.rotation = rotation;
}

/** 회전 누적(스핀)용 — 프레임마다 같은 양을 더한다. */
export function addLayersRotation(layers: readonly RotatableLayer[], delta: number): void {
  for (const layer of layers) layer.rotation += delta;
}
